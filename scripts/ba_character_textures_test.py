import tempfile
import unittest
import json
import shutil
from pathlib import Path
from unittest.mock import patch

import ba_character_textures as textures


class CharacterTextureTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.media = self.root / "media"
        self.prefix = "/private/ba-jp/shared/media/"
        atlas = self.media / "characters/test/test.atlas"
        atlas.parent.mkdir(parents=True)
        atlas.write_bytes(b"matching atlas")
        export = self.root / "export.png"
        export.write_bytes(b"full resolution texture")
        self.old = self.prefix + "characters/test/test.png"
        self.manifest = {
            "gameVersion": textures.CONFIG["gameVersion"],
            "characters": {
                "test": {
                    "model": "test",
                    "atlas": self.prefix + "characters/test/test.atlas",
                    "pages": [self.old],
                }
            },
            "files": [{"url": self.old, "bytes": 3, "sha256": "old"}],
        }
        entry = {
            "model": "test",
            "atlasSha256": textures.sha(atlas.read_bytes()),
            "source": {"platform": "Windows"},
            "pages": {
                "test.png": {
                    "path": "export.png",
                    "sha256": textures.sha(export.read_bytes()),
                }
            },
        }
        self.enterContext(patch.object(textures, "CACHE", self.root))
        self.enterContext(
            patch.object(textures, "texture_index", return_value={"test": entry})
        )

    def test_upgrade_uses_distinct_urls_and_refreshes_download_integrity(self):
        self.assertTrue(
            textures.install_character_textures(self.media, self.prefix, self.manifest)
        )
        new = self.prefix + "characters-hd/test/test.png"
        self.assertEqual(self.manifest["characters"]["test"]["pages"], [new])
        self.assertEqual(self.manifest["files"][0]["url"], new)
        self.assertEqual(
            self.manifest["files"][0]["sha256"],
            textures.sha(b"full resolution texture"),
        )
        self.assertFalse(
            textures.install_character_textures(self.media, self.prefix, self.manifest)
        )
        self.assertEqual(len(self.manifest["files"]), 1)

    def test_rejects_incompatible_atlas(self):
        (self.media / "characters/test/test.atlas").write_bytes(b"different packing")
        with self.assertRaisesRegex(ValueError, "atlas mismatch"):
            textures.install_character_textures(self.media, self.prefix, self.manifest)

    def test_rejects_corrupt_export(self):
        (self.root / "export.png").write_bytes(b"corrupt")
        with self.assertRaisesRegex(ValueError, "export integrity mismatch"):
            textures.install_character_textures(self.media, self.prefix, self.manifest)

    def test_resumes_after_inventory_was_written_before_scene_and_download_list(self):
        library = self.root / "public/private/ba-jp"
        media = library / "shared/media"
        shutil.copytree(self.media, media)
        textures.install_character_textures(media, self.prefix, self.manifest)
        chapter = library / "11020"
        chapter.mkdir()
        (chapter / "assets.json").write_text(json.dumps(self.manifest))
        (chapter / "scenes.json").write_text(json.dumps({"assets": {"old": True}}))
        generated = self.root / "src/generated/ba-stories.json"
        generated.parent.mkdir(parents=True)
        generated.write_text(
            json.dumps(
                [
                    {
                        "id": "ba-jp-11020",
                        "assets": ["/private/ba-jp/11020/chapter.json", self.old],
                    }
                ]
            )
        )
        with patch.object(textures, "ROOT", self.root):
            textures.apply()
        scene = json.loads((chapter / "scenes.json").read_text())
        self.assertEqual(scene["assets"], self.manifest)
        downloads = json.loads(generated.read_text())[0]["assets"]
        self.assertNotIn(self.old, downloads)
        self.assertIn(self.prefix + "characters-hd/test/test.png", downloads)


if __name__ == "__main__":
    unittest.main()
