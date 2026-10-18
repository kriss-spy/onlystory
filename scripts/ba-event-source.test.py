"""Portable JP schema regression tests; no APK or generated schemas required."""

import importlib.util
import json
import unittest
from pathlib import Path

import flatbuffers
from ba_downloader.infrastructure.schema.flatbuffer.reader import FlatBufferReader

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "ba_event_source", ROOT / "scripts/ba-event-source.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
SCHEMA = json.loads(
    (ROOT / "scripts/ba-jp-schema-1.73.json").read_text(encoding="utf8")
)
TYPES = MODULE.load_schema(SCHEMA)


class PortableSchemaTest(unittest.TestCase):
    def test_japanese_script_and_unsigned_hashes_decode_without_generated_files(self):
        builder = flatbuffers.Builder(128)
        japanese = builder.CreateString("日本語テスト")
        script = builder.CreateString("#na;test")
        builder.StartObject(11)
        builder.PrependInt64Slot(0, 10000005, 0)
        builder.PrependInt64Slot(1, 42, 0)
        builder.PrependUint32Slot(5, 4294967290, 0)
        builder.PrependUOffsetTRelativeSlot(8, script, 0)
        builder.PrependUOffsetTRelativeSlot(9, japanese, 0)
        root = builder.EndObject()
        builder.Finish(root)
        row = FlatBufferReader(bytes(builder.Output())).read_root(
            TYPES["ScenarioScriptExcel"]
        )
        self.assertEqual(row["GroupId"], 10000005)
        self.assertEqual(row["SelectionGroup"], 42)
        self.assertEqual(row["BGName"], 4294967290)
        self.assertEqual(row["TextJp"], "日本語テスト")
        self.assertEqual(row["ScriptKr"], "#na;test")
        self.assertEqual(row["VoiceId"], 0)

    def test_enum_names_are_preserved(self):
        builder = flatbuffers.Builder(64)
        builder.StartObject(9)
        builder.PrependUint32Slot(0, 123456, 0)
        builder.PrependInt32Slot(1, 3, 0)
        root = builder.EndObject()
        builder.Finish(root)
        row = FlatBufferReader(bytes(builder.Output())).read_root(
            TYPES["ScenarioCharacterNameExcel"]
        )
        self.assertEqual(row["ProductionStep"], "Release")
        self.assertEqual(row["CharacterName"], 123456)

    def test_missing_titles_are_labeled_continuations_without_internal_ids(self):
        self.assertEqual(MODULE.readable_chapter_title([], "第5話 · 招かれざる美食研究会", 7), "第5話 · 招かれざる美食研究会（続き）")
        self.assertEqual(MODULE.readable_chapter_title([], "", 1), "イベントストーリー 1")
        self.assertEqual(MODULE.readable_chapter_title([{"ScriptKr": "#title;a;b", "TextJp": "第9話;[ruby=にんじゃ]少女[/ruby]の夢"}], "", 1), "第9話 · 少女の夢")

    def test_snapshot_has_every_required_table_and_native_provenance(self):
        expected = {name + "Excel" for name in MODULE.TABLES} | {
            "ScenarioScriptExcel",
            "LocalizeExcel",
        }
        self.assertEqual(expected, set(TYPES))
        self.assertEqual(SCHEMA["gameVersion"], "1.73.459696")
        self.assertEqual(len(SCHEMA["databaseSha256"]), 64)
        self.assertEqual(
            {row["name"] for row in SCHEMA["runtimeFiles"]},
            {"global-metadata.dat", "globalgamemanagers", "libil2cpp.so"},
        )
        self.assertTrue(all(len(row["sha256"]) == 64 for row in SCHEMA["runtimeFiles"]))


if __name__ == "__main__":
    unittest.main()
