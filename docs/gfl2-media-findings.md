# 金翅雀与橄榄枝 media recovery

All original background, music and sound-effect references in A33001 through A33030 now resolve to local media. This covers all 24 sections in the event index. The import matches original script labels to original resource tables; it does not assign images by theme or search for similar filenames.

| Original commands | Distinct labels | Recovered representation                                       |
| ----------------- | --------------: | -------------------------------------------------------------- |
| `Bg`              |              63 | 62 original textures and one explicit black prefab replacement |
| `Sprite`          |               1 | `BG_None_Black_02`, a second label for the same black prefab   |
| `Bgm`             |              46 | Original decoded music, including all original loop regions    |
| `Se`              |             232 | Original decoded sound effects and ambience                    |

The output contains 353 WebP and OGG files, totaling 284,871,539 bytes. This includes 62 lossless background images and 291 audio waveform files. The manifest has 64 background/prefab entries and 278 audio cue entries. There are no unresolved resource labels in this scope.

## Resource evidence

The installed game is `D:/Program Files/GF2Exilium`. All parsing is offline. The extraction does not run the game, alter its configuration, fetch assets, or contact an account service.

The sibling prototype already contains the original 30 book exports, `current_book_probe/Adv.setting.json`, and parsers corroborated against decoded game resource-loader code. The media pipeline reuses those parsers. This pass used ordinary Python parsing and UnityPy, not a connected REA provider, so the provenance consists of file identities and serialized references rather than REA Evidence IDs.

For a background, the complete lookup is:

1. The original book's `Bg.Arg1` or `Sprite.Arg1` selects `Adv.setting`'s Texture row.
2. The row supplies `FileName`, `FileName1`, file type and source scale. Every background used here has identical nonempty `FileName` and `FileName1`, so the game account's alternative-file setting makes no difference.
3. The original loader prefixes images with `Assets/ArtsResource/` and prefabs with `Assets/ConfigPrefab/`.
4. The UTF-16LE MD5 resource key resolves through the current Addressables catalogue and physical GFF packing index.
5. The resolved Unity container entry supplies the texture or its Sprite subasset. For Sprite entries, extraction follows the serialized `m_RD.texture` pointer. It does not pick a texture by name.
6. UnityPy decodes the original texture and exports lossless WebP.

Each manifest entry retains the original setting row, source uses, resource path, catalogue key, internal asset ID, Sprite/Texture path IDs, physical segment location, segment SHA-256 and output SHA-256. The original layer orders are available as `layerOrders`.

`BG_None_Black_01` and `BG_None_Black_02` both reference `AVG/0ob/Background/BG_None_Black_01.prefab`. The browser uses a documented solid `#000000` replacement for this custom prefab. The image labels `黑` and `白` use their actual original textures. The black prefab's Unity shader behavior is not reproduced.

## Audio evidence and playback limits

The original Sound setting row maps each label to its `CueSheet` and cue `FileName`. The extractor reads the installed loose ACB/AWB files under `Assets/ArtsResource/Audio/CriWare/`, then follows the CRI cue, sequence, track-event, synth and waveform references.

vgmstream r2117 decodes the original HCA data using the game loader's recovered key and the original AWB subkey. Its clHCA decoder writes float WAV. FFmpeg then trims the WAV to `WaveformTable.NumSamples` and writes Vorbis quality 6 for browser playback. Native FFmpeg HCA decoding is excluded. FFprobe checks every newly converted output. Original HCA payloads, table rows, conversion metadata and hashes remain in the ignored `.cache/gfl2-media/` directory.

All 46 music cues reach one waveform each. All retain `loopStart` and `loopEnd` from their original waveform extension rows. For example, `黄区荒凉废墟` maps to `BGM_AVG_DesolateRuins`, whose intro ends at 6.4 seconds and loop ends at 134.400021 seconds. WebAudio can preserve that intro and loop region.

Five sound cues reach multiple waveforms. The manifest retains every reachable waveform and labels their playback approximation:

| Script label | Original cue                | Browser representation                                      |
| ------------ | --------------------------- | ----------------------------------------------------------- |
| `2010121`    | `BGE_Rep_Storm_02`          | Two original loop layers, six retained thunder alternatives |
| `2010157`    | `BGE_Rep_Green_City_Day_01` | One original loop layer, three retained alternatives        |
| `2033004`    | `BGE_ElectricalHum_01`      | First one-shot variant, one retained alternative            |
| `2010010`    | `BGE_Drink_01`              | First one-shot variant, one retained alternative            |
| `2022023`    | `BGE_Footstep_Female_39`    | First one-shot variant, one retained alternative            |

