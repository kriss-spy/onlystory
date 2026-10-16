"""Recover the event's original Cubism models from a user's installed GFL2 cache.

Read-only against the installation and prototype evidence. Requires UnityPy from
the existing local analysis Python library, and the verified catalogue resolver
in ONLYSTORY_GFL2_PROTOTYPE's sibling resource_mapping directory. No game launch,
account access, downloads, placeholder pictures, or source asset edits.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import traceback
from gfl2_grid import grid_rows


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    project = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game-root", type=Path, default=Path(os.environ.get("GF2_GAME_ROOT", "D:/Program Files/GF2Exilium")))
    parser.add_argument("--prototype", type=Path, default=Path(os.environ.get("ONLYSTORY_GFL2_PROTOTYPE", project.parent / "onlystory-gfl2/prototype")))
    parser.add_argument("--output", type=Path, default=project / "public/private/gfl2-event/characters")
    parser.add_argument("--only", help="Optional exact Character labels separated by | for focused recovery")
    parser.add_argument("--books", type=Path, help="Directory of recovered original book JSON")
    parser.add_argument("--book-glob", default="A330*.book.json")
    parser.add_argument("--url-prefix", default="/private/gfl2-event/characters/")
    args = parser.parse_args()
    os.environ["GF2_GAME_ROOT"] = str(args.game_root)
    evidence = args.prototype.resolve().parent
    sys.path.insert(0, str(args.game_root / "_reverse_engineering/dorm_legs_feet/assets/python_lib"))
    sys.path.insert(0, str(evidence / "resource_mapping"))
    import UnityPy
    import resolve_assets

    bundles = args.game_root / "GF2 Game/GF2_Exilium_Data/LocalCache/Data/AssetBundles_Windows"
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    settings_file = evidence / "current_book_probe/Adv.setting.json"
    setting = json.loads(settings_file.read_text("utf8"))["settingList"][0]
    header = setting["rows"][0]["strings"]
    settings = [dict(zip(header, row["strings"])) for row in setting["rows"][1:] if row["strings"] and not row["isEmpty"] and not row["isCommentOut"]]
    used = {}
    for book in sorted((args.books or evidence / "event_books").glob(args.book_glob)):
        for row in grid_rows(json.loads(book.read_text("utf8"))["importGridList"][0]):
            if row.get('Command') == 'Character':
                used.setdefault(row['Arg1'], []).append({"script": book.stem.removesuffix(".book"), "row": row["sourceRow"], "pattern": row.get('Arg2', '')})
    if args.only:
        used = {label: used[label] for label in args.only.split('|')}

    manifest = {"version": 1, "kind": "gfl2-cubism-assets", "characters": {}, "files": [], "unresolved": [], "source": {"settingsSha256": sha(settings_file.read_bytes()), "catalogue": str(resolve_assets.ROOT / "GF2 Game/GF2_Exilium_Data/LocalCache/Data/AssetBundles_Windows/catalog_main_28495.bin")}, "limitations": ["Cubism assets and script expression mapping are recovered offline. Web playback and original Unity rendering are separate verification steps."]}
    if not used:
        raise ValueError("No original Character commands matched the selected books")
    manifest["coverage"] = {"labels": len(used), "commands": sum(len(uses) for uses in used.values())}
    exported = {}
    file_records = {}

    def recover(prefab):
        if prefab in exported:
            return exported[prefab]
        asset_path = "Assets/ConfigPrefab/" + prefab
        resolved = resolve_assets.resolve_path(asset_path)
        if not resolved:
            raise ValueError("No catalogue mapping: " + asset_path)
        location = resolved["locations"][0]
        env = UnityPy.Environment()
        provenance = {}
        for dependency in location["dependencies"]:
            physical = dependency["physical"]
            if not physical:
                raise ValueError("No physical bundle record: " + dependency["primary_key"])
            with (bundles / physical["bundle"]).open("rb") as stream:
                stream.seek(physical["segment_offset"])
                raw = stream.read(physical["segment_size"] or -1)
            expected = b"UnityFS\0\0\0\0\7" + b"5.x."
            key = bytes(a ^ b for a, b in zip(raw, expected))
            decoded = bytes(value ^ key[index % 16] for index, value in enumerate(raw[:32768])) + raw[32768:]
            if not decoded.startswith(b"UnityFS\0"):
                raise ValueError("Unsupported UnityFS segment")
            loaded = env.load_file(decoded, name=dependency["primary_key"])
            for name in loaded.files:
                provenance[name.lower()] = {"logicalBundle": dependency["primary_key"], "physicalBundle": physical["bundle"], "segmentOffset": physical["segment_offset"], "segmentBytes": len(raw), "segmentSha256": sha(raw)}

        root = env.container[location["internal_id"]]
        root_file = root.assetsfile

        def dereference(pointer, owner=root_file):
            if not pointer["m_PathID"]:
                return None
            assets_file = owner if not pointer["m_FileID"] else env.find_file(owner.externals[pointer["m_FileID"] - 1].path)
            return assets_file.objects[pointer["m_PathID"]]

        components = [dereference(item["component"]) for item in root.read_typetree()["m_Component"]]
        trees = [(obj, obj.read_typetree()) for obj in components]
        model_component = next((item for item in trees if "_moc" in item[1]), None)
        if not model_component:
            raise ValueError("Character prefab has no Cubism moc component: " + asset_path)
        moc = dereference(model_component[1]["_moc"])
        moc_tree = moc.read_typetree()
        moc_bytes = bytes(moc_tree["_bytes"])
        if moc_bytes[:4] != b"MOC3":
            raise ValueError("Unsupported Cubism moc header")

        # File names are not globally unique (every character uses texture_00).
        # Only inspect drawable texture references under this prefab's root.
        textures = {}
        all_components = []

        def visit(transform):
            tree = transform.read_typetree()
            game_object = dereference(tree["m_GameObject"], transform.assets_file)
            for item in game_object.read_typetree()["m_Component"]:
                obj = dereference(item["component"], game_object.assets_file)
                data = obj.read_typetree()
                all_components.append((obj, data))
                if "_mainTexture" in data:
                    texture = dereference(data["_mainTexture"], obj.assets_file)
                    if texture:
                        image = texture.read()
                        previous = textures.get(image.m_Name.lower())
                        if previous and previous.path_id != texture.path_id:
                            raise ValueError("Ambiguous drawable atlas: " + image.m_Name)
                        textures[image.m_Name.lower()] = texture
            for child in tree["m_Children"]:
                visit(dereference(child, transform.assets_file))

        visit(next(obj for obj in components if obj.type.name == "Transform"))
        model_names = {moc_tree["m_Name"].lower() + ".model3", Path(prefab).stem.lower() + ".model3"}
        model_sources = [obj for obj in moc.assets_file.objects.values() if obj.type.name == "TextAsset" and obj.read().m_Name.lower() in model_names]
        if not model_sources:
            model_sources = [obj for obj in env.objects if obj.type.name == "TextAsset" and obj.read().m_Name.lower() in model_names]
        if len(model_sources) != 1:
            candidates = [obj.read().m_Name for obj in env.objects if obj.type.name == "TextAsset" and ".model3" in obj.read().m_Name.lower()]
            raise ValueError("Expected one original model3 JSON next to moc: " + prefab + "; moc=" + moc_tree["m_Name"] + "; candidates=" + str(candidates))
        model_source = model_sources[0]
        original_model = json.loads(model_source.read().m_Script)
        model = json.loads(json.dumps(original_model))
        slug = Path(prefab).stem
        folder = output / slug
        folder.mkdir(exist_ok=True)
        files = []

        def write(relative_path, data, source_obj, conversion):
            destination = (folder / relative_path).resolve()
            if not destination.is_relative_to(folder.resolve()):
                raise ValueError("Unexpected model relative path")
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
            url = args.url_prefix.rstrip('/') + '/' + slug + "/" + Path(relative_path).as_posix()
            record = {"url": url, "bytes": len(data), "sha256": sha(data), "source": {"unityPathId": str(source_obj.path_id), "unityType": source_obj.type.name, "serializedFile": source_obj.assets_file.name, "conversion": conversion, **provenance.get(source_obj.assets_file.name.lower(), {})}}
            file_records[url] = record
            files.append(url)
            return url

        references = model["FileReferences"]
        write(references["Moc"], moc_bytes, moc, "CubismMoc._bytes, unchanged")
        from io import BytesIO
        for name in references.get("Textures", []):
            obj = textures[Path(name).stem.lower()]
            image_bytes = BytesIO()
            obj.read().image.save(image_bytes, format="PNG")
            write(name, image_bytes.getvalue(), obj, "Unity Texture2D decoded to PNG by UnityPy; original alpha retained")

        # Use the prefab's own expression-list order; English expression file
        # names contain typos and are not a reliable source of script patterns.
        expression_names = []
        expression_objects = []
        source_files = [moc.assets_file]
        for obj, tree in trees:
            if "ExpressionsList" in tree:
                expr_list = dereference(tree["ExpressionsList"], obj.assets_file)
                for pointer in expr_list.read_typetree()["CubismExpressionObjects"] if expr_list else []:
                    expression = dereference(pointer, expr_list.assets_file)
                    if not expression:
                        continue
                    expression_names.append(expression.read_typetree()["m_Name"])
                    expression_objects.append(expression)
                    source_files.append(expression.assets_file)
            if "CubismFadeMotionList" in tree:
                motion_list = dereference(tree["CubismFadeMotionList"], obj.assets_file)
                for pointer in motion_list.read_typetree()["CubismFadeMotionObjects"] if motion_list else []:
                    motion_object = dereference(pointer, motion_list.assets_file)
                    if motion_object:
                        source_files.append(motion_object.assets_file)
            for animation in tree.get("animationData", []):
                clip = dereference(animation["clip"], obj.assets_file)
                if clip:
                    source_files.append(clip.assets_file)

        text_assets = {}
        for assets_file in source_files:
            for obj in assets_file.objects.values():
                if obj.type.name == "TextAsset":
                    text_assets.setdefault(obj.read().m_Name.lower(), obj)

        def write_json_source(name):
            asset_name = Path(name).name.removesuffix(".json").lower()
            obj = text_assets.get(asset_name)
            if not obj:
                raise ValueError("Missing original JSON: " + name)
            data = obj.read().m_Script
            if isinstance(data, str):
                data = data.encode("utf8", "surrogateescape")
            json.loads(data)
            return write(name, data, obj, "Original JSON TextAsset, unchanged UTF-8 content")

        for key in ("DisplayInfo", "Physics", "Pose", "UserData"):
            if key in references:
                write_json_source(references[key])
        if expression_objects:
            references["Expressions"] = []
            for obj in expression_objects:
                tree = obj.read_typetree()
                name = tree["m_Name"]
                path = "expressions/" + name + ".json"
                expression = {"Type": tree["Type"], "FadeInTime": tree["FadeInTime"], "FadeOutTime": tree["FadeOutTime"], "Parameters": [{"Id": param["Id"], "Value": param["Value"], "Blend": {0: "Overwrite", 1: "Add", 2: "Multiply"}[param["Blend"]]} for param in tree["Parameters"]]}
                write(path, (json.dumps(expression, ensure_ascii=False, indent=2) + "\n").encode("utf8"), obj, "Current prefab CubismExpressionData to exp3 JSON; LLLBNPFCPPJ 0 Override=Overwrite, 1 Additive=Add, 2 Multiply")
                references["Expressions"].append({"Name": name, "File": path})
        else:
            for expression in references.get("Expressions", []):
                write_json_source(expression["File"])
        if not expression_names:
            expression_names = [Path(expression["File"]).name.removesuffix(".json") for expression in references.get("Expressions", [])]
        missing_motions = []
        for group_name, group in references.get("Motions", {}).items():
            available = []
            for motion in group:
                asset_name = Path(motion["File"]).name.removesuffix(".json").lower()
                if asset_name not in text_assets:
                    missing_motions.append(motion["File"])
                    continue
                write_json_source(motion["File"])
                available.append(motion)
            references["Motions"][group_name] = available
        model_url = write("model.model3.json", (json.dumps(model, ensure_ascii=False, indent=2) + "\n").encode("utf8"), model_source, "Original model3 JSON with authoritative current-prefab expression list; unavailable optional motion references omitted and documented")
        root_transform = next(tree for obj, tree in trees if obj.type.name == "Transform")
        result = {"kind": "live2d", "url": model_url, "prefab": asset_path, "mocVersion": moc_bytes[4], "prefabScale": root_transform["m_LocalScale"], "expressions": expression_names, "files": files}
        if missing_motions:
            result["limitations"] = ["Original model3 references motions not present as TextAssets in its resolved prefab dependencies; those optional motion references are omitted: " + ", ".join(missing_motions)]
        exported[prefab] = result
        return result

    for index, (label, uses) in enumerate(used.items(), 1):
        rows = [row for row in settings if row["CharacterName"] == label]
        try:
            if not rows:
                raise ValueError("No character setting")
            first = rows[0]
            if first.get("FileType") == "SoundOnly":
                manifest["characters"][label] = {"kind": "sound-only", "prefab": first["FileName"], "variants": {}}
                continue
            variants = {}
            for ordinal, row in enumerate(rows):
                pattern = row.get("Pattern", "")
                if pattern in variants:
                    raise ValueError("Duplicate pattern: " + pattern)
                asset = recover(row["FileName"])
                expression = asset["expressions"][ordinal] if ordinal < len(asset["expressions"]) else None
                variants[pattern] = {"expressionIndex": ordinal, "expressionName": expression, "url": asset["url"], "sourceScale": float(row.get("Scale") or 1), "sourceX": float(row.get("X") or 0), "sourceY": float(row.get("Y") or 0), "maskHeight": float(row.get("MaskHeight") or 0), "renderRect": row.get("RenderRect", ""), "renderTextureScale": float(row.get("RenderTextureScale") or 1), "eyeBlink": row.get("EyeBlink", ""), "lipSynch": row.get("LipSynch", "")}
            character = {**recover(first["FileName"]), "variants": variants, "firstUse": uses[0], "usageCount": len(uses)}
            female_path = first.get("FileName1")
            if female_path:
                female = recover(female_path)
                character["female"] = female
            requested = {part.split(",")[0] for use in uses for part in use["pattern"].split("|")}
            for pattern in requested:
                if pattern and (pattern not in variants or (variants[pattern]["expressionName"] is None and character["expressions"])):
                    manifest["unresolved"].append({"label": label, "pattern": pattern, "reason": "No setting/expression ordinal mapping"})
            manifest["characters"][label] = character
            print(f"{index}/{len(used)} {label}: {len(variants)} patterns, {len(character['files'])} original files", flush=True)
        except Exception as error:
            manifest["unresolved"].append({"label": label, "reason": str(error)})
            print(f"{index}/{len(used)} FAILED {label}: {error}", flush=True)
            if args.only:
                traceback.print_exc()
    manifest["files"] = list(file_records.values())
    manifest["modelCount"] = len(exported)
    manifest["bytes"] = sum(record["bytes"] for record in manifest["files"])
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(f"Recovered {len(manifest['characters'])}/{len(used)} labels, {len(exported)} models, {manifest['bytes']} bytes; {len(manifest['unresolved'])} unresolved entries.")
    return 1 if any("pattern" not in item for item in manifest["unresolved"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
