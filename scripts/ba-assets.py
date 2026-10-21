"""Package referenced JP story media and Spine data from a pinned downloader workspace.

Run with the downloader's UnityPy environment:
uv run --project .cache/ba-downloader python -X utf8 scripts/ba-assets.py
"""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request
import zipfile
import zlib
from functools import lru_cache
from pathlib import Path

import UnityPy
import xxhash
from ba_asset_plan import (
    bundle_rank,
    character_model,
    character_variant,
    check_shared_assets,
    emotion_sound_names,
    load_table,
    missing_background,
    needs_native_actor_fx,
    plan,
    read_story,
    resolve_media,
    resolve_video,
    resolve_voice,
    source_gaps,
    timeline_members,
)
from ba_downloader.infrastructure.schema.crypto import zip_password
from ba_package_cache import (
    canonicalize_manifest_urls,
    export_cache,
    fingerprint,
    stage_file,
    stage_native_actor_effects,
    stage_spine_background,
)
from ba_character_textures import install_character_textures

_BATCH_SOUND_NAMES = set()
_VERIFIED_SOURCES = {}

# Exact decoded textures used by the pinned BA Archive renderer's UnderFire mapping.
# These are community-hosted reference exports, distinguished from verified official bundles.
UNDER_FIRE_ART = [
    (
        "FX_TEX_Smoke_17",
        "FX_TEX_Smoke_17.png",
        "d7364160fbfbbdcc11f784d45a28ee6e97b0857554c3fd81bbad1aacf7b7635e",
    ),
    (
        "BA_UnderFire_Fire1",
        "fire1.png",
        "67bcdcfda28e5941844310bcb71d77c6a5b606f8caf32df3bc183aaa2c0cdded",
    ),
    (
        "BA_UnderFire_Fire2",
        "fire2.png",
        "39cb5ceba6c3444c41adf5665b54fd58de6bddd83892b1e62f9961936dec984f",
    ),
    (
        "BA_UnderFire_Fire3",
        "fire3.png",
        "9781dcbf2f94e96e253b28581b187c479730909137f964b23d316331743d9383",
    ),
    (
        "BA_UnderFire_HardRain",
        "HardRain.png",
        "99178bcde779dc94297c2cedd1f2b8c7b5ad037b8465f6ab39baa3c2853713bd",
    ),
]


UNDER_FIRE_AUDIO_SHA256 = (
    "da19efb9788b88cb49e35b644ef7c1410a53f0b4529ad8ffb99530059c36b6b3"
)
UNDER_FIRE_AUDIO_MEMBER = "prologdepengroup-assets-_mx-addressableasset-audio-_mxprolog-2025-07-02_assets_all_254036561.bundle"


@lru_cache(maxsize=1)
def official_underfire_audio():
    root = Path(__file__).resolve().parents[1]
    catalog = json.loads(
        (root / ".cache/ba-jp-catalog.json").read_text(encoding="utf8")
    )
    asset = next(
        a for a in catalog["assets"] if a["path"] == "Bundle/FullPatch_Prologue_000.zip"
    )
    source = (
        root / ".cache/ba-jp-assets/jp/android/raw/bundles/FullPatch_Prologue_000.zip"
    )
    bundle = source.read_bytes()
    if len(bundle) != asset["size"] or zlib.crc32(bundle) != int(
        asset["checksum"]["value"]
    ):
        raise ValueError(
            f"Official UnderFire audio source integrity mismatch: {source}"
        )
    with zipfile.ZipFile(source) as archive:
        environment = UnityPy.load(archive.read(UNDER_FIRE_AUDIO_MEMBER))
        clip = next(
            o.read()
            for o in environment.objects
            if o.type.name == "AudioClip" and o.read().m_Name == "UI_FX_BG_UnderFire"
        )
        samples = clip.samples
        if len(samples) != 1:
            raise ValueError("Expected exactly one original UnderFire waveform")
        payload = next(iter(samples.values()))
    if hashlib.sha256(payload).hexdigest() != UNDER_FIRE_AUDIO_SHA256:
        raise ValueError("Original UnderFire waveform does not match pinned SHA256")
    source_info = {
        "path": asset["path"],
        "url": asset["url"],
        "bytes": len(bundle),
        "sha256": hashlib.sha256(bundle).hexdigest(),
        "crc": asset["checksum"]["value"],
    }
    return payload, source_info


