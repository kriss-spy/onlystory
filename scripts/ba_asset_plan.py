"""Resolve exact source references to bounded official JP catalog resources."""

import hashlib
import json
import re
import zipfile
from functools import lru_cache
from pathlib import Path

import xxhash

ROOT = Path(__file__).resolve().parents[1]

SPINE_BACKGROUND_VARIANTS = {
    "SC12000_01_01": {
        "model": "SC12000_01",
        "bundle": "Bundle/FullPatch_154.zip",
        "member": "uis-03_scenario-01_background-_mxload-prefabs-2025-07-02_assets_all_41556152.bundle",
        "skeletonDataPathId": 1130997566082866841,
    },
    "SC12000_01_02": {
        "model": "SC12000_01",
        "bundle": "Bundle/FullPatch_153.zip",
        "member": "uis-03_scenario-01_background-_mxload-prefabs-2025-07-02_assets_all_238738019.bundle",
        "skeletonDataPathId": 1130997566082866841,
    },
}


@lru_cache(maxsize=None)
def source_gaps(group):
    path = ROOT / "src/playback/ba/source-gaps.json"
    return (
        [
            g
            for g in json.loads(path.read_text(encoding="utf8"))
            if g["group"] == int(group)
        ]
        if path.exists()
        else []
    )


def missing_background(group, rows, ident):
    positions = [i for i, row in enumerate(rows) if row.get("BGName") == ident]
    declared = {
        (g["row"], g["value"]) for g in source_gaps(group) if g["field"] == "BGName"
    }
    return bool(positions) and all((i, ident) in declared for i in positions)


def needs_native_actor_fx(rows):
    return any(
        re.match(r"^#[1-5];fx;nkultra(?:break)?(?:;|$)", line, re.IGNORECASE)
        for row in rows
        for line in row.get("ScriptKr", "").splitlines()
    )


def character_gap(group, rows, name):
    positions = [
        index
        for index, row in enumerate(rows)
        for line in row.get("ScriptKr", "").splitlines()
        if re.match(r"^[1-5];", line) and line.split(";")[1] == name
    ]
    declared = {
        (gap["row"], gap["value"])
        for gap in source_gaps(group)
        if gap["field"] == "Character"
    }
    return bool(positions) and all((index, name) in declared for index in positions)


def timeline_members(catalog, rows):
    paths = {
        line.split(";")[1]
        for row in rows
        for line in row.get("ScriptKr", "").splitlines()
        if re.match(r"^#timelineNS;", line, re.I)
    }
    result = {}
    for path in paths:
        stem = path.rsplit("/", 1)[-1].lower()
        members = [
            (asset, member)
            for asset in catalog["assets"]
            for member in asset.get("member_paths", [])
            if f"-{stem}-" in member.lower()
        ]
        if not members:
            raise ValueError(f"Missing native timeline catalog members: {path}")
        result[path] = members
    return result


def check_shared_assets(destination, url_prefix, files):
    """Reject semantic-path collisions before publishing any staged chapter files."""
    for item in files:
        target = destination / item["url"].removeprefix(url_prefix)
        if (
            target.exists()
            and hashlib.sha256(target.read_bytes()).hexdigest() != item["sha256"]
        ):
            raise ValueError(
                f"Shared asset collision: {target}; use a versioned or distinct media path"
            )


@lru_cache(maxsize=None)
def load_table(name):
    for directory in [
        ".cache/ba-main-source/official",
        ".cache/ba-event-source/official",
        ".cache/ba-group-source/official",
    ]:
        official = ROOT / directory / (name.replace("ExcelTable", "DBSchema") + ".json")
        if official.exists():
            return [
                r.get("Bytes", r)
                for r in json.loads(official.read_text(encoding="utf8"))
            ]
    return json.loads(
        (ROOT / ".cache/ba-reference" / (name + ".json")).read_text(encoding="utf8")
    )["DataList"]


