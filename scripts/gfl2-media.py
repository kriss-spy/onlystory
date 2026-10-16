"""Recover original media used by every A33001..A33030 event book, offline.

Usage: python scripts/gfl2-media.py [--backgrounds-only] [--refresh]
Uses the proven, source-bound Addressables/GFF/CRI parsers in the sibling
prototype. No game execution, install changes, downloads, or account requests.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import copy
from gfl2_grid import grid_rows

ROOT = Path(__file__).resolve().parent.parent
PROTOTYPE = Path(os.environ.get('ONLYSTORY_GFL2_PROTOTYPE', str(ROOT.parent / 'onlystory-gfl2' / 'prototype'))).resolve().parent
GAME = Path(os.environ.get('GF2_GAME_ROOT', r'D:\Program Files\GF2Exilium'))
OUT = ROOT / 'public/private/gfl2-event/media'
CACHE = ROOT / '.cache/gfl2-media'
URL = '/private/gfl2-event/media/'
REUSE_BACKGROUNDS, REUSE_AUDIO, REUSE_FILES = {}, {}, {}
SOURCE_CHECKS = {}
AUDIO_SOURCE_SHEETS = {}
VGMSTREAM = Path(os.environ.get('ONLYSTORY_VGMSTREAM', str(ROOT / '.cache/gfl2-media/tools/vgmstream-r2117/vgmstream-cli.exe')))
DECODER = {
    'name': 'vgmstream', 'version': 'r2117',
    'executableSha256': '29df08c557ada8269c92a6abfe3886ad2f65849b0b26ba78a0819b363bbc5b85',
    'releaseUrl': 'https://github.com/vgmstream/vgmstream/releases/download/r2117/vgmstream-win64.zip',
    'releaseSha256': '6c4a8a3813864fefed081bbd337dbc0ad93bf88e0b92f5db98d7ab258b22dc6c',
}
HCA_KEY = 7152097263845921
sys.path[:0] = [str(PROTOTYPE), str(PROTOTYPE / 'resource_mapping'), str(GAME / '_reverse_engineering/dorm_legs_feet/assets/python_lib')]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    temporary.replace(path)


def reuse_available(record, row):
    if not record or record.get('setting') != row:
        return False
    if not source_matches(record):
        return False
    def urls(value):
        if isinstance(value, dict):
            if value.get('url'):
                yield value['url']
            for child in value.values():
                yield from urls(child)
        elif isinstance(value, list):
            for child in value:
                yield from urls(child)
    for url in set(urls(record)):
        file = REUSE_FILES.get(url)
        path = (ROOT / 'public' / url.lstrip('/')).resolve()
        if not file or not path.is_relative_to((ROOT / 'public').resolve()) or not path.exists():
            return False
        if not file.get('_verified'):
            if path.stat().st_size != file['bytes'] or digest(path) != file['sha256']:
                return False
            file['_verified'] = True
    return True


def source_matches(record):
    """Reused exports must still match the installed source, not just themselves."""
    if record.get('cueSheet') and record.get('cueName'):
        import extract_audio as cri
        sheet = record['cueSheet']
        if sheet not in AUDIO_SOURCE_SHEETS:
            AUDIO_SOURCE_SHEETS[sheet] = cri.load_sheet(sheet)
        source, tables, memory, _, streaming, _ = AUDIO_SOURCE_SHEETS[sheet]
        name = next((row for row in tables['CueNameTable'] if row['CueName'] == record['cueName']), None)
        if not name:
            return False
        cue = tables['CueTable'][name['CueIndex']]
        kind, index = cue['ReferenceType'], cue['ReferenceIndex']
        indices = [index] if kind == 1 else cri.synth_waves(tables, index) if kind == 2 else cri.sequence_waves(tables, index) if kind == 3 else []
        items = ([record] if 'waveformIndex' in record else []) + record.get('layers', []) + record.get('alternatives', [])
        if {item['waveformIndex'] for item in items} != set(indices):
            return False
        for item in items:
            wave = tables['WaveformTable'][item['waveformIndex']]
            wave_id = wave['StreamAwbId'] if wave['Streaming'] else wave['MemoryAwbId']
            payload = (streaming if wave['Streaming'] else memory)[wave_id]
            key = ('waveform', sheet, item['waveformIndex'], item['sourceSha256'])
            if key not in SOURCE_CHECKS:
                SOURCE_CHECKS[key] = hashlib.sha256(payload).hexdigest() == item['sourceSha256']
            if not SOURCE_CHECKS[key]:
                return False
        return bool(items)
    bundle = record.get('sourceBundle')
    if bundle and record.get('sourceSegmentSha256'):
        directory = GAME / 'GF2 Game/GF2_Exilium_Data/LocalCache/Data/AssetBundles_Windows'
        source = (directory / bundle['bundle']).resolve()
        if not source.is_relative_to(directory.resolve()):
            return False
        offset, size, expected = bundle['segment_offset'], bundle['segment_size'], record['sourceSegmentSha256']
    elif record.get('sourceSha256') and record.get('sourcePath'):
        source = Path(record['sourcePath']).resolve()
        if not source.is_relative_to(GAME.resolve()):
            return False
        offset, size, expected = 0, 0, record['sourceSha256']
    else:
        return 'url' not in record or bool(record.get('color'))
    key = (str(source), offset, size, expected)
    if key not in SOURCE_CHECKS:
        if not source.exists():
            SOURCE_CHECKS[key] = False
        else:
            with source.open('rb') as stream:
                stream.seek(offset)
                actual = hashlib.sha256(stream.read(size or -1)).hexdigest()
            SOURCE_CHECKS[key] = actual == expected
    return SOURCE_CHECKS[key]


def audit(books_dir=None, book_glob='A330*.book.json'):
    setting_path = PROTOTYPE / 'current_book_probe/Adv.setting.json'
    settings = json.loads(setting_path.read_text(encoding='utf8'))
    grids = {g['name'].split(':')[-1]: list(grid_rows(g)) for g in settings['settingList']}
    refs = {'Bg': {}, 'Sprite': {}, 'Bgm': {}, 'Se': {}}
    books = []
    for path in sorted((books_dir or PROTOTYPE / 'event_books').glob(book_glob)):
        book = json.loads(path.read_text(encoding='utf8'))
        books.append({'name': book['m_Name'], 'sha256': digest(path)})
        for grid in book['importGridList']:
            for command in grid_rows(grid):
                kind, label = command.get('Command'), command.get('Arg1')
                if kind in refs:
                    refs[kind].setdefault(label, []).append({'script': book['m_Name'].split('.')[0], 'row': command['sourceRow']})
    return grids, refs, books, setting_path


def extract_backgrounds(grids, refs, manifest, refresh):
    import UnityPy
    from resolve_assets import resolve_path, BUNDLES
    texture_rows = {r['Label']: r for r in grids['Texture'] if r.get('Label')}
    graphic_refs = {}
    for kind in ['Bg', 'Sprite']:
        for label, uses in refs[kind].items():
            graphic_refs.setdefault(label, []).extend({**use, 'command': kind} for use in uses)
    for label, uses in graphic_refs.items():
        row = texture_rows.get(label)
        previous = REUSE_BACKGROUNDS.get(label)
        if not refresh and reuse_available(previous, row):
            manifest['backgrounds'][label] = {**copy.deepcopy(previous), 'uses': uses}
            print('REUSE BACKGROUND', label, flush=True)
            continue
        record = {'label': label, 'uses': uses, 'setting': row}
        try:
            if row is None:
                raise ValueError('No original Texture setting row')
            filename = row.get('FileName1') or row['FileName']
            prefix = 'ConfigPrefab/' if filename.endswith('.prefab') else 'ArtsResource/'
            asset_path = 'Assets/' + prefix + filename
            resolved = resolve_path(asset_path)
            if resolved is None:
                raise ValueError(f'Original resource path not in catalogue: {asset_path}')
            record['sourcePath'] = asset_path
            record['sourceScale'] = float(row.get('Scale') or 1)
            record['catalogueKey'] = resolved['catalogue_key']
            # This is the sole prefab background used in the event. Its scene is
            # explicitly represented as a solid black fallback, as in opening.
            if label in ['BG_None_Black_01', 'BG_None_Black_02'] and row.get('Type') == 'BgPrefab':
                record.update(color='#000000', representation='Solid black replacement for original Custom2DBg prefab; shader not reproduced.')
                manifest['backgrounds'][label] = record
                continue
            locations = [l for l in resolved['locations'] if l['resource_type'].endswith(':UnityEngine.Texture2D')]
            if not locations:
                raise ValueError('No original Texture2D catalogue location')
            location = locations[0]
            output = OUT / 'backgrounds' / (label + '.webp')
            record['assetInternalId'] = location['internal_id']
            found = False
            for dependency in location['dependencies']:
                physical = dependency.get('physical')
                if physical is None:
                    continue
                source = BUNDLES / physical['bundle']
                with source.open('rb') as stream:
                    stream.seek(physical['segment_offset'])
                    raw = stream.read(physical['segment_size'] or -1)
                key = bytes(a ^ b for a, b in zip(raw, b'UnityFS\0\0\0\0\7' + b'5.x.'))
                decoded = bytes(v ^ key[i % 16] for i, v in enumerate(raw[:32768])) + raw[32768:]
                env = UnityPy.load(decoded)
                obj = env.container[location['internal_id']] if location['internal_id'] in env.container else None
                # Unity's container can point to the Sprite subasset even for
                # the Texture2D location; follow its exact serialized texture
                # pointer rather than selecting a texture by similar name.
                if obj is not None and obj.type.name == 'Sprite':
                    record['spritePathId'] = str(obj.path_id)
                    obj = obj.read().m_RD.texture
                if obj is None or obj.type.name != 'Texture2D':
                    continue
                texture = obj.read()
                output.parent.mkdir(parents=True, exist_ok=True)
                sidecar = CACHE / 'backgrounds' / (label + '.json')
                source_hash = hashlib.sha256(raw).hexdigest()
                cached = json.loads(sidecar.read_text(encoding='utf8')) if sidecar.exists() else None
                reusable = output.exists() and cached and cached.get('sourceSegmentSha256') == source_hash and cached.get('outputSha256') == digest(output)
                if refresh or not reusable:
                    texture.image.save(output, format='WEBP', lossless=True)
                record.update(url=URL + output.relative_to(OUT).as_posix(), width=texture.m_Width, height=texture.m_Height,
                              assetName=texture.m_Name, pathId=str(obj.path_id), sourceBundle=physical,
                              sourceSegmentSha256=source_hash, outputSha256=digest(output))
                write_json(sidecar, record)
                manifest['backgrounds'][label] = record
                found = True
                break
            if not found:
                raise ValueError('Original catalogue Texture2D object absent from resolved dependencies')
            print('BACKGROUND', label, record['width'], record['height'], flush=True)
        except Exception as error:
            manifest['unresolved'].append({'kind': 'background', **record, 'error': str(error)})
            print('UNRESOLVED BACKGROUND', label, str(error), flush=True)


def decode_wave(cue, index, tables, memory, memory_key, streaming, stream_key):
    """Use clHCA via pinned vgmstream, then transcode its float WAV with FFmpeg.

    FFmpeg 9.0.1's native HCA decoder produces wrong PCM for these installed
    assets despite returning success. Do not replace this with -i input.hca.
    """
    wave = tables['WaveformTable'][index]
    is_stream = bool(wave['Streaming'])
    wave_id = wave['StreamAwbId'] if is_stream else wave['MemoryAwbId']
    key = stream_key if is_stream else memory_key
    payload = (streaming if is_stream else memory)[wave_id]
    raw = CACHE / 'audio' / f'{cue}.wave{index}.hca'
    raw.parent.mkdir(parents=True, exist_ok=True)
    raw.write_bytes(payload)
    raw.with_suffix('.hcakey').write_bytes(HCA_KEY.to_bytes(8, 'big') + key.to_bytes(2, 'big'))
    wav = raw.with_suffix('.decoded.wav')
    temporary = raw.with_suffix('.converted.ogg')
    decoded = subprocess.run([str(VGMSTREAM), '-i', '-W', '4', '-o', str(wav), str(raw)], capture_output=True)
    if decoded.returncode:
        raise RuntimeError(decoded.stderr.decode(errors='replace'))
    converted = subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', str(wav), '-af', f"atrim=end_sample={wave['NumSamples']}", '-c:a', 'libvorbis', '-q:a', '6', str(temporary)], capture_output=True)
    if converted.returncode:
        raise RuntimeError(converted.stderr.decode(errors='replace'))
    output_hash = digest(temporary)
    output = OUT / 'audio' / f'{cue}.wave{index}.{output_hash[:12]}.ogg'
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(temporary, output)
    temporary.unlink()
    wav.unlink()
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'stream=sample_rate,channels:format=duration', '-of', 'json', str(output)]))
    extension = tables['WaveformExtensionDataTable'][wave['ExtensionData']] if wave['ExtensionData'] != 65535 else None
    return {'waveform_index': index, 'waveform': wave, 'loop': extension,
            'duration_from_table': wave['NumSamples'] / wave['SamplingRate'], 'awb_id': wave_id, 'awb_subkey': key,
            'hca': str(raw), 'hca_sha256': hashlib.sha256(payload).hexdigest(), 'output': str(output),
            'output_sha256': output_hash, 'probe': probe, 'decoder': DECODER,
            'decode_stderr': decoded.stderr.decode(errors='replace'),
            'processing': 'Original HCA decoded by vgmstream r2117 clHCA with base key/AWB subkey to float WAV; FFmpeg trims WaveformTable NumSamples and transcodes WAV to Vorbis quality6. Native FFmpeg HCA decoding is excluded.'}


def extract_audio(grids, refs, manifest, refresh):
    import extract_audio as cri
    cri.OUT = CACHE / 'audio'
    cri.OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'audio').mkdir(parents=True, exist_ok=True)
    if not VGMSTREAM.exists() or digest(VGMSTREAM) != DECODER['executableSha256']:
        raise RuntimeError('Pinned vgmstream r2117 decoder missing or digest mismatch. See docs/gfl2-media-findings.md for acquisition.')
    manifest.setdefault('provenance', {})['audioDecoder'] = DECODER
    sound_rows = {r['Label']: r for r in grids['Sound'] if r.get('Label')}
    sheets = {}
    wave_cache = {}
    cue_cache = {}
    provenance = []
    for kind in ['Bgm', 'Se']:
        for label, uses in refs[kind].items():
            row = sound_rows.get(label)
            previous = REUSE_AUDIO.get((kind, label))
            if not refresh and reuse_available(previous, row):
                manifest['audio'][label] = {**copy.deepcopy(previous), 'uses': uses}
                print('REUSE AUDIO', kind, label, flush=True)
                continue
            record = {'label': label, 'kind': kind, 'uses': uses, 'setting': row}
            try:
                if row is None:
                    raise ValueError('No original Sound setting row')
                sheet, cue = row['CueSheet'], row['FileName']
                record.update(cueName=cue, cueSheet=sheet)
                if sheet not in sheets:
                    sheets[sheet] = cri.load_sheet(sheet)
                source, tables, memory, memory_key, streaming, stream_key = sheets[sheet]
                record.update(sourcePath=str(source), sourceSha256=digest(source), cueSheetSha256=digest(source))
                if (sheet, cue) not in cue_cache:
                    cue_name = next((r for r in tables['CueNameTable'] if r['CueName'] == cue), None)
                    if cue_name is None:
                        raise ValueError(f'Original cue {cue} is absent from installed {sheet} CueNameTable')
                    cue_row = tables['CueTable'][cue_name['CueIndex']]
                    reference_type, index = cue_row['ReferenceType'], cue_row['ReferenceIndex']
                    if reference_type == 1:
                        indexes = [index]
                    elif reference_type == 2:
                        indexes = cri.synth_waves(tables, index)
                    elif reference_type == 3:
                        indexes = cri.sequence_waves(tables, index)
                    else:
                        raise ValueError(f'Unknown original CRI cue reference type {reference_type}')
                    items, original = [], []
                    for index in dict.fromkeys(indexes):
                        cache_key = (sheet, index)
                        if cache_key not in wave_cache:
                            # Include sheet to prevent identical waveform indices
                            # from different ACBs colliding in output filenames.
                            output_cue = sheet + '.' + cue
                            metadata = cri.OUT / f'{output_cue}.wave{index}.json'
                            wave_row = tables['WaveformTable'][index]
                            wave_id = wave_row['StreamAwbId'] if wave_row['Streaming'] else wave_row['MemoryAwbId']
                            payload = (streaming if wave_row['Streaming'] else memory)[wave_id]
                            current_hca_hash = hashlib.sha256(payload).hexdigest()
                            cached = json.loads(metadata.read_text(encoding='utf8')) if metadata.exists() else None
                            output = Path(cached['output']) if cached else None
                            if not refresh and cached and cached.get('decoder') == DECODER and output and output.exists():
                                if not output.resolve().is_relative_to((OUT / 'audio').resolve()):
                                    raise ValueError('Audio cache output escaped runtime audio directory')
                                waveform = cached
                                if waveform.get('output_sha256') != digest(output):
                                    raise ValueError('Recovered audio cache digest mismatch')
                                if waveform.get('hca_sha256') != current_hca_hash or waveform.get('waveform') != wave_row:
                                    raise ValueError('Original audio source changed; rerun with --refresh')
                                loop_row = tables['WaveformExtensionDataTable'][wave_row['ExtensionData']] if wave_row['ExtensionData'] != 65535 else None
                                if waveform.get('loop') != loop_row:
                                    raise ValueError('Original audio loop metadata changed; rerun with --refresh')
                            else:
                                waveform = decode_wave(output_cue, index, tables, memory, memory_key, streaming, stream_key)
                                write_json(metadata, waveform)
                            wave_cache[cache_key] = waveform
                        waveform = wave_cache[cache_key]
                        output = Path(waveform['output'])
                        wave = waveform['waveform']
                        item = {'url': URL + output.relative_to(OUT).as_posix(), 'waveformIndex': index,
                                'duration': waveform['duration_from_table'], 'loop': wave['LoopFlag'] == 2, 'gain': 1,
                                'outputSha256': waveform['output_sha256'], 'sourceSha256': waveform['hca_sha256']}
                        if waveform.get('loop'):
                            item.update(loopStart=waveform['loop']['LoopStart'] / wave['SamplingRate'], loopEnd=waveform['loop']['LoopEnd'] / wave['SamplingRate'])
                        items.append(item)
                        original.append(waveform)
                    if not items:
                        raise ValueError('Original cue reaches no waveform')
                    cue_cache[(sheet, cue)] = (items, cue_row, original)
                items, cue_row, original = cue_cache[(sheet, cue)]
                if len(items) == 1:
                    record.update(items[0])
                else:
                    loop_items = [item for item in items if item['loop']]
                    # Parallel ambience beds can safely play together. Nonloop
                    # random/sequence variants are retained, never mixed at once.
                    if loop_items:
                        record['layers'] = loop_items
                        record['alternatives'] = [item for item in items if not item['loop']]
                    else:
                        record.update(items[0])
                        record['alternatives'] = items[1:]
                    record['limitation'] = 'Original reachable waveforms and loop regions recovered. Browser playback uses loop beds or first one-shot variant; CRI random sequencing, gains and pitch are not reproduced.'
                manifest['audio'][label] = record
                provenance.append({'label': label, 'source': record['sourcePath'], 'sourceSha256': record['sourceSha256'], 'cueRow': cri.summarize(cue_row), 'waveforms': original})
                print('AUDIO', kind, label, cue, len(items), flush=True)
            except Exception as error:
                manifest['unresolved'].append({**record, 'kind': 'audio', 'audioKind': kind, 'error': str(error)})
                print('UNRESOLVED AUDIO', kind, label, repr(error), flush=True)
    # Retain command structure as evidence of limits, without shipping it in
    # each episode payload or pretending it is faithfully scheduled.
    for sheet, (_, tables, _, _, _, _) in sheets.items():
        write_json(CACHE / 'audio-metadata' / (sheet + '.json'), cri.summarize(tables))
    write_json(CACHE / 'audio-provenance.json', provenance)


def main():
    global OUT, CACHE, URL
    sys.stdout.reconfigure(encoding='utf8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backgrounds-only', action='store_true')
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--books', type=Path, help='Directory of recovered original book JSON')
    parser.add_argument('--book-glob', default='A330*.book.json')
    parser.add_argument('--output', type=Path, default=OUT)
    parser.add_argument('--cache', type=Path, default=CACHE)
    parser.add_argument('--url-prefix', default=URL)
    parser.add_argument('--reuse-library', action='store_true')
    args = parser.parse_args()
    OUT, CACHE, URL = args.output.resolve(), args.cache.resolve(), args.url_prefix.rstrip('/') + '/'
    OUT.mkdir(parents=True, exist_ok=True)
    grids, refs, books, setting_path = audit(args.books, args.book_glob)
    source_maps = [
        {'path': item['path'], 'sha256': digest(Path(item['path'])), 'bytes': Path(item['path']).stat().st_size}
        for item in json.loads((PROTOTYPE / 'resource_mapping/mapping_sources.json').read_text(encoding='utf8'))
    ]
    setting_hash = digest(setting_path)
    if args.reuse_library:
        for path in (ROOT / 'public/private').glob('gfl2-*/media/manifest.json'):
            old = json.loads(path.read_text('utf8'))
            if old.get('provenance', {}).get('setting', {}).get('sha256') != setting_hash or old.get('provenance', {}).get('resourceMaps') != source_maps:
                continue
            REUSE_FILES.update({file['url']: file for file in old.get('files', [])})
            REUSE_BACKGROUNDS.update(old.get('backgrounds', {}))
            if old.get('provenance', {}).get('audioDecoder') == DECODER:
                REUSE_AUDIO.update({(record['kind'], label): record for label, record in old.get('audio', {}).items()})
    if not books:
        raise ValueError('No original story books matched the selected input')
    manifest = {'version': 1, 'backgrounds': {}, 'audio': {}, 'layerOrders': {r['LayerName']: int(r.get('Order') or 0) for r in grids['Layer'] if r.get('LayerName')},
                'files': [], 'unresolved': [], 'coverage': {kind: len(labels) for kind, labels in refs.items()},
                'provenance': {'books': books, 'setting': {'path': str(setting_path), 'sha256': digest(setting_path)},
                               'method': 'Original book command labels joined to original Adv.setting rows, then original catalogue/GFF objects or ACB cue graph. Offline extraction only.'}}
    manifest['coverage']['backgroundLabels'] = len(set(refs['Bg']) | set(refs['Sprite']))
    manifest['coverage']['books'] = len(books)
    manifest['provenance']['resourceMaps'] = source_maps
    manifest['provenance']['parsers'] = [
        {'name': name, 'sha256': digest(PROTOTYPE / 'resource_mapping' / name)}
        for name in ['resolve_assets.py', 'catalogue.py', 'extract_audio.py']
    ]
    extract_backgrounds(grids, refs, manifest, args.refresh)
    # Keep an existing full manifest usable until every replacement is ready.
    if args.backgrounds_only or not (OUT / 'manifest.json').exists():
        write_json(OUT / 'manifest.json', manifest)
    if not args.backgrounds_only:
        extract_audio(grids, refs, manifest, args.refresh)
    urls = set()
    def collect(value):
        if isinstance(value, dict):
            if value.get('url'): urls.add(value['url'])
            for item in value.values(): collect(item)
        elif isinstance(value, list):
            for item in value: collect(item)
    collect(manifest['backgrounds']);collect(manifest['audio'])
    for url in sorted(urls):
        if url.startswith(URL):
            path = (OUT / url[len(URL):]).resolve()
            if not path.is_relative_to(OUT.resolve()): raise ValueError('Runtime media path escaped media directory')
        elif url in REUSE_FILES:
            path = (ROOT / 'public' / url.lstrip('/')).resolve()
            if not path.is_relative_to((ROOT / 'public').resolve()): raise ValueError('Reused media escaped public directory')
        else:
            raise ValueError('Runtime media URL escaped media directory')
        manifest['files'].append({'url': url, 'bytes': path.stat().st_size, 'sha256': digest(path)})
    write_json(OUT / 'manifest.json', manifest)
    if not manifest['unresolved'] and not args.backgrounds_only:
        legacy = CACHE / 'legacy-ffmpeg-audio'
        for path in (OUT / 'audio').glob('*.ogg'):
            if URL + path.relative_to(OUT).as_posix() not in urls:
                legacy.mkdir(parents=True, exist_ok=True)
                destination = legacy / path.name
                if destination.exists(): destination = legacy / (path.stem + '.' + digest(path)[:12] + path.suffix)
                if not destination.resolve().is_relative_to(CACHE.resolve()): raise ValueError('Legacy audio move escaped cache')
                shutil.move(path, destination)
    print('COMPLETE', len(manifest['backgrounds']), 'backgrounds', len(manifest['audio']), 'audio cues', len(manifest['unresolved']), 'unresolved', flush=True)
    if manifest['unresolved']:
        print(json.dumps(manifest['unresolved'], ensure_ascii=False)[:5000], flush=True)


if __name__ == '__main__':
    main()

