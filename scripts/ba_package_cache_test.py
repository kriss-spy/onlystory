"""Decoded-media cache integrity and exact sound alias regression checks."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ba_package_cache import (
    ExportCache,
    canonicalize_manifest_urls,
    fingerprint,
    stage_file,
)


class PackageCacheTests(unittest.TestCase):
    def test_unity_provenance_ids_survive_javascript_integer_rounding(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest = {
                "files": [],
                "backgrounds": {
                    "1440557733": {
                        "prefabSource": {
                            "member": "uis-03_scenario-01_background-_mxload-prefabs-2025-07-02_assets_all_238738019.bundle",
                            "skeletonDataPathId": 1130997566082866800,
                        }
                    }
                },
            }
            result = canonicalize_manifest_urls(manifest, directory)
            self.assertEqual(
                result["backgrounds"]["1440557733"]["prefabSource"][
                    "skeletonDataPathId"
                ],
                "1130997566082866841",
            )

    @unittest.skipUnless(os.name == "nt", "Windows physical path casing regression")
    def test_windows_case_alias_urls_publish_actual_filename(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            file = root / "media/Original.png"
            file.parent.mkdir()
            file.write_bytes(b"original sprite")
            manifest = {
                "files": [{"url": "/media/original.png", **fingerprint(file)}],
                "effects": {"original": "/media/original.png"},
            }
            result = canonicalize_manifest_urls(manifest, root)
            self.assertEqual(result["effects"]["original"], "/media/Original.png")
            self.assertEqual(result["files"][0]["url"], "/media/Original.png")
            self.assertEqual(manifest["effects"]["original"], "/media/original.png")

    def test_video_reuse_requires_same_official_source_checksums(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "public/private/clip_h264.mp4"
            source.parent.mkdir(parents=True)
            source.write_bytes(b"verified encoded clip")
            cache = ExportCache.__new__(ExportCache)
            cache.videos = {
                "11001": {
                    "file": {"url": "/private/clip_h264.mp4", **fingerprint(source)},
                    "inputs": {"Media/ED.mp4": "123"},
                }
            }
            resource = {"path": "Media/ED.mp4", "checksum": {"value": "123"}}
            with patch("ba_package_cache.ROOT", root):
                self.assertEqual(
                    cache.stage_video(
                        "11001", [resource], root / "stage", lambda p: p.name
                    ),
                    "11001_h264.mp4",
                )
                resource["checksum"]["value"] = "456"
                self.assertIsNone(
                    cache.stage_video(
                        "11001", [resource], root / "other-stage", lambda p: p.name
                    )
                )
            self.assertFalse((root / "other-stage").exists())

    def test_staging_rejects_tampered_cached_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "original.wav"
            source.write_bytes(b"verified waveform")
            expected = fingerprint(source)
            source.write_bytes(b"corrupted waveform")
            target = Path(directory) / "stage.wav"
            with self.assertRaisesRegex(ValueError, "Decoded cache integrity mismatch"):
                stage_file(source, target, expected)
            self.assertFalse(target.exists())

    def test_authored_case_variant_reuses_original_clip_path(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "SE_Book_02.wav"
            source.write_bytes(b"original waveform")
            cache = ExportCache.__new__(ExportCache)
            cache.sounds = {"SE_Book_02": {"path": source, "file": fingerprint(source)}}
            out = Path(directory) / "stage"
            result = cache.stage_sound(
                "SE_BooK_02", out, lambda p: p.relative_to(out).as_posix()
            )
            self.assertEqual(result, "sound/SE_Book_02.wav")
            self.assertEqual((out / result).read_bytes(), source.read_bytes())

    def test_ambiguous_case_variant_is_not_selected(self):
        cache = ExportCache.__new__(ExportCache)
        cache.sounds = {"SE_Test": {}, "SE_TEST": {}}
        self.assertIsNone(
            cache.stage_sound("se_test", Path("unused"), lambda p: str(p))
        )


if __name__ == "__main__":
    unittest.main()
