"""Export released JP Club group-story groups from official game tables.

Uses the committed 1.73 schema and the pinned ExcelDB SHA-256. Group stories
are ``ScenarioModeDBSchema`` rows with ``ModeType=Sub`` and ``SubType=Club``.
Each released mode owns one distinct front scenario group in this build.
"""

import argparse
import collections
import datetime
import hashlib
import importlib.util
import json
import re
import sqlite3
import zlib
from pathlib import Path

import xxhash

ROOT = Path(__file__).resolve().parents[1]
MAIN_SPEC = importlib.util.spec_from_file_location(
    "ba_main_source", ROOT / "scripts/ba-main-source.py"
)
MAIN = importlib.util.module_from_spec(MAIN_SPEC)
MAIN_SPEC.loader.exec_module(MAIN)
BASE = MAIN.BASE


def eligible(mode):
    return (
        mode["ModeType"] == "Sub"
        and mode["SubType"] == "Club"
        and mode["Open"]
        and not mode["Hide"]
    )


def localized_key(mode, component):
    key = f"Sub_{component}_Title_{mode['VolumeId']}"
    if component in {"Chapter", "Episode"}:
        key += f"_{mode['ChapterId']}"
    if component == "Episode":
        key += f"_{mode['EpisodeId']}"
    return key


def volume_club(modes):
    evidence = {}
    for mode in modes:
        if mode["NeedClub"] in {"", "None_"}:
            continue
        value = {
            "club": mode["NeedClub"],
            "clubStudentCount": mode["NeedClubStudentCount"],
            "modeId": mode["ModeId"],
        }
        previous = evidence.setdefault(mode["VolumeId"], value)
        if previous != value:
            raise ValueError(
                f"Club group volume {mode['VolumeId']} has conflicting NeedClub rows"
            )
    missing = sorted({mode["VolumeId"] for mode in modes} - set(evidence))
    if missing:
        raise ValueError(f"Club group volumes without NeedClub: {missing}")
    return evidence


