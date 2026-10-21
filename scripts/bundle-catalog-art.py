"""Build the small, committed catalog artwork bundle from verified local originals.

Usage: python scripts/bundle-catalog-art.py --library /path/public --library /path/pjsk/library
Requires Pillow. No network downloads or story media are included.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

def references(value):
    if isinstance(value, dict):
        if isinstance(value.get('url'), str) and value['url'].startswith('/private/'):
            yield value
        for child in value.values():
            yield from references(child)
    elif isinstance(value, list):
        for child in value:
            yield from references(child)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--library', action='append', type=Path, required=True)
    args = parser.parse_args()
    art = json.loads((ROOT / 'src/cover-art.json').read_text(encoding='utf8'))
    schools = json.loads((ROOT / 'src/ba-catalog.json').read_text(encoding='utf8'))['schools']
    originals = {item['url']: item for item in references([art, schools])}
    output = ROOT / 'public/catalog-art'
    output.mkdir(exist_ok=True)
    manifest = {}
    for url, metadata in sorted(originals.items()):
        source = next((base / url.lstrip('/') for base in args.library if (base / url.lstrip('/')).is_file()), None)
        if source is None:
            raise FileNotFoundError(url)
        original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        if metadata.get('sha256') and metadata['sha256'] != original_hash:
            raise ValueError(f'Original checksum mismatch: {url}')
        with Image.open(source) as image:
            # Catalog thumbnails are bounded; keep alpha for logos and emblems.
            image = image.convert('RGBA' if image.mode in ('RGBA', 'LA', 'P') else 'RGB')
            image.thumbnail((960, 640), Image.Resampling.LANCZOS)
            temporary = output / 'catalog.tmp.webp'
            image.save(temporary, 'WEBP', quality=84, method=6)
            payload = temporary.read_bytes()
            digest = hashlib.sha256(payload).hexdigest()
            destination = output / (digest[:24] + '.webp')
            temporary.replace(destination)
            manifest[url] = {'url': '/catalog-art/' + destination.name, 'sha256': digest, 'bytes': len(payload), 'width': image.width, 'height': image.height, 'originalSha256': original_hash}
    (ROOT / 'src/catalog-assets.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    # Remove only generated thumbnails that no catalog reference uses anymore.
    expected = {Path(item['url']).name for item in manifest.values()}
    for thumbnail in output.glob('*.webp'):
        if thumbnail.name not in expected:
            thumbnail.unlink()
    print(f'Bundled {len(manifest)} catalog images, {sum(item["bytes"] for item in manifest.values()):,} bytes')

if __name__ == '__main__':
    main()
