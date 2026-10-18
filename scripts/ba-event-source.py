"""Export JP event scripts from the pinned official game database.

Run with the pinned downloader environment after catalog bootstrap:
uv run --project .cache/ba-downloader python -X utf8 scripts/ba-event-source.py
The committed schema snapshot removes the need for APK decompilation.
"""

import argparse
import datetime
import hashlib
import json
import re
import sqlite3
import urllib.request
import zlib
from pathlib import Path
from dataclasses import make_dataclass
from enum import IntEnum
from types import SimpleNamespace
from typing import Annotated

import xxhash

from ba_downloader.domain.models.execution import ExecutionContext
from ba_downloader.domain.models.workspace import WorkspaceLayout
from ba_downloader.infrastructure.schema.flatbuffer.descriptors import (
    FlatBufferField,
    FlatBufferTypeMetadata,
)
from ba_downloader.infrastructure.schema.flatbuffer.reader import FlatBufferReader
from ba_downloader.infrastructure.regions.jp.sqlcipher_key import JpSqlCipherKeyProvider
from ba_downloader.infrastructure.storage.sqlcipher import SqlCipherDatabaseResolver


ROOT = Path(__file__).resolve().parents[1]
TOOL_REVISION = "ac4598977abb46cf11574446fe799aed59842b3a"
TABLES = [
    "EventContentSeason",
    "EventContentScenario",
    "ScenarioMode",
    "ScenarioCharacterName",
    "ScenarioBGName",
    "ScenarioBGEffect",
    "ScenarioTransition",
    "BGM",
]


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )


def merge_library(path, definitions):
    """Replace exported Event entries in place and append newly exported ones."""
    library = json.loads(path.read_text(encoding="utf8"))
    pending = {
        (definition["collectionId"], definition["group"]): definition
        for definition in definitions
    }
    merged = []
    for definition in library:
        key = (definition.get("collectionId"), definition.get("group"))
        if definition.get("category") == "Event" and key in pending:
            merged.append(pending.pop(key))
        else:
            merged.append(definition)
    merged.extend(pending.values())
    write_json(path, merged)
    return len(merged)


def load_schema(schema):
    enums = {}
    for name, entry in schema["enums"].items():
        enum = IntEnum(name, entry["members"])
        enum.__flatbuffer_enum__ = SimpleNamespace(**entry["metadata"])
        enums[name] = enum
    types = {}
    primitives = {"int": int, "float": float, "str": str, "bool": bool}
    for name, entry in schema["types"].items():
        fields = []
        for item in entry["fields"]:
            descriptor = FlatBufferField(**item["field"])
            annotation = enums.get(item["annotation"]) or primitives[item["annotation"]]
            if descriptor.is_vector:
                annotation = list[annotation]
            fields.append((item["name"], Annotated[annotation, descriptor]))
        cls = make_dataclass(name, fields)
        cls.__flatbuffer_type__ = FlatBufferTypeMetadata(**entry["metadata"])
        types[name] = cls
    return types