_CHARACTER_TABLES = {}


def read_story(group):
    folder = ROOT / "public/private/ba-jp" / str(group)
    source = json.loads((folder / "source.json").read_text(encoding="utf8"))
    corrections_path = ROOT / "src/playback/ba/source-corrections.json"
    if corrections_path.exists():
        for correction in json.loads(corrections_path.read_text(encoding="utf8")):
            if correction["group"] != int(group):
                continue
            row = source["content"][correction["row"]]
            if correction["from"] not in row["ScriptKr"]:
                raise ValueError(
                    f"Authored source correction no longer matches group {group} row {correction['row']}"
                )
            row["ScriptKr"] = row["ScriptKr"].replace(
                correction["from"], correction["to"]
            )
    data = (folder / "characters.json").read_bytes()
    digest = hashlib.sha256(data).digest()
    if digest not in _CHARACTER_TABLES:
        _CHARACTER_TABLES[digest] = json.loads(data)["DataList"]
    return source["content"], _CHARACTER_TABLES[digest]


def resolve_media(assets, relative, group):
    # The catalog splits bootstrap/prologue resources from the full game data.
    prefixes = (
        ["Media/Prologue/", "Media/GameData/"]
        if str(group) == "11000"
        else ["Media/GameData/", "Media/Prologue/"]
    )
    for prefix in prefixes:
        if prefix + relative in assets:
            return assets[prefix + relative]
    folded = {key.lower(): value for key, value in assets.items()}
    for prefix in prefixes:
        if (prefix + relative).lower() in folded:
            return folded[(prefix + relative).lower()]
    raise ValueError(f"Missing catalog media: {relative}")


CHARACTER_VARIANTS = {
    "saori_mask": {
        "model": "saori_spr",
        "skin": "Mask_01",
        "member": "uis-03_scenario-02_character-_mxload-prefabs-2025-07-02_assets_all_3478852753.bundle",
        "skeletonDataPathId": -4195861766549748775,
    },
    "atsuko_mask": {
        "model": "atsuko_spr",
        "skin": "Mask_01",
        "member": "uis-03_scenario-02_character-_mxload-prefabs-2025-07-02_assets_all_2361551157.bundle",
        "skeletonDataPathId": 6065107889458805346,
    },
    "ch0144_mask": {
        "model": "CH0144_spr",
        "skin": "Mask_01",
        "member": "uis-03_scenario-02_character-_mxload-prefabs-2025-07-02_assets_all_1915279382.bundle",
        "skeletonDataPathId": 2484367421006352313,
    },
    "ch0212_mask": {
        "model": "CH0212_spr",
        "skin": "Mask_01",
        "member": "uis-03_scenario-02_character-_mxload-prefabs-2025-07-02_assets_all_1061242807.bundle",
        "skeletonDataPathId": -3074950749436409167,
    },
}


def character_variant(character):
    prefab = Path(character["SpinePrefabName"]).name.removeprefix("CharacterSpine_")
    return CHARACTER_VARIANTS.get(prefab.lower())


def character_model(character):
    if not character["SpinePrefabName"]:
        return None
    prefab = Path(character["SpinePrefabName"]).name.removeprefix("CharacterSpine_")
    variant = character_variant(character)
    if variant:
        return variant["model"]
    # ND is a scenario prefab variant; the catalog stores its base Spine data.
    prefab = re.sub(r"ND$", "", prefab)
    return prefab if prefab.lower().endswith("spr") else prefab + "_spr"


def model_names(rows, characters, group=None):
    names = {
        line.split(";")[1]
        for r in rows
        for line in r.get("ScriptKr", "").splitlines()
        if re.match(r"^[1-5];", line)
    }
    by_hash = {c["CharacterName"]: c for c in characters}
    result = {}
    for name in sorted(names):
        c = by_hash.get(xxhash.xxh32(name.encode("utf8")).intdigest())
        if c is None:
            if group and character_gap(group, rows, name):
                continue
            raise ValueError(f"Missing character row for {name}")
        model = character_model(c)
        if model:
            result[model] = (name, c)
    return result


