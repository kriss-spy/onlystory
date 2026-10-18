"""Build audited event collections from installed Steam replay tables.

Schema field order reference: https://github.com/gf-data-tools/gf-data-ch/tree/main/stc
Only structural field names are borrowed. All table values come from Steam EN.

After gfl1-extract.py has archived scripts, run:
  python scripts/gfl1-catalog.py --stc-root "<game>/GirlsFrontLine_Data/StreamingAssets/Res/Pc/stc"
Defaults use .cache/gfl1/scripts and write .cache/gfl1/collections.json.
Use --all-events to discover native event collections into collections-expanded.json.
Use --events arctic-warfare,16 to select slugs or native replay row IDs.
Labels are recovered from installed assettexttable.ab; no probe cache is needed.
"""
import argparse
import hashlib
import json
import re
import struct
import unicodedata
from pathlib import Path

STORY_FIELDS = 'id mission_id description scripts campaign bgm title is_util start round point first mid end fail step_start_story step_end_story story_playback_sub_id background_code'.split()
PLAYBACK_FIELDS = 'id story_campaign_id name chapter type game_chronicle description is_hide tag order campaign_sub_name'.split()
EVENTS = [('operation-cube', [-1]), ('deep-dive', [-10, -11, -12, -13]), ('continuum-turbulence', [-24, -25, -26, -27, -28]), ('dual-randomness', [-41])]


def discover_events(playback, labels):
    """Discover whole negative-campaign collections using native replay rows."""
    stable = {tuple(campaigns): slug for slug, campaigns in EVENTS}
    stable[(-48,)] = 'poincare-recurrence'
    result = []
    used = set()
    for row in sorted(playback, key=lambda row: (row['order'], row['id'])):
        campaigns = [int(value) for value in row['story_campaign_id'].split(',') if value.strip()]
        if not campaigns or any(campaign >= 0 for campaign in campaigns):
            continue
        title = labels.get(row['name'], '')
        english = unicodedata.normalize('NFKD', title).encode('ascii', 'ignore').decode('ascii').lower()
        slug = stable.get(tuple(campaigns)) or re.sub(r'[^a-z0-9]+', '-', english).strip('-') or f'native-event-{row["id"]}'
        if slug in used:
            slug += f'-{row["id"]}'
        used.add(slug)
        result.append((slug, campaigns))
    return result


def discover_main_story(playback):
    """Select numbered campaigns actually exposed by native main-story replay."""
    return [(f'chapter-{row["story_campaign_id"]}' + ('-normal' if row['story_campaign_id'] == '1' else ''), [int(row['story_campaign_id'])])
            for row in sorted(playback, key=lambda row: (row['order'], row['id']))
            if row['type'] == 1 and row['story_campaign_id'].isdigit()]


def collection_title(replay, labels):
    key = replay['name']
    raw = labels.get(key, '')
    if key == 'story_playback-10000026' and raw == 'Poincar\u00c3\u00a9 Recurrence':
        return raw.encode('latin1').decode('utf-8'), {'rawTitle': raw, 'labelKey': key, 'transformation': 'latin1-to-utf8'}
    return raw, None


