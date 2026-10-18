"""Export original Steam EN chapter/event selection artwork into the local library."""
import argparse
import hashlib
import importlib
import io
import json
from pathlib import Path

import UnityPy

ROOT = Path(__file__).resolve().parent.parent
PAGE = 'https://store.steampowered.com/app/3887700/'
EVENTS = {
    'operation-cube': 'missionselect_Cube_base',
    'blindfold-theorem': 'missionselect_Cube_base',
    'arctic-warfare': 'missionselect_Arctic_base',
    'deep-dive': 'missionselect_DeepDive_base',
    'singularity': 'missionselect_Sing_base',
    'continuum-turbulence': 'missionselect_ContinuumTurbulence_base',
    'isomer': 'missionselect_Isomer_base',
    'shattered-connexion': 'missionselect_Reversible_base',
    'polarized-light': 'missionselect_PolarizedLight_base',
    'dual-randomness': 'missionselect_Dual Randomness_base',
    'mirror-stage': 'missionselect_MirrorStage_base',
    'poincare-recurrence': 'missionselect_PoincareRecurrence_base',
    'fixed-point': 'missionselect_FixedPoint_base',
    'longitudinal-strain': 'missionselect_2022Summer_base',
    'eclipses-saros': 'missionselect_2022Scar_base',
    'slow-shock': 'missionselect_Slowshock_base',
    'the-summer-garden-of-forking-paths': 'missionselect_202404Activity_base',
    'cartesian-theater': 'missionselect_202406Activity_base',
    'zero-charge': 'missionselect_202407Activity_base',
    'angular-gyrus': 'missionselect_202408Activity_base',
    'isolation-forest': 'missionselect_202410Activity_base',
    'convolutional-kernel': 'missionselect_202412activity_base',
    'roche-limit': 'missionselect_202505activity_base',
    'virtual-pair': 'missionselect_202507activity_base',
    'quantum-fluctuations': 'missionselect_202509activity_base',
    'freaky-pandemic': 'missionselect_Halloween_base',
    'a-snowy-night-capriccio': 'missionselect_Xmas_base',
    'the-photo-studio-mystery': 'missionselect_WhiteDay2020_base',
    'far-side-of-the-sea': 'missionSelect_Bikini_2020_base',
    'butterfly-in-a-cocoon': 'missionselect_Halloween2020_base',
    'waves-wrangler': 'missionSelect_Bikini_2021_base',
    'one-coin-short': 'missionselect_Xmas2021_base',
    'love-bakery': 'missionselect_2022WhiteValentine_base',
    'lycan-sanctuary': 'missionselect_Bikini_2022_base',
    'maze-guess': 'missionselect_2023Rouge_base',
    'lost-in-thoughts': 'missionselect_2023RougeSummer_base',
    'permitted-reloading': 'missionselect_2023Se_base',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game-root', type=Path, default=importlib.import_module('gfl1-extract').find_steam_game())
    parser.add_argument('--library-root', type=Path)
    parser.add_argument('--catalog', type=Path, default=ROOT / 'src/generated/gfl1-catalog.json')
    parser.add_argument('--manifest', type=Path, default=ROOT / 'src/cover-art.json')
    args = parser.parse_args()
    if args.game_root is None:
        parser.error('Install Steam EN or provide --game-root.')
    local = ROOT / '.codex/worktree.local.json'
    config = json.loads(local.read_text(encoding='utf-8')) if local.exists() else {}
    library = args.library_root or Path(config.get('libraryRoot', ROOT / 'public'))
    output = library / 'private/gfl1/covers'
    output.mkdir(parents=True, exist_ok=True)
    collections = {episode['collectionId']: episode for episode in json.loads(args.catalog.read_text(encoding='utf-8'))}
    selection = {f'gfl1-{slug}': ('resourceiconops.ab', name, 'event-selection-banner') for slug, name in EVENTS.items()}
    collaborations = json.loads((ROOT / 'scripts/gfl1-collaborations.json').read_text(encoding='utf-8'))['collections']
    selection.update({f'gfl1-{slug}': ('resourceiconops.ab', row['cover'], 'event-selection-banner') for slug, row in collaborations.items() if f'gfl1-{slug}' in collections})
    for number in range(14):
        slug = 'gfl1-chapter-1-normal' if number == 1 else f'gfl1-chapter-{number}'
        selection[slug] = ('resourcetitle.ab', f'chapter{number}_base', 'chapter-map-banner')
    if set(collections) - set(selection):
        raise ValueError(f'Choose artwork for new native collections: {sorted(set(collections) - set(selection))}')
    resources = args.game_root / 'GirlsFrontLine_Data/StreamingAssets/Res/Pc'
    bundles = {}
    for suffix in {record[0] for record in selection.values()}:
        files = list(resources.glob('*' + suffix))
        if len(files) != 1:
            raise ValueError(f'Expected one original {suffix}')
        path = files[0]
        env = UnityPy.load(str(path))
        wanted = {record[1] for record in selection.values() if record[0] == suffix}
        textures = {}
        for obj in env.objects:
            if obj.type.name == 'Texture2D':
                texture = obj.read()
                if texture.m_Name in wanted:
                    if texture.m_Name in textures:
                        raise ValueError(f'Ambiguous native texture: {texture.m_Name}')
                    textures[texture.m_Name] = (obj, texture)
        bundles[suffix] = (path, hashlib.sha256(path.read_bytes()).hexdigest(), textures)
    artwork = json.loads(args.manifest.read_text(encoding='utf-8'))
    for identity, episode in collections.items():
        suffix, name, role = selection[identity]
        bundle, bank_hash, textures = bundles[suffix]
        obj, texture = textures[name]
        image = texture.image.convert('RGBA')
        minimum = 298 if identity == 'gfl1-operation-rabbit-hunt' else 400
        if image.width < minimum or image.height < 100 or not image.getbbox():
            raise ValueError(f'Invalid native cover: {name}')
        encoded = io.BytesIO()
        image.save(encoded, format='WEBP', lossless=True, exact=True, method=6)
        data = encoded.getvalue()
        digest = hashlib.sha256(data).hexdigest()
        filename = f'{identity}.{digest[:16]}.webp'
        (output / filename).write_bytes(data)
        record = {
            'url': '/private/gfl1/covers/' + filename,
            'position': '50% 50%', 'fit': 'contain',
            'width': image.width, 'height': image.height,
            'kind': 'official-game-art', 'role': role,
            'credit': 'Sunborn / MICA Team', 'page': PAGE,
            'source': bundle.name + '#' + name, 'sha256': digest,
            'nativeSource': {
                'file': bundle.name, 'sha256': bank_hash,
                'pathId': str(obj.path_id), 'texture': name,
                'pixelSha256': hashlib.sha256(image.tobytes()).hexdigest(),
            },
        }
        if identity == 'gfl1-blindfold-theorem':
            record['note'] = 'Cube+ chapter uses the shared original Operation Cube campaign banner.'
        if identity == 'gfl1-operation-rabbit-hunt':
            record['note'] = (
                'The installed client ships no 480x155 _base variant for this collaboration; '
                'its original 298x149 selection texture is used at native size, not scaled.'
            )
        artwork['events']['gfl1:' + identity] = record
        print(f'{identity}: {name} ({image.width}x{image.height})', flush=True)
    args.manifest.write_text(json.dumps(artwork, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
