"""Verify recovered Cubism files, model references, expressions and event coverage."""
import hashlib
import json
from pathlib import Path
import struct
import argparse


def main():
    project = Path(__file__).resolve().parent.parent
    public = project / "public"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", nargs="?", type=Path, default=public / "private/gfl2-event/characters/manifest.json")
    manifest = json.loads(parser.parse_args().manifest.read_text("utf8"))
    files = {item["url"]: item for item in manifest["files"]}
    assert len(files) == len(manifest["files"]), "Duplicate file records"
    for url, record in files.items():
        path = (public / url.lstrip("/")).resolve()
        assert path.is_relative_to(public.resolve()), "Invalid public file path"
        data = path.read_bytes()
        assert len(data) == record["bytes"], url
        assert hashlib.sha256(data).hexdigest() == record["sha256"], url
        assert record["source"].get("segmentSha256"), "Missing original segment provenance: " + url
        if url.endswith(".moc3"):
            assert data[:4] == b"MOC3", url
        if url.endswith(".png"):
            assert data[:8] == b"\x89PNG\r\n\x1a\n", url
            width, height = struct.unpack_from(">II", data, 16)
            assert width > 0 and height > 0, url
        if url.endswith('.webp'):
            assert data[:4] == b'RIFF' and data[8:12] == b'WEBP', url
        if url.endswith(".json"):
            json.loads(data)

    model_urls = set()
    uses = 0
    expressions = 0
    for label, character in manifest["characters"].items():
        if character["kind"] == "sound-only":
            continue
        uses += character["usageCount"]
        for asset in [character, *([character["female"]] if "female" in character else [])]:
            model_urls.add(asset["url"])
            assert all(url in files for url in asset["files"]), label
            model_path = public / asset["url"].lstrip("/")
            model = json.loads(model_path.read_text("utf8"))
            references = model["FileReferences"]
            linked = [references["Moc"], *references.get("Textures", [])]
            linked.extend(references[key] for key in ["Physics", "Pose", "DisplayInfo", "UserData"] if key in references)
            linked.extend(expression["File"] for expression in references.get("Expressions", []))
            linked.extend(motion["File"] for group in references.get("Motions", {}).values() for motion in group)
            for relative in linked:
                file_path = ((public / relative.lstrip('/')) if relative.startswith('/') else (model_path.parent / relative)).resolve()
                assert file_path.is_relative_to(public.resolve()), relative
                url = "/" + file_path.relative_to(public.resolve()).as_posix()
                assert url in files, "Untracked model reference: " + url
            assert len(references.get("Expressions", [])) == len(asset["expressions"]), label
            expressions += len(asset["expressions"])
        for pattern, variant in character["variants"].items():
            if variant["expressionName"]:
                variant_model = json.loads((public / variant["url"].lstrip('/')).read_text('utf8'))
                names = [item["Name"] for item in variant_model['FileReferences'].get('Expressions', [])]
                assert variant["expressionName"] == names[variant["expressionIndex"]], (label, pattern)

    assert len(manifest["characters"]) == manifest.get("coverage", {}).get("labels", 53), "Incomplete event Character label coverage"
    assert len(model_urls) == manifest["modelCount"], "Incomplete model manifest"
    assert all(item.get("pattern") for item in manifest["unresolved"]), "Failed character asset extraction"
    print(f"Verified {len(manifest['characters'])} labels, {len(model_urls)} models, {len(files)} hashed files, {expressions} expression entries; {len(manifest['unresolved'])} source pattern inconsistencies retained.")


if __name__ == "__main__":
    main()