def install_underfire_audio(media_root, url_prefix, manifest):
    payload, source_info = official_underfire_audio()
    target = media_root / "sound" / "UI_FX_BG_UnderFire.wav"
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if target.read_bytes() != payload:
            raise ValueError(f"Shared UnderFire sound collision: {target}")
    else:
        partial = target.with_suffix(target.suffix + ".partial")
        partial.write_bytes(payload)
        partial.replace(target)
    url = url_prefix + "sound/UI_FX_BG_UnderFire.wav"
    manifest.setdefault("sounds", {})["UI_FX_BG_UnderFire"] = url
    item = {"url": url, "bytes": len(payload), "sha256": UNDER_FIRE_AUDIO_SHA256}
    existing = next(
        (i for i, f in enumerate(manifest["files"]) if f["url"] == url), None
    )
    if existing is None:
        manifest["files"].append(item)
    else:
        manifest["files"][existing] = item
    if not any(
        i["path"] == source_info["path"] for i in manifest.setdefault("inputs", [])
    ):
        manifest["inputs"].append(source_info)
    manifest.setdefault("effectSoundSources", {})["UI_FX_BG_UnderFire"] = {
        "source": "Official JP Unity AudioClip",
        "bundle": source_info["path"],
        "member": UNDER_FIRE_AUDIO_MEMBER,
        "clip": "UI_FX_BG_UnderFire",
        "bytes": len(payload),
        "sha256": UNDER_FIRE_AUDIO_SHA256,
        "duration": 2.152018,
        "sampleRate": 22050,
        "channels": 1,
    }


def install_underfire_art(media_root, url_prefix, manifest):
    root = Path(__file__).resolve().parents[1]
    cache = root / ".cache/ba-underfire-reference"
    cache.mkdir(parents=True, exist_ok=True)
    provenance = []
    for alias, filename, expected_sha in UNDER_FIRE_ART:
        source_url = (
            "https://yuuka.cdn.diyigemt.com/image/ba-all-data/effectTexture/" + filename
        )
        source = cache / filename
        if not source.exists():
            with urllib.request.urlopen(source_url, timeout=40) as response:
                payload = response.read()
            if hashlib.sha256(payload).hexdigest() != expected_sha:
                raise ValueError(f"Reference effect integrity mismatch: {filename}")
            source.write_bytes(payload)
        payload = source.read_bytes()
        if hashlib.sha256(payload).hexdigest() != expected_sha:
            raise ValueError(f"Reference effect integrity mismatch: {filename}")
        target = media_root / "effects" / "underfire-reference" / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            if target.read_bytes() != payload:
                raise ValueError(f"Shared reference effect collision: {target}")
        else:
            partial = target.with_suffix(target.suffix + ".partial")
            partial.write_bytes(payload)
            partial.replace(target)
        url = url_prefix + "effects/underfire-reference/" + filename
        manifest["effects"][alias] = url
        item = {"url": url, "bytes": len(payload), "sha256": expected_sha}
        existing = next(
            (i for i, f in enumerate(manifest["files"]) if f["url"] == url), None
        )
        if existing is None:
            manifest["files"].append(item)
        else:
            manifest["files"][existing] = item
        provenance.append(
            {
                "alias": alias,
                "url": source_url,
                "sha256": expected_sha,
                "bytes": len(payload),
                "source": "Community renderer reference texture",
                "mappingRevision": "4ddc9ee241f6028d724346acda190155dc98aaf6",
                "mappingPath": "lib/ba-story-player/lib/stores/index.ts",
                "nativeAlpha": True,
            }
        )
    manifest["referenceEffectArt"] = provenance
    install_underfire_audio(media_root, url_prefix, manifest)


