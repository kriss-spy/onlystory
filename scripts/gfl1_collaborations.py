"""Add collaboration-only metadata without claiming it comes from native replay."""
import hashlib
import importlib
import re


def enrich_collections(result, definitions, scripts, stc_root, sources):
    catalog = importlib.import_module('gfl1-catalog')
    mission_fields = importlib.import_module('gfl1_gameplay').MISSION_FIELDS
    raw = (stc_root / '5016.stc').read_bytes()
    _, missions = catalog.decode_stc(raw, mission_fields)
    mission_by_id = {str(row['id']): row for row in missions}
    sources.append({'file': '5016.stc', 'sha256': hashlib.sha256(raw).hexdigest(), 'rows': len(missions)})
    import UnityPy
    bundle, = stc_root.parent.glob('*assettexttable.ab')
    mission_labels = {}
    for obj in UnityPy.load(str(bundle)).objects:
        if obj.type.name == 'TextAsset':
            asset = obj.read()
            if asset.m_Name == 'mission':
                mission_labels = dict(line.split(',', 1) for line in asset.m_Script.splitlines() if ',' in line)
                break
    if not mission_labels:
        raise ValueError('Missing installed mission localization')
    sources.append({'file': bundle.name, 'sha256': hashlib.sha256(bundle.read_bytes()).hexdigest(), 'textAssets': ['mission']})
    available = {p.stem for p in scripts.glob('*.txt')}
    for collection in result['collections']:
        definition = definitions.get(collection['id'].removeprefix('gfl1-'))
        if not definition:
            continue
        collection['eventType'] = 'collaboration'
        # Old Rabbit Hunt has mission records but no story_util records. Its
        # explicit file sequence is kept distinct from replay-derived metadata.
        if 'missionTitles' in definition:
            scenes = []
            for mission in sorted((m for m in missions if m['campaign'] in collection['chapterIds']), key=lambda m: m['sub']):
                for script in sorted(available):
                    match = re.fullmatch(rf'-8-{mission["sub"]}-(1|2First|2End)', script)
                    if not match:
                        continue
                    phase = {'1': 'opening', '2First': 'first-clear', '2End': 'repeat-ending'}[match[1]]
                    scenes.append({'script': script, 'sourceStatus': 'available', 'title': mission_labels.get(mission['name']) or definition['missionTitles'][mission['sub'] - 1], 'missionId': str(mission['id']), 'phase': phase, 'roles': [], 'order': len(scenes) + 1, 'orderStatus': 'mission-sub-and-source-phase', 'provenance': {'table': '5016.stc', 'row': mission['id'], 'sub': mission['sub'], 'phaseBasis': 'Explicit original TextAsset suffix', 'titleLabel': mission['name']}})
            collection['sections'] = [{'id': 'operation-rabbit-hunt-story', 'title': 'Story', 'order': 1, 'scenes': scenes}]
            collection['orderStatus'] = 'mission-sub-and-source-phase'
            collection['audit']['unassigned'] = []
            collection['audit']['unresolved'] = []
            collection['audit']['assignedCount'] = len(scenes)
            if {s['script'] for s in scenes} != {s for s in available if s.startswith('-8-')}:
                raise ValueError('Unmapped Rabbit Hunt scene')
        else:
            for section in collection['sections']:
                for scene in section['scenes']:
                    if scene.get('orderStatus') == 'native-ancillary':
                        scene['orderStatus'] = 'native-story-util'
                    if not scene['title'] or scene['title'] == scene['script']:
                        names = {mission_labels.get(mission_by_id[mid]['name'], '') for mid in scene.get('missionId', '').split(',') if mid in mission_by_id}
                        names.discard('')
                        if len(names) == 1:
                            scene['title'] = names.pop()
                    scene['title'] = scene['title'].replace('//c', ',')
        extras = definition.get('extras', {})
        if extras:
            if set(extras) - available:
                raise ValueError(f'Missing collaboration extras: {set(extras) - available}')
            collection['sections'].append({'id': collection['id'] + '-extras', 'title': 'Bar stories' if collection['id'] == 'gfl1-valhalla' else 'Additional encounters and tutorials', 'order': 1000, 'scenes': [{'script': script, 'title': title, 'sourceStatus': 'available', 'phase': 'unresolved', 'roles': [], 'order': i + 1, 'orderStatus': 'explicit-collaboration-extra', 'provenance': {'source': 'gfl1-collaborations.json', 'note': 'Original named TextAsset; separate from mission story sequence'}} for i, (script, title) in enumerate(extras.items())]})
            collection['supplementalNativeScripts'] = sorted(set(collection['supplementalNativeScripts']) | set(extras))
            collection['audit']['inventoryCount'] += len(extras)
            collection['audit']['assignedCount'] += len(extras)
        collection['collectionProvenance'] = {'source': 'gfl1-collaborations.json', 'reference': definition['source'], 'replayTableStatus': 'Not exposed in installed 5186.stc'}
    owners = {}
    for collection in result['collections']:
        for section in collection['sections']:
            for scene in section['scenes']:
                owners.setdefault(scene['script'], []).append(collection['id'])
    result['selection'].update(scripts=sorted(owners), sourceAssets=sorted(set(owners) & available), scriptCount=len(owners), sourceScriptCount=len(set(owners) & available))
    result['audit']['crossCollectionDuplicates'] = [{'script': script, 'collections': ids} for script, ids in owners.items() if len(ids) > 1]
    result['audit']['unselectedNegativeScripts'] = sorted(s for s in available if s.startswith('-') and s not in owners)