def readable_chapter_title(rows, previous_title, order):
    title = next((r["TextJp"] for r in rows if "#title;" in r["ScriptKr"] and r["TextJp"]), "")
    if title:
        return re.sub(r"\[ruby=[^\]]*\](.*?)\[/ruby\]", r"\1", title).replace(";", " · ")
    return f"{previous_title}（続き）" if previous_title else f"イベントストーリー {order}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--events", default="801,802,803,804,805")
    parser.add_argument("--workspace", type=Path, default=ROOT / ".cache/ba-jp-assets")
    parser.add_argument(
        "--source-cache", type=Path, default=ROOT / ".cache/ba-event-source"
    )
    parser.add_argument(
        "--public-root", type=Path, default=ROOT / "public/private/ba-jp"
    )
    parser.add_argument(
        "--library", type=Path, default=ROOT / "scripts/ba-library.json"
    )
    parser.add_argument("--merge-library", action="store_true")
    args = parser.parse_args()
    event_ids = [int(value) for value in args.events.split(",")]
    cache = args.source_cache.resolve()
    schema = json.loads(
        (ROOT / "scripts/ba-jp-schema-1.73.json").read_text(encoding="utf8")
    )
    schema_types = load_schema(schema)
    catalog = json.loads(
        (ROOT / ".cache/ba-jp-catalog.json").read_text(encoding="utf8")
    )
    if catalog["version"] != schema["gameVersion"]:
        raise ValueError("Catalog version does not match committed JP schema snapshot")
    asset = next(a for a in catalog["assets"] if a["path"] == "Table/ExcelDB.db")
    context = ExecutionContext(
        region="jp",
        platform="android",
        resource_version=catalog["version"],
        workspace=WorkspaceLayout.create(args.workspace.resolve(), "jp", "android"),
        max_retries=2,
    )
    database = context.workspace.raw_tables / "ExcelDB.db"
    if not database.exists():
        database.parent.mkdir(parents=True, exist_ok=True)
        temporary = database.with_suffix(".download")
        with (
            urllib.request.urlopen(asset["url"], timeout=120) as response,
            temporary.open("wb") as output,
        ):
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        temporary.replace(database)
    raw = database.read_bytes()
    if len(raw) != asset["size"] or zlib.crc32(raw) != int(asset["checksum"]["value"]):
        raise ValueError(
            "Official ExcelDB database does not match the pinned catalog size/CRC32"
        )
    if hashlib.sha256(raw).hexdigest() != schema["databaseSha256"]:
        raise ValueError("Database hash differs from the committed schema snapshot")
    resolver = SqlCipherDatabaseResolver(
        context, key_provider=JpSqlCipherKeyProvider(context)
    )
    decoded_path = resolver.resolve(database)

    def decode(name, blob):
        return FlatBufferReader(blob).read_root(
            schema_types[name.replace("DBSchema", "Excel")]
        )

    with sqlite3.connect(decoded_path) as connection:
        tables = {}
        for name in TABLES:
            table_name = name + "DBSchema"
            tables[name] = [
                decode(table_name, row[0])
                for row in connection.execute(
                    f'SELECT Bytes FROM "{table_name}" ORDER BY rowid'
                )
            ]
            write_json(
                cache / "official" / f"{table_name}.json",
                [{"Bytes": row} for row in tables[name]],
            )
        localize = {
            row["Key"]: row
            for row in (
                decode("LocalizeDBSchema", b)
                for (b,) in connection.execute("SELECT Bytes FROM LocalizeDBSchema")
            )
        }
        seasons = {
            row["EventContentId"]: row
            for row in tables["EventContentSeason"]
            if row["EventDisplay"]
        }
        characters = {"DataList": tables["ScenarioCharacterName"]}
        write_json(cache / "characters.json", characters)
        definitions, events = [], []
        for event_id in event_ids:
            season = seasons[event_id]
            title = localize[xxhash.xxh32_intdigest(season["Name"])]["Jp"]
            scenarios = sorted(
                (
                    row
                    for row in tables["EventContentScenario"]
                    if row["EventContentId"] == event_id
                ),
                key=lambda row: row["Order"],
            )
            groups = [group for row in scenarios for group in row["ScenarioGroupId"]]
            if not groups or len(groups) != len(set(groups)):
                raise ValueError(
                    f"Missing or duplicate scenario groups for event {event_id}"
                )
            date = season["EventContentOpenTime"][:10]
            events.append(
                {"eventId": event_id, "title": title, "groups": groups, "date": date}
            )
            previous_title = ""
            for order, group in enumerate(groups, 1):
                rows = [
                    decode("ScenarioScriptDBSchema", blob)
                    for (blob,) in connection.execute(
                        "SELECT Bytes FROM ScenarioScriptDBSchema WHERE GroupId=? ORDER BY rowid",
                        (group,),
                    )
                ]
                if not rows or any(row["GroupId"] != group for row in rows):
                    raise ValueError(
                        f"Invalid or empty official scenario group {group}"
                    )
                source = {"GroupId": group, "content": rows}
                source_file = cache / f"{group}.json"
                write_json(source_file, source)
                folder = args.public_root / str(group)
                write_json(folder / "source.json", source)
                write_json(folder / "characters.json", characters)
                chapter_title = readable_chapter_title(rows, previous_title, order)
                if any("#title;" in r["ScriptKr"] and r["TextJp"] for r in rows):
                    previous_title = chapter_title
                definitions.append(
                    {
                        "group": group,
                        "sourceFile": source_file.relative_to(ROOT).as_posix(),
                        "charactersFile": (cache / "characters.json")
                        .relative_to(ROOT)
                        .as_posix(),
                        "provenanceFile": (cache / "provenance.json")
                        .relative_to(ROOT)
                        .as_posix(),
                        "story": title,
                        "title": chapter_title,
                        "collectionId": f"ba-jp-event-{event_id}",
                        "date": date,
                        "category": "Event",
                        "order": order,
                    }
                )
                print(event_id, group, len(rows), chapter_title, flush=True)
    write_json(cache / "definitions.json", definitions)
    write_json(cache / "events.json", events)
    merged = None
    if args.merge_library:
        merged = merge_library(args.library, definitions)
    write_json(
        cache / "provenance.json",
        {
            "source": "Official JP game tables",
            "region": "JP",
            "language": "ja",
            "gameVersion": catalog["version"],
            "url": asset["url"],
            "size": len(raw),
            "crc32": zlib.crc32(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "schemaSnapshot": schema["schemaSnapshot"],
            "schemaFile": "scripts/ba-jp-schema-1.73.json",
            "schemaSha256": hashlib.sha256(
                (ROOT / "scripts/ba-jp-schema-1.73.json").read_bytes()
            ).hexdigest(),
            "tables": [name + "DBSchema" for name in TABLES]
            + ["ScenarioScriptDBSchema", "LocalizeDBSchema"],
            "toolRepository": "https://github.com/ZM-Kimu/Blue-Archive-Asset-Downloader",
            "toolRevision": TOOL_REVISION,
            "exportedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        },
    )
    print(f"Exported {len(events)} JP events and {len(definitions)} chapters.")
    if merged is not None:
        print(f"Merged into library: {merged} definitions.")


if __name__ == "__main__":
    main()
