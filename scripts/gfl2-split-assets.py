"""Attach one verified extraction to each event without copying its payloads."""
import argparse
from copy import deepcopy
import json
from pathlib import Path
from gfl2_grid import grid_rows

ROOT = Path(__file__).resolve().parent.parent


def urls(value):
    if isinstance(value, str) and value.startswith('/private/'):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from urls(item)
    elif isinstance(value, list):
        for item in value:
            yield from urls(item)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch', type=Path, required=True)
    parser.add_argument('--assets', type=Path, required=True)
    args = parser.parse_args()
    sources = {kind: json.loads((args.assets / kind / 'manifest.json').read_text('utf8')) for kind in ['media', 'characters', 'videos']}
    for item in json.loads(args.batch.read_text('utf8')):
        event = item['id']
        books = sorted((ROOT / '.cache' / event / 'books').glob('*.book.json'))
        labels = {}
        for book in books:
            for grid in json.loads(book.read_text('utf8'))['importGridList']:
                for row in grid_rows(grid):
                    labels.setdefault(row['Command'], set()).add(row.get('Arg1', ''))
        for kind, source in sources.items():
            manifest = deepcopy(source)
            if kind == 'media':
                keys = {'backgrounds': set.union(*(labels.get(c, set()) for c in ['Bg', 'Sprite', 'CustomCharacter'])), 'audio': labels.get('Bgm', set()) | labels.get('Se', set())}
            elif kind == 'characters':
                keys = {'characters': labels.get('Character', set())}
            else:
                keys = {'videos': labels.get('Video', set())}
            selected = set.union(*keys.values())
            for key, names in keys.items():
                manifest[key] = {label: value for label, value in source[key].items() if label in names}
                for value in manifest[key].values():
                    if 'uses' in value:
                        value['uses'] = [use for use in value['uses'] if (use.get('script') or use.get('book', '').replace('.book.json', '')) in {book.name.replace('.book.json', '') for book in books}]
            manifest['unresolved'] = [entry for entry in source.get('unresolved', []) if str(entry['label']) in selected]
            required = set(urls({key: manifest[key] for key in keys}))
            manifest['files'] = [file for file in source['files'] if file['url'] in required]
            if required - {file['url'] for file in manifest['files']}:
                raise ValueError(f'{event}: assets absent from extraction inventory')
            manifest['event'] = event
            manifest['extractionBatch'] = args.assets.name
            if kind == 'media':
                manifest['coverage'] = {'books': len(books), 'backgroundLabels': len(keys['backgrounds']), 'Bgm': len(labels.get('Bgm', [])), 'Se': len(labels.get('Se', []))}
            if kind == 'characters':
                manifest['coverage'] = {'labels': len(keys['characters'])}
                manifest['bytes'] = sum(file['bytes'] for file in manifest['files'])
                manifest['modelCount'] = len({v.get('url') for v in manifest['characters'].values() if v.get('url')})
            destination = ROOT / 'public/private' / event / kind / 'manifest.json'
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', 'utf8')
        print(event, len(books), flush=True)


if __name__ == '__main__':
    main()
