"""Recover original USM SBT subtitle timing and installed Chinese localization."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT.parent / 'onlystory-gfl2'))
import table_probe as t


def record(raw):
    return {number: value for number, wire, value in t.fields(raw)}


def timestamp(seconds):
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3600000)
    minutes, milliseconds = divmod(milliseconds, 60000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f'{hours:02}:{minutes:02}:{seconds:02}.{milliseconds:03}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    args = parser.parse_args()
    args.manifest = args.manifest.resolve()
    language = {row[1]: row[2].decode('utf8') for row in map(record, t.rows('LangPackageTableCnData')) if 2 in row}
    subtitles = {row[1]: language[record(row[2])[1]] for row in map(record, t.rows('VideoSubtitleData'))}
    content = {row[1]: row for row in map(record, t.rows('AvgContentData'))}
    for identity, row in content.items():
        if identity not in subtitles and 2 in row:
            text = language.get(record(row[2])[1])
            if text is not None:
                subtitles[identity] = text
    manifest = json.loads(args.manifest.read_text('utf8'))
    variants = [(label, video) for label, video in manifest['videos'].items()] + [(label + '.female', video['female']) for label, video in manifest['videos'].items() if 'female' in video]
    for label, video in variants:
        data = Path(video['sourcePath']).read_bytes()
        position = 0
        cues = []
        while position + 32 <= len(data):
            size = struct.unpack_from('>I', data, position + 4)[0] + 8
            assert size >= 32 and position + size <= len(data)
            if data[position:position + 4] == b'@SBT' and data[position + 15] == 0:
                offset = data[position + 9] + 8
                channel, unit, start, duration, text_length = struct.unpack_from('<IIIII', data, position + offset)
                if channel == 0:
                    text = data[position + offset + 20:position + offset + 20 + text_length].split(b'\0')[0].decode('utf8')
                    if text.isdigit():
                        text = subtitles[int(text)]
                    if text:
                        cues.append({'start': start / unit, 'end': (start + duration) / unit, 'text': text.replace('|', '\n')})
            position += size
        if not cues:
            continue
        vtt = 'WEBVTT\n\n' + '\n\n'.join(f"{index + 1}\n{timestamp(cue['start'])} --> {timestamp(cue['end'])}\n{cue['text']}" for index, cue in enumerate(cues)) + '\n'
        digest = hashlib.sha256(vtt.encode('utf8')).hexdigest()
        output = args.manifest.parent / f'{label}.zh-CN.{digest[:12]}.vtt'
        output.write_bytes(vtt.encode('utf8'))
        url = '/' + output.relative_to(ROOT / 'public').as_posix()
        previous_tracks = {track['url'] for track in video.get('subtitles', [])}
        video['subtitles'] = [{'url': url, 'language': 'zh-CN', 'label': '简体中文', 'default': True}]
        manifest['files'] = [file for file in manifest['files'] if file['url'] not in previous_tracks]
        manifest['files'].append({'url': url, 'bytes': output.stat().st_size, 'sha256': digest})
        print('SUBTITLES', label, len(cues), flush=True)
    manifest['source']['subtitleTableSha256'] = hashlib.sha256((t.TABLES / 'VideoSubtitleData.bytes').read_bytes()).hexdigest()
    manifest['source']['languageTableSha256'] = hashlib.sha256((t.TABLES / 'LangPackageTableCnData.bytes').read_bytes()).hexdigest()
    manifest['source']['contentTableSha256'] = hashlib.sha256((t.TABLES / 'AvgContentData.bytes').read_bytes()).hexdigest()
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


if __name__ == '__main__':
    main()
