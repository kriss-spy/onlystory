"""Read the Steam EN resource bundles without running or modifying the game."""
import argparse
import hashlib
import io
import json
import os
import re
import shutil
from pathlib import Path

import UnityPy
from gfl1_audio import recover_audio
from gfl1_selection import select_scripts, media_requests, native_event_campaigns, prime_caches, expression_requests, decode_script
from gfl1_gameplay import recover_gameplay
from gfl1_shooting import recover_shooting


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def extract(game, output, library, vgmstream=None, ffmpeg=None, campaigns=(), selection=None):
    resources = game / 'GirlsFrontLine_Data/StreamingAssets/Res/Pc'
    if not resources.is_dir():
        raise ValueError(f'Not a Steam GFL1 installation: {game}')
    output.mkdir(parents=True, exist_ok=True)
    media = library / 'private/gfl1'
    media.mkdir(parents=True, exist_ok=True)
    sources = []

    def bundle(suffix):
        files = sorted(resources.glob('*' + suffix))
        if len(files) != 1:
            raise ValueError(f'Expected one {suffix} bundle, found {len(files)}')
        path = files[0]
        sources.append({'file': path.name, 'sha256': digest(path), 'bytes': path.stat().st_size})
        return UnityPy.load(str(path))

    if selection and selection.get('table'):
        selection_table = resources / 'stc' / selection['table']
        sources.append({'file': selection_table.name, 'sha256': digest(selection_table), 'bytes': selection_table.stat().st_size})
    texts = {}
    archive = []
    selection_issues = []
    encoding_provenance = []
    extra_scripts = {script.lower() for script in (selection or {}).get('nativeReferences', [])}
    for suffix in ['assettextavg.ab', 'assettextes.ab']:
        for obj in bundle(suffix).objects:
            if obj.type.name != 'TextAsset':
                continue
            data = obj.read()
            name = data.m_Name
            raw = data.m_Script.encode('utf-8', 'surrogateescape')
            if '/' in name or '\\' in name or name in {'.', '..'}:
                raise ValueError(f'Unsafe TextAsset name: {name}')
            if suffix == 'assettextavg.ab':
                destination = output / 'scripts' / (name + '.txt')
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(raw)
                raw_hash = hashlib.sha256(raw).hexdigest()
                archive_relative = f'archive/{raw_hash}.bin'
                archive_path = output / archive_relative
                archive_path.parent.mkdir(parents=True, exist_ok=True)
                if not archive_path.exists():
                    archive_path.write_bytes(raw)
                archive.append({'script': name, 'sha256': raw_hash, 'bytes': len(raw), 'archivePath': archive_relative, 'pathId': obj.path_id})
            if name.lower() in extra_scripts or name in {'profiles', 'ChapterConfig', 'AVGPlayBackProfiles'} or re.fullmatch(r'1-\d+-[12]', name) or any(name.startswith(f'{campaign}-') for campaign in campaigns):
                try:
                    texts[name], encoding_record = decode_script(name, raw)
                    if encoding_record:
                        encoding_provenance.append(encoding_record)
                except UnicodeDecodeError as error:
                    if name in {'profiles', 'ChapterConfig', 'AVGPlayBackProfiles'}:
                        raise
                    selection_issues.append({'script': name, 'kind': 'invalid-encoding', 'reason': str(error), 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)})
    selected = select_scripts(texts, campaigns, extra_scripts)
    expected = {f'1-{mission}-{part}' for mission in range(1, 7) for part in [1, 2]}
    if not expected <= set(selected):
        raise ValueError(f'Chapter 1 script mismatch: missing={expected-set(selected)}, extra={set(selected)-expected}')
    all_text = '\n'.join(selected.values())
    profiles = texts['profiles'].splitlines()
    background_ids, wanted_characters = media_requests(all_text)
    wanted_backgrounds = {profiles[x] for x in background_ids}
    wanted_expressions = expression_requests(all_text)
    manifest = {'version': 1, 'region': 'Steam EN', 'scripts': selected,
                'chapterConfig': texts['ChapterConfig'], 'replayProfiles': texts.get('AVGPlayBackProfiles', ''), 'campaigns': list(campaigns), 'archive': archive, 'backgrounds': {}, 'portraits': {},
                'audio': {}, 'missing': [], 'sources': sources, 'portraitMetadata': {}, 'selection': selection or {'mode':'explicit-campaigns'}, 'selectionIssues': selection_issues, 'encodingProvenance': encoding_provenance}

    manifest['selection'].update({'selectedValidScripts': len(selected), 'excludedScriptCount': len(selection_issues), 'archiveCount': len(archive)})

    def image_asset(image, identity):
        # Lossless WebP keeps the original RGBA, including the prefab alpha.
        encoded = io.BytesIO()
        image.save(encoded, 'WEBP', lossless=True, exact=True, method=4)
        data = encoded.getvalue()
        path = media / 'images' / (hashlib.sha256(data).hexdigest()[:20] + '.webp')
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_bytes(data)
        return '/private/gfl1/images/' + path.name

    cache_path = output / 'image-cache.json'
    prefab_index_path = output / 'prefab-index.json'
    prefab_index = json.loads(prefab_index_path.read_text(encoding='utf-8')) if prefab_index_path.exists() else {}
    image_cache = json.loads(cache_path.read_text(encoding='utf-8')) if cache_path.exists() else {}

    # BIN indexes address the original profiles list, including black and white.
    backgrounds = {}
    for file in sorted(resources.glob('*resourceavgtexture*.ab')):
        print(f'Inspecting {file.name}', flush=True)
        env = UnityPy.load(str(file))
        used = False
        for obj in env.objects:
            if obj.type.name != 'Texture2D':
                continue
            data = obj.read()
            if data.m_Name in wanted_backgrounds:
                key = f'{file.name}:{file.stat().st_size}:{file.stat().st_mtime_ns}:{obj.path_id}'
                cached = image_cache.get(key)
                if not cached or not (library / cached.lstrip('/')).exists():
                    cached = image_asset(data.image, 'bg:' + data.m_Name)
                    image_cache[key] = cached
                    write_json(cache_path, image_cache)
                backgrounds[data.m_Name] = cached
                used = True
        if used:
            sources.append({'file': file.name, 'sha256': digest(file), 'bytes': file.stat().st_size})
    for index in background_ids:
        name = profiles[index]
        entry = {'name': name, 'url': backgrounds.get(name)}
        if name.lower() in {'black', 'white'}:
            entry['color'] = '#000000' if name.lower() == 'black' else '#ffffff'
        elif not entry['url']:
            manifest['missing'].append({'kind': 'background', 'id': index, 'name': name})
        manifest['backgrounds'][str(index)] = entry

    def portrait_pointer(env, obj, pointer):
        from UnityPy.classes import PPtr
        try:
            return PPtr(**pointer, assetsfile=obj.assets_file).deref()
        except FileNotFoundError as original_error:
            # Some native portraits have no precomputed picAlpha, but retain an
            # original Sprite in pic[] from a declared external atlas dependency.
            dependencies = []
            for candidate in list(env.objects):
                if candidate.type.name == 'AssetBundle':
                    dependencies.extend(candidate.read().m_Dependencies)
            for dependency in sorted(set(dependencies), key=lambda value: (not value.startswith('sprites_'), value)):
                logical = dependency.replace('_', '').lower()
                paths = list(resources.glob('*' + logical + '.ab'))
                if len(paths) != 1:
                    continue
                dependency_path = paths[0]
                env.load_file(str(dependency_path))
                try:
                    resolved = PPtr(**pointer, assetsfile=obj.assets_file).deref()
                except FileNotFoundError:
                    continue
                sources.append({'file': dependency_path.name, 'sha256': digest(dependency_path), 'bytes': dependency_path.stat().st_size})
                return resolved
            raise original_error

    # The shipped portrait component's picAlpha array contains complete RGBA
    # textures. Its array order is the expression index used by the scripts.
    for file in sorted(resources.glob('*avgpicprefabs*.ab')):
        fingerprint = f'primary-gameobject-v2:{file.name}:{file.stat().st_size}:{file.stat().st_mtime_ns}'
        if fingerprint in prefab_index and not (set(prefab_index[fingerprint]) & wanted_characters):
            continue
        discovered_names = []
        print(f'Inspecting {file.name}', flush=True)
        env = UnityPy.load(str(file))
        used = False
        for obj in env.objects:
            if obj.type.name != 'MonoBehaviour':
                continue
            tree = obj.read_typetree()
            if 'picAlpha' not in tree:
                continue
            image_name = tree.get('imageName')
            pointer = tree.get('m_GameObject', {})
            object_name = None
            if pointer.get('m_FileID') == 0 and pointer.get('m_PathID'):
                object_name = obj.assets_file.objects[pointer['m_PathID']].read().m_Name
            # Native scripts address the prefab GameObject; some components retain
            # a stale imageName from another character (NytoIsomer: MP5Mod).
            names = {name for name in (object_name, image_name) if name}
            discovered_names.extend(sorted(names))
            name = object_name if object_name in wanted_characters else image_name
            if name not in wanted_characters:
                continue
            if object_name != name and name in manifest['portraits']:
                continue
            textures = []
            fallback_expressions = []
            for expression, pointer in enumerate(tree.get('picAlpha', [])):
                if expression not in wanted_expressions[name]:
                    textures.append(None)
                    continue
                fallback = pointer['m_PathID'] == 0
                if fallback:
                    pictures = tree.get('pic', [])
                    pointer = pictures[expression] if expression < len(pictures) else pointer
                if pointer['m_PathID'] == 0:
                    textures.append(None)
                    continue
                try:
                    reader = portrait_pointer(env, obj, pointer)
                    if fallback and reader.type.name != 'Sprite':
                        raise ValueError('Native picAlpha is empty and pic does not reference an original Sprite')
                    key = f'{file.name}:{file.stat().st_size}:{file.stat().st_mtime_ns}:{reader.path_id}'
                    cached = image_cache.get(key)
                    texture = reader.read()
                    if fallback:
                        fallback_expressions.append({'expression': expression, 'source': 'pic', 'objectType': reader.type.name, 'nativeName': texture.m_Name})
                    if not cached or not (library / cached.lstrip('/')).exists():
                        cached = image_asset(texture.image, f'portrait:{name}:{len(textures)}')
                        image_cache[key] = cached
                        write_json(cache_path, image_cache)
                    textures.append({'name': texture.m_Name, 'url': cached})
                except (FileNotFoundError, ValueError) as error:
                    textures.append(None)
                    manifest['missing'].append({'kind': 'portrait-dependency', 'name': name, 'expression': len(textures)-1, 'reason': str(error)})
            manifest['portraits'][name] = textures
            manifest['portraitMetadata'][name] = {'orderScale': tree.get('orderScale', []), 'nativeSpriteFallbacks': fallback_expressions}
            used = True
        if used:
            sources.append({'file': file.name, 'sha256': digest(file), 'bytes': file.stat().st_size})
        prefab_index[fingerprint] = discovered_names
        write_json(prefab_index_path, prefab_index)
        if wanted_characters <= manifest['portraits'].keys():
            break
    for name in sorted(wanted_characters - manifest['portraits'].keys()):
        manifest['missing'].append({'kind': 'portrait', 'name': name})

    # The native communication window uses these two AVG atlas sprites.
    # resources.assets includes their packed texture and sprite geometry.
    native_resources = game / 'GirlsFrontLine_Data/resources.assets'
    native = UnityPy.load(str(native_resources))
    communication = {}
    for obj in native.objects:
        if obj.type.name != 'Sprite':
            continue
        sprite = obj.read()
        if sprite.m_Name in {'LayerBord', 'LayerBord_Top'}:
            communication['frameUrl' if sprite.m_Name == 'LayerBord' else 'markerUrl'] = image_asset(sprite.image, 'communication:' + sprite.m_Name)
    if len(communication) != 2:
        raise ValueError('The native AVG communication frame sprites are missing.')
    manifest['communication'] = communication
    sources.append({'file': native_resources.name, 'sha256': digest(native_resources), 'bytes': native_resources.stat().st_size})

    recover_gameplay(resources, output, manifest, image_asset, library)
    previous_path = output / 'extracted.json'
    if not previous_path.exists():
        previous_path = output / 'extraction-seed.json'
    if previous_path.exists():
        previous = json.loads(previous_path.read_text(encoding='utf-8'))
        manifest['audioProvenance'] = previous.get('audioProvenance', [])
    if any('<ShootPanel>' in text for text in manifest['scripts'].values()):
        recover_shooting(resources, library, manifest)
    recover_audio(resources, output, library, manifest, vgmstream, ffmpeg)
    write_json(output / 'extracted.json', manifest)
    print(f'Archived {len(archive)} scripts; selected {len(selected)}; portraits {len(manifest["portraits"])}; missing {len(manifest["missing"])}', flush=True)


