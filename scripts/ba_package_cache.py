"""Verified decoded-media reuse for large JP story batches.

The public shared media are immutable. Staging uses hard links where supported;
source and destination inventories keep their SHA256 checks at publication.
"""

import hashlib
import json
import os
import re
import shutil
import zipfile
import zlib
from functools import lru_cache
from pathlib import Path

import UnityPy
from ba_asset_plan import CHARACTER_VARIANTS, SPINE_BACKGROUND_VARIANTS

ROOT = Path(__file__).resolve().parents[1]
_FINGERPRINTS = {}

NATIVE_ACTOR_TEXTURES = [
    "FX_TEX_Circle_01",
    "FX_TEX_Circle_Glow_04",
    "FX_TEX_Flare_03",
    "FX_TEX_Lightning_RGB_02a",
    "FX_TEX_Noise_06",
    "FX_TEX_Noise_15",
    "FX_TEX_Stretch_Scroll_06",
]
NATIVE_ACTOR_MEMBERS = {
    "Bundle/FullPatch_Prologue_000.zip": "prologdepengroup-assets-_mx-effectsfreezed-texture-_mxprolog-2025-07-02_assets_all_1825571283.bundle",
    "Bundle/FullPatch_051.zip": "assets-_mx-effectsfreezed-texture-_mxdependency-textures-2025-07-02_assets_all_1689773877.bundle",
}


def fingerprint(path):
    path = Path(path)
    stat = path.stat()
    key = (stat.st_dev, stat.st_ino, stat.st_mtime_ns, stat.st_size)
    if key not in _FINGERPRINTS:
        _FINGERPRINTS[key] = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"bytes": stat.st_size, "sha256": _FINGERPRINTS[key]}


