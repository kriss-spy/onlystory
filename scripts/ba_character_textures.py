"""Use verified full-resolution Windows textures with identical JP story atlases.

Run after Android media acquisition. Publication reimports installed chapters so
new scene revisions bypass old offline downloads. Skeletons and animations stay intact.
"""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import time
import urllib.request
import zipfile
import zlib
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path

import UnityPy
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / "scripts/ba-character-textures.json").read_text())
CACHE = ROOT / ".cache/ba-character-textures" / CONFIG["gameVersion"]
MEDIA = ROOT / "public/private/ba-jp/shared/media"


def sha(data):
    return hashlib.sha256(data).hexdigest()


@lru_cache(maxsize=4096)
def _file_sha(path, modified, size):
    return sha(path.read_bytes())


def file_sha(path):
    stat = path.stat()
    return _file_sha(path, stat.st_mtime_ns, stat.st_size)


def write_json(path, value):
    partial = path.with_suffix(path.suffix + ".partial")
    compact = "public" in path.parts or "generated" in path.parts
    partial.write_text(
        json.dumps(
            value,
            ensure_ascii=False,
            indent=None if compact else 2,
            separators=(",", ":") if compact else None,
        )
        + "\n",
        encoding="utf8",
    )
    for attempt in range(10):
        try:
            partial.replace(path)
            return
        except PermissionError:
            if attempt == 9:
                raise
            time.sleep(0.1 * (attempt + 1))


def fetch_verified(url, target, size=None, crc=None, digest=None):
    def valid(data):
        return (
            (size is None or len(data) == size)
            and (crc is None or zlib.crc32(data) == crc)
            and (digest is None or sha(data) == digest)
        )

    if target.exists() and valid(target.read_bytes()):
        return target.read_bytes()
    with urllib.request.urlopen(url, timeout=90) as response:
        data = response.read()
    if not valid(data):
        raise ValueError(f"Official character asset integrity mismatch: {url}")
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(target.suffix + ".partial")
    partial.write_bytes(data)
    partial.replace(target)
    return data


@lru_cache(maxsize=1)
def texture_index():
    path = CACHE / "index.json"
    return json.loads(path.read_text(encoding="utf8")) if path.exists() else {}


def install_character_textures(media_root, prefix, manifest):
    if manifest.get("gameVersion") != CONFIG["gameVersion"]:
        return False
    index = texture_index()
    changed = False
    replacements = {}
    additions = {}
    for character in manifest["characters"].values():
        upgrade = index.get(character["model"].lower())
        if not upgrade:
            continue
        atlas = media_root / character["atlas"].removeprefix(prefix)
        if file_sha(atlas) != upgrade["atlasSha256"]:
            raise ValueError(f"High-resolution atlas mismatch: {character['model']}")
        pages = []
        for old in character["pages"]:
            filename = old.rsplit("/", 1)[-1]
            item = upgrade["pages"].get(filename)
            if not item:
                raise ValueError(f"High-resolution page missing: {old}")
            source = CACHE / item["path"]
            if file_sha(source) != item["sha256"]:
                raise ValueError(f"High-resolution export integrity mismatch: {source}")
            relative = f"characters-hd/{upgrade['model']}/{filename}"
            target = media_root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                partial = target.with_suffix(".png.partial")
                shutil.copyfile(source, partial)
                partial.replace(target)
            elif file_sha(target) != item["sha256"]:
                raise ValueError(f"High-resolution publication collision: {target}")
            url = prefix + relative
            pages.append(url)
            replacements[old] = url
            additions[url] = {
                "url": url,
                "bytes": source.stat().st_size,
                "sha256": item["sha256"],
            }
        if character["pages"] != pages:
            changed = True
        character["pages"] = pages
        character["textureSource"] = upgrade["source"]
    if replacements:
        files = {f["url"]: f for f in manifest["files"] if f["url"] not in replacements}
        files.update(additions)
        manifest["files"] = list(files.values())
    return changed


