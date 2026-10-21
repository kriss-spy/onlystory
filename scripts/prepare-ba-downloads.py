"""Maintainer selectors for offline BA imports; never embeds extracted media/text.

Run with .cache/ba-downloader/.venv/Scripts/python.exe, then run
node scripts/prepare-ba-downloads.mjs to verify JS texture decoding and publish.
"""

import hashlib
import json
from collections import defaultdict
from pathlib import Path
import zipfile
import zlib

import UnityPy
from PIL import Image
from ba_asset_plan import resolve_video, resolve_voice
from ba_downloader.infrastructure.schema.crypto import zip_password

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / ".cache/ba-all-downloads"
WORK.mkdir(exist_ok=True)


def read(path):
    return json.loads(Path(path).read_text(encoding="utf8"))


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(path, value):
    Path(path).write_text(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf8"
    )


def main():
    episodes = read(ROOT / "src/generated/ba-stories.json")
    catalog = read(ROOT / ".cache/ba-jp-catalog.json")
    catalog_assets = {a["path"]: a for a in catalog["assets"]}
    prologue = read(ROOT / "src/downloads/ba/recipe.json")
    inputs = []
    by_url = {}
    paths = []

    def add(source, local=None):
        if source["url"] in by_url:
            return by_url[source["url"]]
        source = dict(source)
        identifier = len(inputs)
        if local is None:
            if source.get("path", "").startswith("Bundle/"):
                local = (
                    ROOT
                    / ".cache/ba-jp-assets/jp/android/raw/bundles"
                    / Path(source["path"]).name
                )
            elif source.get("path", "").startswith("Media/"):
                local = (
                    ROOT
                    / ".cache/ba-jp-assets/jp/android/raw/media"
                    / source["path"][6:]
                )
        if local:
            local = Path(local)
            data = local.read_bytes()
            source["bytes"] = len(data)
            if source.get("sha256") and source["sha256"] != sha(data):
                raise ValueError(f"Original mismatch: {local}")
            if source.get("crc") is not None and zlib.crc32(data) != int(source["crc"]):
                raise ValueError(f"Original CRC mismatch: {local}")
            source["sha256"] = sha(data)
        source["id"] = identifier
        source["filename"] = (
            source.get("filename") or Path(source.get("path") or source["url"]).name
        )
        inputs.append(source)
        paths.append(str(local) if local else None)
        by_url[source["url"]] = identifier
        return identifier

    for source in prologue["inputs"]:
        add(source)
    manifests = {}
    unique = {}
    for episode in episodes:
        group = episode["id"].removeprefix("ba-jp-")
        manifest = read(ROOT / f"public/private/ba-jp/{group}/assets.json")
        manifests[group] = manifest
        for source in manifest["inputs"]:
            add(source)
        for f in manifest["files"]:
            if f["url"] in unique and unique[f["url"]] != f:
                raise ValueError(f"Output collision: {f['url']}")
            unique[f["url"]] = f
    hd_root = ROOT / ".cache/ba-character-textures/1.73.459696"
    for entry in read(hd_root / "index.json").values():
        src = entry["source"]
        url = src["catalogUrl"].rsplit("/", 1)[0] + "/" + src["pack"]
        add(
            {
                "url": url,
                "path": "WindowsBundle/" + src["pack"],
                "crc": str(src["packCrc"]),
            },
            hd_root / "packs" / src["pack"],
        )
    for reference in prologue["assets"]["referenceEffectArt"]:
        # Their IDs are already in the prologue registry.
        add(reference)
    db = manifests[next(g for g in manifests if g != "11000")]["tableSource"][
        "database"
    ]
    db_info = {
        "url": db["url"],
        "path": "Table/ExcelDB.db",
        "bytes": db["size"],
        "sha256": "0ceb1d1a0f118febb172c1a6e45d4cc7711b1fc4bb8718df035cf99a7825f159",
    }
    db_local = ROOT / ".cache/ba-jp-assets/jp/android/raw/table/ExcelDB.db"
    if not db_local.exists():
        db_local = next(ROOT.glob(".cache/**/ExcelDB.db"))
    db_id = add(db_info, db_local)
    # Resolve original local paths for the preexisting prologue IDs too.
    for source in inputs:
        if paths[source["id"]]:
            continue
        p = source.get("path", "")
        if p.startswith("Bundle/"):
            paths[source["id"]] = str(
                ROOT / ".cache/ba-jp-assets/jp/android/raw/bundles" / Path(p).name
            )
        elif p.startswith("Media/"):
            paths[source["id"]] = str(
                ROOT / ".cache/ba-jp-assets/jp/android/raw/media" / p[6:]
            )
    outputs = {}
    by_hash = defaultdict(list)
    for source in inputs:
        by_hash[source.get("sha256")].append(source["id"])
    for url, f in unique.items():
        if f["sha256"] in by_hash:
            outputs[url] = dict(f, kind="copy", input=by_hash[f["sha256"]][0])
        elif url.endswith("Spine-LICENSE.txt"):
            outputs[url] = dict(f, kind="license")
    # Reuse already verified selectors and browser pixel hashes for common art.
    old_by_hash = {o["sha256"]: o for o in prologue["outputs"]}
    for url, f in unique.items():
        if f["sha256"] in old_by_hash and url not in outputs:
            outputs[url] = {**old_by_hash[f["sha256"]], **f}
    for group, manifest in manifests.items():
        for video, url in manifest.get("videos", {}).items():
            movie, sound = resolve_video(catalog_assets, video, group)
            movie_id = by_url[movie["url"]]
            outputs[url] = dict(
                unique[url],
                kind="video",
                input=movie_id,
                **({"soundInput": by_url[sound["url"]]} if sound else {}),
            )
        for voice, url in manifest.get("voices", {}).items():
            if url in outputs:
                continue
            parts = resolve_voice(catalog_assets, voice, group)
            selectors = []
            for source, member in parts:
                part = {"input": by_url[source["url"]]}
                if member:
                    part["member"] = member
                    part["password"] = zip_password(
                        Path(source["path"]).name.lower()
                    ).decode()
                selectors.append(part)
            outputs[url] = dict(
                unique[url], kind="audio", parts=selectors, input=selectors[0]["input"]
            )
    targets = defaultdict(list)
    text_hashes = defaultdict(list)
    for url, f in unique.items():
        if url in outputs:
            continue
        if url.endswith((".skel", ".atlas")):
            text_hashes[f["sha256"]].append(url)
        else:
            targets[Path(url).stem.casefold()].append(url)
    print(
        f"{len(inputs)} originals, {len(unique)} output URLs, {len(outputs)} pre-resolved",
        flush=True,
    )
    for source in inputs:
        if not source.get("path", "").startswith(("Bundle/", "WindowsBundle/")):
            continue
        local = Path(paths[source["id"]])
        with zipfile.ZipFile(local) as archive:
            for member in archive.namelist():
                folded = member.lower()
                if not any(
                    x in folded
                    for x in [
                        "spinecharacters",
                        "spinebackground",
                        "audio",
                        "effectsfreezed-texture",
                        "uis-atlas",
                    ]
                ):
                    continue
                try:
                    env = UnityPy.load(archive.read(member))
                    for obj in env.objects:
                        if obj.type.name not in ["TextAsset", "Texture2D", "AudioClip"]:
                            continue
                        data = obj.read()
                        base = {
                            "input": source["id"],
                            "member": member,
                            "name": data.m_Name,
                            "pathId": str(obj.path_id),
                        }
                        if obj.type.name == "TextAsset":
                            payload = data.m_Script
                            if isinstance(payload, str):
                                payload = payload.encode("utf8", "surrogateescape")
                            for url in text_hashes.get(sha(payload), []):
                                outputs.setdefault(
                                    url, dict(unique[url], kind="text", **base)
                                )
                        elif data.m_Name.casefold() in targets:
                            wanted = [
                                u
                                for u in targets[data.m_Name.casefold()]
                                if u not in outputs
                            ]
                            if not wanted:
                                continue
                            if obj.type.name == "AudioClip":
                                for url in wanted:
                                    if url.endswith(".wav"):
                                        outputs[url] = dict(
                                            unique[url], kind="vorbis", **base
                                        )
                            elif obj.type.name == "Texture2D":
                                image = data.image.convert("RGBA")
                                raw_hash = sha(image.tobytes())
                                for url in wanted:
                                    if not url.endswith(".png"):
                                        continue
                                    golden = Image.open(
                                        ROOT / "public" / url.lstrip("/")
                                    ).convert("RGBA")
                                    if (
                                        golden.size == image.size
                                        and sha(golden.tobytes()) == raw_hash
                                    ):
                                        outputs[url] = dict(
                                            unique[url],
                                            kind="texture",
                                            width=image.width,
                                            height=image.height,
                                            nativeRgbaSha256=raw_hash,
                                            **base,
                                        )
                except Exception as error:
                    raise RuntimeError(f"{local.name}: {member}") from error
        print(f"{source['path']}: {len(outputs)}/{len(unique)} resolved", flush=True)
    missing = [url for url in unique if url not in outputs]
    save(WORK / "missing.json", missing)
    save(WORK / "selectors.json", list(outputs.values()))
    save(WORK / "sources.json", inputs)
    save(WORK / "input-paths.json", paths)
    save(WORK / "bootstrap.json", {"db": db_id, "groups": [int(g) for g in manifests]})
    if missing:
        raise ValueError(f"{len(missing)} unresolved outputs; see {WORK}/missing.json")


if __name__ == "__main__":
    main()
