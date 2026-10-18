import unittest
from gfl1_audio import parse_template, find_stream, discover_cues


class CueTests(unittest.TestCase):
    def test_native_terrain_relations_include_triggers_without_catalog_cache(self):
        from gfl1_gameplay import native_story_relations
        fields = ['start','scripts','first','mid','end','round','point','step_start_story','step_end_story','fail']
        row = dict.fromkeys(fields, '') | {'id': 98, 'mission_id': '10004,10021', 'start': '-1-4-1.txt', 'point': '23:-1-4-4-Point23'}
        relations, sources = native_story_relations([row], ['-1-4-1', '-1-4-4-Point23'])
        self.assertEqual(relations, {'-1-4-1': [10004,10021], '-1-4-4-Point23': [10004,10021]})
        self.assertEqual(sources['-1-4-1'], {98})

    def test_missing_selected_terrain_texture_is_audited(self):
        import tempfile
        from pathlib import Path
        from importlib import import_module
        from unittest.mock import patch
        from gfl1_gameplay import recover_gameplay
        fields = ['start','scripts','first','mid','end','round','point','step_start_story','step_end_story','fail']
        story = dict.fromkeys(fields, '') | {'id': 98, 'mission_id': '10004', 'start': '-1-4-1'}
        mission = {'id':10004,'campaign':-1,'sub':4,'if_emergency':0,'map_res_name':'Chapter1_Y','map_information':'native camera'}
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            (base / 'stc').mkdir()
            (base / 'stc/5016.stc').write_bytes(b'missions')
            (base / 'stc/5044.stc').write_bytes(b'stories')
            manifest = {'scripts':{'-1-4-1':'source'},'sources':[]}
            with patch.object(import_module('gfl1-catalog'), 'decode_stc', side_effect=[(5016,[mission]),(5044,[story])]):
                recover_gameplay(base, base, manifest, lambda *_: self.fail('No texture exists'), base)
            self.assertEqual(manifest['gameplayBackgrounds'], {})
            self.assertEqual(manifest['gameplayBackgroundAudit']['unresolved'][0]['mapResource'], 'Chapter1_Y')
            self.assertEqual({item['file'] for item in manifest['sources']}, {'5016.stc','5044.stc'})

    def test_terrain_uses_source_campaign_instead_of_rerun(self):
        from gfl1_gameplay import select_terrain
        original = {'id': 10004, 'campaign': -1, 'map_res_name': 'Chapter1_Y'}
        rerun = {'id': 10021, 'campaign': -6, 'map_res_name': 'OPS2_Y'}
        self.assertEqual(select_terrain(-1, [rerun, original]), ('Chapter1_Y', [original]))
        self.assertIsNone(select_terrain(1, [{'id': 5, 'campaign': 1, 'map_res_name': 'Chapter1_Y;OPS86_Y'}]))

    def test_generic_sound_channel_and_stop_markers(self):
        self.assertEqual(discover_cues('<SE1>Stop_AVG_loop</SE1><SE1><SE2>Gunfight</SE2></SE1><SE>Battlefield</SE><SE1>Gunfight</SE1><SE2>Empty</SE2><SE>SE_Empty</SE><BGM>BGM_Empty</BGM>'), {'bgm': set(), 'sfx': {'Battlefield', 'Gunfight'}})

    def test_strict_campaign_prefix_and_montage_inventory(self):
        from gfl1_selection import select_scripts, media_requests
        self.assertEqual(set(select_scripts({'-1': 'anniversary', '-1-1-1': 'event', '-10-1-1': 'different', '1-1-1': 'base'}, (-1,))), {'-1-1-1', '1-1-1'})
        self.assertEqual(media_requests('A(0)||<BIN>3</BIN><CG>4,5</CG><Pic>[B(2)&C(0)],[D(1)]</Pic>:text'), ([3,4,5], {'A','B','C','D'}))

    def test_exact_legacy_encoding_exception_preserves_source_bytes(self):
        from gfl1_selection import decode_script
        raw = ('()||<BIN>10</BIN>:<color=#FFFF00>'+chr(0x3010)+'TIP'+chr(0x3011)+' Squad 404 is unable to move in this stage, but they can remotely control facilities and change the radar\'s connection status. Please take advantage of that, Commander.</color>\r\n').encode('gb18030')
        text, provenance = decode_script('-71-15-EXT', raw)
        self.assertEqual(text.encode('gb18030'), raw)
        self.assertEqual(provenance['bytes'], 218)
        self.assertTrue(provenance['roundTrip'])
        with self.assertRaises(UnicodeDecodeError):
            decode_script('-71-15-EXT', raw+b'changed')
        with self.assertRaises(UnicodeDecodeError):
            decode_script('unverified', raw)

    def test_audio_template_duplicate_cue_resolves_by_channel_kind(self):
        template = 'AudioBT|AVG_AMB_Rain|AVG_AMB_Rain|AVG\nAudioBGM|AVG_AMB_Rain|AVG_AMB_Rain|BGM'
        self.assertEqual(parse_template(template, {'AudioBT','AudioUI'})['AVG_AMB_Rain']['bank'], 'AVG')
        self.assertEqual(parse_template(template, {'AudioBGM'})['AVG_AMB_Rain']['bank'], 'BGM')

    def test_native_explicit_script_and_invisible_portrait_inventory(self):
        from gfl1_selection import select_scripts, expression_requests
        self.assertEqual(set(select_scripts({'-77-A-2':'event','-77-A-50':'unreferenced','-78.txt':'letter'}, (-78,), ['-77-A-2'])), {'-77-A-2'})
        flag = '#'+chr(0x9690)+chr(0x8eab)
        self.assertEqual(expression_requests('NPC-AK12Mod'+flag+'(0)||:dialogue'), {'NPC-AK12Mod':{0}})
        self.assertEqual(discover_cues('<BGM>BGM_PAUSE</BGM><SE1>Stop_AVG_loop</SE1>'), {'bgm':set(),'sfx':set()})

    def test_alias_and_comments(self):
        mapping = parse_template('// header\nAudioBGM|BGM_Sunshine|home_formation_factory|BGM // alias\nAudioBT|Gunfight|Gunfight|AVG\nAudioUI|Skip|\n')
        self.assertEqual(mapping['BGM_Sunshine']['stream'], 'home_formation_factory')
        self.assertEqual(mapping['Gunfight']['bank'], 'AVG')
        self.assertNotIn('Skip', mapping)

    def test_cue_case_variation_uses_same_native_stream(self):
        self.assertEqual(find_stream([{'streamInfo':{'name':'RunStep','index':269}}], 'Runstep')['streamInfo']['index'],269)

    def test_duplicate_exact_name_uses_first_native_bank_index(self):
        streams = [{'streamInfo': {'name': 'GF_MAP3_BGM', 'index': 2}}, {'streamInfo': {'name': 'GF_MAP3_BGM', 'index': 1}}]
        self.assertEqual(find_stream(streams, 'GF_MAP3_BGM')['streamInfo']['index'], 1)

    def test_exact_subsong_not_substring(self):
        streams = [{'streamInfo': {'name': 'AVG_2022Saros_Gunfight', 'index': 99}}, {'streamInfo': {'name': 'Gunfight; Gunfire', 'index': 263}}]
        self.assertEqual(find_stream(streams, 'Gunfight')['streamInfo']['index'], 263)
        with self.assertRaises(ValueError):
            find_stream(streams, 'Missing')


if __name__ == '__main__':
    unittest.main()