def update_underfire_art(group, audio_only=False):
    root = Path(__file__).resolve().parents[1]
    folder = root / "public/private/ba-jp" / str(group)
    manifest_path = folder / "assets.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf8"))
    url_prefix = (
        f"/private/ba-jp/{group}/media/"
        if str(group) == "11000"
        else "/private/ba-jp/shared/media/"
    )
    installer = install_underfire_audio if audio_only else install_underfire_art
    installer(root / "public" / url_prefix.lstrip("/"), url_prefix, manifest)
    partial = manifest_path.with_suffix(".json.partial")
    partial.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
    partial.replace(manifest_path)
    print(
        "Updated UnderFire assets",
        group,
        "official gunfire audio"
        if audio_only
        else "5 transparent textures and official gunfire audio",
    )


@lru_cache(maxsize=1)
def verified_emotion_outputs():
    root = Path(__file__).resolve().parents[1]
    return (
        json.loads((root / "src/downloads/ba/outputs.json").read_text(encoding="utf8")),
        json.loads((root / "src/downloads/ba/sources.json").read_text(encoding="utf8")),
    )


def update_emotion_audio(group):
    """Attach only required, already verified original clips to a staged chapter."""
    root = Path(__file__).resolve().parents[1]
    folder = root / "public/private/ba-jp" / str(group)
    path = folder / "assets.json"
    manifest = json.loads(path.read_text(encoding="utf8"))
    rows = json.loads((folder / "source.json").read_text(encoding="utf8"))["content"]
    outputs = {
        item["name"]: item
        for item in verified_emotion_outputs()[0]
        if item.get("kind") == "vorbis"
        and item.get("name", "").startswith("SFX_Emoticon_Motion_")
    }
    inputs = verified_emotion_outputs()[1]
    for name in sorted(emotion_sound_names(rows)):
        selector = outputs[name]
        url = selector["url"]
        payload = root / "public" / url.lstrip("/")
        if fingerprint(payload) != {key: selector[key] for key in ("bytes", "sha256")}:
            raise ValueError(f"Emotion clip integrity mismatch: {name}")
        manifest["sounds"][name] = url
        if not any(item["url"] == url for item in manifest["files"]):
            manifest["files"].append(
                {key: selector[key] for key in ("url", "bytes", "sha256")}
            )
        source = inputs[selector["input"]]
        if not any(item["url"] == source["url"] for item in manifest["inputs"]):
            manifest["inputs"].append(
                {key: value for key, value in source.items() if key not in ("id", "filename")}
            )
    serialized = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    if path.read_text(encoding="utf8") != serialized:
        partial = path.with_suffix(".json.partial")
        partial.write_text(serialized, encoding="utf8")
        for attempt in range(10):
            try:
                partial.replace(path)
                break
            except PermissionError:
                if attempt == 9:
                    raise
                time.sleep(0.1)
    print("Updated original emotion audio", group, len(emotion_sound_names(rows)))


