"""Publish Blue Archive group-story cover metadata and school labels.

Maps every imported Club story collection to the school named by its official
GroupStory emblem and uses a representative original story background as the
collection cover.

Run with the pinned downloader environment:
uv run --project .cache/ba-downloader python -X utf8 scripts/ba-group-catalog.py
"""

import argparse
import importlib.util
import json
import sqlite3
import sys
import types
from pathlib import Path

from PIL import Image
from ba_downloader.domain.models.execution import ExecutionContext
from ba_downloader.domain.models.workspace import WorkspaceLayout
from ba_downloader.infrastructure.regions.jp.sqlcipher_key import (
    JpSqlCipherKeyProvider,
)
from ba_downloader.infrastructure.schema.flatbuffer.reader import FlatBufferReader
from ba_downloader.infrastructure.storage.sqlcipher import SqlCipherDatabaseResolver

ROOT = Path(__file__).resolve().parents[1]
SCHEMAS = ROOT / ".cache/ba-jp-assets/jp/android/extracted/schemas/flatbuffers"


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


def group_emblems(catalog):
    EmblemExcel = schema_class("EmblemExcel")
    context = ExecutionContext(
        region="jp",
        platform="android",
        resource_version=catalog["version"],
        workspace=WorkspaceLayout.create(
            (ROOT / ".cache/ba-jp-assets").resolve(), "jp", "android"
        ),
        max_retries=2,
    )
    database = context.workspace.raw_tables / "ExcelDB.db"
    resolved = SqlCipherDatabaseResolver(
        context, key_provider=JpSqlCipherKeyProvider(context)
    ).resolve(database)
    with sqlite3.connect(resolved) as connection:
        rows = [
            FlatBufferReader(blob).read_root(EmblemExcel)
            for (blob,) in connection.execute(
                "SELECT Bytes FROM EmblemDBSchema ORDER BY rowid"
            )
        ]
    result = {}
    for row in rows:
        if not str(row["Category"]).endswith("GroupStory"):
            continue
        result[int(row["EmblemParameter"])] = row
    return result


def school_id(emblem):
    icon = str(emblem["EmblemIconPath"])
    return icon.rsplit("_Group_", 1)[-1].casefold()


