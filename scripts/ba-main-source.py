"""Export released JP main-story and prologue groups from official game tables.

Uses the committed 1.73 schema and exact database hash. Existing prologue group
11000 is retained because its community snapshot already carries verified voices.
"""

import argparse
import collections
import datetime
import hashlib
import importlib.util
import json
import re
import sqlite3
import urllib.request
import zipfile
import zlib
from pathlib import Path

import xxhash

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "ba_event_source", ROOT / "scripts/ba-event-source.py"
)
BASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BASE)


def eligible(mode, as_of):
    return (
        mode["ModeType"] in {"Main", "Prologue"}
        and mode["Open"]
        and not mode["Hide"]
        and mode["SubType"] in {"Series1", "Series2"}
        and (not mode["ExposedTime"] or mode["ExposedTime"][:10] <= as_of)
    )


def localized_key(mode, component):
    prefix = mode["ModeType"] + "_" + component + "_Title_"
    if mode["SubType"] != "Series1":
        prefix += mode["SubType"] + "_"
    numbers = [mode["VolumeId"]]
    if component in {"Chapter", "Episode"}:
        numbers.append(mode["ChapterId"])
    if component == "Episode":
        numbers.append(mode["EpisodeId"])
    return prefix + "_".join(map(str, numbers))


def ordered_groups(mode):
    return [("front", group) for group in mode["FrontScenarioGroupId"]] + [
        ("back", group) for group in mode["BackScenarioGroupId"]
    ]


def verified_asset(asset, destination):
    if not destination.exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(".download")
        with (
            urllib.request.urlopen(asset["url"], timeout=120) as response,
            temporary.open("wb") as output,
        ):
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        temporary.replace(destination)
    data = destination.read_bytes()
    if len(data) != asset["size"] or zlib.crc32(data) != int(
        asset["checksum"]["value"]
    ):
        raise ValueError(
            f"Official asset checksum differs from catalog: {asset['path']}"
        )
    return data


def main_voice_members(catalog, workspace):
    asset = next(
        item
        for item in catalog["assets"]
        if item["path"] == "Media/GameData/Audio/VOC_JP/JP_Main.zip"
    )
    path = workspace.raw_media / asset["path"].removeprefix("Media/")
    verified_asset(asset, path)
    with zipfile.ZipFile(path) as archive:
        return [
            member for member in archive.namelist() if member.lower().endswith(".ogg")
        ]