def package(group, check_only=False):
    ROOT = Path(__file__).resolve().parents[1]
    RAW = ROOT / ".cache/ba-jp-assets/jp/android/raw"
    folder = ROOT / "public/private/ba-jp" / str(group)
    OUT = (
        folder / "media"
        if str(group) == "11000"
        else ROOT / "public/private/ba-jp/shared/media"
    )
    destination = OUT
    staging = None
    if str(group) != "11000" or check_only:
        staging_root = ROOT / ".cache/ba-stage-assets"
        staging_root.mkdir(parents=True, exist_ok=True)
        staging = tempfile.TemporaryDirectory(prefix=f"{group}-", dir=staging_root)
        OUT = Path(staging.name) / "media"
    OUT.mkdir(parents=True, exist_ok=True)
    URL = (
        "/private/ba-jp/11000/media/"
        if str(group) == "11000"
        else "/private/ba-jp/shared/media/"
    )
    catalog = json.loads(
        (ROOT / ".cache/ba-jp-catalog.json").read_text(encoding="utf8")
    )
    selected, selected_members = plan(catalog, group)
    rows, characters = read_story(group)
    cache = export_cache(catalog["version"])
    bg_table = load_table("ScenarioBGNameExcelTable")
    bgm_table = load_table("BGMExcelTable")
    transitions = load_table("ScenarioTransitionExcelTable")
    manifest = dict(
        version=1,
        region="JP",
        platform="android",
        gameVersion=catalog["version"],
        backgrounds={},
        characters={},
        music={},
        sounds={},
        voices={},
        videos={},
        cutscenes={},
        popups={},
        transitions={},
        emotions={},
        effects={},
        files=[],
        inputs=[],
        sourceGaps=source_gaps(group),
    )
    manifest["metadata"] = []
    for name in [
        "ScenarioBGNameExcelTable",
        "BGMExcelTable",
        "ScenarioTransitionExcelTable",
    ]:
        source = next(
            p
            for p in [
                ROOT
                / ".cache/ba-main-source/official"
                / (name.replace("ExcelTable", "DBSchema") + ".json"),
                ROOT
                / ".cache/ba-event-source/official"
                / (name.replace("ExcelTable", "DBSchema") + ".json"),
                ROOT
                / ".cache/ba-group-source/official"
                / (name.replace("ExcelTable", "DBSchema") + ".json"),
                ROOT / ".cache/ba-reference" / (name + ".json"),
            ]
            if p.exists()
        )
        data = source.read_bytes()
        item = {
            "name": name,
            "path": source.relative_to(ROOT).as_posix(),
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
        manifest["metadata"].append(item)
    official_provenance = ROOT / ".cache/ba-main-source/provenance.json"
    if not official_provenance.exists():
        official_provenance = ROOT / ".cache/ba-event-source/provenance.json"
    if not official_provenance.exists():
        official_provenance = ROOT / ".cache/ba-group-source/provenance.json"
    if official_provenance.exists():
        manifest["tableSource"] = json.loads(
            official_provenance.read_text(encoding="utf8")
        )
    assets = {a["path"]: a for a in catalog["assets"]}
    verified = set()

    def source_file(asset):
        kind = asset["asset_type"]
        p = (
            RAW
            / {"bundle": "bundles", "media": "media", "table": "tables"}[kind]
            / asset["path"].split("/", 1)[1]
        )
        stat = p.stat()
        key = (str(p), stat.st_mtime_ns, stat.st_size, asset["checksum"]["value"])
        if key not in _VERIFIED_SOURCES:
            data = p.read_bytes()
            if len(data) != asset["size"] or zlib.crc32(data) != int(
                asset["checksum"]["value"]
            ):
                raise ValueError(f"Catalog integrity mismatch: {p}")
            _VERIFIED_SOURCES[key] = {
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        if p not in verified:
            manifest["inputs"].append(
                dict(
                    path=asset["path"],
                    url=asset["url"],
                    **_VERIFIED_SOURCES[key],
                    crc=asset["checksum"]["value"],
                )
            )
            verified.add(p)
        return p

    def record(p):
        item = dict(url=URL + p.relative_to(OUT).as_posix(), **fingerprint(p))
        existing = next(
            (i for i, f in enumerate(manifest["files"]) if f["url"] == item["url"]),
            None,
        )
        if existing is None:
            manifest["files"].append(item)
        else:
            manifest["files"][existing] = item
        return item["url"]

    def copy_media(path, target):
        src = source_file(resolve_media(assets, path, group))
        dst = OUT / target
        stage_file(src, dst)
        return record(dst)

    for path, native in timeline_members(catalog, rows).items():
        sources = []
        for asset, member in native:
            verified_path = source_file(asset)
            with zipfile.ZipFile(verified_path) as archive:
                info = archive.getinfo(member)
                sources.append(
                    dict(
                        path=asset["path"],
                        member=member,
                        crc=info.CRC,
                        bytes=info.file_size,
                    )
                )
        manifest["cutscenes"][path] = dict(
            supported=False,
            reason="Original Unity 3D cutscene is not supported by this reader.",
            sources=sources,
        )

    for ident in sorted({r["BGName"] for r in rows if r["BGName"]}):
        bg = next((b for b in bg_table if b["Name"] == ident), None)
        if bg is None and missing_background(group, rows, ident):
            # sourceGaps declares the exact missing row; no synthetic image asset.
            continue
        if bg is None:
            raise ValueError(f"Missing official background metadata: {ident}")
        if bg.get("BGType") == "Spine":
            source_file(assets["Bundle/FullPatch_088.zip"])
            manifest["backgrounds"][ident] = stage_spine_background(
                bg, OUT, URL, record, catalog
            )
            continue
        name = Path(bg["BGFileName"]).name + ".jpg"
        manifest["backgrounds"][ident] = dict(
            name=name, url=copy_media(bg["BGFileName"] + ".jpg", "backgrounds/" + name)
        )

    for ident in sorted({r["BGMId"] for r in rows if r["BGMId"] and r["BGMId"] != 999}):
        bgm = next(b for b in bgm_table if b["Id"] == ident)
        name = Path(bgm["Path"][0]).name + ".ogg"
        manifest["music"][ident] = dict(
            url=copy_media(bgm["Path"][0] + ".ogg", "music/" + name),
            gain=bgm["Volume"][0],
            loopStart=bgm["LoopStartTime"][0],
            loopEnd=bgm["LoopEndTime"][0],
        )

    for voice in sorted({r["VoiceJp"] for r in rows if r.get("VoiceJp")}):
        parts = resolve_voice(assets, voice, group)
        inputs = []
        for asset, member in parts:
            path = source_file(asset)
            if member:
                path = (
                    ROOT
                    / ".cache/ba-voice-exports"
                    / asset["checksum"]["value"]
                    / Path(member).name
                )
                path.parent.mkdir(parents=True, exist_ok=True)
                with zipfile.ZipFile(source_file(asset)) as archive:
                    info = archive.getinfo(member)
                    cached = path.read_bytes() if path.exists() else None
                    if (
                        cached is None
                        or len(cached) != info.file_size
                        or zlib.crc32(cached) != info.CRC
                    ):
                        archive.setpassword(
                            zip_password(Path(asset["path"]).name.lower())
                        )
                        partial = path.with_suffix(path.suffix + ".partial")
                        partial.write_bytes(archive.read(member))
                        partial.replace(path)
            inputs.append(path)
        target = OUT / "voice" / (voice + ".ogg")
        target.parent.mkdir(parents=True, exist_ok=True)
        if len(inputs) == 1:
            stage_file(inputs[0], target)
        else:
            listing = ROOT / ".cache" / (voice + ".concat.txt")
            listing.write_text(
                "\n".join(
                    "file '" + str(p).replace("\\", "/").replace("'", "'\\''") + "'"
                    for p in inputs
                ),
                encoding="utf8",
            )
            subprocess.run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-y",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    str(listing),
                    "-c:a",
                    "libvorbis",
                    "-q:a",
                    "5",
                    str(target),
                ],
                check=True,
            )
        manifest["voices"][voice] = record(target)

    for popup in sorted({r.get("PopupFileName") for r in rows} - {None, ""}):
        manifest["popups"][popup] = copy_media(
            "UIs/03_Scenario/04_ScenarioImage/" + popup + ".png",
            "popups/" + popup + ".png",
        )
    for video in sorted(
        {
            line.split(";")[1]
            for r in rows
            for line in r.get("ScriptKr", "").splitlines()
            if re.match(r"^#video(?:ns2)?;", line, re.I)
        }
    ):
        movie_asset, sound_asset = resolve_video(assets, video, group)
        movie = source_file(movie_asset)
        sound = source_file(sound_asset) if sound_asset else None
        cached_video = cache.stage_video(
            video, [movie_asset] + ([sound_asset] if sound_asset else []), OUT, record
        )
        if cached_video:
            manifest["videos"][video] = cached_video
            continue
        target = OUT / "videos" / (video + "_h264.mp4")
        target.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(movie)]
            + (
                ["-i", str(sound), "-map", "0:v:0", "-map", "1:a:0"]
                if sound
                else ["-map", "0:v:0", "-map", "0:a?"]
            )
            + [
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "18",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
                str(target),
            ],
            check=True,
        )
        manifest["videos"][video] = record(target)

    names = {
        line.split(";")[1]
        for r in rows
        for line in r["ScriptKr"].splitlines()
        if re.match(r"^[1-5];", line)
    }
    by_hash = {c["CharacterName"]: c for c in characters}
    wanted = {}
    for name in sorted(names):
        character = by_hash.get(xxhash.xxh32(name.encode("utf8")).intdigest())
        if character is None:
            positions = [
                index
                for index, row in enumerate(rows)
                for line in row["ScriptKr"].splitlines()
                if re.match(r"^[1-5];", line) and line.split(";")[1] == name
            ]
            declared = {
                (gap["row"], gap["value"])
                for gap in source_gaps(group)
                if gap["field"] == "Character"
            }
            if positions and all(
                (index, name) in declared for index in positions
            ):
                continue
            raise ValueError(f"Missing character row for {name}")
        model = character_model(character)
        if model is None:
            manifest["characters"][name] = dict(
                model="invisible",
                invisible=True,
                name=character["NameJP"],
                signal=False,
                skeleton="",
                atlas="",
                pages=[],
            )
            continue
        wanted.setdefault(model, []).append(name)
        manifest["characters"][name] = dict(
            model=model,
            name=character["NameJP"],
            signal=character["Shape"] == "Signal",
            skeleton=URL + "characters/" + model + "/" + model + ".skel",
            atlas=URL + "characters/" + model + "/" + model + ".atlas",
            pages=[],
        )

    for name in manifest["characters"]:
        variant = character_variant(
            by_hash[xxhash.xxh32(name.encode("utf8")).intdigest()]
        )
        if variant:
            manifest["characters"][name]["skin"] = variant["skin"]
            manifest["characters"][name]["prefabSource"] = dict(
                bundle="Bundle/FullPatch_154.zip",
                **{**variant, "skeletonDataPathId": str(variant["skeletonDataPathId"])},
            )
    for asset in selected:
        if asset["asset_type"] == "bundle":
            source_file(asset)
    reused_models = set()
    for model in wanted:
        pages = cache.stage_model(model, selected_members, OUT, record)
        if pages is not None:
            reused_models.add(model)
            for alias in wanted[model]:
                manifest["characters"][alias]["pages"] = pages
    sound_gaps = {
        (g["row"], g["value"]) for g in source_gaps(group) if g["field"] == "Sound"
    }
    sound_names = {
        r["Sound"]
        for i, r in enumerate(rows)
        if r["Sound"] and (i, r["Sound"]) not in sound_gaps
    }
    sound_names.update(emotion_sound_names(rows))
    for name in sound_names:
        cached = cache.stage_sound(name, OUT, record)
        if cached:
            manifest["sounds"][name] = cached
    cached_sound_names = {name.casefold() for name in cache.sounds}
    batch_sounds = {
        name
        for name in (_BATCH_SOUND_NAMES or sound_names)
        if name.casefold() not in cached_sound_names
    }
    extracted = set()
    allowed_members = {member for _, member in selected_members}
    member_ranks = {
        member: bundle_rank(asset, member) for asset, member in selected_members
    }
    for asset in selected:
        if asset["asset_type"] != "bundle":
            continue
        with zipfile.ZipFile(source_file(asset)) as archive:
            for member in sorted(
                archive.namelist(), key=lambda m: member_ranks.get(m, ())
            ):
                models = (
                    [
                        m
                        for m in wanted
                        if m not in reused_models
                        and "-" + m.lower() + "-" in member.lower()
                    ]
                    if member in allowed_members
                    else []
                )
                is_sound = "audio" in member and bool(batch_sounds)
                if not models and not is_sound:
                    continue
                env = UnityPy.load(archive.read(member))
                for obj in env.objects:
                    if obj.type.name == "TextAsset" and models:
                        data = obj.read()
                        if not any(
                            data.m_Name.lower().startswith(m.lower()) for m in models
                        ):
                            continue
                        model = models[0]
                        filename = (
                            model + ".skel"
                            if data.m_Name.lower().endswith(".skel")
                            else model + ".atlas"
                            if data.m_Name.lower().endswith(".atlas")
                            else data.m_Name
                        )
                        dest = OUT / "characters" / model / filename
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        payload = data.m_Script
                        if isinstance(payload, str):
                            payload = payload.encode("utf8", "surrogateescape")
                        dest.write_bytes(payload)
                        record(dest)
                        extracted.add(dest.name)
                    elif obj.type.name == "Texture2D" and models:
                        data = obj.read()
                        model = models[0]
                        dest = OUT / "characters" / model / (data.m_Name + ".png")
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        data.image.save(dest)
                        record(dest)
                        for alias in wanted[model]:
                            character = manifest["characters"][alias]
                            if record(dest) not in character["pages"]:
                                character["pages"].append(record(dest))
                    elif obj.type.name == "AudioClip" and is_sound:
                        data = obj.read()
                        requested = {
                            name
                            for name in batch_sounds
                            if name.casefold() == data.m_Name.casefold()
                        }
                        if not requested:
                            continue
                        samples = data.samples
                        if len(samples) != 1:
                            raise ValueError(
                                f"Expected one sound waveform for {data.m_Name}"
                            )
                        payload = next(iter(samples.values()))
                        input_info = next(
                            i for i in manifest["inputs"] if i["path"] == asset["path"]
                        )
                        cache.save_sound(data.m_Name, payload, input_info)
                        batch_sounds.difference_update(requested)
                        if data.m_Name in sound_names:
                            manifest["sounds"][data.m_Name] = cache.stage_sound(
                                data.m_Name, OUT, record
                            )

    for name in sound_names - manifest["sounds"].keys():
        cached = cache.stage_sound(name, OUT, record)
        if cached:
            manifest["sounds"][name] = cached
    cache.save_index()

    missing = sound_names - manifest["sounds"].keys()
    if missing:
        raise ValueError(f"Missing sounds: {sorted(missing)}")

    if not cache.stage_common(OUT, URL, record, manifest):
        # NGUI's authored Emoji atlas provides the original response/emotion art.
        with zipfile.ZipFile(
            source_file(assets["Bundle/FullPatch_Prologue_001.zip"])
        ) as archive:
            member = next(
                n for n in archive.namelist() if "uis-atlas-_mxprolog-2025" in n
            )
            env = UnityPy.load(archive.read(member))
            atlas = next(
                o.read_typetree()
                for o in env.objects
                if o.type.name == "MonoBehaviour"
                and o.read_typetree().get("m_Name") == "Emoji"
            )
            image = next(
                o.read().image
                for o in env.objects
                if o.type.name == "Texture2D" and o.read().m_Name == "Emoji"
            )
            for sprite in atlas["mSprites"]:
                name = sprite["name"]
                dest = OUT / "emotion" / (name + ".png")
                dest.parent.mkdir(parents=True, exist_ok=True)
                x, y, w, h = [sprite[k] for k in ["x", "y", "width", "height"]]
                image.crop((x, y, x + w, y + h)).save(dest)
                manifest["emotions"][name] = record(dest)
        with zipfile.ZipFile(
            source_file(assets["Bundle/FullPatch_Prologue_000.zip"])
        ) as archive:
            member = next(
                n
                for n in archive.namelist()
                if "effectsfreezed-texture-_mxprolog-2025" in n
            )
            env = UnityPy.load(archive.read(member))
            for obj in env.objects:
                if obj.type.name != "Texture2D":
                    continue
                data = obj.read()
                if data.m_Name not in [
                    "FX_TEX_Smoke_RGB_15",
                    "FX_TEX_Bulletline_02",
                    "FX_TEX_Hit_01",
                    "FX_TEX_Img_Heart_04",
                    "FX_TEX_Cartoon_Star",
                    "FX_TEX_Speed_Line_03",
                    "FX_TEX_Dust_01",
                    "FX_TEX_Flare_03",
                ]:
                    continue
                image = data.image.convert("RGBA")
                dest = OUT / "effects" / (data.m_Name + ".png")
                dest.parent.mkdir(parents=True, exist_ok=True)
                image.save(dest)
                manifest["effects"][data.m_Name] = record(dest)
    install_underfire_art(OUT, URL, manifest)
    if needs_native_actor_fx(rows):
        stage_native_actor_effects(catalog, OUT, record, manifest)
    for c in manifest["characters"].values():
        if c.get("invisible"):
            continue
        character_folder = OUT / "characters" / c["model"]
        if (
            not (character_folder / (c["model"] + ".skel")).is_file()
            or not (character_folder / (c["model"] + ".atlas")).is_file()
            or not c["pages"]
        ):
            raise ValueError(f"Incomplete Spine model: {c}")
        atlas = (character_folder / (c["model"] + ".atlas")).read_text(encoding="utf8")
        for page in re.findall(r"^([^\s].*\.png)\s*$", atlas, re.M):
            if not (character_folder / page.strip()).is_file():
                raise ValueError(f"Missing atlas page: {page}")
    manifest["transitions"] = {
        t["Name"]: t
        for t in transitions
        if t["Name"] in {r["Transition"] for r in rows}
    }
    license_file = OUT / "Spine-LICENSE.txt"
    shutil.copyfile(
        ROOT / "node_modules/@esotericsoftware/spine-webgl/LICENSE", license_file
    )
    record(license_file)
    install_character_textures(OUT, URL, manifest)
    if staging:
        # Validate the complete staged chapter before touching any shared output.
        # This also resolves authored patch components before comparing final models.
        check_shared_assets(destination, URL, manifest["files"])
        if not check_only:
            for item in manifest["files"]:
                relative = item["url"].removeprefix(URL)
                target = destination / relative
                if target.exists():
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                partial = target.with_suffix(target.suffix + ".partial")
                shutil.copyfile(OUT / relative, partial)
                partial.replace(target)
        staging.cleanup()
    if check_only:
        print(
            "Validated staged chapter",
            group,
            len(manifest["files"]),
            "files; no shared output changes",
        )
        return
    manifest_partial = folder / "assets.json.partial"
    manifest = canonicalize_manifest_urls(manifest, ROOT / "public")
    manifest_partial.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
    manifest_partial.replace(folder / "assets.json")
    cache.register(manifest)
    print(
        "Packaged",
        group,
        len(manifest["files"]),
        "files;",
        len(manifest["voices"]),
        "voices;",
        len(manifest["characters"]),
        "characters",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--groups", default="11000")
    parser.add_argument("--definitions")
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--underfire-art-only", action="store_true")
    parser.add_argument("--underfire-audio-only", action="store_true")
    parser.add_argument("--emotion-audio-only", action="store_true")
    parser.add_argument("--canonicalize-urls-only", action="store_true")
    args = parser.parse_args()
    if args.canonicalize_urls_only and args.check_only:
        raise ValueError(
            "--canonicalize-urls-only cannot be combined with --check-only"
        )
    ROOT = Path(__file__).resolve().parents[1]
    groups = (
        [
            int(d["group"])
            for d in json.loads(Path(args.definitions).read_text(encoding="utf8"))
        ]
        if args.definitions
        else [int(g) for g in args.groups.split(",")]
    )
    for group in groups:
        if args.canonicalize_urls_only:
            continue
        if not (
            args.underfire_art_only or args.underfire_audio_only or args.emotion_audio_only
        ):
            source = ROOT / "public/private/ba-jp" / str(group) / "source.json"
            declared_sound_gaps = {
                (gap["row"], gap["value"])
                for gap in source_gaps(group)
                if gap["field"] == "Sound"
            }
            rows = json.loads(source.read_text(encoding="utf8"))["content"]
            _BATCH_SOUND_NAMES.update(emotion_sound_names(rows))
            _BATCH_SOUND_NAMES.update(
                r.get("Sound")
                for i, r in enumerate(rows)
                if r.get("Sound") and (i, r["Sound"]) not in declared_sound_gaps
            )
    for group in groups:
        if args.emotion_audio_only:
            if args.check_only:
                raise ValueError(
                    "--emotion-audio-only cannot be combined with --check-only"
                )
            update_emotion_audio(group)
            continue
        if args.canonicalize_urls_only:
            path = ROOT / "public/private/ba-jp" / str(group) / "assets.json"
            manifest = json.loads(path.read_text(encoding="utf8"))
            updated = canonicalize_manifest_urls(manifest, ROOT / "public")
            if updated != manifest:
                partial = path.with_suffix(".json.partial")
                partial.write_text(
                    json.dumps(updated, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf8",
                )
                partial.replace(path)
                print("Canonicalized physical media URLs", group)
            continue
        if args.underfire_art_only or args.underfire_audio_only:
            if args.check_only:
                raise ValueError(
                    "--underfire-art-only cannot be combined with --check-only"
                )
            update_underfire_art(int(group), audio_only=args.underfire_audio_only)
        else:
            package(int(group), check_only=args.check_only)