def bundle_rank(asset, member):
    dates = re.findall(r"\d{4}-\d{2}-\d{2}", member)
    patch = re.search(r"UpdatePatch_v(\d+)", asset["path"])
    return (
        "_Prologue_" not in asset["path"],
        max(dates, default=""),
        int(patch[1]) + 1 if patch else 0,
        asset["path"],
        member,
    )


_BUNDLE_INDEXES = {}


def bundle_members(catalog, models):
    cache_key = id(catalog)
    if cache_key not in _BUNDLE_INDEXES:
        index = {}
        for asset in catalog["assets"]:
            if asset["asset_type"] != "bundle":
                continue
            for member in asset.get("member_paths", []):
                match = re.search(
                    r"spinecharacters-(.*?)-_mx", member, re.I
                ) or re.search(r"-([^-]+_spr)-", member, re.I)
                if not match:
                    continue
                entry = index.setdefault(
                    match[1].lower(), {"combined": [], "roles": {}}
                )
                if "_mxprolog-" in member:
                    entry["combined"].append((asset, member))
                else:
                    for role in ["textassets", "textures"]:
                        if "-" + role + "-" in member:
                            previous = entry["roles"].get(role)
                            if previous is None or bundle_rank(
                                asset, member
                            ) > bundle_rank(*previous):
                                entry["roles"][role] = (asset, member)
        _BUNDLE_INDEXES[cache_key] = (catalog, index)
    index = _BUNDLE_INDEXES[cache_key][1]
    result = []
    missing = []
    for model in models:
        entry = index.get(model.lower(), {"combined": [], "roles": {}})
        for role in ["textassets", "textures"]:
            if role in entry["roles"]:
                result.append(entry["roles"][role])
            elif not entry["combined"]:
                missing.append((model, role))
        if not all(role in entry["roles"] for role in ["textassets", "textures"]):
            result.extend(entry["combined"])
    if missing:
        raise ValueError(f"Missing model catalog members: {missing}")
    return sorted(result, key=lambda pair: bundle_rank(*pair))


def resolve_video(assets, identifier, group):
    try:
        metadata = next(
            (r for r in load_table("VideoExcelTable") if str(r["Id"]) == identifier),
            None,
        )
    except FileNotFoundError:
        metadata = None
    if metadata:
        movie = resolve_media(assets, metadata["VideoPath"][0] + ".mp4", group)
        sound = (
            resolve_media(assets, metadata["SoundPath"][0] + ".ogg", group)
            if metadata.get("SoundPath") and metadata["SoundPath"][0]
            else None
        )
        return movie, sound
    relatives = [
        "Scenario/Event/" + identifier + "_Title_Video.mp4",
        "Scenario/Main/" + identifier + "_Video.mp4",
        "Scenario/Event/" + identifier + "_Video.mp4",
    ]
    for relative in relatives:
        try:
            movie = resolve_media(assets, relative, group)
            sound_path = relative.removesuffix("_Video.mp4") + "_Sound.ogg"
            try:
                sound = resolve_media(assets, sound_path, group)
            except ValueError:
                sound = None
            return movie, sound
        except ValueError:
            pass
    raise ValueError(f"Missing catalog video: {identifier}")


@lru_cache(maxsize=None)
def _voice_archive_members(path, size, mtime):
    with zipfile.ZipFile(path) as archive:
        return archive.namelist()


