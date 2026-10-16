"""Recover the original videos referenced by selected installed GFL2 story books.

H264 picture packets are copied unchanged. Chinese and Japanese CRI ADX audio
streams are decoded by the pinned vgmstream binary and encoded as AAC in separate
browser-compatible MP4s. Original game code establishes track 0=CN, 1=JP, 2=KR;
see docs/gfl2-video-voice-languages.md.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from gfl2_grid import grid_rows

ROOT = Path(__file__).resolve().parent.parent
GAME = Path('D:/Program Files/GF2Exilium')
sys.path.insert(0, str(ROOT.parent / 'onlystory-gfl2'))
import table_probe


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--books', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--url-prefix', required=True)
    parser.add_argument('--only', action='append', type=int, default=[])
    parser.add_argument('--cache', type=Path, default=ROOT / '.cache/gfl2-ilion-videos')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    cache = args.cache.resolve()
    cache.mkdir(parents=True, exist_ok=True)
    decoder = ROOT / '.cache/gfl2-media/tools/vgmstream-r2117/vgmstream-cli.exe'
    assert sha(decoder) == '29df08c557ada8269c92a6abfe3886ad2f65849b0b26ba78a0819b363bbc5b85'
    uses = {}
    for book in sorted(args.books.glob('*.book.json')):
        for grid in json.loads(book.read_text('utf8'))['importGridList']:
            for row in grid_rows(grid):
                if row.get('Command') == 'Video':
                    uses.setdefault(int(row['Arg1']), []).append({'book': book.name, 'row': row['sourceRow']})
    table = {dict((n, v) for n, w, v in table_probe.fields(row))[1]: dict((n, v) for n, w, v in table_probe.fields(row)) for row in table_probe.rows('VideoData')}
    previous_path = args.output / 'manifest.json'
    previous = json.loads(previous_path.read_text('utf8')) if previous_path.exists() else {}
    manifest = {'version': 2, 'videos': {}, 'files': [item for item in previous.get('files', []) if item['url'].endswith('.vtt')], 'unresolved': [], 'source': {**previous.get('source', {}), 'videoTableSha256': sha(table_probe.TABLES / 'VideoData.bytes'), 'voiceTrackMapping': {'zh-CN': 0, 'ja': 1}, 'voiceMappingEvidence': 'docs/gfl2-video-voice-languages.md'}, 'limitations': ['Korean source track is not exported; supported voice choices are Chinese and Japanese.']}
    if args.only:
        manifest['videos'] = previous.get('videos', {})
        manifest['files'] = previous.get('files', [])
        manifest['unresolved'] = [entry for entry in previous.get('unresolved', []) if int(entry['label']) not in args.only]
    for label, locations in uses.items():
        if args.only and label not in args.only:
            continue
        try:
            record = table[label]
            variants = [('male', record[2])] + ([('female', record[3])] if record[2] != record[3] else [])
            for gender, relative_bytes in variants:
                relative = relative_bytes.decode('utf8')
                source = GAME / 'GF2 Game/GF2_Exilium_Data/LocalCache/Data/AssetBundles_Windows/Assets/Cutscene/Video/PC' / relative
                source_hash = sha(source)
                probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(source)]))
                pictures = [s for s in probe['streams'] if s['codec_type'] == 'video']
                sounds = [s for s in probe['streams'] if s['codec_type'] == 'audio']
                assert len(pictures) == 1 and pictures[0]['codec_name'] == 'h264'
                voices = {}
                for locale, index, iso_language in [('zh-CN', 0, 'zho'), ('ja', 1, 'jpn')]:
                    stream = sounds[index]
                    assert stream['codec_name'] == 'adpcm_adx'
                    wav = cache / f'{label}-{source_hash[:12]}-track{index + 1}.wav'
                    if not wav.exists():
                        subprocess.run([str(decoder), '-s', str(index + 1), '-i', '-W', '4', '-o', str(wav), str(source)], check=True, capture_output=True)
                    temporary = cache / f'{label}.{gender}.{locale}.mp4'
                    command = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', str(source), '-i', str(wav), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-disposition:a:0', 'default', '-metadata:s:a:0', f'language={iso_language}']
                    subprocess.run(command + [str(temporary)], check=True, capture_output=True)
                    output_hash = sha(temporary)
                    output = args.output / f'{label}.{gender}.{locale}.{output_hash[:12]}.mp4'
                    temporary.replace(output)
                    # MP4 changes Annex B start codes to length prefixes, so compare
                    # decoded frame pixels instead of container packet serialization.
                    def frame_hashes(path):
                        return subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:v:0', '-t', '2', '-an', '-f', 'framemd5', '-']).splitlines()[10:]
                    assert frame_hashes(source) == frame_hashes(output), 'Remuxed picture pixels changed'
                    output_probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', str(output)]))
                    assert len([s for s in output_probe['streams'] if s['codec_type'] == 'audio']) == 1
                    url = args.url_prefix.rstrip('/') + '/' + output.name
                    voices[locale] = {'url': url, 'sourceAudioTrack': index}
                    manifest['files'].append({'url': url, 'bytes': output.stat().st_size, 'sha256': output_hash})
                    print('VIDEO', label, locale, output.stat().st_size, flush=True)
                asset = {'url': voices['zh-CN']['url'], 'voices': voices, 'width': pictures[0]['width'], 'height': pictures[0]['height'], 'duration': float(probe['format']['duration']), 'sourcePath': str(source), 'sourceSha256': source_hash, 'audioStreams': len(sounds), 'defaultAudioStream': 1, 'uses': locations, 'processing': 'Lossless H264 packet remux; one original ADX language stream decoded by vgmstream r2117 and separately encoded AAC256k per MP4.'}
                old_asset = previous.get('videos', {}).get(str(label), {})
                if gender == 'female': old_asset = old_asset.get('female', {})
                old_subtitles = old_asset.get('subtitles')
                if old_subtitles:
                    asset['subtitles'] = old_subtitles
                if gender == 'male': manifest['videos'][str(label)] = asset
                else: manifest['videos'][str(label)]['female'] = asset
        except Exception as error:
            manifest['unresolved'].append({'label': label, 'error': str(error)})
            print('UNRESOLVED VIDEO', label, repr(error), flush=True)
        (args.output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', 'utf8')
    return bool(manifest['unresolved'])


if __name__ == '__main__':
    raise SystemExit(main())
