"""Acquire the pinned original global database and export English source rows.

Run with uv run --project .cache/ba-downloader python -X utf8
scripts/ba-english-source.py. No translated dialogue enters the application shell.
"""

import hashlib
import json
import sqlite3
import urllib.request
from pathlib import Path

import flatbuffers
from flatbuffers import number_types
from ba_downloader.domain.models.execution import ExecutionContext
from ba_downloader.domain.models.workspace import WorkspaceLayout
from ba_downloader.infrastructure.regions.gl.sqlcipher_key import GlSqlCipherKeyProvider
from ba_downloader.infrastructure.storage.sqlcipher import SqlCipherDatabaseResolver

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache/ba-gl-source"
SCHEMA = json.loads((ROOT / "scripts/ba-gl-schema-1.93.json").read_text())
SOURCE = {
    "url": "https://ba.dn.nexoncdn.co.kr/com.nexon.bluearchive/14458de2094747e5/Preload/TableBundles/ExcelDB.db",
    "path": "Global/Table/ExcelDB.db",
    "bytes": 329715712,
    "md5": "3f23ccd570961d35b6d99a4ea1b9f265",
    "sha256": SCHEMA["databaseSha256"],
}


def decode(blob, name):
    table = flatbuffers.table.Table(blob, int.from_bytes(blob[:4], "little"))
    flags = {
        "System.Int32": number_types.Int32Flags,
        "System.UInt32": number_types.Uint32Flags,
        "System.Int64": number_types.Int64Flags,
        "System.UInt64": number_types.Uint64Flags,
        "System.Boolean": number_types.BoolFlags,
    }
    result = {}
    for field in SCHEMA["types"][name]["fields"]:
        kind = field["field"]["cs_type"]
        offset = table.Offset(4 + 2 * field["field"]["index"])
        if field["field"].get("is_vector"):
            value = [table.Get(flags[kind], table.Vector(offset) + 4 * i) for i in range(table.VectorLen(offset))] if offset else []
        elif kind == "System.String":
            value = table.String(table.Pos + offset).decode("utf8") if offset else None
        else:
            value = table.Get(flags[kind], table.Pos + offset) if offset else 0
        result[field["name"]] = value
    return result


def save(name, value):
    (CACHE / name).write_text(json.dumps(value, ensure_ascii=False), encoding="utf8")


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    context = ExecutionContext(
        region="gl", platform="android", resource_version=SCHEMA["gameVersion"],
        workspace=WorkspaceLayout.create(ROOT / ".cache/ba-gl-assets", "gl", "android"),
        max_retries=2,
    )
    original = context.workspace.raw_tables / "ExcelDB.db"
    original.parent.mkdir(parents=True, exist_ok=True)
    if not original.exists():
        temporary = original.with_suffix(".download")
        with urllib.request.urlopen(SOURCE["url"], timeout=180) as response, temporary.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        temporary.replace(original)
    raw = original.read_bytes()
    if len(raw) != SOURCE["bytes"] or hashlib.md5(raw).hexdigest() != SOURCE["md5"] or hashlib.sha256(raw).hexdigest() != SOURCE["sha256"]:
        raise ValueError("Global original database does not match the pinned official catalog")
    key_file = CACHE / "key.txt"
    if not key_file.exists():
        key_file.write_text(GlSqlCipherKeyProvider(context).get_key_hex(), encoding="utf8")
    context = ExecutionContext(
        region="gl", platform="android", resource_version=SCHEMA["gameVersion"],
        workspace=context.workspace, sqlcipher_key=key_file.read_text().strip(), max_retries=2,
    )
    database = SqlCipherDatabaseResolver(context).resolve(original)
    wanted = {d["group"] for d in json.loads((ROOT / "scripts/ba-library.json").read_text(encoding="utf8"))}
    groups = {}
    with sqlite3.connect(database) as connection:
        for group, blob in connection.execute("SELECT GroupId, Bytes FROM ScenarioScriptDBSchema ORDER BY GroupId, rowid"):
            if group not in wanted:
                continue
            row = decode(blob, "ScenarioScriptExcel")
            if not row["TeenMode"]:
                groups.setdefault(group, []).append(row)
        save("scripts.json", groups)
        for name in ["ScenarioCharacterNameExcel", "LocalizeExcel"]:
            rows = [decode(blob, name) for (blob,) in connection.execute(f'SELECT Bytes FROM "{name.replace("Excel", "DBSchema")}" ORDER BY rowid')]
            save(name + ".json", rows)
        as_of = SCHEMA["availabilityAsOf"]
        opened = lambda value: not value or value[:10] <= as_of
        modes = [decode(blob, "ScenarioModeExcel") for (blob,) in connection.execute("SELECT Bytes FROM ScenarioModeDBSchema ORDER BY rowid")]
        released = {group for mode in modes if mode["Open"] and not mode["Hide"] and opened(mode["ExposedTime"]) and opened(mode["ScenarioOpenDate"]) for group in mode["FrontScenarioGroupId"] + mode["BackScenarioGroupId"]}
        seasons = [decode(blob, "EventContentSeasonExcel") for (blob,) in connection.execute("SELECT Bytes FROM EventContentSeasonDBSchema ORDER BY rowid")]
        events = {season["EventContentId"] for season in seasons if season["EventDisplay"] and opened(season["EventContentOpenTime"])}
        event_modes = [decode(blob, "EventContentScenarioExcel") for (blob,) in connection.execute("SELECT Bytes FROM EventContentScenarioDBSchema ORDER BY rowid")]
        released.update(group for mode in event_modes if mode["EventContentId"] in events for group in mode["ScenarioGroupId"])
        save("availability.json", {"asOf": as_of, "groups": sorted(released & wanted), "modes": modes, "events": sorted(events)})
    save("provenance.json", {
        "region": "GL", "language": "en", "gameVersion": SCHEMA["gameVersion"],
        "source": SOURCE, "schema": SCHEMA["schemaSource"],
        "schemaCorrections": SCHEMA["verifiedCorrections"],
        "keySource": "https://ba.zmkimu.com/gl", "originalPath": original.relative_to(ROOT).as_posix(),
        "schemaSha256": hashlib.sha256((ROOT / "scripts/ba-gl-schema-1.93.json").read_bytes()).hexdigest(),
        "groups": len(groups), "rows": sum(map(len, groups.values())),
    })
    print(f"Exported {len(groups)} global scenario groups from verified official originals")


if __name__ == "__main__":
    main()