def find_steam_game():
    """Use Steam's own library manifest. No disk-wide game search."""
    if os.environ.get('GF1_GAME_ROOT'):
        return Path(os.environ['GF1_GAME_ROOT'])
    if os.name != 'nt':
        return None
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Valve\Steam') as key:
            steam = Path(winreg.QueryValueEx(key, 'SteamPath')[0])
    except OSError:
        return None
    folders = steam / 'steamapps/libraryfolders.vdf'
    libraries = [steam]
    if folders.exists():
        libraries.extend(Path(p.replace('\\\\', '\\')) for p in re.findall(r'"path"\s+"([^"]+)"', folders.read_text(encoding='utf-8')))
    for library in libraries:
        manifest = library / 'steamapps/appmanifest_3887700.acf'
        if manifest.exists():
            match = re.search(r'"installdir"\s+"([^"]+)"', manifest.read_text(encoding='utf-8'))
            if match:
                return library / 'steamapps/common' / match[1]
    return None


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game-root', default=find_steam_game(), type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--library-root', required=True, type=Path)
    parser.add_argument('--selection', type=Path, help='Authoritative staged collection registry; select its sourceAssets plus Chapter 1')
    parser.add_argument('--all-events', action='store_true', help='Select all-negative native replay collections from installed 5186.stc')
    parser.add_argument('--reuse-cache', type=Path, help='Seed decoder/image caches from a previous extraction without replacing its manifest')
    parser.add_argument('--milestone', action='store_true', help='Include the four-event pipeline validation milestone')
    parser.add_argument('--campaigns', help='Comma-separated campaign IDs, in addition to Chapter 1')
    parser.add_argument('--gameplay-only', action='store_true', help='Refresh original native mission terrain in an existing extraction')
    parser.add_argument('--audio-only', action='store_true', help='Refresh audio in an existing extraction without re-extracting images')
    parser.add_argument('--shooting-only', action='store_true', help='Export native ShootPanel models into an existing extraction')
    parser.add_argument('--vgmstream')
    parser.add_argument('--ffmpeg', default=shutil.which('ffmpeg'))
    args = parser.parse_args()
    if args.game_root is None:
        parser.error('Steam EN was not found. Set GF1_GAME_ROOT or pass --game-root.')
    if args.reuse_cache:
        prime_caches(args.reuse_cache.resolve(), args.output.resolve())
    if args.gameplay_only:
        manifest = json.loads((args.output / 'extracted.json').read_text(encoding='utf-8'))
        def gameplay_image(image, identity):
            encoded = io.BytesIO()
            image.save(encoded, 'WEBP', lossless=True, exact=True, method=4)
            raw = encoded.getvalue()
            path = args.library_root / 'private/gfl1/images' / (hashlib.sha256(raw).hexdigest()[:20] + '.webp')
            path.parent.mkdir(parents=True, exist_ok=True)
            if not path.exists():
                path.write_bytes(raw)
            return '/private/gfl1/images/' + path.name
        recover_gameplay(args.game_root / 'GirlsFrontLine_Data/StreamingAssets/Res/Pc', args.output, manifest, gameplay_image, args.library_root)
        write_json(args.output / 'extracted.json', manifest)
        print(f'Recovered {len(manifest["gameplayBackgrounds"])} native gameplay terrain references')
    elif args.shooting_only:
        manifest = json.loads((args.output / 'extracted.json').read_text(encoding='utf-8'))
        recover_shooting(args.game_root / 'GirlsFrontLine_Data/StreamingAssets/Res/Pc', args.library_root, manifest)
        write_json(args.output / 'extracted.json', manifest)
        print('Recovered native William target and commander gun Cubism models')
    elif args.audio_only:
        manifest = json.loads((args.output / 'extracted.json').read_text(encoding='utf-8'))
        recover_audio(args.game_root / 'GirlsFrontLine_Data/StreamingAssets/Res/Pc', args.output, args.library_root, manifest, args.vgmstream, args.ffmpeg)
        write_json(args.output / 'extracted.json', manifest)
        print(f'Recovered {len(manifest["audio"])} BGM cues and {len(manifest["sfx"])} sound effects; missing {len(manifest["missing"])}')
    else:
        campaigns = tuple(int(x) for x in args.campaigns.split(',')) if args.campaigns else ()
        selection = None
        if args.all_events:
            campaigns, selection = native_event_campaigns(args.game_root / 'GirlsFrontLine_Data/StreamingAssets/Res/Pc')
        elif args.milestone:
            campaigns = (-1, -10, -11, -12, -13, -24, -25, -26, -27, -28, -41)
        if args.selection:
            registry = json.loads(args.selection.read_text(encoding='utf-8'))['selection']
            selection = (selection or {}) | {'nativeReferences': registry['sourceAssets'], 'registry': str(args.selection), 'registrySha256': digest(args.selection)}
        extract(args.game_root.resolve(), args.output.resolve(), args.library_root.resolve(), args.vgmstream, args.ffmpeg, campaigns, selection)
