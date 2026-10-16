"""Read-only inventory of exported assets and byte-identical duplicate files.

Writes a report, never moves, converts, or deletes assets. Manifest membership
is evidence of a reference, not a complete runtime reachability or deletion test.
"""

import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def audit(root):
    paths = sorted(path for path in root.rglob('*') if path.is_file())
    listed = set()
    manifest_errors = []
    for path in paths:
        if path.name != 'manifest.json':
            continue
        try:
            manifest = json.loads(path.read_text('utf8'))
            for item in manifest.get('files', []):
                url = item if isinstance(item, str) else item.get('url')
                if url:
                    listed.add(url)
        except (ValueError, AttributeError) as error:
            manifest_errors.append({'path': path.relative_to(root).as_posix(), 'error': str(error)})
    by_size = defaultdict(list)
    packages = defaultdict(lambda: {'files': 0, 'bytes': 0})
    extensions = defaultdict(lambda: {'files': 0, 'bytes': 0})
    files = []
    for path in paths:
        relative = path.relative_to(root).as_posix()
        size = path.stat().st_size
        url = '/private/' + relative
        entry = {'path': relative, 'bytes': size, 'manifestListed': url in listed}
        files.append(entry)
        by_size[size].append((path, entry))
        for target in (packages[relative.split('/')[0]], extensions[path.suffix.lower()]):
            target['files'] += 1
            target['bytes'] += size
    duplicates = []
    for size, candidates in by_size.items():
        if len(candidates) < 2 or size == 0:
            continue
        hashes = defaultdict(list)
        for path, entry in candidates:
            hashes[digest(path)].append(entry)
        for sha, group in hashes.items():
            if len(group) > 1:
                duplicates.append({'sha256': sha, 'bytesEach': size,
                                   'redundantBytes': size * (len(group) - 1), 'files': group})
    duplicates.sort(key=lambda group: group['redundantBytes'], reverse=True)
    return {'root': str(root), 'scope': 'Physical exported files; apparent bytes, not allocated disk blocks.',
            'manifestCaveat': 'Unlisted does not mean unused. Direct URLs, nested model references, opening previews and old URLs need separate reachability checks.',
            'files': len(files), 'bytes': sum(item['bytes'] for item in files),
            'packages': dict(packages), 'extensions': dict(extensions),
            'manifestListedBytes': sum(item['bytes'] for item in files if item['manifestListed']),
            'manifestErrors': manifest_errors,
            'exactDuplicateRedundantBytes': sum(group['redundantBytes'] for group in duplicates),
            'duplicates': duplicates, 'largestFiles': sorted(files, key=lambda item: item['bytes'], reverse=True)[:30]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=PROJECT / 'public/private')
    parser.add_argument('--output', type=Path, default=PROJECT / '.cache/storage-audit.json')
    args = parser.parse_args()
    root = args.root.resolve(strict=True)
    output = args.output.resolve()
    if output == root or root in output.parents:
        parser.error('Put the report outside the audited asset directory.')
    report = audit(root)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', 'utf8')
    print(json.dumps({key: value for key, value in report.items()
                      if key not in ('duplicates', 'largestFiles')}, indent=2))
    print(f'Report: {output}')


if __name__ == '__main__':
    main()