def resolve_voice(assets, voice, group):
    direct = [
        a
        for a in assets.values()
        if a["asset_type"] == "media"
        and a["path"].lower().endswith("/" + voice.lower() + ".ogg")
    ]
    if direct:
        preferred = "Media/Prologue/" if str(group) == "11000" else "Media/GameData/"
        asset = next((a for a in direct if a["path"].startswith(preferred)), direct[0])
        return [(asset, None)]
    parts = [
        a
        for a in assets.values()
        if a["asset_type"] == "media"
        and re.search("/" + re.escape(voice) + r"_\d+\.ogg$", a["path"], re.I)
    ]
    if parts:
        return [(a, None) for a in sorted(parts, key=lambda a: a["path"])]
    archive_asset = assets.get("Media/GameData/Audio/VOC_JP/JP_Main.zip")
    if archive_asset:
        path = (
            ROOT
            / ".cache/ba-jp-assets/jp/android/raw/media/GameData/Audio/VOC_JP/JP_Main.zip"
        )
        if path.exists():
            stat = path.stat()
            matches = [
                m
                for m in _voice_archive_members(
                    str(path), stat.st_size, stat.st_mtime_ns
                )
                if Path(m).stem.lower() == voice.lower()
                or re.fullmatch(re.escape(voice) + r"_\d+", Path(m).stem, re.I)
            ]
            if matches:
                return [(archive_asset, m) for m in sorted(matches)]
    raise ValueError(f"Missing voice catalog entry: {voice}")


def plan(catalog, group):
    rows, chars = read_story(group)
    assets = {a["path"]: a for a in catalog["assets"]}
    selected = {}

    def add(a):
        selected[a["path"]] = a

    bgs = {b["Name"]: b for b in load_table("ScenarioBGNameExcelTable")}
    music = {b["Id"]: b for b in load_table("BGMExcelTable")}
    for ident in {r.get("BGName") for r in rows} - {None, 0}:
        if ident not in bgs and missing_background(group, rows, ident):
            continue
        if bgs[ident].get("BGType") == "Spine":
            add(assets["Bundle/FullPatch_088.zip"])
            variant = SPINE_BACKGROUND_VARIANTS.get(
                Path(bgs[ident]["BGFileName"]).name.removeprefix("SpineBG_")
            )
            if variant:
                add(assets[variant["bundle"]])
        else:
            add(resolve_media(assets, bgs[ident]["BGFileName"] + ".jpg", group))
    for ident in {r.get("BGMId") for r in rows} - {None, 0, 999}:
        add(resolve_media(assets, music[ident]["Path"][0] + ".ogg", group))
    for voice in {r.get("VoiceJp") for r in rows} - {None, ""}:
        for asset, _ in resolve_voice(assets, voice, group):
            add(asset)
    for popup in {r.get("PopupFileName") for r in rows} - {None, ""}:
        add(
            resolve_media(
                assets, "UIs/03_Scenario/04_ScenarioImage/" + popup + ".png", group
            )
        )
    for video in {
        line.split(";")[1]
        for r in rows
        for line in r.get("ScriptKr", "").splitlines()
        if re.match(r"^#video(?:ns2)?;", line, re.I)
    }:
        movie, sound = resolve_video(assets, video, group)
        add(movie)
        if sound:
            add(sound)
    members = bundle_members(catalog, model_names(rows, chars, group))
    for native in timeline_members(catalog, rows).values():
        for asset, _ in native:
            add(asset)
    if needs_native_actor_fx(rows):
        for path in ["Bundle/FullPatch_051.zip", "Bundle/FullPatch_125.zip"]:
            add(assets[path])
    if any(
        character_variant(c)
        for _, c in model_names(rows, chars, group).values()
    ):
        add(assets["Bundle/FullPatch_154.zip"])
    for a, _ in members:
        add(a)
    # Common SFX, emoji atlas and shader textures are in the already-tested bootstrap packs.
    for a in catalog["assets"]:
        if a["path"] in [
            "Bundle/FullPatch_Prologue_000.zip",
            "Bundle/FullPatch_Prologue_001.zip",
        ]:
            add(a)
    if str(group) != "11000" and any(r.get("Sound") for r in rows):
        add(assets["Bundle/FullPatch_115.zip"])
    return sorted(selected.values(), key=lambda a: a["path"]), members
