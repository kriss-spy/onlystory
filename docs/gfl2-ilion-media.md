# 伊利昂之围 media recovery

The import uses the 101 original recovered books in `.cache/gfl2-ilion/books`. Their source segment identities are retained in `.cache/gfl2-ilion/books-provenance.json`. Assets are read from the user's installed Windows game cache without running or modifying the game. This is ordinary offline format parsing and managed decompilation; these findings have no REA Evidence IDs.

## Reproduce

```powershell
python scripts/gfl2-media.py --books .cache/gfl2-ilion/books --book-glob '*.book.json' --output public/private/gfl2-ilion/media --cache .cache/gfl2-ilion-media --url-prefix /private/gfl2-ilion/media/
python scripts/gfl2-characters.py --books .cache/gfl2-ilion/books --book-glob '*.book.json' --output public/private/gfl2-ilion/characters --url-prefix /private/gfl2-ilion/characters/
python scripts/gfl2-videos.py --books .cache/gfl2-ilion/books --output public/private/gfl2-ilion/videos --url-prefix /private/gfl2-ilion/videos/
python scripts/gfl2-video-subtitles.py public/private/gfl2-ilion/videos/manifest.json
node scripts/gfl2-media-verify.mjs public/private/gfl2-ilion/media/manifest.json
python scripts/gfl2-characters-verify.py public/private/gfl2-ilion/characters/manifest.json
```

The existing 金翅雀与橄榄枝 extraction defaults and output directories remain separate. Manifest entries retain original labels, book uses, source resource paths, Unity object IDs or CRI cue/waveform identities, and source/output hashes.

## Graphics and characters

The book audit requests 151 background labels and 6 additional sprite labels. Original flat images are decoded at their source resolution and exported as lossless WebP. Most are 2048 × 1024. Solid black Custom2DBg prefabs retain the existing explicit black representation.

The character manifest contains 180 labels, 170 original Cubism models, 2,260 hashed files, 1,199 expression entries and 437,458,390 bytes. Atlas PNGs preserve original resolution and alpha. The verifier checks file hashes, original segment provenance, model references, moc signatures and each variant's own model expression order.

Three models reference optional motion JSON that is absent from their resolved prefab dependencies: 男性路人戴帽子, 男性路人 and 佐伊. Their original moc, atlases and expressions are recovered; unavailable motion references are removed from the browser model JSON and recorded as model limitations. No replacement motion is fabricated.

The original settings for 奇洛薇格涅托 refer to different prefabs across patterns. Four requested patterns have no corresponding ordinal expression on the specified model: Proud, Smile, Surprised and Pain. These remain explicit source inconsistencies in the manifest. Static images or unrelated expressions are not substituted.

The sole unresolved graphic is `地图`, `Assets/ConfigPrefab/AVG/0ob/Item/ITEM_Map_01.prefab`. It is an animated holographic Custom2DBg prefab with effects, materials and no direct Texture2D catalogue location. Four Sprite commands use it: M23005 row 424, M23012 row 140, and M24009 rows 204 and 341. The bounded prefab inventory is `.cache/gfl2-ilion/map-prefab.json`. Its effects are not represented by an unrelated map image. The verifier permits only this exact documented graphic limitation and the exact missing sound cue below; any other missing media fails validation.

`BG_None_Hotelmonitoring_Day_01`, also used by CustomCharacter, has an original Texture setting and is successfully recovered as a 2048 × 1024 image; it has no Character setting.

## Sound

The audit requests 77 BGM and 593 sound-effect labels. The exporter follows each original ACB cue to its reachable waveforms and retains loop points and alternative/layer distinctions. HCA is decoded with the previously pinned vgmstream r2117 clHCA binary and original game/AWB keys. FFmpeg transcodes the resulting float WAV to Vorbis quality 6. FFmpeg native HCA decoding is excluded because it previously produced distorted audio for this installation.

The final media manifest recovers all 77 BGM and 592 of the 593 sound cues. Together with the graphics, it inventories 1,135 hashed files and 640,674,558 bytes. The missing sound is label `2021001`, requested once at M23015 row 207. Its original setting requests cue `BGE_Act_Female_36` from `BGE_AVG_Special_Somi`, but the installed ACB's 18-name CueNameTable contains Female_37 through Female_41 and no Female_36. This remains an explicit original-data inconsistency; no other sound is substituted.

Three recovered BGM were compared with independent pinned vgmstream PCM decodes: ten-second sample correlations were 0.9975–0.9994 with 23.0–29.2 dB signal-to-error ratios. All samples were finite. One source/Vorbis peak exceeds unity, so the existing runtime compressor remains necessary. Results are retained in `.cache/gfl2-ilion-media/audio-quality-check.json`.

CRI random scheduling, pitch and original per-waveform gain automation remain approximations, as in the earlier event importer. Recovered waveform alternatives are not mixed together unless they are original loop beds.

## Movies

Installed VideoData joins the four original Video command IDs to these assets:

| ID    | Original file under Assets/Cutscene/Video/PC | Duration    |
| ----- | -------------------------------------------- | ----------- |
| 12201 | AVG/TIME_Chapter_22_01.usm                   | 97.15 s     |
| 12202 | AVG/TIME_Chapter_22_02.usm                   | 8.316667 s  |
| 12301 | AVG/TIME_Chapter_23_01.usm                   | 49.716667 s |
| 12401 | AVG/TIME_Chapter_24_01.usm                   | 34.734708 s |

All four male/female table paths are identical. Original 2560 × 1440 H264 picture packets are copied into browser MP4 without picture re-encoding. Each original USM contains three ADX audio streams. The verified game setting maps zero-based tracks 0 to Chinese, 1 to Japanese and 2 to Korean. The exporter now creates separate Chinese and Japanese single-audio MP4s using pinned vgmstream decoding and AAC 256 kbit/s encoding. The eight active movies total 624,896,394 bytes. Existing Chinese WebVTT subtitles are shared between voice choices. Original multi-track URLs remain on disk for compatibility.

The first two seconds of decoded frame MD5s match the originals for all eight outputs. See [video voice evidence](gfl2-video-voice-languages.md) for the exact managed-code mapping and source hashes.

USM SBT channel 0 contains numeric subtitle IDs. The managed player explicitly joins those IDs to VideoSubtitleData and then the current localized language table. The subtitle extractor follows that same join to LangPackageTableCnData and preserves the original per-cue start/duration. Movies 12201 and 12301 each contain four such cues, exported as Chinese WebVTT and indexed with hashes in the video manifest. Movies 12202 and 12401 contain no matching subtitle cues. A separate SBT channel carries Japanese text; it is not mistaken for Chinese localization.
