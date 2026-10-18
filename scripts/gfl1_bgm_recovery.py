"""Inventory installed CRI banks without changing published audio manifests."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import shutil
import subprocess


def inventory_banks(resources, output, decoder, prior_cache=None):
    output.mkdir(parents=True, exist_ok=True)
    scratch = output / 'probe'
    scratch.mkdir(exist_ok=True)

    def inspect(source):
        checksum = hashlib.sha256(source.read_bytes()).hexdigest()
        name = source.name.removesuffix('.bytes')
        target = output / (name + '.streams.json')
        candidates = [target]
        if prior_cache:
            candidates.append(prior_cache / target.name)
        for candidate in candidates:
            if candidate.is_file():
                cached = json.loads(candidate.read_text(encoding='utf-8-sig'))
                if cached.get('sha256') == checksum and cached.get('streams'):
                    if candidate != target:
                        target.write_text(json.dumps(cached, indent=2), encoding='utf-8')
                    return {'bank': source.name, 'sha256': checksum, 'streams': len(cached['streams']), 'cached': True}
        temporary = scratch / name
        shutil.copyfile(source, temporary)
        try:
            result = subprocess.run([str(decoder), '-m', '-I', '-s', '1', '-S', '0', str(temporary)], capture_output=True, text=True, timeout=120)
            streams = [json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]
            entry = {'sha256': checksum, 'source': source.name, 'streams': streams}
            if result.returncode or not streams:
                entry['error'] = result.stderr.strip() or result.stdout.strip() or f'decoder exit {result.returncode}'
            target.write_text(json.dumps(entry, indent=2), encoding='utf-8')
            return {'bank': source.name, 'sha256': checksum, 'streams': len(streams), **({'error': entry['error']} if 'error' in entry else {})}
        finally:
            temporary.unlink(missing_ok=True)

    banks = sorted(resources.glob('*.acb.bytes'))
    results = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        for result in executor.map(inspect, banks):
            results.append(result)
            if len(results) % 40 == 0:
                print(f'Inventoried {len(results)}/{len(banks)} banks', flush=True)
    (output / 'inventory-index.json').write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--resources', type=Path, required=True)
    parser.add_argument('--decoder', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path('.cache/gfl1/audio-bank-inventories'))
    parser.add_argument('--prior-cache', type=Path, default=Path('.cache/gfl1'))
    args = parser.parse_args()
    results = inventory_banks(args.resources, args.output, args.decoder.resolve(), args.prior_cache)
    print(f'Banks: {len(results)}; streams: {sum(entry["streams"] for entry in results)}; failures: {sum("error" in entry for entry in results)}')


if __name__ == '__main__':
    main()
