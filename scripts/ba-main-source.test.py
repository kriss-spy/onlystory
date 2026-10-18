"""Main-story selection, localization and voice-link regression tests."""

import importlib.util
import json
import unittest
from pathlib import Path

import flatbuffers
import xxhash

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "ba_main_source", ROOT / "scripts/ba-main-source.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class MainSourceTest(unittest.TestCase):
    def setUp(self):
        self.mode = {
            "ModeType": "Main",
            "SubType": "Series1",
            "Open": True,
            "Hide": False,
            "ExposedTime": "",
            "VolumeId": 1,
            "ChapterId": 2,
            "EpisodeId": 3,
        }

    def test_only_released_visible_main_or_prologue_modes_are_selected(self):
        self.assertTrue(MODULE.eligible(self.mode, "2026-10-17"))
        self.assertTrue(
            MODULE.eligible(
                self.mode | {"ModeType": "Prologue", "SubType": "Series2"}, "2026-10-17"
            )
        )
        for changed in [
            {"ModeType": "SpecialOperation"},
            {"ModeType": "Sub"},
            {"Hide": True},
            {"Open": False},
            {"SubType": "None_"},
            {"ExposedTime": "2026-10-18 11:00:00"},
        ]:
            self.assertFalse(MODULE.eligible(self.mode | changed, "2026-10-17"))

    def test_official_localization_keys_distinguish_parts(self):
        self.assertEqual(
            MODULE.localized_key(self.mode, "Volume"), "Main_Volume_Title_1"
        )
        self.assertEqual(
            MODULE.localized_key(self.mode, "Episode"), "Main_Episode_Title_1_2_3"
        )
        self.assertEqual(
            MODULE.localized_key(self.mode | {"SubType": "Series2"}, "Chapter"),
            "Main_Chapter_Title_Series2_1_2",
        )
        self.assertEqual(
            MODULE.localized_key(self.mode | {"ModeType": "Prologue"}, "Volume"),
            "Prologue_Volume_Title_1",
        )

    def test_authored_front_and_back_group_order_is_retained(self):
        self.assertEqual(
            MODULE.ordered_groups(
                {"FrontScenarioGroupId": [11002, 11005], "BackScenarioGroupId": [11008]}
            ),
            [("front", 11002), ("front", 11005), ("back", 11008)],
        )

    def test_voice_hash_resolves_lowercase_archive_and_split_original_files(self):
        catalog = {
            "assets": [
                {"path": "Media/Prologue/Audio/VOC_JP/JP_Main/Main_11000_111_1.ogg"}
            ]
        }
        voices = MODULE.voice_lookup(catalog, ["main_33000_001.ogg"])
        self.assertEqual(
            voices[xxhash.xxh32_intdigest("Main_11000_111")], "Main_11000_111"
        )
        self.assertEqual(
            voices[xxhash.xxh32_intdigest("Main_33000_001")], "Main_33000_001"
        )

    def test_portable_video_schema_retains_nation_and_separate_soundtrack(self):
        schema = json.loads(
            (ROOT / "scripts/ba-jp-main-schema-1.73.json").read_text(encoding="utf8")
        )
        video = MODULE.BASE.load_schema(schema)["VideoExcel"]
        builder = flatbuffers.Builder(256)
        video_path = builder.CreateString("Scenario/Main/13000_MV_Video")
        sound_path = builder.CreateString("Scenario/Main/13000_MV_Sound")
        builder.StartVector(4, 1, 4)
        builder.PrependInt32(1)
        nations = builder.EndVector()
        builder.StartVector(4, 1, 4)
        builder.PrependUOffsetTRelative(video_path)
        videos = builder.EndVector()
        builder.StartVector(4, 1, 4)
        builder.PrependUOffsetTRelative(sound_path)
        sounds = builder.EndVector()
        builder.StartObject(5)
        builder.PrependInt64Slot(0, 11007, 0)
        builder.PrependUOffsetTRelativeSlot(1, nations, 0)
        builder.PrependUOffsetTRelativeSlot(2, videos, 0)
        builder.PrependUOffsetTRelativeSlot(3, sounds, 0)
        root = builder.EndObject()
        builder.Finish(root)
        row = MODULE.BASE.FlatBufferReader(bytes(builder.Output())).read_root(video)
        self.assertEqual(row["Id"], 11007)
        self.assertEqual(row["Nation"], ["All"])
        self.assertEqual(row["VideoPath"], ["Scenario/Main/13000_MV_Video"])
        self.assertEqual(row["SoundPath"], ["Scenario/Main/13000_MV_Sound"])

    @unittest.skipUnless(
        (ROOT / ".cache/ba-main-source/coverage.json").exists(),
        "Official export is not installed",
    )
    def test_installed_snapshot_has_no_missing_or_future_story_groups(self):
        cache = ROOT / ".cache/ba-main-source"
        coverage = json.loads((cache / "coverage.json").read_text(encoding="utf8"))
        definitions = json.loads(
            (cache / "definitions.json").read_text(encoding="utf8")
        )
        self.assertEqual(coverage["uniqueGroups"], 613)
        self.assertEqual(coverage["eligibleModes"], 480)
        self.assertEqual(coverage["futureMainPrologueModes"], 0)
        self.assertEqual(
            {mode["ModeId"] for mode in coverage["excludedModes"]}, {11000, 11002}
        )
        self.assertTrue(all(mode["Hide"] for mode in coverage["excludedModes"]))
        self.assertEqual(len(definitions), 612)
        self.assertEqual(len({row["group"] for row in definitions}), 612)
        self.assertNotIn(11000, {row["group"] for row in definitions})
        self.assertEqual(coverage["emptyGroups"], [])
        self.assertEqual(coverage["missingLabels"], [])
        self.assertEqual(coverage["unresolvedVoices"], [])
        self.assertTrue(
            all(
                (ROOT / definition["sourceFile"]).is_file()
                for definition in definitions
            )
        )


if __name__ == "__main__":
    unittest.main()
