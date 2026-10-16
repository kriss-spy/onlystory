"""Extract precisely mapped Ilion books from installed Addressables/GFF segments."""
import json,sys,hashlib,os,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
PROTO=ROOT.parent/'onlystory-gfl2'
GAME=Path(os.environ.get('GF2_GAME_ROOT',r'D:\Program Files\GF2Exilium'))
sys.path[:0]=[str(PROTO/'resource_mapping'),str(GAME/'_reverse_engineering/dorm_legs_feet/assets/python_lib')]
import UnityPy
from resolve_assets import resolve_path,BUNDLES
OUT=ROOT/'.cache/gfl2-ilion/books';OUT.mkdir(parents=True,exist_ok=True)
subprocess.run(['node',str(ROOT/'scripts/gfl2-ilion.mjs'),'--index'],cwd=ROOT,check=True)
nodes=json.loads((ROOT/'.cache/gfl2-ilion/nodes.json').read_text(encoding='utf8'))
labels=sorted({s for n in nodes for p in n['plots'] for s in p['scripts']})
mapping_path=PROTO/'current_book_probe/AdvBookAssetPathMappingSO.json';mapping=json.loads(mapping_path.read_text(encoding='utf8'));m=dict(zip(mapping['m_PlotId2PathIndexDict']['keys'],mapping['m_PlotId2PathIndexDict']['values']))
sources=[];segments={}
for label in labels:
    path='Assets/Utage/BuildResources/'+mapping['Path'][int(m[label])]+'/'+label+'.book.asset'
    resolved=resolve_path(path)
    if not resolved:raise ValueError('Not in catalogue: '+path)
    found=False
    for loc in resolved['locations']:
      for dep in loc['dependencies']:
        physical=dep.get('physical')
        if not physical:continue
        identity=(physical['bundle'],physical['segment_offset'],physical['segment_size'])
        if identity not in segments:
            with (BUNDLES/identity[0]).open('rb') as stream:stream.seek(identity[1]);raw=stream.read(identity[2] or -1)
            key=bytes(a^b for a,b in zip(raw,b'UnityFS\0\0\0\0\7'+b'5.x.'))
            decoded=bytes(v^key[i%16] for i,v in enumerate(raw[:32768]))+raw[32768:]
            segments[identity]=(UnityPy.load(decoded),hashlib.sha256(raw).hexdigest())
        env,sha=segments[identity]
        obj=env.container[loc['internal_id']] if loc['internal_id'] in env.container else None
        if obj is None:continue
        data=obj.read_typetree()
        if data.get('m_Name')!=label+'.book':continue
        (OUT/(label+'.book.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        sources.append({'script':label,'sourcePath':path,'catalogueKey':resolved['catalogue_key'],'internalId':loc['internal_id'],'sourceBundle':physical,'segmentSha256':sha,'pathId':str(obj.path_id)})
        found=True;break
      if found:break
    if not found:raise ValueError('Mapped book not extracted: '+label)
(OUT.parent/'books-provenance.json').write_text(json.dumps({'mappingSha256':hashlib.sha256(mapping_path.read_bytes()).hexdigest(),'books':sources},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Extracted',len(sources),'books from',len(segments),'unique segments.',flush=True)