def merge_library(path, definitions):
    library = json.loads(path.read_text(encoding="utf8"))
    merged = [
        definition
        for definition in library
        if definition.get("category") != "Group story"
    ] + definitions
    BASE.write_json(path, merged)
    return len(merged)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--as-of",
        default=datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
    )
    parser.add_argument("--workspace", type=Path, default=ROOT / ".cache/ba-jp-assets")
    parser.add_argument(
        "--source-cache", type=Path, default=ROOT / ".cache/ba-group-source"
    )
    parser.add_argument(
        "--public-root", type=Path, default=ROOT / "public/private/ba-jp"
    )
    parser.add_argument(
        "--library",
        type=Path,
        default=ROOT / "scripts/ba-library.json",
    )
    parser.add_argument("--merge-library", action="store_true")
    args = parser.parse_args()
    cache = args.source_cache.resolve()
    schema_file = ROOT / "scripts/ba-jp-schema-1.73.json"
    schema = json.loads(schema_file.read_text(encoding="utf8"))
    types = BASE.load_schema(schema)
    catalog = json.loads(
        (ROOT / ".cache/ba-jp-catalog.json").read_text(encoding="utf8")
    )
    if catalog["version"] != schema["gameVersion"]:
        raise ValueError(
            "Group-story catalog does not match the committed schema version"
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
    raw = MAIN.verified_asset(
        next(item for item in catalog["assets"] if item["path"] == "Table/ExcelDB.db"),
        raw_path,
    )
    database_hash = hashlib.sha256(raw).hexdigest()
    if database_hash != schema["databaseSha256"]:
        raise ValueError("Group-story database hash does not match the committed schema")
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

    for name in [
        "ScenarioModeDBSchema",
        "ScenarioBGNameDBSchema",
        "ScenarioBGEffectDBSchema",
        "ScenarioTransitionDBSchema",
        "BGMDBSchema",
        "ScenarioCharacterNameDBSchema",
    ]:
        BASE.write_json(
            cache / "official" / f"{name}.json", [{"Bytes": row} for row in table(name)]
        )

    localize = {row["Key"]: row["Jp"] for row in table("LocalizeDBSchema")}
    all_modes = table("ScenarioModeDBSchema")
    all_club_subtype_modes = [
        row for row in all_modes if row["SubType"] == "Club"
    ]
    modes = sorted(
        (row for row in all_modes if eligible(row)),
        key=lambda row: (
            row["VolumeId"],
            row["ChapterId"],
            row["EpisodeId"],
            row["ModeId"],
        ),
    )
    clubs = volume_club(modes)
    characters = {"DataList": table("ScenarioCharacterNameDBSchema")}
    BASE.write_json(cache / "characters.json", characters)
    definitions, collections_meta, seen = [], {}, {}
    coverage = {
        "asOf": args.as_of,
        "gameVersion": catalog["version"],
        "allScenarioModes": len(all_modes),
        "allClubSubTypeModes": len(all_club_subtype_modes),
        "eligibleModes": len(modes),
        "excludedModes": [
            row
            for row in all_club_subtype_modes
            if not eligible(row)
        ],
        "emptyGroups": [],
        "missingLabels": [],
        "unresolvedVoices": [],
        "volumeClubConflicts": [],
        "rows": 0,
        "japaneseRows": 0,
        "selectionGroups": 0,
        "commands": collections.Counter(),
        "actorCommands": collections.Counter(),
        "bgEffects": collections.Counter(),
        "transitions": collections.Counter(),
        "popups": collections.Counter(),
        "videos": collections.Counter(),
        "voices": collections.Counter(),
        "groups": [],
        "modes": [],
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
        collection_id = f"ba-jp-group-v{mode['VolumeId']}"
        collection = collections_meta.setdefault(
            collection_id,
            {
                "collectionId": collection_id,
                "story": labels["Volume"],
                "modeType": mode["ModeType"],
                "subType": mode["SubType"],
                "volume": mode["VolumeId"],
                "chapter": mode["ChapterId"],
                "club": clubs[mode["VolumeId"]],
                "labels": label_evidence,
                "groups": [],
                "modes": [],
            },
        )
        collection["modes"].append(mode["ModeId"])
        groups = MAIN.ordered_groups(mode)
        for group_index, (phase, group) in enumerate(groups, 1):
            reference = {
                "modeId": mode["ModeId"],
                "episode": mode["EpisodeId"],
                "phase": phase,
                "groupIndex": group_index,
            }
            if group in seen:
                seen[group]["modeReferences"].append(reference)
                raise ValueError(
                    f"Club group scenario {group} is shared by multiple eligible modes"
                )
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
                    coverage["voices"][row["VoiceId"]] += 1
                    coverage["unresolvedVoices"].append(
                        {"group": group, "row": index, "id": row["VoiceId"]}
                    )
                if row["SelectionGroup"]:
                    coverage["selectionGroups"] += 1
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
                    if parts[0] in {"#video", "#videons2"} and len(parts) > 1:
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
            BASE.write_json(cache / f"{group}.json", source)
            BASE.write_json(args.public_root / str(group) / "source.json", source)
            BASE.write_json(
                args.public_root / str(group) / "characters.json", characters
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
                "story": labels["Volume"],
                "title": labels["Episode"],
                "collectionId": collection_id,
                "category": "Group story",
                "order": len(collection["groups"]),
                "date": mode["ExposedTime"][:10],
                "groupStory": {
                    "club": mode["NeedClub"]
                    if mode["NeedClub"] not in {"", "None_"}
                    else clubs[mode["VolumeId"]]["club"],
                    "clubStudentCount": clubs[mode["VolumeId"]][
                        "clubStudentCount"
                    ],
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
        coverage["modes"].append(
            {
                "modeId": mode["ModeId"],
                "volume": mode["VolumeId"],
                "chapter": mode["ChapterId"],
                "episode": mode["EpisodeId"],
                "group": mode["FrontScenarioGroupId"][0],
                "club": clubs[mode["VolumeId"]]["club"],
                "date": mode["ExposedTime"][:10],
            }
        )
        print(
            mode["ModeId"],
            labels["Volume"],
            labels["Episode"],
            [group for _, group in groups],
            flush=True,
        )
    coverage["latestExposedTime"] = max(
        (row["ExposedTime"] for row in modes), default=""
    )
    coverage["futureClubModes"] = sum(
        bool(row["ExposedTime"]) and row["ExposedTime"][:10] > args.as_of
        for row in modes
    )
    coverage["uniqueGroups"] = len(seen)
    coverage["exportedGroups"] = len(definitions)
    coverage["collections"] = len(collections_meta)
    coverage["clubs"] = sorted(
        {value["club"] for value in clubs.values()}
    )
    BASE.write_json(cache / "definitions.json", definitions)
    BASE.write_json(cache / "collections.json", list(collections_meta.values()))
    BASE.write_json(cache / "coverage.json", coverage)
    BASE.write_json(
        cache / "provenance.json",
        {
            "source": "Official JP Club group-story game tables",
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
                "ScenarioBGNameDBSchema",
                "ScenarioBGEffectDBSchema",
                "ScenarioTransitionDBSchema",
                "BGMDBSchema",
            ],
            "schemaFile": "scripts/ba-jp-schema-1.73.json",
            "schemaSha256": hashlib.sha256(schema_file.read_bytes()).hexdigest(),
            "localizationTemplates": "Sub_Volume_Title_{volume}; Sub_Chapter_Title_{volume}_{chapter}; Sub_Episode_Title_{volume}_{chapter}_{episode}; xxhash32 seed0 joins LocalizeDBSchema",
            "asOf": args.as_of,
            "exportedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        },
    )
    merged = None
    if args.merge_library:
        merged = merge_library(args.library, definitions)
    print(
        "EXPORTED",
        len(definitions),
        "GROUPS",
        len(seen),
        "MODES",
        len(modes),
        "COLLECTIONS",
        len(collections_meta),
        "ROWS",
        coverage["rows"],
        "LABELGAPS",
        len(coverage["missingLabels"]),
        "LIBRARY",
        merged if merged is not None else "unchanged",
        flush=True,
    )
    if (
        coverage["emptyGroups"]
        or coverage["missingLabels"]
        or coverage["unresolvedVoices"]
    ):
        raise ValueError(
            "Group-story source export has gaps; inspect coverage.json before publishing"
        )


if __name__ == "__main__":
    main()