CRI sequence timing, random selection, per-track gain and pitch commands are preserved in `.cache/gfl2-media/audio-metadata/` but are not executed. Loop beds play together; one-shot alternatives are not mixed simultaneously. This is original media playback with disclosed scheduling limits, not full CRI runtime emulation.

## Rebuilding and verification

The Windows development decoder is the official [vgmstream r2117 win64 release](https://github.com/vgmstream/vgmstream/releases/download/r2117/vgmstream-win64.zip). The downloaded archive SHA-256 is `6c4a8a3813864fefed081bbd337dbc0ad93bf88e0b92f5db98d7ab258b22dc6c`. Its `vgmstream-cli.exe` SHA-256 is `29df08c557ada8269c92a6abfe3886ad2f65849b0b26ba78a0819b363bbc5b85`. Extract it to `.cache/gfl2-media/tools/vgmstream-r2117/`, or set `ONLYSTORY_VGMSTREAM` to that same executable elsewhere. The extractor checks its identity before decoding. It does not install a system-wide tool.

Run from the project directory:

```powershell
python scripts/gfl2-media.py
node scripts/gfl2-media-verify.mjs
python scripts/gfl2-media-audio-check.py
```

The default prototype is the sibling `onlystory-gfl2/prototype` directory. `ONLYSTORY_GFL2_PROTOTYPE` overrides it, matching the existing importer. `GF2_GAME_ROOT` overrides the installed game directory. Python needs UnityPy and its texture decoders; this machine already has them in the game's existing analysis environment. The audio quality check also needs NumPy. FFmpeg and FFprobe must be on PATH.

`--backgrounds-only` runs just background extraction and writes a background-only manifest. `--refresh` regenerates media rather than reusing verified caches. Do not run the background-only mode after the full import unless replacing the manifest is intended.

Runtime output is `public/private/gfl2-event/media/`, already covered by the project's `public/private/` ignore rule. It contains the WebP/OGG files and `manifest.json`, which supplies absolute browser URLs under `/private/gfl2-event/media/`. Each audio filename contains its content digest, so an existing offline cache cannot keep serving a different decode under the same URL. Raw HCA files, cache sidecars and full CRI metadata stay in `.cache/gfl2-media/`, outside Vite's public directory and production bundles. Runtime import should copy the asset maps it needs for each section and avoid embedding the entire provenance ledger in every episode.

Verification checks every declared label, source-row joins, all file sizes and SHA-256 hashes, all audio loop bounds, the 30-book scope and original default background layer order. Cache reuse also checks original texture-segment digests, HCA payload digests, waveform rows and loop extension rows against the currently installed source.

## Distorted audio diagnosis

The first export used FFmpeg 9.0.1's native HCA decoder. It returned success and non-silent data, but those checks missed the defect. The earlier opening preview and full reader contained identical bad PCM, so comparing those two exports alone could not catch it.

The retained diagnostic compares the first music cue and storm loop layers 31 and 38 against independent float WAV references from pinned vgmstream/clHCA. It reconstructs those references from the original encrypted HCA and exact base key/AWB subkey. Wrong-key and missing-subkey controls produced silence in vgmstream; the correct inputs decoded nonzero audio. Turning off FFmpeg CPU optimizations left its bad PCM unchanged. Searching encoder-delay offsets did not explain the difference.

For the first 20 seconds, the old music export correlated only 0.0122 with the independent reference and measured -3.12 dB SNR. The replacement correlated 0.99945 with 29.58 dB SNR after Vorbis encoding. Storm layers measured 0.99956 and 0.99940 correlation after replacement. The default first-scene sum changed from peak 1.16665 with 245 samples beyond full scale to peak 0.82262 with zero samples beyond full scale. The original storm and music are bass-heavy; low spectral centroid by itself was not evidence of corruption.

`python scripts/gfl2-media-audio-check.py --candidate prior` deliberately exercises the retained old opening exports and fails. Without that argument, it verifies the current exports against the independent references and checks clipping. Detailed PCM digests, DC offsets, spectra and signal measurements remain in `.cache/gfl2-media/first-scene-audio-check-current.json` and the corresponding prior report. Old wrong exports remain outside public assets in `.cache/gfl2-media/legacy-ffmpeg-audio/` for diagnosis.

This identifies a native FFmpeg HCA decoding defect for these files. It does not identify the underlying decoder arithmetic bug. The repaired pipeline uses clHCA for all recovered audio, preserving the original source payloads and loop bounds.
