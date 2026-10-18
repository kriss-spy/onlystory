"""Catalog resolution regressions; run in the downloader's xxhash environment."""

import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ba_asset_plan import (
    bundle_members,
    character_model,
    check_shared_assets,
    missing_background,
    needs_native_actor_fx,
    resolve_media,
    resolve_video,
    timeline_members,
)


class AssetPlanTests(unittest.TestCase):
    def test_native_actor_fx_dependency_only_for_authored_actor_commands(self):
        self.assertTrue(needs_native_actor_fx([{"ScriptKr": "#3;fx;NKUltra"}]))
        self.assertTrue(needs_native_actor_fx([{"ScriptKr": "#1;fx;nkultrabreak"}]))
        self.assertFalse(needs_native_actor_fx([{"ScriptKr": "#3;em;nkultra"}]))

    def test_missing_background_exception_is_row_and_group_scoped(self):
        gap = {"field": "BGName", "row": 6, "value": 2584521940}
        rows = [{"BGName": 0} for _ in range(7)]
        rows[6]["BGName"] = gap["value"]
        with patch(
            "ba_asset_plan.source_gaps",
            side_effect=lambda group: [gap] if int(group) == 32130 else [],
        ):
            self.assertTrue(missing_background(32130, rows, gap["value"]))
            self.assertFalse(missing_background(200003, rows, gap["value"]))
            rows[0]["BGName"] = gap["value"]
            self.assertFalse(missing_background(32130, rows, gap["value"]))

    def test_numeric_video_uses_official_companion_sound(self):
        metadata = [
            {
                "Id": 11001,
                "VideoPath": ["Scenario/Main/104000_ED_Video"],
                "SoundPath": ["Scenario/Main/104000_ED_Sound"],
            }
        ]
        assets = {
            "Media/GameData/" + p: {"path": p}
            for p in [
                "Scenario/Main/104000_ED_Video.mp4",
                "Scenario/Main/104000_ED_Sound.ogg",
            ]
        }
        with patch("ba_asset_plan.load_table", return_value=metadata):
            movie, sound = resolve_video(assets, "11001", 104071)
        self.assertEqual(movie["path"], "Scenario/Main/104000_ED_Video.mp4")
        self.assertEqual(sound["path"], "Scenario/Main/104000_ED_Sound.ogg")

    def test_native_timeline_requires_exact_scene_members(self):
        asset = {
            "path": "Bundle/FullPatch_076.zip",
            "member_paths": [
                "assets-sccutscene_13000_01-prefabs.bundle",
                "assets-sccutscene_13000_02-prefabs.bundle",
            ],
        }
        rows = [{"ScriptKr": "#timelineNS;ScCutScene/ScCutScene_13000_01"}]
        result = timeline_members({"assets": [asset]}, rows)
        self.assertEqual(len(result["ScCutScene/ScCutScene_13000_01"]), 1)
        with self.assertRaisesRegex(ValueError, "Missing native timeline"):
            timeline_members({"assets": []}, rows)

    def test_shared_identical_bytes_are_idempotent(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "image.png").write_bytes(b"original")
            files = [
                {
                    "url": "/shared/image.png",
                    "sha256": hashlib.sha256(b"original").hexdigest(),
                }
            ]
            check_shared_assets(root, "/shared/", files)

    def test_shared_collision_fails_without_mutating_published_file(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            target = root / "image.png"
            target.write_bytes(b"original")
            files = [
                {
                    "url": "/shared/image.png",
                    "sha256": hashlib.sha256(b"different").hexdigest(),
                }
            ]
            with self.assertRaisesRegex(ValueError, "Shared asset collision"):
                check_shared_assets(root, "/shared/", files)
            self.assertEqual(target.read_bytes(), b"original")

    def test_region_folder_precedence(self):
        relative = "UIs/03_Scenario/01_Background/BG_Black.jpg"
        assets = {
            p + relative: {"path": p + relative}
            for p in ["Media/Prologue/", "Media/GameData/"]
        }
        self.assertEqual(
            resolve_media(assets, relative, 11000)["path"], "Media/Prologue/" + relative
        )
        self.assertEqual(
            resolve_media(assets, relative, 80101)["path"], "Media/GameData/" + relative
        )

    def test_missing_media_fails(self):
        with self.assertRaisesRegex(ValueError, "Missing catalog media"):
            resolve_media({}, "absent.jpg", 80101)

    def test_latest_game_model_supersedes_bootstrap(self):
        catalog = {
            "assets": [
                {
                    "path": "Bundle/FullPatch_Prologue_000.zip",
                    "asset_type": "bundle",
                    "member_paths": ["assets-izuna_spr-_mxprolog-2025.bundle"],
                },
                {
                    "path": "Bundle/FullPatch_092.zip",
                    "asset_type": "bundle",
                    "member_paths": [
                        "assets-izuna_spr-textassets-2025.bundle",
                        "assets-izuna_spr-textures-2025.bundle",
                    ],
                },
                {
                    "path": "Bundle/UpdatePatch_v1_000.zip",
                    "asset_type": "bundle",
                    "member_paths": ["assets-izuna_spr-textures-2026.bundle"],
                },
            ]
        }
        result = bundle_members(catalog, ["izuna_spr"])
        self.assertEqual(
            [a["path"] for a, _ in result],
            ["Bundle/FullPatch_092.zip", "Bundle/UpdatePatch_v1_000.zip"],
        )

    def test_catalog_iteration_does_not_choose_older_texture(self):
        newer = {
            "path": "Bundle/UpdatePatch_v12_000.zip",
            "asset_type": "bundle",
            "member_paths": [
                "assets-izuna_spr-textassets-2026-01-01.bundle",
                "assets-izuna_spr-textures-2026-01-01.bundle",
            ],
        }
        older = {
            "path": "Bundle/FullPatch_092.zip",
            "asset_type": "bundle",
            "member_paths": [
                "assets-izuna_spr-textassets-2025-07-02.bundle",
                "assets-izuna_spr-textures-2025-07-02.bundle",
            ],
        }
        result = bundle_members({"assets": [newer, older]}, ["izuna_spr"])
        self.assertTrue(all(a["path"] == newer["path"] for a, _ in result))

    def test_nd_prefab_resolves_its_authored_base_skeleton(self):
        self.assertEqual(
            character_model(
                {
                    "SpinePrefabName": "UIs/03_Scenario/02_Character/CharacterSpine_Azusa_swimsuitND"
                }
            ),
            "Azusa_swimsuit_spr",
        )
        self.assertEqual(
            character_model(
                {
                    "SpinePrefabName": "UIs/03_Scenario/02_Character/CharacterSpine_Azusa_swimsuit"
                }
            ),
            "Azusa_swimsuit_spr",
        )

    def test_mixed_case_npc_prefab_matches_catalog_member(self):
        asset = {
            "path": "Bundle/FullPatch_094.zip",
            "asset_type": "bundle",
            "member_paths": [
                "assets-yukata_streetghostes_rl_spr-textassets-2025.bundle",
                "assets-yukata_streetghostes_rl_spr-textures-2025.bundle",
            ],
        }
        self.assertEqual(
            len(bundle_members({"assets": [asset]}, ["Yukata_StreetGhostes_RL_spr"])), 2
        )

    def test_missing_texture_fails_before_download(self):
        catalog = {
            "assets": [
                {
                    "path": "Bundle/a.zip",
                    "asset_type": "bundle",
                    "member_paths": ["assets-izuna_spr-textassets-2025.bundle"],
                }
            ]
        }
        with self.assertRaisesRegex(ValueError, "Missing model catalog members"):
            bundle_members(catalog, ["izuna_spr"])


if __name__ == "__main__":
    unittest.main()
