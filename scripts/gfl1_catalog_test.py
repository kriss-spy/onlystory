import importlib.util
import struct
import tempfile
from types import SimpleNamespace
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('gfl1_catalog', Path(__file__).with_name('gfl1-catalog.py'))
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)


class CatalogTests(unittest.TestCase):
    def test_collaboration_without_replay_retains_distinct_metadata_provenance(self):
        definitions = {'collab': {'title': 'Collaboration', 'source': 'https://example.com/event', 'order': 1001}}
        result = catalog.build_collections(['-8-1-1'], [], [], {}, [('collab', [-8])], definitions)
        collection = result['collections'][0]
        self.assertIsNone(collection['replayId'])
        self.assertEqual(collection['title'], 'Collaboration')
        self.assertEqual(collection['orderStatus'], 'native-story-util-with-triggered-extras')
        self.assertEqual(result['selection']['sourceAssets'], ['-8-1-1'])
        with self.assertRaises(ValueError):
            catalog.build_collections(['-8-1-1'], [], [], {}, [('unknown', [-8])])

    def test_main_story_discovery_uses_native_numbered_replay_rows_and_stable_chapter_one(self):
        rows = [
            dict(id=2, order=2, type=1, story_campaign_id='1'),
            dict(id=1, order=1, type=1, story_campaign_id='0'),
            dict(id=23, order=23, type=1, story_campaign_id='13'),
            dict(id=99, order=99, type=2, story_campaign_id='14'),
            dict(id=7, order=7, type=2, story_campaign_id='-1'),
        ]
        self.assertEqual(catalog.discover_main_story(rows), [
            ('chapter-0', [0]), ('chapter-1-normal', [1]), ('chapter-13', [13]),
        ])

    def test_poincare_title_correction_is_exact_and_retains_native_evidence(self):
        key = 'story_playback-10000026'
        raw = 'Poincar\u00c3\u00a9 Recurrence'
        title, provenance = catalog.collection_title({'name': key}, {key: raw})
        self.assertEqual(title, 'Poincar\u00e9 Recurrence')
        self.assertEqual(provenance, {'rawTitle': raw, 'labelKey': key, 'transformation': 'latin1-to-utf8'})
        self.assertEqual(catalog.collection_title({'name': 'other'}, {'other': raw}), (raw, None))
        self.assertEqual(catalog.collection_title({'name': key}, {key: 'Already correct'}), ('Already correct', None))

    def test_native_discovery_excludes_main_story_and_keeps_stable_ids(self):
        rows = [
            dict(id=1, order=1, story_campaign_id='1', name='main'),
            dict(id=7, order=7, story_campaign_id='-1', name='cube'),
            dict(id=10, order=10, story_campaign_id='-2,-3,-4,-5', name='arctic'),
            dict(id=26, order=26, story_campaign_id='-48', name='poincare'),
            dict(id=99, order=99, story_campaign_id='-99,1', name='mixed'),
        ]
        discovered = catalog.discover_events(rows, {'cube': 'Operation Cube', 'arctic': 'Arctic Warfare', 'poincare': 'Poincar\u00c3\u00a9 Recurrence'})
        self.assertEqual(discovered, [('operation-cube', [-1]), ('arctic-warfare', [-2, -3, -4, -5]), ('poincare-recurrence', [-48])])

    def test_explicit_selection_registry_audits_strict_campaign_prefix(self):
        playback = [dict(id=10, order=10, story_campaign_id='-2', name='event', campaign_sub_name='')]
        result = catalog.build_collections(['-2-a', '-20-b', '-2'], playback, [], {'event': 'Event'}, [('event', [-2])])
        self.assertEqual(result['selection']['scripts'], ['-2-a'])
        self.assertEqual(result['selection']['campaignIds'], [-2])
        self.assertEqual(result['selection']['scriptCount'], 1)
        self.assertEqual(result['audit']['unselectedNegativeScripts'], ['-2', '-20-b'])

    def test_labels_fall_back_to_installed_bundle(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle = root / 'hashed-assettexttable.ab'
            bundle.write_bytes(b'native-bundle-fixture')
            cached = root / 'cached'
            cached.mkdir()
            (cached / 'story_playback.txt').write_text('replay-title,Operation Cube\n', encoding='utf-8')
            asset = SimpleNamespace(m_Name='story_util', m_Script='native-title,Title, with comma\n')
            obj = SimpleNamespace(type=SimpleNamespace(name='TextAsset'), read=lambda: asset)
            sources = []
            labels = catalog.load_labels(cached, root, sources, lambda path: SimpleNamespace(objects=[obj]))
            self.assertEqual(labels, {'replay-title': 'Operation Cube', 'native-title': 'Title, with comma'})
            self.assertEqual(sources[-1]['file'], bundle.name)

    def test_stc_index_validates_structural_decoding(self):
        text = b'local-label'
        record = struct.pack('<iBH', 23, 1, len(text)) + text
        header_size = 11 + 2 + 8
        body = struct.pack('<IB', 1, 2) + bytes([5, 11]) + struct.pack('<ii', 23, header_size) + record
        data = struct.pack('<HI', 5044, len(body)) + body
        self.assertEqual(catalog.decode_stc(data, ['id', 'title']), (5044, [{'id': 23, 'title': 'local-label'}]))
        damaged = bytearray(data)
        damaged[17] += 1
        with self.assertRaisesRegex(ValueError, 'sparse index'):
            catalog.decode_stc(damaged, ['id', 'title'])

    def test_native_replay_order_and_unassigned_are_separate(self):
        playback = [dict(id=i, story_campaign_id=','.join(map(str, groups)), name=slug, campaign_sub_name='', order=i) for i, (slug, groups) in enumerate(catalog.EVENTS)]
        story = dict.fromkeys(catalog.STORY_FIELDS, '')
        story.update(id=10, campaign=-1, story_playback_sub_id=1, scripts='-1-z,-1-a', start='-1-z', point='2007:-1-point', title='title', mission_id='101')
        result = catalog.build_collections(['-1-a', '-1-z', '-1-point', '-1-extra', '-10-other'], playback, [story], {'title': 'Native title'})
        cube = result['collections'][0]
        self.assertEqual([s['script'] for s in cube['sections'][0]['scenes']], ['-1-z', '-1-a', '-1-point'])
        point = cube['sections'][0]['scenes'][2]
        self.assertEqual((point['phase'], point['trigger'], point['orderStatus']), ('map', '2007', 'trigger-dependent'))
        self.assertEqual(cube['audit']['unassigned'], ['-1-extra'])
        self.assertEqual(cube['sections'][-1]['scenes'][0]['orderStatus'], 'unresolved')
        self.assertEqual(cube['audit']['inventoryCount'], 4)

    def test_missing_native_script_is_reported(self):
        playback = [dict(id=i, story_campaign_id=','.join(map(str, groups)), name=slug, campaign_sub_name='', order=i) for i, (slug, groups) in enumerate(catalog.EVENTS)]
        story = dict.fromkeys(catalog.STORY_FIELDS, '')
        story.update(id=10, campaign=-1, story_playback_sub_id=1, scripts='-1-missing', title='title', mission_id='101')
        cube = catalog.build_collections([], playback, [story], {})['collections'][0]
        self.assertEqual(cube['audit']['missing'], [{'script': '-1-missing', 'storyUtilId': 10, 'field': 'scripts'}])
        missing = cube['sections'][0]['scenes'][0]
        self.assertEqual((missing['script'], missing['sourceStatus']), ('-1-missing', 'missing'))
        self.assertEqual(missing['provenance']['row'], 10)
        self.assertEqual(cube['audit']['assignedCount'], 0)

    def test_native_external_reference_includes_exact_source_and_path_alias(self):
        playback = [dict(id=48, order=48, story_campaign_id='-78', name='event', campaign_sub_name='')]
        story = dict.fromkeys(catalog.STORY_FIELDS, '')
        story.update(id=1445, campaign=-78, story_playback_sub_id=1, scripts='BattleAvg/-77-A-2', title='title', mission_id='101')
        result = catalog.build_collections(['-78-extra', '-77-A-2', '-77-A-50'], playback, [story], {}, [('event', [-78])])
        collection = result['collections'][0]
        self.assertEqual(collection['supplementalNativeScripts'], ['-77-A-2'])
        self.assertEqual(collection['audit']['strictPrefixInventoryCount'], 1)
        self.assertEqual(result['selection']['sourceAssets'], ['-77-A-2', '-78-extra'])
        self.assertEqual(result['selection']['missingReferences'], [])

    def test_zero_subchapter_is_ancillary_without_chronology_claim(self):
        playback = [dict(id=i, story_campaign_id=','.join(map(str, groups)), name=slug, campaign_sub_name='', order=i) for i, (slug, groups) in enumerate(catalog.EVENTS)]
        story = dict.fromkeys(catalog.STORY_FIELDS, '')
        story.update(id=197, campaign=-13, story_playback_sub_id=0, scripts='-13-1-1', start='-13-1-1', title='ranking', mission_id='101')
        deep_dive = catalog.build_collections(['-13-1-1'], playback, [story], {'ranking': 'Imaginary Maze'})['collections'][1]
        section = deep_dive['sections'][0]
        self.assertEqual((section['order'], section['nativeSubchapterId']), (998, 0))
        self.assertEqual(section['scenes'][0]['orderStatus'], 'native-ancillary')
        self.assertEqual(section['scenes'][0]['provenance']['nativeSubchapterId'], 0)


if __name__ == '__main__':
    unittest.main()