def decode_stc(data, fields):
    table, length, count = struct.unpack_from('<HII', data)
    if length != len(data) - 6:
        raise ValueError('Invalid STC declared length')
    width = data[10]
    types = data[11:11 + width]
    if width != len(fields) or any(t not in (5, 11) for t in types):
        raise ValueError('Unsupported STC schema')
    offset = 11 + width + ((count + 9) // 10) * 8
    rows = []
    offsets = []
    for _ in range(count):
        offsets.append(offset)
        row = {}
        for name, kind in zip(fields, types):
            if kind == 5:
                row[name] = struct.unpack_from('<i', data, offset)[0]
                offset += 4
            else:
                # The byte before the uint16 length marks the encoding.
                encoding = data[offset]
                size = struct.unpack_from('<H', data, offset + 1)[0]
                offset += 3
                if encoding not in (0, 1):
                    raise ValueError('Unsupported STC string encoding')
                row[name] = data[offset:offset + size].decode('utf-8')
                offset += size
        rows.append(row)
    if offset != len(data):
        raise ValueError('Trailing or incomplete STC data')
    for index, position in enumerate(range(0, count, 10)):
        identity, relative = struct.unpack_from('<ii', data, 11 + width + index * 8)
        if identity != rows[position]['id'] or relative != offsets[position]:
            raise ValueError('STC sparse index does not match decoded rows')
    return table, rows


def localization(path):
    return dict(line.split(',', 1) for line in path.read_text(encoding='utf-8-sig').splitlines() if ',' in line)


def load_labels(directory, resources, sources, load_bundle=None):
    """Read optional cached labels, otherwise recover only the two native tables."""
    needed = {'story_playback', 'story_util'}
    labels = {}
    for name in sorted(needed.copy()):
        path = directory / (name + '.txt')
        if path.is_file():
            labels.update(localization(path))
            sources.append({'file': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
            needed.remove(name)
    if not needed:
        return labels
    bundles = list(resources.glob('*assettexttable.ab'))
    if len(bundles) != 1:
        raise ValueError(f'Expected one installed assettexttable.ab bundle, found {len(bundles)}')
    if load_bundle is None:
        import UnityPy
        load_bundle = UnityPy.load
    bundle = bundles[0]
    for obj in load_bundle(str(bundle)).objects:
        if obj.type.name != 'TextAsset':
            continue
        asset = obj.read()
        if asset.m_Name not in needed:
            continue
        text = asset.m_Script.encode('utf-8', 'surrogateescape').decode('utf-8-sig')
        labels.update(line.split(',', 1) for line in text.splitlines() if ',' in line)
        needed.remove(asset.m_Name)
        if not needed:
            break
    if needed:
        raise ValueError(f'Missing installed localization tables: {sorted(needed)}')
    sources.append({'file': bundle.name, 'sha256': hashlib.sha256(bundle.read_bytes()).hexdigest(), 'textAssets': ['story_playback', 'story_util']})
    return labels


def script_refs(value, keyed=False):
    result = []
    for item in value.split(','):
        item = item.strip()
        if not item:
            continue
        trigger, script = item.split(':', 1) if keyed and ':' in item else ('', item)
        script = script.strip().removesuffix('.txt')
        # Native replay rows sometimes retain the resource directory, whereas
        # TextAsset identities contain its basename. Preserve other names.
        if script.lower().startswith('battleavg/'):
            script = script[len('BattleAvg/'):]
        result.append((script, trigger))
    return result


def build_collections(script_ids, playback, stories, labels, events=None, definitions=None):
    available = set(script_ids)
    canonical = {s.lower(): s for s in available}
    collections = []
    for slug, campaigns in EVENTS if events is None else events:
        inventory = {s for s in available if any(s.startswith(f'{c}-') for c in campaigns)}
        matches = [row for row in playback if set(campaigns).issubset({int(x) for x in row['story_campaign_id'].split(',')})]
        definition = (definitions or {}).get(slug)
        if len(matches) != 1 and not (definition and not matches):
            raise ValueError(f'Expected unique native replay collection for {slug}')
        replay = matches[0] if matches else None
        display_title, title_provenance = collection_title(replay, labels) if replay else (definition['title'], {'source': definition['source'], 'basis': 'Collaboration registry; absent from installed replay table'})
        section_labels = labels.get(replay['campaign_sub_name'], '').split(';') if replay else []
        sections = {}
        assigned = set()
        missing = []
        duplicates = []
        supplemental = set()
        for row in sorted((r for r in stories if r['campaign'] in campaigns), key=lambda r: r['id']):
            native_subchapter = row['story_playback_sub_id']
            section_id = (1 if definition else 998) if native_subchapter == 0 else native_subchapter
            section = sections.setdefault(section_id, {'id': f'{slug}-{section_id}', 'nativeSubchapterId': native_subchapter, 'title': 'Story' if definition else 'Additional native scenes, chronology unspecified' if native_subchapter == 0 else section_labels[section_id - 1] if 0 < section_id <= len(section_labels) else f'Section {section_id}', 'order': section_id, 'scenes': []})
            # Native replay scripts explicitly order its text scenes. Triggered
            # scenes are preserved separately because gameplay decides timing.
            refs = []
            for field, phase, keyed in [('start', 'opening', False), ('scripts', 'replay', False), ('first', 'first-clear', False), ('mid', 'mid', False), ('end', 'ending', False), ('round', 'round', True), ('point', 'map', True), ('step_start_story', 'step-start', True), ('step_end_story', 'step-end', True), ('fail', 'failure', False)]:
                for script, trigger in script_refs(row[field], keyed):
                    if not any(s.lower() == script.lower() for s, _, _, _ in refs):
                        refs.append((script, phase, field, trigger))
            for raw_script, phase, field, trigger in refs:
                script = canonical.get(raw_script.lower(), raw_script)
                if script not in available:
                    missing.append({'script': script, 'storyUtilId': row['id'], 'field': field})
                elif script not in inventory:
                    supplemental.add(script)
                if script in assigned:
                    duplicates.append({'script': script, 'storyUtilId': row['id'], 'field': field})
                    continue
                assigned.add(script)
                for trigger_field, trigger_phase in [('round', 'round'), ('point', 'map'), ('step_start_story', 'step-start'), ('step_end_story', 'step-end')]:
                    for triggered_script, native_trigger in script_refs(row[trigger_field], True):
                        if triggered_script.lower() == script.lower():
                            phase, trigger = trigger_phase, native_trigger
                roles = [name for name in ['start', 'first', 'end', 'mid', 'fail'] if any(s.lower() == script.lower() for s, _ in script_refs(row[name]))]
                if phase == 'replay':
                    if 'first' in roles:
                        phase = 'first-clear'
                    elif 'end' in roles:
                        phase = 'repeat-ending' if row['first'] and row['first'] != row['end'] else 'ending'
                section['scenes'].append({'script': script, 'sourceStatus': 'available' if script in available else 'missing', 'title': labels.get(row['title'], script), 'missionId': row['mission_id'], 'storyUtilId': row['id'], 'phase': phase, 'roles': roles, 'trigger': trigger or None, 'order': len(section['scenes']) + 1, 'orderStatus': 'trigger-dependent' if phase in ('round', 'map', 'step-start', 'step-end', 'failure') else 'native-ancillary' if native_subchapter == 0 else 'native-replay', 'provenance': {'table': '5044.stc', 'row': row['id'], 'field': field, 'nativeSubchapterId': native_subchapter}})
        unassigned = sorted(inventory - assigned)
        if unassigned:
            sections[999] = {'id': f'{slug}-unresolved', 'title': 'Additional source scenes, placement unresolved', 'order': 999, 'scenes': [{'script': script, 'title': script, 'phase': 'unresolved', 'roles': [], 'order': index + 1, 'orderStatus': 'unresolved', 'provenance': {'source': 'TextAsset inventory', 'note': 'No selected native replay row references this script.'}} for index, script in enumerate(unassigned)]}
        unresolved = [f'{len(unassigned)} source scripts lack replay placement.'] if unassigned else []
        if any(s['orderStatus'] == 'trigger-dependent' for section in sections.values() for s in section['scenes']):
            unresolved.append('Triggered scenes retain native trigger IDs; their exact gameplay interleaving is not a single linear sequence.')
        native_campaigns = [int(x) for x in replay['story_campaign_id'].split(',')] if replay else campaigns
        collections.append({'id': f'gfl1-{slug}', 'title': display_title or slug, **({'titleProvenance': title_provenance} if title_provenance else {}), 'chapterIds': campaigns, 'order': replay['order'] if replay else definition['order'], 'orderStatus': 'native-replay-with-triggered-extras' if replay else 'native-story-util-with-triggered-extras', 'replayId': replay['id'] if replay else None, 'nativeChapterIds': native_campaigns, 'excludedNativeScripts': sorted(s for s in available if any(s.startswith(f'{c}-') for c in native_campaigns) and s not in inventory), 'supplementalNativeScripts': sorted(supplemental), 'sections': [sections[k] for k in sorted(sections)], 'audit': {'inventoryCount': len(inventory | supplemental), 'strictPrefixInventoryCount': len(inventory), 'assignedCount': len(assigned & available), 'missing': missing, 'unassigned': unassigned, 'duplicates': duplicates, 'unresolved': unresolved}})
    owners = {}
    for collection in collections:
        for section in collection['sections']:
            for scene in section['scenes']:
                owners.setdefault(scene['script'], []).append(collection['id'])
    campaign_ids = sorted({campaign for collection in collections for campaign in collection['chapterIds']})
    return {'version': 1, 'region': 'Steam EN', 'collections': collections, 'selection': {'eventIds': [collection['id'] for collection in collections], 'campaignIds': campaign_ids, 'scriptCount': len(owners), 'scripts': sorted(owners), 'sourceAssets': sorted(set(owners) & available), 'sourceScriptCount': len(set(owners) & available), 'missingReferences': [dict(collectionId=collection['id'], **missing) for collection in collections for missing in collection['audit']['missing']]}, 'audit': {'crossCollectionDuplicates': [{'script': script, 'collections': ids} for script, ids in owners.items() if len(ids) > 1], 'unselectedNegativeScripts': sorted(script for script in available if script.startswith('-') and script not in owners)}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stc-root', type=Path, required=True)
    parser.add_argument('--scripts', type=Path, default=Path('.cache/gfl1/scripts'))
    parser.add_argument('--localization-dir', type=Path, help='Optional cached story_playback.txt and story_util.txt labels; missing tables are read from installed assettexttable.ab')
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument('--all-events', action='store_true', help='Discover every native all-negative replay collection')
    selection.add_argument('--all-story', action='store_true', help='Discover all native main-story chapters and event collections')
    parser.add_argument('--collaborations', action='store_true', help='Include the explicit EN collaboration registry absent from native replay')
    selection.add_argument('--events', help='Comma-separated native event slugs or replay row IDs')
    parser.add_argument('--output', type=Path, help='Defaults to collections-expanded.json for --all-events/--events, otherwise collections.json')
    args = parser.parse_args()
    sources = []
    tables = {}
    for name, fields in [('5044.stc', STORY_FIELDS), ('5186.stc', PLAYBACK_FIELDS)]:
        data = (args.stc_root / name).read_bytes()
        table, rows = decode_stc(data, fields)
        tables[name] = rows
        sources.append({'file': name, 'tableId': table, 'sha256': hashlib.sha256(data).hexdigest(), 'rows': len(rows)})
    labels = load_labels(args.localization_dir or args.scripts, args.stc_root.parent, sources)
    events = None
    if args.all_events or args.all_story or args.events:
        events = discover_events(tables['5186.stc'], labels)
        if args.all_story:
            events = discover_main_story(tables['5186.stc']) + events
        if args.events:
            requested = set(args.events.split(','))
            selected = []
            matched = set()
            for slug, campaigns in events:
                replay = next(row for row in tables['5186.stc'] if row['story_campaign_id'] == ','.join(map(str, campaigns)))
                keys = {slug, f'gfl1-{slug}', str(replay['id'])} & requested
                if keys:
                    selected.append((slug, campaigns))
                    matched.update(keys)
            if requested - matched:
                parser.error(f'Unknown native event selections: {sorted(requested - matched)}')
            events = selected
    definitions = None
    if args.collaborations:
        registry = Path(__file__).with_name('gfl1-collaborations.json')
        definitions = json.loads(registry.read_text(encoding='utf-8'))['collections']
        sources.append({'file': registry.name, 'sha256': hashlib.sha256(registry.read_bytes()).hexdigest()})
        events = list(EVENTS if events is None else events) + [(slug, row['campaigns']) for slug, row in definitions.items()]
    result = build_collections([f.stem for f in args.scripts.glob('*.txt')], tables['5186.stc'], tables['5044.stc'], labels, events, definitions)
    if definitions:
        from gfl1_collaborations import enrich_collections
        enrich_collections(result, definitions, args.scripts, args.stc_root, sources)
    for collection in result['collections']:
        if all(campaign >= 0 for campaign in collection['chapterIds']):
            collection['category'] = 'Main story'
            # Preserve the original Chapter 1 collection URL and existing saves.
            if collection['chapterIds'] == [1]:
                collection['id'] = 'gfl1-chapter-1-normal'
        else:
            collection['category'] = 'Event'
    result['collections'].sort(key=lambda collection: collection['order'])
    result['sources'] = sources
    result['schemaReference'] = 'https://github.com/gf-data-tools/gf-data-ch/tree/main/stc'
    output = args.output or Path('.cache/gfl1/collections-expanded.json' if args.all_events or args.all_story or args.events else '.cache/gfl1/collections.json')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for c in result['collections']:
        print(c['id'], c['audit']['assignedCount'], 'assigned;', len(c['audit']['unassigned']), 'unassigned;', len(c['audit']['missing']), 'missing')


if __name__ == '__main__':
    main()

