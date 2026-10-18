import json
import tempfile
import unittest
from pathlib import Path
from gfl1_audio import audio_mapping, load_verified_aliases, reusable_audio, alias_scope_matches, recover_audio


class VerifiedAliasTests(unittest.TestCase):
    def test_recovered_native_banks_and_keys_survive_cache_seeding(self):
        from gfl1_selection import prime_caches
        with tempfile.TemporaryDirectory() as temporary:
            source, output = Path(temporary) / 'old', Path(temporary) / 'new'
            (source / 'recovered-banks').mkdir(parents=True)
            (source / 'recovered-banks/scene.acb').write_bytes(b'original bank')
            (source / 'recovered-banks/scene.hcakey').write_bytes(b'native key')
            prime_caches(source, output)
            self.assertEqual((output / 'recovered-banks/scene.acb').read_bytes(), b'original bank')
            self.assertEqual((output / 'recovered-banks/scene.hcakey').read_bytes(), b'native key')
            prime_caches(output, output)

    def test_scoped_repairs_cannot_change_unreviewed_source_occurrences(self):
        alias = self.alias() | {'sourceScopes': [{'script': 'known', 'row': 2}]}
        self.assertTrue(alias_scope_matches(alias, {'known': '()||:Intro\n()||<SE1>SourceTypo</SE1>:Text'}))
        self.assertFalse(alias_scope_matches(alias, {'unknown': '()||<SE1>SourceTypo</SE1>:Text'}))
        self.assertFalse(alias_scope_matches(alias, {'known': '()||<SE1>SourceTypo</SE1>:Text'}))

    def test_bank_or_key_hash_change_blocks_even_an_existing_cached_track(self):
        import hashlib
        from types import SimpleNamespace
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            resources, output, library = [base / name for name in ('resources', 'output', 'library')]
            for directory in (resources, output / 'recovered-banks', library):
                directory.mkdir(parents=True)
            (resources / 'assettextes.ab').write_bytes(b'template')
            bank = output / 'recovered-banks/AVG.acb'
            bank.write_bytes(b'bank')
            key = output / 'recovered-banks/AVG.hcakey'
            key.write_bytes(b'key')
            (library / 'clip.ogg').write_bytes(b'cached')
            alias = self.alias() | {
                'bankSource': 'recovered-banks/AVG.acb',
                'bankSha256': hashlib.sha256(bank.read_bytes()).hexdigest(),
                'sidecars': [{'path': 'recovered-banks/AVG.hcakey', 'sha256': hashlib.sha256(key.read_bytes()).hexdigest()}],
            }
            entry = {'stream': alias['stream'], 'bank': alias['bank']}
            prior = {'cue': alias['cue'], 'kind': 'sfx', 'template': entry, 'sha256': alias['bankSha256'], 'url': '/clip.ogg'}
            (output / 'audio-cache.json').write_text(json.dumps([prior]), encoding='utf-8')
            template = SimpleNamespace(m_Name='AudioTemplate', m_Script='')
            obj = SimpleNamespace(type=SimpleNamespace(name='TextAsset'), read=lambda: template)
            for changed in ('none', 'key', 'bank'):
                bank.write_bytes(b'changed' if changed == 'bank' else b'bank')
                key.write_bytes(b'changed' if changed == 'key' else b'key')
                manifest = {'scripts': {'test': '()||<SE1>SourceTypo</SE1>:Text'}, 'sources': [], 'missing': []}
                with patch('UnityPy.load', return_value=SimpleNamespace(objects=[obj])), patch('gfl1_audio.load_verified_aliases', return_value={('sfx','SourceTypo'): alias}):
                    recover_audio(resources, output, library, manifest, 'unused', 'unused')
                self.assertEqual(bool(manifest['missing']), changed != 'none')
                self.assertEqual('SourceTypo' in manifest['sfx'], changed == 'none')

    def alias(self):
        return {'kind': 'sfx', 'cue': 'SourceTypo', 'stream': 'OriginalStream', 'bank': 'AVG',
                'bankSha256': 'a' * 64,
                'evidence': [{'source': 'native script correspondence', 'detail': 'Exact command comparison'}]}

    def test_verified_mapping_requires_evidence_and_unique_cue(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'aliases.json'
            registry = {'version': 1, 'region': 'Steam EN', 'aliases': [self.alias()]}
            path.write_text(json.dumps(registry), encoding='utf-8')
            self.assertIn(('sfx', 'SourceTypo'), load_verified_aliases(path))
            registry['aliases'][0]['evidence'] = []
            path.write_text(json.dumps(registry), encoding='utf-8')
            with self.assertRaises(ValueError):
                load_verified_aliases(path)
            registry['aliases'] = [self.alias(), self.alias()]
            path.write_text(json.dumps(registry), encoding='utf-8')
            with self.assertRaises(ValueError):
                load_verified_aliases(path)

    def test_current_native_mapping_cannot_be_silently_overridden(self):
        alias = self.alias()
        key = ('sfx', alias['cue'])
        entry, evidence = audio_mapping('sfx', alias['cue'], {}, {key: alias})
        self.assertEqual(entry, {'stream': 'OriginalStream', 'bank': 'AVG'})
        self.assertEqual(evidence, alias)
        with self.assertRaises(ValueError):
            audio_mapping('sfx', alias['cue'], {alias['cue']: {'stream': 'NewNative', 'bank': 'AVG'}}, {key: alias})
        self.assertEqual(audio_mapping('sfx', 'Unknown', {}, {})[0]['stream'], 'Unknown')

    def test_cache_cannot_reuse_different_subsong_from_same_bank_or_other_kind(self):
        with tempfile.TemporaryDirectory() as temporary:
            library = Path(temporary)
            (library / 'clip.ogg').write_bytes(b'cached audio')
            entry = {'stream': 'OriginalStream', 'bank': 'AVG'}
            prior = {'kind': 'sfx', 'template': entry, 'sha256': 'hash', 'url': '/clip.ogg'}
            self.assertTrue(reusable_audio(prior, 'sfx', entry, 'hash', library))
            self.assertFalse(reusable_audio(prior, 'sfx', dict(entry, stream='Other'), 'hash', library))
            self.assertFalse(reusable_audio(prior, 'bgm', entry, 'hash', library))
            self.assertFalse(reusable_audio(prior, 'sfx', entry, 'updated bank', library))


if __name__ == '__main__':
    unittest.main()