def stage_file(source, target, expected=None):
    source, target = Path(source), Path(target)
    actual = fingerprint(source)
    if expected and any(actual[k] != expected[k] for k in ["bytes", "sha256"]):
        raise ValueError(f"Decoded cache integrity mismatch: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if fingerprint(target) != actual:
            raise ValueError(f"Staging collision: {target}")
        return
    try:
        os.link(source, target)
    except OSError:
        shutil.copyfile(source, target)


def canonicalize_manifest_urls(manifest, public_root):
    """Keep generated URLs equal to physical casing on Windows and Unix hosts."""
    public_root = Path(public_root).resolve()
    mapping = {}
    for item in manifest["files"]:
        physical = (public_root / item["url"].lstrip("/")).resolve(strict=True)
        mapping[item["url"]] = "/" + physical.relative_to(public_root).as_posix()

    def replace(value):
        if isinstance(value, str):
            return mapping.get(value, value)
        if isinstance(value, list):
            return [replace(item) for item in value]
        if isinstance(value, dict):
            result = {key: replace(item) for key, item in value.items()}
            # Unity PathIDs exceed JavaScript's exact integer range. Restore the
            # recorded prefab IDs after older JS imports and serialize them as text.
            if "skeletonDataPathId" in result:
                original = next(
                    (
                        v
                        for v in [
                            *CHARACTER_VARIANTS.values(),
                            *SPINE_BACKGROUND_VARIANTS.values(),
                        ]
                        if v["member"] == result.get("member")
                    ),
                    None,
                )
                if original:
                    result["skeletonDataPathId"] = str(original["skeletonDataPathId"])
            if "pathId" in result:
                result["pathId"] = str(result["pathId"])
            return result
        return value

    result = replace(manifest)
    unique = {}
    for item in result["files"]:
        previous = unique.setdefault(item["url"], item)
        if previous != item:
            raise ValueError(f"Canonical media URL collision: {item['url']}")
    result["files"] = list(unique.values())
    return result


@lru_cache(maxsize=None)
def native_actor_effect_files(version, resources):
    cache = (
        ROOT
        / ".cache/ba-native-actor-fx"
        / version
        / "-".join(crc for _, crc, _ in resources)
    )
    cache.mkdir(parents=True, exist_ok=True)
    marker = cache / "files.json"
    if marker.exists():
        return json.loads(marker.read_text(encoding="utf8"))
    files = []
    for path, crc, size in resources:
        source = ROOT / ".cache/ba-jp-assets/jp/android/raw/bundles" / Path(path).name
        data = source.read_bytes()
        if len(data) != size or zlib.crc32(data) != int(crc):
            raise ValueError(f"Original actor-effect pack integrity mismatch: {path}")
        with zipfile.ZipFile(source) as archive:
            member = NATIVE_ACTOR_MEMBERS[path]
            environment = UnityPy.load(archive.read(member))
            for obj in environment.objects:
                if obj.type.name != "Texture2D":
                    continue
                texture = obj.read()
                if texture.m_Name not in NATIVE_ACTOR_TEXTURES:
                    continue
                target = cache / (texture.m_Name + ".png")
                texture.image.save(target)
                files.append(
                    {
                        "name": texture.m_Name,
                        "path": str(target),
                        "file": fingerprint(target),
                        "source": {
                            "bundle": path,
                            "member": member,
                            "memberCrc": archive.getinfo(member).CRC,
                            "texture": texture.m_Name,
                            "pathId": obj.path_id,
                        },
                    }
                )
    if {f["name"] for f in files} != set(NATIVE_ACTOR_TEXTURES):
        raise ValueError("Original NK Ultra texture dependency is missing")
    marker.write_text(json.dumps(files, indent=2) + "\n", encoding="utf8")
    return files


def stage_native_actor_effects(catalog, out, record, manifest):
    assets = {a["path"]: a for a in catalog["assets"]}
    resources = tuple(
        (path, assets[path]["checksum"]["value"], assets[path]["size"])
        for path in NATIVE_ACTOR_MEMBERS
    )
    for item in native_actor_effect_files(catalog["version"], resources):
        target = out / "effects/native-actor" / (item["name"] + ".png")
        stage_file(item["path"], target, item["file"])
        manifest["effects"][item["name"]] = record(target)
        manifest.setdefault("effectsNativeSources", {})[item["name"]] = item["source"]


class ExportCache:
    def __init__(self, version):
        self.version = version
        self.models = {}
        self.sounds = {}
        self.videos = {}
        self.common = None
        self.root = ROOT / ".cache/ba-sound-export-cache" / version
        self.root.mkdir(parents=True, exist_ok=True)
        index = self.root / "index.json"
        if index.exists():
            for name, item in json.loads(index.read_text(encoding="utf8")).items():
                item["path"] = Path(item["path"])
                self.sounds[name] = item
        for manifest_path in sorted(
            (ROOT / "public/private/ba-jp").glob("*/assets.json")
        ):
            manifest = json.loads(manifest_path.read_text(encoding="utf8"))
            if manifest.get("gameVersion") == version:
                self.register(manifest)

    def register(self, manifest):
        files = {f["url"]: f for f in manifest["files"]}
        for identifier, url in manifest.get("videos", {}).items():
            if url in files and url.endswith("_h264.mp4"):
                self.videos.setdefault(
                    identifier,
                    {
                        "file": files[url],
                        "inputs": {
                            i["path"]: i["crc"] for i in manifest.get("inputs", [])
                        },
                    },
                )
        for character in manifest.get("characters", {}).values():
            if not character["skeleton"].startswith("/private/ba-jp/shared/media/"):
                continue
            directory = character["skeleton"].rsplit("/", 1)[0] + "/"
            pages = set(character.get("pages", []))
            entries = [
                f for u, f in files.items() if u.startswith(directory) or u in pages
            ]
            self.models.setdefault(
                character["model"].lower(),
                {
                    "model": character["model"],
                    "files": entries,
                    "inputs": {i["path"]: i["crc"] for i in manifest.get("inputs", [])},
                },
            )
        for name, url in manifest.get("sounds", {}).items():
            if url in files:
                self.sounds.setdefault(
                    name,
                    {
                        "path": ROOT / "public" / url.lstrip("/"),
                        "file": files[url],
                        "input": None,
                    },
                )
        if self.common is None and manifest.get("emotions") and manifest.get("effects"):
            self.common = {
                "emotions": manifest["emotions"],
                "effects": manifest["effects"],
                "files": files,
            }

    def stage_model(self, model, selected_members, out, record):
        cached = self.models.get(model.lower())
        if not cached:
            return None
        members = [
            (a, m)
            for a, m in selected_members
            if "-" + model.lower() + "-" in m.lower()
        ]
        if any(
            cached["inputs"].get(a["path"]) != a["checksum"]["value"]
            for a, _ in members
        ):
            return None
        pages = []
        for item in cached["files"]:
            source = ROOT / "public" / item["url"].lstrip("/")
            filename = Path(item["url"]).name
            if filename.lower().endswith((".skel", ".atlas")):
                filename = model + Path(filename).suffix
            target = out / "characters" / model / filename
            stage_file(source, target, item)
            url = record(target)
            if filename.lower().endswith(".png"):
                pages.append(url)
        return pages

    def stage_sound(self, name, out, record):
        item = self.sounds.get(name)
        canonical = name
        if not item:
            matches = [key for key in self.sounds if key.casefold() == name.casefold()]
            if len(matches) == 1:
                canonical = matches[0]
                item = self.sounds[canonical]
        if not item:
            return None
        # Reused manifests may key a clip by an authored case variant. Preserve the
        # original physical filename so the URL also works on case-sensitive hosts.
        target = out / "sound" / Path(item["path"]).name
        stage_file(item["path"], target, item["file"])
        return record(target)

    def stage_video(self, identifier, resources, out, record):
        item = self.videos.get(identifier)
        if not item or any(
            item["inputs"].get(a["path"]) != a["checksum"]["value"] for a in resources
        ):
            return None
        source = ROOT / "public" / item["file"]["url"].lstrip("/")
        target = out / "videos" / (identifier + "_h264.mp4")
        stage_file(source, target, item["file"])
        return record(target)

    def save_sound(self, name, payload, input_info):
        target = self.root / (name + ".wav")
        if target.exists() and target.read_bytes() != payload:
            raise ValueError(f"Decoded sound cache collision: {name}")
        target.write_bytes(payload)
        self.sounds[name] = {
            "path": target,
            "file": fingerprint(target),
            "input": input_info,
        }

    def save_index(self):
        content = {
            n: {**item, "path": str(item["path"])}
            for n, item in self.sounds.items()
            if item.get("input") is not None
        }
        partial = self.root / "index.json.partial"
        partial.write_text(
            json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
        )
        partial.replace(self.root / "index.json")

    def stage_common(self, out, url_prefix, record, manifest):
        if not self.common:
            return False
        for kind in ["emotions", "effects"]:
            for name, url in self.common[kind].items():
                item = self.common["files"][url]
                source = ROOT / "public" / url.lstrip("/")
                relative = url.split("/media/", 1)[1]
                target = out / relative
                stage_file(source, target, item)
                manifest[kind][name] = record(target)
        return True


_CACHES = {}


def export_cache(version):
    if version not in _CACHES:
        _CACHES[version] = ExportCache(version)
    return _CACHES[version]


@lru_cache(maxsize=None)
def validate_background_variant(name, crc, expected_size):
    variant = SPINE_BACKGROUND_VARIANTS[name]
    source = (
        ROOT
        / ".cache/ba-jp-assets/jp/android/raw/bundles"
        / Path(variant["bundle"]).name
    )
    data = source.read_bytes()
    if len(data) != expected_size or zlib.crc32(data) != int(crc):
        raise ValueError(f"Original background prefab integrity mismatch: {name}")
    with zipfile.ZipFile(source) as archive:
        environment = UnityPy.load(archive.read(variant["member"]))
        for obj in environment.objects:
            if obj.type.name != "MonoBehaviour":
                continue
            tree = obj.read_typetree()
            reference = tree.get("skeletonDataAsset", {})
            if reference.get("m_PathID") == variant["skeletonDataPathId"]:
                return
    raise ValueError(f"Original background prefab skeleton changed: {name}")


@lru_cache(maxsize=1)
def _spine_background_resources(version, crc, expected_size):
    source = ROOT / ".cache/ba-jp-assets/jp/android/raw/bundles/FullPatch_088.zip"
    data = source.read_bytes()
    if len(data) != expected_size or zlib.crc32(data) != int(crc):
        raise ValueError(
            "Official Spine background pack failed catalog integrity validation"
        )
    texts = {}
    textures = {}
    with zipfile.ZipFile(source) as archive:
        for member in sorted(archive.namelist()):
            if "spinebackground-spinebg-" not in member or not any(
                role in member for role in ["-textassets-", "-textures-"]
            ):
                continue
            environment = UnityPy.load(archive.read(member))
            for obj in environment.objects:
                if obj.type.name == "TextAsset":
                    text = obj.read()
                    payload = text.m_Script
                    if isinstance(payload, str):
                        payload = payload.encode("utf8", "surrogateescape")
                    texts[text.m_Name] = payload
                elif obj.type.name == "Texture2D":
                    texture = obj.read()
                    textures[texture.m_Name + ".png"] = texture
    return texts, textures


def stage_spine_background(bg, out, url_prefix, record, catalog):
    asset = next(
        a for a in catalog["assets"] if a["path"] == "Bundle/FullPatch_088.zip"
    )
    model = Path(bg["BGFileName"]).name.removeprefix("SpineBG_")
    variant = SPINE_BACKGROUND_VARIANTS.get(model)
    if variant:
        prefab_asset = next(
            a for a in catalog["assets"] if a["path"] == variant["bundle"]
        )
        validate_background_variant(
            model, prefab_asset["checksum"]["value"], prefab_asset["size"]
        )
        model = variant["model"]
    cache = (
        ROOT
        / ".cache/ba-spine-bg-exports"
        / catalog["version"]
        / asset["checksum"]["value"]
        / model
    )
    cache.mkdir(parents=True, exist_ok=True)
    marker = cache / "files.json"
    if marker.exists():
        files = json.loads(marker.read_text(encoding="utf8"))
    else:
        texts, textures = _spine_background_resources(
            catalog["version"], asset["checksum"]["value"], asset["size"]
        )
        for filename in [model + ".skel", model + ".atlas"]:
            if filename not in texts:
                raise ValueError(
                    f"Original Spine background text asset missing: {filename}"
                )
            (cache / filename).write_bytes(texts[filename])
        atlas = (cache / (model + ".atlas")).read_text(encoding="utf8")
        pages = re.findall(r"^([^\s].*\.png)\s*$", atlas, re.MULTILINE)
        for page in pages:
            if page not in textures:
                raise ValueError(f"Original Spine background page missing: {page}")
            textures[page].image.save(cache / page)
        files = [
            {"name": name, **fingerprint(cache / name)}
            for name in [model + ".skel", model + ".atlas", *pages]
        ]
        marker.write_text(json.dumps(files, indent=2) + "\n", encoding="utf8")
    result = {
        "name": model,
        "renderer": "spine",
        "skeleton": "",
        "atlas": "",
        "pages": [],
        "animation": bg.get("AnimationName") or "Idle_01",
        "scale": bg.get("SpineScale", 1),
        "x": bg.get("SpineLocalPosX", 0),
        "y": bg.get("SpineLocalPosY", 0),
    }
    if variant:
        result["prefabSource"] = {
            **variant,
            "skeletonDataPathId": str(variant["skeletonDataPathId"]),
        }
    for item in files:
        target = out / "background-spine" / model / item["name"]
        stage_file(cache / item["name"], target, item)
        url = record(target)
        if item["name"].endswith(".skel"):
            result["skeleton"] = url
        elif item["name"].endswith(".atlas"):
            result["atlas"] = url
        else:
            result["pages"].append(url)
    return result
