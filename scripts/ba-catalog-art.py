"""Export original JP event banners, lobby backgrounds and school emblems.

Banner/logo and lobby-background textures live in date-stamped incremental
Unity bundles inside a handful of verified game packs. The script discovers
every such member from the official catalog, buffers them per family, and
exports the art for each imported event collection together with the school
emblems used by the catalog.

Run: uv run --project .cache/ba-downloader --extra unitypy python -X utf8 scripts/ba-catalog-art.py
"""

import argparse
import concurrent.futures
import hashlib
import io
import json
import re
import urllib.request
import zipfile
import zlib
from pathlib import Path

import UnityPy
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / ".cache/ba-jp-catalog.json"
SEASON_TABLE = (
    ROOT / ".cache/ba-event-source/official/EventContentSeasonDBSchema.json"
)
LIBRARY = ROOT / "scripts/ba-library.json"
COVER_ART = ROOT / "src/cover-art.json"
OUT = ROOT / "public/private/ba-jp/catalog"
URL = "/private/ba-jp/catalog/"
BUNDLE_DIR = ROOT / ".cache/ba-jp-assets/jp/android/raw/bundles"
# Asset families that hold the catalog art, keyed by a stable member-name token.
FAMILIES = {
    "covers": "27_eventcontent-enter_parcel-",
    "backgrounds": "27_eventcontent-main_bgimage-",
    "marks": "11_schoolicon-",
}
SCHOOL_EXCLUDED = {"etc", "error", "tokiwadai", "sakugawa"}


def read_json(path):
    return json.loads(path.read_text(encoding="utf8"))


def get_pack(asset):
    target = BUNDLE_DIR / Path(asset["path"]).name

    def valid(data):
        return len(data) == asset["size"] and zlib.crc32(data) == int(
            asset["checksum"]["value"]
        )

    if not target.exists() or not valid(target.read_bytes()):
        target.parent.mkdir(parents=True, exist_ok=True)
        partial = target.with_suffix(".zip.catalog-partial")
        with (
            urllib.request.urlopen(asset["url"], timeout=120) as response,
            partial.open("wb") as output,
        ):
            while chunk := response.read(8192):
                output.write(chunk)
        if not valid(partial.read_bytes()):
            raise ValueError(f"Official catalog integrity mismatch: {asset['path']}")
        partial.replace(target)
    print("Verified official pack", asset["path"], target.stat().st_size, flush=True)
    return asset, target


