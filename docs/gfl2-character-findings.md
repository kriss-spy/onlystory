# 金翅雀与橄榄枝 character recovery

The complete event's original character models are recovered into
`public/private/gfl2-event/characters/`. The asset manifest covers all 53
`Character` command labels from A33001–A33030: 52 visual labels and the
intentional `SoundOnly_02` label. Two labels share a visual model, and both
commander labels have separate female models. In total there are 53 distinct
models, 640 files and 116,824,179 bytes (111.4 MiB).

These findings come from offline cache parsing and decompilation. This recovery
did not launch or change the game, contact game services, or use substitute art.
Browser rendering is implemented and checked separately by the story renderer.

## Reproduce

```powershell
python scripts/gfl2-characters.py
python scripts/gfl2-characters-verify.py
```

The extractor reads the installation selected by `GF2_GAME_ROOT` (default
`D:/Program Files/GF2Exilium`) and the recovered prototype selected by
`ONLYSTORY_GFL2_PROTOTYPE` (default the sibling `onlystory-gfl2/prototype`).
It uses that prototype's `resource_mapping/resolve_assets.py` and its verified
catalogue/GFF parser, plus the existing local UnityPy library under the game's
`_reverse_engineering/dorm_legs_feet/assets/python_lib` directory. These are
development dependencies for extracting private assets; browser playback does
not need the installation or Python.

For a diagnostic subset, use a separate output directory, for example
`python scripts/gfl2-characters.py --only 盖娅 --output private-review/gaia-check`.
The output manifest describes that subset, so do not overwrite the complete
public manifest with a diagnostic run.

Verification checks every output hash and original bundle provenance, PNG and
MOC3 headers, all model3 file references, expression indices, all 53 labels, and
the absence of failed character extractions. It passed against the recovered
640-file collection.

## What the characters actually contain

The character settings in
`../onlystory-gfl2/current_book_probe/Adv.setting.json` use `FileType: Custom`
for visual characters. `Utage.AdvBootSetting.BootInit` sets their root to
`ConfigPrefab`, so the path for the first character command is:

```text
A33001 row 45: Character 盖娅 Idle,0 中 ...
Assets/ConfigPrefab/AVG/27luoleilai/Character/CHA_Gaia_NPC_01.prefab
```

Its actual Unity prefab has a Cubism model component with `_moc`, an expression
controller, a fade-motion list, and `ArtMesh` drawables with atlas references.
The `_moc` points to a `CubismMoc` MonoBehaviour whose `_bytes` start with `MOC3`.
The source is Live2D Cubism, rather than Spine or a 3D character.

The same extraction verifies a MOC3 model for every visual label. Two visual
labels use moc version 1; the others use version 3. Original model3 metadata,
motion3 JSON and display information remain in the cache as TextAssets. Atlas
textures decode to PNG with alpha. The extractor walks only a selected
prefab's transform hierarchy to obtain its drawable texture references:
matching a global `texture_00` name would select other characters' atlases.

Each file record includes its Unity object path ID as a **string** (the values
exceed JavaScript's safe integer range), serialized file, logical and physical
bundle names, packed segment offset/length, original segment hash, output hash,
and conversion description.

## Expressions and motion

Script `Arg2` can contain a sequence such as `Idle,0|Happy,0.5`. Decompiling
`Utage.AdvGraphicObjectLive2D.SetExpression` shows that the game derives the
expression index from the matching character-setting row's position relative
to that character's first setting row. The extractor uses that order directly.
It does not derive a pattern from an English filename: several filenames have
spelling differences from the script's patterns.

The current prefab's `CubismExpressionObjects` list is authoritative. Some
original model3 JSON files omit that list even though the prefab contains it;
for example, the first-generation commander has five current expression
objects and no expressions in the old model3 file. The generated model3 JSON
uses the prefab's list and order.

Current expression objects also contain blend settings that can differ from
their retained raw exp3 TextAssets. The shipped enum `LLLBNPFCPPJ` is
`Override=0`, `Additive=1`, `Multiply=2`. The extractor converts those to Web
exp3 `Overwrite`, `Add`, and `Multiply`, preserving the serialized parameter
values and fade durations. This avoids applying old additive data where the
installed game uses replacement values.

Original mouth-motion JSON is included when the source model references it.
No invented idle/breathing or mouse-following motion is added by extraction.
The manifest also retains eye-blink and lip-sync configuration for the renderer.
Recovering those settings does not establish that automatic blinking, lip
sync, timing, clipping, or layering matches the native Unity player; those
behaviors need their own runtime checks.

## Manifest interface

`manifest.characters` is keyed by the exact script `Arg1`, including punctuation.
A visual entry contains:

- `kind: live2d`, `url` pointing to a local `model.model3.json`, `mocVersion`,
  source `prefab`, `prefabScale`, `expressions`, and `files`.
- `variants[pattern]` with `expressionIndex`, `expressionName`, model `url`,
  `sourceX`, `sourceY`, `sourceScale`, `maskHeight`, `renderRect`,
  `renderTextureScale`, `eyeBlink`, and `lipSynch`.
- `female` with the alternative model and its own `files`, where the setting
  has a `FileName1` path. Both commander labels supply this alternative.

The top-level `files` array contains hash/size/provenance records for all model
files. A chapter importer must include the base **and** female file lists for
each referenced label if both text variants should work offline. `SoundOnly_02`
has `kind: sound-only` and requires no character picture.

Gaia's original settings are X=0, Y=251, Scale=0.29, RenderRect=`0,0,800,800`,
RenderTextureScale=3 and MaskHeight=0.15. The prefab transform scales X and Y
by 1300. These values are retained rather than replaced with arbitrary portrait
sizes. Camera and layer transforms belong to the scene-command interpreter.

## Retained source inconsistency

The event requests `布瑟尔` with pattern `Think`, but the recovered character
settings define only `Idle` for that label. The complete model is available;
the missing expression remains recorded in `manifest.unresolved`. A renderer
can keep the existing neutral character visible while reporting the unavailable
pattern. It must not claim to have recovered an original `Think` expression.
This is the only unresolved entry after complete extraction.