def prepare():
    CACHE.mkdir(parents=True, exist_ok=True)
    android = json.loads((ROOT / ".cache/ba-jp-catalog.json").read_text())
    if android["version"] != CONFIG["gameVersion"]:
        raise ValueError(
            "Character texture catalog must match the story library version"
        )
    raw = fetch_verified(
        CONFIG["catalogUrl"], CACHE / "packing.json", digest=CONFIG["catalogSha256"]
    )
    packing = json.loads(raw)
    models = {p.name.lower(): p for p in (MEDIA / "characters").iterdir() if p.is_dir()}
    selected = {}
    for pack in packing["FullPatchPacks"] + packing["UpdatePacks"]:
        for member in pack["BundleFiles"]:
            match = re.search(
                r"spinecharacters-(.*?)-_mxdependency-(textassets|textures)-",
                member["Name"],
                re.I,
            )
            if match and match[1].lower() in models:
                selected.setdefault(pack["PackName"], {"pack": pack, "members": []})[
                    "members"
                ].append(member)

    def extract(selection):
        pack = selection["pack"]
        path = CACHE / "packs" / pack["PackName"]
        fetch_verified(
            CONFIG["catalogUrl"].rsplit("/", 1)[0] + "/" + pack["PackName"],
            path,
            size=pack["PackSize"],
            crc=pack["Crc"],
        )
        result = {}
        with zipfile.ZipFile(path) as archive:
            for member in selection["members"]:
                model = re.search(
                    r"spinecharacters-(.*?)-_mxdependency-", member["Name"], re.I
                )[1].lower()
                data = archive.read(member["Name"])
                # Unity bundle CRC is Unity's unpacked-bundle checksum, not ZIP CRC.
                entry = result.setdefault(
                    model, {"atlases": {}, "textures": {}, "members": []}
                )
                entry["members"].append(member["Name"])
                for obj in UnityPy.load(data).objects:
                    if obj.type.name == "TextAsset":
                        text = obj.read()
                        if text.m_Name.lower().endswith(".atlas"):
                            payload = text.m_Script
                            if isinstance(payload, str):
                                payload = payload.encode("utf8", "surrogateescape")
                            entry["atlases"][text.m_Name.lower()] = payload
                    elif obj.type.name == "Texture2D":
                        texture = obj.read()
                        entry["textures"][(texture.m_Name + ".png").lower()] = texture
        upgrades = {}
        for model, entry in result.items():
            folder = models[model]
            atlas_path = next(folder.glob("*.atlas"))
            atlas = atlas_path.read_bytes()
            if entry["atlases"].get(atlas_path.name.lower()) != atlas:
                continue
            page_names = re.findall(r"^([^\s].*\.png)\s*$", atlas.decode(), re.M)
            pages = {}
            larger = False
            for name in page_names:
                texture = entry["textures"].get(name.lower())
                if texture is None:
                    break
                with Image.open(folder / name) as old:
                    width, height = old.size
                if texture.m_Width < width or texture.m_Height < height:
                    break
                if texture.m_Width * height != texture.m_Height * width:
                    break
                larger |= texture.m_Width > width or texture.m_Height > height
                export = CACHE / "exports" / folder.name / name
                export.parent.mkdir(parents=True, exist_ok=True)
                texture.image.save(export)
                pages[name] = {
                    "path": export.relative_to(CACHE).as_posix(),
                    "sha256": sha(export.read_bytes()),
                    "width": texture.m_Width,
                    "height": texture.m_Height,
                    "previousWidth": width,
                    "previousHeight": height,
                }
            else:
                if larger:
                    upgrades[model] = {
                        "model": folder.name,
                        "atlasSha256": sha(atlas),
                        "pages": pages,
                        "source": {
                            "platform": "Windows",
                            "gameVersion": CONFIG["gameVersion"],
                            "catalogUrl": CONFIG["catalogUrl"],
                            "catalogSha256": CONFIG["catalogSha256"],
                            "pack": pack["PackName"],
                            "packCrc": pack["Crc"],
                            "members": entry["members"],
                        },
                    }
        print(
            f"Checked {pack['PackName']}: {len(upgrades)} larger matching models",
            flush=True,
        )
        return upgrades

    index = {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        for upgrades in pool.map(extract, selected.values()):
            index.update(upgrades)
    write_json(CACHE / "index.json", index)
    texture_index.cache_clear()
    print(
        f"{len(index)} character models have verified higher-resolution textures",
        flush=True,
    )


def apply():
    changed = 0
    inventories = {}
    groups = []
    for path in (ROOT / "public/private/ba-jp").glob("*/assets.json"):
        groups.append(path.parent.name)
        manifest = json.loads(path.read_text(encoding="utf8"))
        pages = [
            url for c in manifest["characters"].values() for url in c.get("pages", [])
        ]
        if not pages:
            continue
        prefix = pages[0].split("/media/", 1)[0] + "/media/"
        updated = install_character_textures(
            ROOT / "public" / prefix.lstrip("/"), prefix, manifest
        )
        if updated:
            write_json(path, manifest)
            changed += 1
        inventories["ba-jp-" + path.parent.name] = manifest["files"]
        scene_path = path.with_name("scenes.json")
        if scene_path.exists():
            program = json.loads(scene_path.read_text(encoding="utf8"))
            if program.get("assets") != manifest:
                program["assets"] = manifest
                write_json(scene_path, program)
    generated = ROOT / "src/generated/ba-stories.json"
    if generated.exists() and inventories:
        episodes = json.loads(generated.read_text(encoding="utf8"))
        for episode in episodes:
            files = inventories.get(episode["id"])
            if files is not None:
                episode["assets"] = [
                    url for url in episode["assets"] if "/media/" not in url
                ] + [f["url"] for f in files]
        write_json(generated, episodes)
    print(f"Updated character art in {changed} chapters", flush=True)
    return groups


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--apply-only",
        action="store_true",
        help="Resume publication from the verified export index",
    )
    args = parser.parse_args()
    if not args.apply_only:
        prepare()
    if args.apply or args.apply_only:
        groups = apply()
        if groups:
            # The canonical importer hashes scene contents into their URLs. Refresh
            # every installed chapter, including upgrades outside a selected acquire.
            subprocess.run(
                ["node", "scripts/import-ba.mjs", "--groups=" + ",".join(groups)],
                cwd=ROOT,
                check=True,
            )