def input_info(asset, path):
    return {
        "path": asset["path"],
        "url": asset["url"],
        "bytes": path.stat().st_size,
        "crc32": asset["checksum"]["value"],
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def export_texture(texture, logical_name, asset, member, info, source_path):
    image = texture.image.convert("RGBA")
    output = io.BytesIO()
    image.save(output, format="PNG")
    payload = output.getvalue()
    digest = hashlib.sha256(payload).hexdigest()
    filename = logical_name + "." + digest[:12] + ".png"
    target = OUT / filename
    if target.exists() and target.read_bytes() != payload:
        raise ValueError(f"Catalog art collision: {target}")
    if not target.exists():
        partial = target.with_suffix(".png.partial")
        partial.write_bytes(payload)
        partial.replace(target)
    return {
        "url": URL + filename,
        "position": "50% 50%",
        "width": image.width,
        "height": image.height,
        "bytes": len(payload),
        "sha256": digest,
        "source": asset["url"],
        "sourcePath": source_path,
        "bundle": asset["path"],
        "bundleSha256": info["sha256"],
        "member": member,
        "texture": texture.m_Name,
        "nativeAlpha": image.getchannel("A").getextrema()[0] < 255,
    }


def verify_output(art):
    total = 0
    for kind in ["covers", "backgrounds", "marks"]:
        for name, item in art.get(kind, {}).items():
            path = ROOT / "public" / item["url"].lstrip("/")
            payload = path.read_bytes()
            if (
                len(payload) != item["bytes"]
                or hashlib.sha256(payload).hexdigest() != item["sha256"]
            ):
                raise ValueError(
                    f"Exported catalog art integrity mismatch: {kind}/{name}"
                )
            with Image.open(path) as image:
                if image.size != (item["width"], item["height"]):
                    raise ValueError(
                        f"Exported catalog art dimensions mismatch: {kind}/{name}"
                    )
            total += 1
    print("Verified", total, "catalog images and dimensions", flush=True)


def discover_members(catalog):
    """Map each family token to its members across the official packs.

    The bundles are incremental snapshots, so every dated member is kept. A
    member carried by more than one pack prefers the umbrella ``FullPatch``
    download over a targeted update patch.
    """
    members = {family: {} for family in FAMILIES}
    for asset in catalog["assets"]:
        for member_path in asset.get("member_paths") or []:
            for family, token in FAMILIES.items():
                if token not in member_path:
                    continue
                match = re.search(r"(\d{4}-\d{2}-\d{2})", member_path)
                date = match.group(1) if match else "0000-00-00"
                current = members[family].get(member_path)
                if current is None or (
                    "FullPatch" in asset["path"] and "FullPatch" not in current[1]
                ):
                    members[family][member_path] = (date, asset["path"])
    return members


def resolve_event_art(season, event_ids):
    """Resolve each event's banner (title logo) and lobby background paths."""
    rows_by_event = {}
    for row in season:
        rows_by_event.setdefault(row["Bytes"]["EventContentId"], []).append(
            row["Bytes"]
        )

    def first_path(rows, key):
        stage = next(
            (row for row in rows if row.get("EventContentType") == "Stage"), None
        )
        display = next((row for row in rows if row.get("EventDisplay")), None)
        for row in (stage, display):
            if row and row.get(key):
                return row[key]
        return next((row[key] for row in rows if row.get(key)), "")

    resolved = {}
    for event in event_ids:
        rows = rows_by_event.get(event, [])
        resolved[event] = (
            first_path(rows, "MainBannerImagePath"),
            first_path(rows, "MainBgImagePath"),
        )
    return resolved


def merge_cover_art(result):
    artwork = read_json(COVER_ART)
    events = artwork.setdefault("events", {})
    for event, background in result["backgrounds"].items():
        events[f"ba:ba-jp-event-{event}"] = {
            **background,
            "logo": result["covers"][event],
        }
    COVER_ART.write_text(
        json.dumps(artwork, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
    print("Merged", len(result["covers"]), "event covers into", COVER_ART, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--inspect", action="store_true")
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    if args.verify_only:
        verify_output(read_json(OUT / "art.json"))
        return
    catalog = read_json(CATALOG)
    by_path = {asset["path"]: asset for asset in catalog["assets"]}
    members = discover_members(catalog)

    library = read_json(LIBRARY)
    event_ids = sorted(
        {
            int(definition["collectionId"].rsplit("-", 1)[-1])
            for definition in library
            if definition.get("category") == "Event"
        }
    )
    season = read_json(SEASON_TABLE)
    resolved = resolve_event_art(season, event_ids)
    wanted_covers = {
        (Path(banner).name + "_jp").lower(): event
        for event, (banner, _) in resolved.items()
        if banner
    }
    wanted_backgrounds = {}
    for event, (_, background) in resolved.items():
        if background:
            wanted_backgrounds.setdefault(
                Path(background).name.lower(), set()
            ).add(event)

    asset_paths = sorted(
        {
            asset_path
            for family in FAMILIES
            for _, asset_path in members[family].values()
        }
    )
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        packs = {
            asset["path"]: (asset, path)
            for asset, path in pool.map(
                get_pack, (by_path[path] for path in asset_paths)
            )
        }
    OUT.mkdir(parents=True, exist_ok=True)
    result = {
        "version": 1,
        "region": "JP",
        "gameVersion": catalog["version"],
        "covers": {},
        "backgrounds": {},
        "marks": {},
        "inputs": [],
    }
    result["metadata"] = {
        "path": SEASON_TABLE.relative_to(ROOT).as_posix(),
        "sha256": hashlib.sha256(SEASON_TABLE.read_bytes()).hexdigest(),
    }
    infos = {}
    for asset_path in asset_paths:
        asset, path = packs[asset_path]
        infos[asset_path] = input_info(asset, path)
        result["inputs"].append(infos[asset_path])

    def newest_first(family):
        return sorted(
            members[family].items(), key=lambda item: item[1][0], reverse=True
        )

    for member_path, (_, asset_path) in newest_first("covers"):
        asset, path = packs[asset_path]
        with zipfile.ZipFile(path) as archive:
            environment = UnityPy.load(archive.read(member_path))
            textures = [
                obj.read()
                for obj in environment.objects
                if obj.type.name == "Texture2D"
            ]
        if args.inspect:
            for texture in textures:
                print(
                    "covers",
                    member_path,
                    texture.m_Name,
                    texture.m_Width,
                    texture.m_Height,
                    flush=True,
                )
            continue
        for texture in textures:
            event = wanted_covers.get(texture.m_Name.lower())
            if event is None or str(event) in result["covers"]:
                continue
            banner = resolved[event][0]
            result["covers"][str(event)] = export_texture(
                texture,
                f"event-{event}",
                asset,
                member_path,
                infos[asset_path],
                banner,
            )
    for member_path, (_, asset_path) in newest_first("backgrounds"):
        asset, path = packs[asset_path]
        with zipfile.ZipFile(path) as archive:
            environment = UnityPy.load(archive.read(member_path))
            textures = [
                obj.read()
                for obj in environment.objects
                if obj.type.name == "Texture2D"
            ]
        if args.inspect:
            for texture in textures:
                print(
                    "backgrounds",
                    member_path,
                    texture.m_Name,
                    texture.m_Width,
                    texture.m_Height,
                    flush=True,
                )
            continue
        for texture in textures:
            events = wanted_backgrounds.get(texture.m_Name.lower())
            if not events:
                continue
            for event in sorted(events):
                if str(event) in result["backgrounds"]:
                    continue
                result["backgrounds"][str(event)] = export_texture(
                    texture,
                    f"event-background-{event}",
                    asset,
                    member_path,
                    infos[asset_path],
                    resolved[event][1],
                )
    for member_path, (_, asset_path) in newest_first("marks"):
        asset, path = packs[asset_path]
        with zipfile.ZipFile(path) as archive:
            environment = UnityPy.load(archive.read(member_path))
            textures = [
                obj.read()
                for obj in environment.objects
                if obj.type.name == "Texture2D"
            ]
        if args.inspect:
            for texture in textures:
                print(
                    "marks",
                    member_path,
                    texture.m_Name,
                    texture.m_Width,
                    texture.m_Height,
                    flush=True,
                )
            continue
        for texture in textures:
            name = texture.m_Name.lower()
            if not name.startswith("school_icon_"):
                continue
            school = name.removeprefix("school_icon_")
            if school in SCHOOL_EXCLUDED or school in result["marks"]:
                continue
            result["marks"][school] = export_texture(
                texture,
                "school-" + school,
                asset,
                member_path,
                infos[asset_path],
                "UIs/01_Common/11_SchoolIcon/" + texture.m_Name,
            )
    if args.inspect:
        return
    missing = [
        event
        for event in event_ids
        if str(event) not in result["covers"]
        or str(event) not in result["backgrounds"]
    ]
    if missing:
        raise ValueError(f"Missing original JP event art for: {missing}")
    if (
        not {"hyakkiyako", "redwinter", "trinity", "gehenna", "shanhaijing"}
        <= result["marks"].keys()
    ):
        raise ValueError("Missing imported-event school emblems")
    for kind in ["covers", "backgrounds", "marks"]:
        result[kind] = dict(sorted(result[kind].items()))
    verify_output(result)
    partial = OUT / "art.json.partial"
    partial.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
    partial.replace(OUT / "art.json")
    merge_cover_art(result)
    print(
        "Exported",
        len(result["covers"]),
        "original JP event banners,",
        len(result["backgrounds"]),
        "original event backgrounds and",
        len(result["marks"]),
        "original school emblems",
        flush=True,
    )


if __name__ == "__main__":
    main()
