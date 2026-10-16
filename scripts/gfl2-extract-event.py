"""Extract exactly the books referenced by a declared CN event package."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
spec_path = Path(sys.argv[1]).resolve()
spec = json.loads(spec_path.read_text('utf8'))
subprocess.run(['node', str(ROOT / 'scripts/gfl2-event-package.mjs'), '--index', str(spec_path)], cwd=ROOT, check=True)
evidence = ROOT.parent / 'onlystory-gfl2'
game = Path(os.environ.get('GF2_GAME_ROOT', 'D:/Program Files/GF2Exilium'))
sys.path[:0] = [str(evidence / 'resource_mapping'), str(game / '_reverse_engineering/dorm_legs_feet/assets/python_lib')]
import UnityPy
from resolve_assets import resolve_path, BUNDLES

base = ROOT / '.cache' / spec['id']
out = base / 'books'
out.mkdir(parents=True, exist_ok=True)
nodes = json.loads((base / 'nodes.json').read_text('utf8'))
labels = sorted({s for n in nodes for p in n['plots'] for s in p['scripts']})
mapping_path = evidence / 'current_book_probe/AdvBookAssetPathMappingSO.json'
mapping = json.loads(mapping_path.read_text('utf8'))
indices = dict(zip(mapping['m_PlotId2PathIndexDict']['keys'], mapping['m_PlotId2PathIndexDict']['values']))
sources = []
for label in labels:
    path = 'Assets/Utage/BuildResources/' + mapping['Path'][int(indices[label])] + '/' + label + '.book.asset'
    resolved = resolve_path(path)
    if not resolved:
        raise ValueError('Not in current catalogue: ' + path)
    found = False
    for location in resolved['locations']:
        for dependency in location['dependencies']:
            physical = dependency.get('physical')
            if not physical:
                continue
            with (BUNDLES / physical['bundle']).open('rb') as stream:
                stream.seek(physical['segment_offset'])
                raw = stream.read(physical['segment_size'] or -1)
            key = bytes(a ^ b for a, b in zip(raw, b'UnityFS\0\0\0\0\7' + b'5.x.'))
            decoded = bytes(v ^ key[i % 16] for i, v in enumerate(raw[:32768])) + raw[32768:]
            environment = UnityPy.load(decoded)
            obj = environment.container[location['internal_id']] if location['internal_id'] in environment.container else None
            if obj is None:
                continue
            data = obj.read_typetree()
            if data.get('m_Name') != label + '.book':
                continue
            (out / (label + '.book.json')).write_bytes((json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode('utf8'))
            sources.append({'script': label, 'sourcePath': path, 'catalogueKey': resolved['catalogue_key'], 'internalId': location['internal_id'], 'sourceBundle': physical, 'segmentSha256': hashlib.sha256(raw).hexdigest(), 'pathId': str(obj.path_id)})
            found = True
            break
        if found:
            break
    if not found:
        raise ValueError('Mapped book not extracted: ' + label)
    print('BOOK', label, flush=True)
(base / 'books-provenance.json').write_bytes((json.dumps({'mappingSha256': hashlib.sha256(mapping_path.read_bytes()).hexdigest(), 'books': sources}, ensure_ascii=False, indent=2) + '\n').encode('utf8'))
print('Extracted', len(sources), 'original mapped books.', flush=True)
