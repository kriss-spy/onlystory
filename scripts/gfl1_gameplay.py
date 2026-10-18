"""Recover gameplay terrain from native mission rows, without synthesizing maps."""
import hashlib
import json
import re
from importlib import import_module

MISSION_FIELDS = ['id', 'duplicate_type', 'integration_switch', 'coin_type', 'campaign', 'sub', 'if_emergency', 'endless_mode', 'special_type', 'name', 'difficulty', 'recommend_gun_level', 'exp_parameter', 'type', 'enemy_ai_type', 'win_turn', 'win_spot_id', 'special_spot_id', 'expect_enemy_die_num', 'expect_gun_die_num', 'expect_turn', 'boss_team_id', 'turn_duration', 'costbp', 'getcoin', 'getcoin_parameter', 'coin_ap', 'turn_limit', 'limit_gun_pool', 'limit_team', 'map_res_name', 'map_information', 'is_hide', 'is_snow', 'adaptive_gun', 'fog_length', 'fog_color', 'limit_equip_pool', 'draw_event_s_id', 'support_available', 'enemy_quickmove', 'expect_defend_line_turn', 'expect_hostage_num', 'title_logo', 'random_line_spot', 'order', 'reinforce_ally_team', 'reinforce_ally_turn', 'reinforce_ally_spot', 'ally_boss_team_id', 'ally_code', 'supply_parameter', 'drop_mission_key', 'close_missions', 'mission_group_id', 'mission_group_draw_event', 'open_mission_keys', 'mission_describe', 'force_type', 'round_config', 'color_change_type', 'color_change_number', 'color_change_result', 'spot_reset', 'draw_code', 'reset_drop_key_once', 'close_mission_control', 'limit_squad', 'open_mission_items', 'drop_mission_item', 'mapped_mission_id', 'branch_next_mission_id', 'win_type', 'medal_type_silver', 'drop_item_count', 'difficulty_recommend', 'difficulty_recommend_addendum', 'limit_sangvis', 'mission_tip', 'win_step', 'event_score', 'score_prize', 'drop_key_info', 'lose_type', 'fight_environment_group', 'environment_transform_config', 'recommended_team_ids', 'restart_hide', 'auto_battle', 'daily_demand', 'limit_vehicle', 'limit_component_pool', 'guide_cdn', 'mission_intensify_item_config', 'mission_item']


def select_terrain(campaign, candidates):
    exact = [row for row in candidates if row['campaign'] == campaign]
    codes = {row['map_res_name'] for row in exact}
    if len(codes) != 1:
        return None
    code = next(iter(codes))
    if not re.fullmatch(r'[A-Za-z0-9_]+', code):
        return None
    return code, exact


def native_story_relations(stories, script_ids, campaigns=None):
    catalog = import_module('gfl1-catalog')
    canonical = {script.lower(): script for script in script_ids}
    relations, source_rows = {}, {}
    fields = [('start', False), ('scripts', False), ('first', False), ('mid', False),
              ('end', False), ('round', True), ('point', True), ('step_start_story', True),
              ('step_end_story', True), ('fail', False)]
    for row in stories:
        if campaigns is not None and int(row['campaign']) not in campaigns:
            continue
        mission_ids = {int(value) for value in row['mission_id'].split(',') if value}
        for field, keyed in fields:
            for script, _ in catalog.script_refs(row[field], keyed):
                script = canonical.get(script.replace('\\', '/').rsplit('/', 1)[-1].lower())
                if script is not None:
                    relations.setdefault(script, set()).update(mission_ids)
                    source_rows.setdefault(script, set()).add(row['id'])
    return {script: sorted(ids) for script, ids in relations.items()}, source_rows


