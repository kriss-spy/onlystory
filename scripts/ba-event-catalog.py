"""Publish Blue Archive event school labels from the official roster.

Derives each imported event collection's featured schools from the official
``EventContentCharacterBonus`` pickup roster and the ``CharacterExcel`` school
column. Hand-curated entries already present in ``src/ba-catalog.json`` (any
entry whose evidence is not from this derivation) are preserved unchanged.

Run with the pinned downloader environment:
uv run --project .cache/ba-downloader python -X utf8 scripts/ba-event-catalog.py
"""

import argparse
import importlib.util
import json
import sqlite3
import sys
import types
from collections import Counter
from pathlib import Path

from ba_downloader.domain.models.execution import ExecutionContext
from ba_downloader.domain.models.workspace import WorkspaceLayout
from ba_downloader.infrastructure.regions.jp.sqlcipher_key import (
    JpSqlCipherKeyProvider,
)
from ba_downloader.infrastructure.schema.flatbuffer.reader import FlatBufferReader
from ba_downloader.infrastructure.storage.sqlcipher import SqlCipherDatabaseResolver

ROOT = Path(__file__).resolve().parents[1]
SCHEMAS = ROOT / ".cache/ba-jp-assets/jp/android/extracted/schemas/flatbuffers"
# A school is featured when it supplies at least this share of the roster.
FEATURED_SHARE = 1 / 5
DERIVATION = "event-character-bonus"
BASIS = (
    "Derived from the official event character-bonus (pickup) roster: a school "
    f"is featured when it supplies at least {round(FEATURED_SHARE * 100)}% of it. "
    "Boss-raid style events with no roster carry no derived school."
)


def schema_class(name):
    package = sys.modules.get("baschemas")
    if package is None:
        package = types.ModuleType("baschemas")
        package.__path__ = [str(SCHEMAS)]
        sys.modules["baschemas"] = package
    key = f"baschemas.{name}"
    if key in sys.modules:
        return getattr(sys.modules[key], name)
    spec = importlib.util.spec_from_file_location(key, SCHEMAS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[key] = module
    spec.loader.exec_module(module)
    return getattr(module, name)


def read_json(path):
    return json.loads(path.read_text(encoding="utf8"))


def write_json(path, value):
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )


def event_rosters(catalog):
    """Return the pickup roster per event and the school per character id."""
    bonus_type = schema_class("EventContentCharacterBonusExcel")
    character_type = schema_class("CharacterExcel")
    context = ExecutionContext(
        region="jp",
        platform="android",
        resource_version=catalog["version"],
        workspace=WorkspaceLayout.create(
            (ROOT / ".cache/ba-jp-assets").resolve(), "jp", "android"
        ),
        max_retries=2,
    )
    resolved = SqlCipherDatabaseResolver(
        context, key_provider=JpSqlCipherKeyProvider(context)
    ).resolve(context.workspace.raw_tables / "ExcelDB.db")
    with sqlite3.connect(resolved) as connection:
        bonuses = [
            FlatBufferReader(blob).read_root(bonus_type)
            for (blob,) in connection.execute(
                "SELECT Bytes FROM EventContentCharacterBonusDBSchema ORDER BY rowid"
            )
        ]
        characters = [
            FlatBufferReader(blob).read_root(character_type)
            for (blob,) in connection.execute(
                "SELECT Bytes FROM CharacterDBSchema ORDER BY rowid"
            )
        ]
    rosters = {}
    for row in bonuses:
        rosters.setdefault(int(row["EventContentId"]), []).append(
            int(row["CharacterId"])
        )
    schools = {int(row["Id"]): str(row["School"]).casefold() for row in characters}
    return rosters, schools


def is_derived(entry):
    return any(
        item.get("kind") == DERIVATION for item in entry.get("evidence", [])
    )


def derive(event, roster, schools, known):
    counts = Counter(schools.get(character, "") for character in roster)
    total = sum(counts.values())
    if not total:
        return None
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    featured = [
        (school, count)
        for school, count in ranked
        if school in known and count / total >= FEATURED_SHARE
    ]
    if not featured:
        return None
    return {
        "schools": [school for school, _ in featured],
        "evidence": [
            {
                "school": school,
                "kind": DERIVATION,
                "eventContentId": event,
                "roster": total,
                "characters": sorted(
                    character
                    for character in roster
                    if schools.get(character) == school
                ),
            }
            for school, _ in featured
        ],
        "associationBasis": BASIS,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    library = read_json(ROOT / "scripts/ba-library.json")
    event_ids = sorted(
        {
            int(definition["collectionId"].rsplit("-", 1)[-1])
            for definition in library
            if definition.get("category") == "Event"
        }
    )
    if not event_ids:
        raise ValueError("No imported event stories in the BA library")
    catalog = read_json(ROOT / "src/ba-catalog.json")
    known = {school["id"] for school in catalog["schools"]}
    if args.verify_only:
        entries = {
            key: value
            for key, value in catalog["collections"].items()
            if key.startswith("ba-jp-event-")
        }
        for key, entry in entries.items():
            if not entry.get("schools") or not set(entry["schools"]) <= known:
                raise ValueError(f"Invalid event school label: {key}")
        print("Verified", len(entries), "event school labels")
        return
    game_catalog = read_json(ROOT / ".cache/ba-jp-catalog.json")
    rosters, schools = event_rosters(game_catalog)
    collections = {}
    derived = 0
    for event in event_ids:
        key = f"ba-jp-event-{event}"
        existing = catalog["collections"].get(key)
        if existing and not is_derived(existing):
            collections[key] = existing
            continue
        entry = derive(event, rosters.get(event, []), schools, known)
        if entry is None:
            continue
        collections[key] = entry
        derived += 1
    preserved = {
        key: value
        for key, value in catalog["collections"].items()
        if not (
            key.startswith("ba-jp-event-")
            and int(key.rsplit("-", 1)[-1]) in set(event_ids)
        )
    }
    catalog["collections"] = {**preserved, **collections}
    catalog["associationBasis"] = (
        "Featured institutions, not every speaker or mentioned school. "
        "Main-story collections are curated from their official volume/chapter "
        "setting; the earliest event collections are hand-curated. Later event "
        "collections are derived from the official character-bonus (pickup) "
        "roster, keeping schools that supply at least 20% of it. "
        "EventContentSeasonDBSchema has no direct event-school association field."
    )
    write_json(ROOT / "src/ba-catalog.json", catalog)
    print(
        "Published",
        len(collections),
        f"event school labels ({derived} derived from the pickup roster)",
        flush=True,
    )


if __name__ == "__main__":
    main()
