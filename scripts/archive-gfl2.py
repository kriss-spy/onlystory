"""Create and verify a ZIP64 handoff without removing working resources."""
import argparse
import hashlib
import json
from pathlib import Path
import time
import zipfile


def files_under(base, prefix):
    for path in sorted(base.rglob('*')):
        if path.is_file() and not path.is_symlink() and '__pycache__' not in path.parts:
            yield path, f'{prefix}/{path.relative_to(base).as_posix()}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--destination', type=Path, required=True)
    parser.add_argument('--tables', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    destination = args.destination.resolve()
    partial = destination.with_suffix('.zip.partial')
    if destination.exists() or partial.exists():
        raise SystemExit('Refusing to overwrite an existing archive or partial archive.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    entries = []
    for name in ['src', 'scripts', 'docs', 'tests', 'public', 'private-review']:
        entries.extend(files_under(root / name, f'onlystory/{name}'))
    for path in sorted(root.iterdir()):
        if path.is_file() and not path.name.endswith(('.tsbuildinfo', '.local')):
            entries.append((path, f'onlystory/{path.name}'))
    # Preserve recovered books, raw media, extraction tools and evidence.
    for path in sorted((root / '.cache').iterdir()):
        if path.name.startswith(('gfl2', 'ilion', 'cover', 'storage-images', 'storage-experiments')):
            if path.is_dir():
                entries.extend(files_under(path, f'onlystory/.cache/{path.name}'))
            elif path.is_file():
                entries.append((path, f'onlystory/.cache/{path.name}'))
    sibling = root.parent / 'onlystory-gfl2'
    if sibling.exists():
        entries.extend(files_under(sibling, 'onlystory-gfl2'))
    if args.tables:
        if not args.tables.is_dir():
            raise SystemExit('Source table directory does not exist.')
        entries.extend(files_under(args.tables, 'gfl2-source-tables'))
    if not entries or len({name for _, name in entries}) != len(entries):
        raise SystemExit('Empty or duplicate archive inventory.')
    total = sum(path.stat().st_size for path, _ in entries)
    print(f'Archiving {len(entries):,} files, {total:,} source bytes.', flush=True)
    compressed = {'.png', '.webp', '.jpg', '.mp4', '.m4a', '.ogg', '.zip', '.usm', '.hca', '.acb'}
    manifest = []
    done = 0
    last = time.monotonic()
    with zipfile.ZipFile(partial, 'x', allowZip64=True) as archive:
        for path, name in entries:
            info = zipfile.ZipInfo.from_file(path, name)
            info.compress_type = zipfile.ZIP_STORED if path.suffix.lower() in compressed else zipfile.ZIP_DEFLATED
            digest = hashlib.sha256()
            size = 0
            with path.open('rb') as source, archive.open(info, 'w', force_zip64=True) as target:
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
                    target.write(chunk)
                    size += len(chunk)
            manifest.append({'path': name, 'bytes': size, 'sha256': digest.hexdigest()})
            done += size
            if time.monotonic() - last > 15:
                print(f'Written {done:,} / {total:,} source bytes.', flush=True)
                last = time.monotonic()
        archive.writestr('ARCHIVE-MANIFEST.json', json.dumps({
            'format': 1, 'files': manifest,
            'notes': 'Includes imported resources and local recovery inputs. Installed game, node_modules and dist are excluded. See onlystory/docs/deployment.md.'
        }, ensure_ascii=False, indent=2), compress_type=zipfile.ZIP_DEFLATED)
    print('Verifying every archived file against its SHA-256 manifest.', flush=True)
    with zipfile.ZipFile(partial) as archive:
        for entry in manifest:
            digest = hashlib.sha256()
            with archive.open(entry['path']) as source:
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
            if digest.hexdigest() != entry['sha256']:
                raise SystemExit(f"Archive hash mismatch: {entry['path']}")
    digest = hashlib.sha256()
    with partial.open('rb') as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    partial.rename(destination)
    checksum = destination.with_suffix('.zip.sha256')
    checksum.write_text(f'{digest.hexdigest()}  {destination.name}\n', encoding='utf8')
    print(json.dumps({'archive': str(destination), 'files': len(manifest),
        'sourceBytes': total, 'zipBytes': destination.stat().st_size,
        'sha256': digest.hexdigest(), 'verified': True}), flush=True)


if __name__ == '__main__':
    main()