def recover_gameplay(resources, output, manifest, image_asset, library):
    import UnityPy
    table = resources / 'stc/5016.stc'
    raw = table.read_bytes()
    table_id, rows = import_module('gfl1-catalog').decode_stc(raw, MISSION_FIELDS)
    missions = {row['id']: row for row in rows}
    catalog = import_module('gfl1-catalog')
    story_table = resources / 'stc/5044.stc'
    story_raw = story_table.read_bytes()
    _, stories = catalog.decode_stc(story_raw, catalog.STORY_FIELDS)
    selected_campaigns = None
    if 'campaigns' in manifest:
        selected_campaigns = set(manifest['campaigns']) | {1}
        if not manifest['campaigns']:
            # A selection-registry extraction lists its scripts without a
            # --campaigns argument; the selected scripts' own campaign
            # prefixes are the native scope, never additional campaigns.
            selected_campaigns |= {
                int(match.group(1))
                for script in manifest['scripts']
                if (match := re.match(r'^(-?\d+)-', script))
            }
    relations, story_rows = native_story_relations(stories, manifest['scripts'], selected_campaigns)
    story_campaigns = {row['id']: int(row.get('campaign', 0)) for row in stories}
    story_hash = hashlib.sha256(story_raw).hexdigest()
    selections = {}
    unresolved = []
    for script in manifest['scripts']:
        match = re.match(r'^(-?\d+)-', script)
        if not match:
            continue
        campaign = int(match.group(1))
        sub_match = re.match(r'^-?\d+-(\d+)-', script)
        sub = int(sub_match.group(1)) if sub_match else None
        candidates = [missions[i] for i in relations.get(script, []) if i in missions]
        if not candidates and campaign == 1:
            candidates = [row for row in rows if row['campaign'] == 1 and row['sub'] == sub and row['if_emergency'] == 0]
        if not candidates and campaign == -8 and re.fullmatch(r'-8-\d+-(1|2First|2End)', script):
            # Rabbit Hunt survives in mission/STC and TextAssets, but its
            # story_util rows were removed from the installed replay registry.
            candidates = [row for row in rows if row['campaign'] == -8 and row['sub'] == sub]
        # A replay can reference original and rerun missions with different maps.
        native_campaigns = {story_campaigns[row] for row in story_rows.get(script, set()) if story_campaigns[row] != 0}
        resolved_campaign = campaign
        if campaign not in native_campaigns and len(native_campaigns) == 1:
            resolved_campaign = next(iter(native_campaigns))
        selected = select_terrain(resolved_campaign, candidates)
        if selected is None:
            unresolved.append({'script': script, 'reason': 'No unambiguous single terrain resource for source campaign', 'nativeCandidates': [{'id': row['id'], 'campaign': row['campaign'], 'mapResource': row['map_res_name']} for row in candidates]})
            continue
        code, exact = selected
        selections[script] = {'name': code, 'missionIds': [row['id'] for row in exact],
            'provenance': {'table': table.name, 'tableId': table_id, 'tableSha256': hashlib.sha256(raw).hexdigest(),
                'storyTable': story_table.name, 'storyTableSha256': story_hash, 'storyUtilIds': sorted(story_rows.get(script, [])),
                'field': 'map_res_name', 'sourceScriptCampaign': campaign, 'nativeStoryCampaign': resolved_campaign, 'selection': 'Native mission campaign matches native story relation; source script campaign when no relation exists',
                'missionRows': [{'id': row['id'], 'campaign': row['campaign'], 'mapResource': row['map_res_name'], 'mapInformation': row['map_information']} for row in candidates]}}
    wanted = {entry['name'] for entry in selections.values()}
    textures = {}
    cache_path = output / 'gameplay-texture-cache.json'
    cache = json.loads(cache_path.read_text(encoding='utf-8')) if cache_path.exists() else {}
    for bundle in sorted(resources.glob('*assetmap*.ab')):
        # Native bundles group their exact map raster names by chapter/OPS key.
        logical = bundle.name.lower()
        if not any('assetmap' + name.split('_')[0].lower() + '.ab' in logical for name in wanted):
            continue
        fingerprint = f'{bundle.name}:{bundle.stat().st_size}:{bundle.stat().st_mtime_ns}'
        cached = cache.get(fingerprint, {})
        needed = {name for name in wanted if 'assetmap' + name.split('_')[0].lower() + '.ab' in logical}
        if needed <= cached.keys() and all((library / cached[name]['url'].lstrip('/')).is_file() for name in needed):
            textures.update(cached)
            manifest['sources'] = [s for s in manifest['sources'] if s['file'] != bundle.name] + [{'file': bundle.name, 'sha256': next(iter(cached.values()))['bundleSha256'], 'bytes': bundle.stat().st_size}]
            continue
        env = UnityPy.load(str(bundle))
        used = False
        for obj in env.objects:
            if obj.type.name != 'Texture2D':
                continue
            texture = obj.read()
            if texture.m_Name in wanted:
                textures[texture.m_Name] = {'url': image_asset(texture.image, 'gameplay:' + texture.m_Name),
                    'width': texture.m_Width, 'height': texture.m_Height, 'bundle': bundle.name,
                    'bundleSha256': hashlib.sha256(bundle.read_bytes()).hexdigest()}
                used = True
        if used:
            cache[fingerprint] = {name: entry for name, entry in textures.items() if entry['bundle'] == bundle.name}
            cache_path.write_text(json.dumps(cache, indent=2), encoding='utf-8')
            manifest['sources'] = [s for s in manifest['sources'] if s['file'] != bundle.name] + [{'file': bundle.name, 'sha256': hashlib.sha256(bundle.read_bytes()).hexdigest(), 'bytes': bundle.stat().st_size}]
    manifest['gameplayBackgrounds'] = {}
    for script, entry in selections.items():
        if entry['name'] in textures:
            texture = textures[entry['name']]
            entry.update({key: texture[key] for key in ('url', 'width', 'height')})
            entry['provenance'].update({key: texture[key] for key in ('bundle', 'bundleSha256')})
            manifest['gameplayBackgrounds'][script] = entry
        else:
            unresolved.append({'script': script, 'reason': 'Selected native terrain texture was not found in installed map bundles', 'mapResource': entry['name'], 'missionIds': entry['missionIds'], 'provenance': entry['provenance']})
    manifest['gameplayBackgroundAudit'] = {'resolvedCount': len(manifest['gameplayBackgrounds']), 'unresolved': unresolved}
    manifest['sources'] = [s for s in manifest['sources'] if s['file'] != table.name] + [{'file': table.name, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}]
    manifest['sources'] = [s for s in manifest['sources'] if s['file'] != story_table.name] + [{'file': story_table.name, 'sha256': story_hash, 'bytes': len(story_raw)}]
    return manifest['gameplayBackgrounds']
