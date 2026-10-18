import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from gfl1_bgm_recovery import inventory_banks


class BgmInventoryTests(unittest.TestCase):
    def test_hash_matching_inventory_is_reused_without_decoder(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            resources = root / 'resources'
            resources.mkdir()
            (resources / 'native.acb.bytes').write_bytes(b'native fixture')
            cache = root / 'cache'
            cache.mkdir()
            entry = {'sha256': hashlib.sha256(b'native fixture').hexdigest(), 'streams': [{'streamInfo': {'index': 1, 'name': 'Original'}}]}
            (cache / 'native.acb.streams.json').write_text(json.dumps(entry), encoding='utf-8')
            with patch('gfl1_bgm_recovery.subprocess.run') as decoder:
                result = inventory_banks(resources, root / 'output', Path('decoder'), cache)
            decoder.assert_not_called()
            self.assertTrue(result[0]['cached'])

    def test_probe_uses_metadata_only_and_discards_temporary_bank(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            resources = root / 'resources'
            resources.mkdir()
            (resources / 'native.acb.bytes').write_bytes(b'native fixture')
            stream = {'streamInfo': {'index': 1, 'name': 'Original'}}
            def metadata(arguments, **kwargs):
                self.assertEqual(arguments[1:7], ['-m', '-I', '-s', '1', '-S', '0'])
                self.assertEqual(Path(arguments[-1]).read_bytes(), b'native fixture')
                return SimpleNamespace(stdout=json.dumps(stream), stderr='', returncode=0)
            with patch('gfl1_bgm_recovery.subprocess.run', side_effect=metadata):
                result = inventory_banks(resources, root / 'output', Path('decoder'))
            self.assertEqual(result[0]['streams'], 1)
            self.assertFalse(list((root / 'output/probe').glob('*.acb')))


if __name__ == '__main__':
    unittest.main()
