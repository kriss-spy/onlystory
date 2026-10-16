"""Prepare exact lossless WebP candidates without modifying source assets."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import sys

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pillow-path', default=os.environ.get('ONLYSTORY_PILLOW_PATH'))
    parser.add_argument('--event', action='append', help='Only process these completed event packages')
    args = parser.parse_args()
    if args.pillow_path:
        sys.path.insert(0, args.pillow_path)
    from PIL import Image
    cache = ROOT / '.cache/storage-images'
    cache.mkdir(parents=True, exist_ok=True)
    report_path = cache / 'index.json'
    report = json.loads(report_path.read_text('utf8')) if report_path.exists() else {}
    paths = sorted((ROOT / 'public/private').glob('*/characters/**/*.png'))
    if args.event:
        paths = [path for path in paths if path.relative_to(ROOT / 'public/private').parts[0] in args.event]
    for n, path in enumerate(paths):
        original = path.read_bytes()
        sha = hashlib.sha256(original).hexdigest()
        cached = report.get(sha, {})
        canonical = ROOT / 'public/private/shared' / f'{cached.get("sha256")}.webp'
        if cached.get('output') and canonical.exists() and hashlib.sha256(canonical.read_bytes()).hexdigest() == cached['sha256']:
            continue
        if sha in report and (not report[sha].get('output') or Path(report[sha]['output']).exists()):
            continue
        image = Image.open(path)
        # PNG IHDR bit depth. Leave higher precision and non-RGB inputs alone.
        if original[24] != 8 or image.mode not in ('RGB', 'RGBA'):
            report[sha] = {'eligible': False}
            continue
        # Preserve explicit profiles and skip gamma/chromaticity transforms until
        # a browser color-management comparison exists for them.
        if any(key in image.info for key in ('gamma', 'chromaticity', 'srgb')):
            report[sha] = {'eligible': False}
            continue
        destination = cache / f'{sha}.webp'
        metadata = {key: image.info[key] for key in ('icc_profile', 'exif', 'xmp') if key in image.info}
        image.save(destination, format='WEBP', lossless=True, exact=True, method=6, **metadata)
        decoded = Image.open(destination)
        assert decoded.size == image.size
        assert decoded.convert('RGBA').tobytes() == image.convert('RGBA').tobytes(), str(path)
        assert all(decoded.info.get(key) == value for key, value in metadata.items()), str(path)
        smaller = destination.stat().st_size < len(original)
        report[sha] = {'eligible': True, 'sameRGBA': True, 'sourceBytes': len(original),
                       'bytes': destination.stat().st_size, 'output': str(destination) if smaller else None,
                       'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
                       'width': image.width, 'height': image.height}
        temporary = report_path.with_suffix('.tmp')
        temporary.write_text(json.dumps(report, indent=2) + '\n', 'utf8')
        temporary.replace(report_path)
        print(f'{n + 1}/{len(paths)} {path.name}: {len(original)} -> {destination.stat().st_size}', flush=True)
    report_path.write_text(json.dumps(report, indent=2) + '\n', 'utf8')
    chosen = [item for item in report.values() if item.get('output')]
    print(f'{len(chosen)} unique exact conversions; {sum(item["sourceBytes"] - item["bytes"] for item in chosen)} bytes saved after deduplication')


if __name__ == '__main__':
    main()