def background_for(definitions, used):
    candidates = []
    seen = set()
    for definition in definitions:
        group = definition["group"]
        folder = ROOT / "public/private/ba-jp" / str(group)
        assets = read_json(folder / "assets.json")
        source = read_json(folder / "source.json")
        identifiers = []
        for row in source["content"]:
            identifier = str(row.get("BGName") or "")
            if identifier and identifier != "0":
                identifiers.append(identifier)
        identifiers.extend(
            identifier
            for identifier, background in assets["backgrounds"].items()
            if background.get("renderer") != "spine"
        )
        for identifier in identifiers:
            if identifier in seen:
                continue
            seen.add(identifier)
            background = assets["backgrounds"].get(identifier)
            if (
                not background
                or background.get("renderer") == "spine"
                or background.get("name") == "BG_Black.jpg"
                or not (ROOT / "public" / background["url"].lstrip("/")).exists()
            ):
                continue
            files = {file["url"]: file for file in assets.get("files", [])}
            candidates.append(
                {
                    "group": group,
                    "identifier": identifier,
                    "name": background["name"],
                    "url": background["url"],
                    "file": files.get(background["url"], {}),
                }
            )
    if candidates:
        return next(
            (candidate for candidate in candidates if candidate["url"] not in used),
            candidates[0],
        )
    raise ValueError("No image background found for group-story collection")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    library = read_json(ROOT / "scripts/ba-library.json")
    definitions = [
        definition
        for definition in library
        if definition.get("category") == "Group story"
    ]
    if not definitions:
        raise ValueError("No imported group stories in the BA library")
    catalog = read_json(ROOT / "src/ba-catalog.json")
    artwork = read_json(ROOT / "src/cover-art.json")
    if args.verify_only:
        missing = [
            definition["collectionId"]
            for definition in definitions
            if definition["collectionId"] not in catalog["collections"]
            or f"ba:{definition['collectionId']}" not in artwork["events"]
        ]
        if missing:
            raise ValueError(f"Missing group-story catalog metadata: {missing}")
        print("Verified", len(definitions), "group-story catalog definitions")
        return
    game_catalog = read_json(ROOT / ".cache/ba-jp-catalog.json")
    database_url = read_json(ROOT / ".cache/ba-group-source/provenance.json")[
        "database"
    ]["url"]
    emblems = group_emblems(game_catalog)
    collections = {}
    covers = {}
    manifest = {"version": 1, "gameVersion": game_catalog["version"], "groups": {}}
    used_backgrounds = set()
    for collection_id in sorted(
        {definition["collectionId"] for definition in definitions},
        key=lambda value: int(value.rsplit("-v", 1)[-1]),
    ):
        members = sorted(
            (
                definition
                for definition in definitions
                if definition["collectionId"] == collection_id
            ),
            key=lambda definition: definition["order"],
        )
        first = members[0]
        mode = int(first["groupStory"]["modeId"])
        emblem = emblems.get(mode)
        if emblem is None:
            raise ValueError(f"Missing GroupStory emblem for mode {mode}")
        school = school_id(emblem)
        if school not in {item["id"] for item in catalog["schools"]}:
            raise ValueError(f"Unknown school from GroupStory emblem: {school}")
        background = background_for(members, used_backgrounds)
        used_backgrounds.add(background["url"])
        local = ROOT / "public" / background["url"].lstrip("/")
        with Image.open(local) as image:
            width, height = image.size
        collections[collection_id] = {
            "schools": [school],
            "evidence": [
                {
                    "school": school,
                    "group": first["group"],
                    "row": 0,
                    "kind": "group-story-emblem",
                    "emblemId": emblem["Id"],
                    "emblemIconPath": emblem["EmblemIconPath"],
                }
            ],
            "groupStory": {
                "volume": first["groupStory"]["volume"],
                "club": first["groupStory"]["club"],
                "emblemId": emblem["Id"],
                "emblemCategory": str(emblem["Category"]),
                "emblemIconPath": emblem["EmblemIconPath"],
                "labels": first["groupStory"]["labels"],
            },
            "associationBasis": "Official GroupStory emblem category; the emblem icon identifies the featured school.",
        }
        covers[f"ba:{collection_id}"] = {
            "url": background["url"],
            "position": "50% 50%",
            "width": width,
            "height": height,
            "kind": "official-game-art",
            "credit": "Original Blue Archive group-story background",
            "source": database_url,
            "sourcePath": background["name"],
            "bytes": background["file"].get("bytes"),
            "sha256": background["file"].get("sha256"),
            "groupStory": {
                "group": background["group"],
                "backgroundId": background["identifier"],
            },
        }
        manifest["groups"][collection_id] = {
            "emblem": {
                "id": emblem["Id"],
                "category": str(emblem["Category"]),
                "iconPath": emblem["EmblemIconPath"],
                "backgroundPath": emblem["EmblemBGPathJp"],
                "school": school,
            },
            "cover": covers[f"ba:{collection_id}"],
        }
    catalog["collections"] = {
        **{
            key: value
            for key, value in catalog["collections"].items()
            if not key.startswith("ba-jp-group-")
        },
        **collections,
    }
    artwork["events"] = {
        **{
            key: value
            for key, value in artwork["events"].items()
            if not key.startswith("ba:ba-jp-group-")
        },
        **covers,
    }
    write_json(ROOT / "src/ba-catalog.json", catalog)
    write_json(ROOT / "src/cover-art.json", artwork)
    write_json(ROOT / "public/private/ba-jp/catalog/group-story.json", manifest)
    print(
        "Published",
        len(collections),
        "group-story collections with covers and school labels",
        flush=True,
    )


if __name__ == "__main__":
    main()