def voice_lookup(catalog, archive_members=()):
    voices = {}
    for asset in catalog["assets"]:
        if "/VOC_JP/" not in asset["path"] or not asset["path"].lower().endswith(
            ".ogg"
        ):
            continue
        stem = Path(asset["path"]).stem
        voices[xxhash.xxh32_intdigest(stem)] = stem
        # Two authored prologue lines are split into _1/_2 files in this version.
        if re.search(r"_\d{3}_[12]$", stem):
            base = stem[:-2]
            voices[xxhash.xxh32_intdigest(base)] = base
    for member in archive_members:
        stem = Path(member).stem
        canonical = re.sub(r"^main_", "Main_", stem, flags=re.I)
        for candidate in {stem, canonical, stem.lower(), stem.upper()}:
            voices[xxhash.xxh32_intdigest(candidate)] = canonical
    return voices


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--as-of",
        default=datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
    )
    parser.add_argument("--workspace", type=Path, default=ROOT / ".cache/ba-jp-assets")
    parser.add_argument(
        "--source-cache", type=Path, default=ROOT / ".cache/ba-main-source"
    )
    parser.add_argument(
        "--public-root", type=Path, default=ROOT / "public/private/ba-jp"
    )
    args = parser.parse_args()
    cache = args.source_cache.resolve()
    schema_file = ROOT / "scripts/ba-jp-schema-1.73.json"
    schema = json.loads(schema_file.read_text(encoding="utf8"))
    types = BASE.load_schema(schema)
    main_schema_file = ROOT / "scripts/ba-jp-main-schema-1.73.json"
    main_schema = json.loads(main_schema_file.read_text(encoding="utf8"))
    if (
        main_schema["gameVersion"] != schema["gameVersion"]
        or main_schema["databaseSha256"] != schema["databaseSha256"]
    ):
        raise ValueError(
            "Portable main-story schemas do not describe the same database"
        )
    types.update(BASE.load_schema(main_schema))
    catalog = json.loads(
        (ROOT / ".cache/ba-jp-catalog.json").read_text(encoding="utf8")
    )
    if catalog["version"] != schema["gameVersion"]:
        raise ValueError(
            "Main-story catalog does not match the committed schema version"
        )
    context = BASE.ExecutionContext(
        region="jp",
        platform="android",
        resource_version=catalog["version"],
        workspace=BASE.WorkspaceLayout.create(
            args.workspace.resolve(), "jp", "android"
        ),
        max_retries=2,
    )
    raw_path = context.workspace.raw_tables / "ExcelDB.db"
    raw = verified_asset(
        next(item for item in catalog["assets"] if item["path"] == "Table/ExcelDB.db"),
        raw_path,
    )
    database_hash = hashlib.sha256(raw).hexdigest()
    if database_hash != schema["databaseSha256"]:
        raise ValueError("Main-story database hash does not match the committed schema")
    database = BASE.SqlCipherDatabaseResolver(
        context, key_provider=BASE.JpSqlCipherKeyProvider(context)
    ).resolve(raw_path)
    connection = sqlite3.connect(database)

    def decode(table, blob):
        return BASE.FlatBufferReader(blob).read_root(
            types[table.replace("DBSchema", "Excel")]
        )

    def table(name):
        return [
            decode(name, blob)
            for (blob,) in connection.execute(
                f'SELECT Bytes FROM "{name}" ORDER BY rowid'
            )
        ]

    for name in ["VideoDBSchema", "ScenarioBGNameDBSchema", "ScenarioBGEffectDBSchema"]:
        BASE.write_json(
            cache / "official" / f"{name}.json", [{"Bytes": row} for row in table(name)]
        )

    localize = {row["Key"]: row["Jp"] for row in table("LocalizeDBSchema")}
    all_modes = table("ScenarioModeDBSchema")
    modes = sorted(
        (row for row in all_modes if eligible(row, args.as_of)),
        key=lambda row: (
            row["SubType"],
            row["ModeType"] != "Prologue",
            row["VolumeId"],
            row["ChapterId"],
            row["EpisodeId"],
            row["ModeId"],
        ),
    )
    characters = {"DataList": table("ScenarioCharacterNameDBSchema")}
    BASE.write_json(cache / "characters.json", characters)
    archive_members = main_voice_members(catalog, context.workspace)
    BASE.write_json(cache / "voice-members.json", archive_members)
    voices = voice_lookup(catalog, archive_members)
    definitions, collections_meta, seen = [], {}, {}
    coverage = {
        "asOf": args.as_of,
        "gameVersion": catalog["version"],
        "allScenarioModes": len(all_modes),
        "allMainPrologueModes": sum(
            row["ModeType"] in {"Main", "Prologue"} for row in all_modes
        ),
        "eligibleModes": len(modes),
        "excludedModes": [
            row
            for row in all_modes
            if row["ModeType"] in {"Main", "Prologue"} and not eligible(row, args.as_of)
        ],
        "existingGroupsPreserved": [11000],
        "emptyGroups": [],
        "missingLabels": [],
        "unresolvedVoices": [],
        "rows": 0,
        "japaneseRows": 0,
        "commands": collections.Counter(),
        "actorCommands": collections.Counter(),
        "bgEffects": collections.Counter(),
        "transitions": collections.Counter(),
        "popups": collections.Counter(),
        "videos": collections.Counter(),
        "voices": collections.Counter(),
        "groups": [],
    }
    for mode in modes:
        labels, label_evidence = {}, {}
        for component in ["Volume", "Chapter", "Episode"]:
            key = localized_key(mode, component)
            hash_key = xxhash.xxh32_intdigest(key)
            value = localize.get(hash_key, "")
            labels[component] = value
            label_evidence[component] = {"key": key, "hash": hash_key, "text": value}
            if not value:
                coverage["missingLabels"].append(
                    {
                        "mode": mode["ModeId"],
                        "component": component,
                        "key": key,
                        "hash": hash_key,
                    }
                )
        if not labels["Volume"] or not labels["Chapter"] or not labels["Episode"]:
            continue
        if mode["ModeType"] == "Prologue":
            collection_id = (
                "ba-jp-prologue"
                if mode["SubType"] == "Series1"
                else "ba-jp-prologue-part2"
            )
            story = (
                labels["Volume"]
                if mode["SubType"] == "Series1"
                else "第2部 · " + labels["Volume"]
            )
        else:
            collection_id = f"ba-jp-main-{mode['SubType'].lower()}-v{mode['VolumeId']}-c{mode['ChapterId']}"
            story = f"第{1 if mode['SubType'] == 'Series1' else 2}部 · {labels['Volume']} · 第{mode['ChapterId']}章 {labels['Chapter']}"
        collection = collections_meta.setdefault(
            collection_id,
            {
                "collectionId": collection_id,
                "story": story,
                "modeType": mode["ModeType"],
                "series": mode["SubType"],
                "part": 1 if mode["SubType"] == "Series1" else 2,
                "displayVolume": mode["DisplayVolumeId"]
                or labels["Volume"].split(" ")[0],
                "volume": mode["VolumeId"],
                "chapter": mode["ChapterId"],
                "labels": label_evidence,
                "groups": [],
                "modes": [],
            },
        )
        collection["modes"].append(mode["ModeId"])
        groups = ordered_groups(mode)
        for group_index, (phase, group) in enumerate(groups, 1):
            reference = {
                "modeId": mode["ModeId"],
                "episode": mode["EpisodeId"],
                "phase": phase,
                "groupIndex": group_index,
            }
            if group in seen:
                seen[group]["modeReferences"].append(reference)
                continue
            rows = [
                decode("ScenarioScriptDBSchema", blob)
                for (blob,) in connection.execute(
                    "SELECT Bytes FROM ScenarioScriptDBSchema WHERE GroupId=? ORDER BY rowid",
                    (group,),
                )
            ]
            if not rows:
                coverage["emptyGroups"].append({"group": group, "mode": mode["ModeId"]})
                continue
            for index, row in enumerate(rows):
                if row["VoiceId"]:
                    row["VoiceJp"] = voices.get(row["VoiceId"], "")
                    if not row["VoiceJp"]:
                        coverage["unresolvedVoices"].append(
                            {"group": group, "row": index, "id": row["VoiceId"]}
                        )
                    coverage["voices"][row["VoiceId"]] += 1
                for field, name in [
                    ("BGEffect", "bgEffects"),
                    ("Transition", "transitions"),
                    ("PopupFileName", "popups"),
                ]:
                    if row[field]:
                        coverage[name][row[field]] += 1
                for line in row["ScriptKr"].splitlines():
                    parts = line.split(";")
                    if line.startswith("#"):
                        coverage["commands"][parts[0]] += 1
                    if re.match(r"^#[1-5]$", parts[0]) and len(parts) > 1:
                        coverage["actorCommands"][parts[1]] += 1
                    if parts[0] == "#video" and len(parts) > 1:
                        coverage["videos"][parts[1]] += 1
            source = {"GroupId": group, "content": rows}
            group_info = {
                "group": group,
                "collectionId": collection_id,
                "rows": len(rows),
                "japaneseRows": sum(bool(row["TextJp"]) for row in rows),
                "modeReferences": [reference],
            }
            seen[group] = group_info
            coverage["groups"].append(group_info)
            coverage["rows"] += group_info["rows"]
            coverage["japaneseRows"] += group_info["japaneseRows"]
            collection["groups"].append(group)
            if group == 11000:
                continue
            BASE.write_json(cache / f"{group}.json", source)
            BASE.write_json(args.public_root / str(group) / "source.json", source)
            BASE.write_json(
                args.public_root / str(group) / "characters.json", characters
            )
            title = labels["Episode"] + (
                f" · {group_index}/{len(groups)}" if len(groups) > 1 else ""
            )
            definition = {
                "group": group,
                "sourceFile": (cache / f"{group}.json").relative_to(ROOT).as_posix(),
                "charactersFile": (cache / "characters.json")
                .relative_to(ROOT)
                .as_posix(),
                "provenanceFile": (cache / "provenance.json")
                .relative_to(ROOT)
                .as_posix(),
                "story": story,
                "title": title,
                "collectionId": collection_id,
                "category": "Main story",
                "order": len(collection["groups"]),
                "date": mode["ExposedTime"][:10],
                "mainStory": {
                    "series": mode["SubType"],
                    "part": 1 if mode["SubType"] == "Series1" else 2,
                    "displayVolume": mode["DisplayVolumeId"]
                    or labels["Volume"].split(" ")[0],
                    "volume": mode["VolumeId"],
                    "chapter": mode["ChapterId"],
                    "episode": mode["EpisodeId"],
                    "modeId": mode["ModeId"],
                    "modeIds": [mode["ModeId"]],
                    "phase": phase,
                    "labels": label_evidence,
                },
            }
            definitions.append(definition)
        print(
            mode["ModeId"],
            mode["SubType"],
            labels["Volume"],
            labels["Chapter"],
            labels["Episode"],
            [group for _, group in groups],
            flush=True,
        )
    coverage["latestExposedTime"] = max(
        (row["ExposedTime"] for row in modes), default=""
    )
    coverage["futureMainPrologueModes"] = sum(
        row["ModeType"] in {"Main", "Prologue"}
        and bool(row["ExposedTime"])
        and row["ExposedTime"][:10] > args.as_of
        for row in all_modes
    )
    coverage["uniqueGroups"] = len(seen)
    coverage["exportedGroups"] = len(definitions)
    coverage["collections"] = len(collections_meta)
    BASE.write_json(cache / "definitions.json", definitions)
    BASE.write_json(cache / "collections.json", list(collections_meta.values()))
    BASE.write_json(cache / "coverage.json", coverage)
    BASE.write_json(
        cache / "provenance.json",
        {
            "source": "Official JP main-story game tables",
            "region": "JP",
            "language": "ja",
            "gameVersion": catalog["version"],
            "sha256": database_hash,
            "database": next(
                item for item in catalog["assets"] if item["path"] == "Table/ExcelDB.db"
            ),
            "toolRepository": "https://github.com/ZM-Kimu/Blue-Archive-Asset-Downloader",
            "toolRevision": BASE.TOOL_REVISION,
            "tables": [
                "ScenarioModeDBSchema",
                "ScenarioScriptDBSchema",
                "ScenarioCharacterNameDBSchema",
                "LocalizeDBSchema",
            ],
            "schemaFile": "scripts/ba-jp-schema-1.73.json",
            "schemaSha256": hashlib.sha256(schema_file.read_bytes()).hexdigest(),
            "mainSchemaFile": "scripts/ba-jp-main-schema-1.73.json",
            "mainSchemaSha256": hashlib.sha256(
                main_schema_file.read_bytes()
            ).hexdigest(),
            "localizationTemplates": "Official runtime metadata string literals; xxhash32 seed0 joins LocalizeDBSchema",
            "asOf": args.as_of,
            "exportedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        },
    )
    print(
        "EXPORTED",
        len(definitions),
        "GROUPS",
        len(seen),
        "MODES",
        len(modes),
        "COLLECTIONS",
        len(collections_meta),
        "LABELGAPS",
        len(coverage["missingLabels"]),
        "VOICEGAPS",
        len(coverage["unresolvedVoices"]),
        flush=True,
    )
    if (
        coverage["emptyGroups"]
        or coverage["missingLabels"]
        or coverage["unresolvedVoices"]
    ):
        raise ValueError(
            "Main-story source export has gaps; inspect coverage.json before publishing"
        )


if __name__ == "__main__":
    main()
