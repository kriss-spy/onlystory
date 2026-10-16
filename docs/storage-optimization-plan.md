# Storage optimization plan

Status: shared asset migration and lossless atlas conversion implemented. Movie stream sharing and automatic reclamation remain pending. Updated 2026-10-16.

The target is a library containing events from several games, potentially more than 20 GB. Store identical assets once, preserve the original movie picture streams, compress eligible textures losslessly, and install only selected events and languages. Keep standalone desktop and private server modes as first-class storage targets.

This is the replacement for the missing optimization document. It records the decisions, measurements, implementation order, and checks needed before changing the library. The research baseline below predates implementation; current results are recorded next.

## Implementation results

The shared importer and exact atlas conversion reduce the current exported library from **2,520,968,481 to 2,228,750,796 bytes**, saving **292,217,685 bytes**. The complete image pass converted **194 unique atlases**, saving **151,003,629 bytes after deduplication**. Every replacement retained dimensions, all decoded RGBA samples, and supported metadata. Backgrounds, audio packets, movie packets, and Cubism model payloads were not re-encoded.

Imports now store immutable payloads under `/private/shared/<full-sha256>.<extension>`. Event manifests and nested model references use those URLs. Provenance retains original file identities and source records. Old URLs resolve through the host's alias index, including correct MIME types and byte ranges. Repeated imports validate shared payload hashes and reuse the existing objects.

The frontend build excludes the media library and is about **2.3 MB**, including the demo and Cubism runtime. `npm run preview` and `npm start` serve the library separately. This removes the previous extra 2.523 GB build copy; it does not include a desktop executable or authenticated remote server.

Downloads now use a maximum of three asset transfers, share in-flight work across episode jobs, and stream into CacheStorage instead of accumulating movie chunks in JavaScript. They include only the selected movie voice, record installed dependencies/languages, and check managed downloads for missing cache entries at startup. Management shows actual cached media bytes and estimated browser space. Small byte-identical old cache entries migrate by SHA-256; re-encoded textures and large movies keep their existing cache entries for compatibility.

The first rollout deliberately retains combined-language movie exports and the four legacy multi-track movies. Sharing their video streams remains the next implementation phase. Automatic cache reclamation, a complete large-file cache migration, pre-download incremental estimates, cross-tab transfer coordination, and desktop packaging are also still pending. Removing a download still preserves shared cached media for Undo.

Detailed image equality records and current sizes are saved in [storage-implementation.json](storage-implementation.json). Disposable benchmark and conversion payloads were removed after verifying their canonical replacements; their JSON evidence remains. The original game installation and extraction evidence were not changed.

Validation passed for 36 unit tests, 15 import/host tests, and 74 unique browser checks across a full suite and focused follow-up runs. These cover every imported story, the original cast, high-DPI sharpness, holograms, old URL/cache compatibility, cancellation/retry, selective movie-language downloads, and offline seeking. The closed-eye expression check also passed three repeated runs after fixing its premature readiness marker. A production-host smoke check verified a real shared scene, deep links, and the download page at 320-pixel width. Reimporting the real library leaves all 13 catalog/manifest/index JSON files byte-identical.

### Run and reproduce

```powershell
npm run import:gfl2
npm run storage:audit
npm run build
npm start
```

`npm start` serves on loopback at port 4173. `ONLYSTORY_LIBRARY` can point at an external directory containing the `private` folder; it defaults to this project's `public`. It must contain the scene/text packages and shared objects, not only the shared directory. Static deployment of `dist` alone no longer contains game material. Use the provided host or implement equivalent media and alias routes.

For newly extracted PNG atlases, run `npm run storage:images` with Pillow available, then `npm run import:gfl2`. `ONLYSTORY_PILLOW_PATH` or the script's `--pillow-path` option can select an existing Pillow installation. The converter prepares and verifies candidates; the importer publishes only smaller verified results. It skips higher sample depths and unverified gamma/chromaticity cases. Existing canonical objects can supply a previously verified conversion after disposable candidates have been cleaned up.

The image converter must run before initial sharing of newly extracted PNGs. Running it after those PNGs have already become canonical objects does not retroactively convert them. Extracting them again and preparing candidates before import is the supported workflow for that case.

## Measured baseline

The current `public/private` contains 4,729 files totaling **2,520,968,481 bytes, or 2.521 GB**. These numbers describe the two imported GFL2 events and the opening preview, covers, and effects. They do not predict the eventual sizes of Blue Archive or PJSK. MB and GB below are decimal, not MiB/GiB.

| Exported category                        | Physical bytes | Approximate size |
| ---------------------------------------- | -------------: | ---------------: |
| Movies, including retained older exports |    943,969,065 |           944 MB |
| PNG images, mostly character atlases     |    481,072,898 |           481 MB |
| WebP images, already lossless exports    |    476,951,094 |           477 MB |
| Vorbis audio                             |    448,595,003 |           449 MB |
| JSON, models, and other files            |    170,380,421 |           170 MB |
| Total                                    |  2,520,968,481 |         2.521 GB |

The production `dist` directory is another **2.523 GB** because Vite currently copies public assets into the build. Before these experiments, `.cache` used **1.890 GB** for extraction, decoded audio, diagnostics, and other development artifacts. These are separate from the published library. The game installation, browser HTTP cache, and browser offline downloads are outside this audit. Server and browser copies are separate budgets even when they contain the same bytes.

Evidence is saved in [storage-baseline.json](storage-baseline.json). Re-run the read-only inventory with:

```powershell
python scripts/storage-audit.py
```

It writes `.cache/storage-audit.json` with duplicate groups and largest files. It hashes files with matching sizes to confirm identical bytes. It does not delete or convert anything. Manifest membership alone does not establish runtime reachability or safe deletion.

## Confirmed opportunities

| Opportunity                                          |                                       Measurement | Qualification                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------ |
| Share byte-identical files across event packages     |     145,167,742 redundant bytes across 469 groups | Primarily textures, backgrounds, and models. References must be migrated before removing copies.                               |
| Retire four older multi-track MP4 exports            |                                 319,072,671 bytes | Not in the active movie manifest, but deliberately retained for compatibility. A reachability and migration check is required. |
| Share video between active Chinese/Japanese versions | 306,331,926 bytes saved in stream-copy experiment | Eight current movie files become four video files plus eight audio files. Browser delivery still needs implementation.         |
| Lossless character atlas conversion                  |            35–39% smaller in four sampled atlases | Same dimensions and every decoded RGBA byte. This is a sample, not a whole-library forecast.                                   |

The first three opportunities address separate bytes in this snapshot. If implemented successfully, together they would take the exported directory from **2.521 GB to about 1.750 GB**, before any atlas savings. That is a conditional accounting result, not an implemented reduction or a prediction for every game. Manifest rewrites and packaging overhead can change the final number.

### Movie reuse experiment

The four current movies occupy **624,896,394 bytes** across their Chinese and Japanese MP4s. Each pair contains the same H.264 elementary stream. Full-stream SHA-256 checks matched after Annex B normalization, rather than checking only the first two seconds of decoded frames.

Copying one video stream and each existing AAC audio stream into separate containers produced **318,564,468 bytes**, saving **306,331,926 bytes, about 49% of these active movie files**. This used stream copy with no video or audio re-encoding. It is a storage packaging measurement, not proof of synchronized browser playback.

The experiment outputs are under `.cache/storage-experiments`. Detailed per-movie hashes and sizes are in the saved baseline. Verify the final delivery packaging again because MSE requires appropriate fragmented MP4, and its overhead may differ from this ordinary MP4 experiment.

### Atlas experiment

Four 2048 × 2048 character textures were sampled, including the two largest atlas PNGs and samples near the median and lower quartile of files sorted by size. Pillow lossless WebP with `exact=True, method=6` reduced them from **11,767,749 to 7,398,118 bytes**, about **37.1%**. All four decoded RGBA arrays matched exactly, including RGB under transparent pixels.

The sample includes Easley, Dragon, Enfield, and Springfield textures. It is deliberately small. Before rollout, inventory source precision and color metadata, benchmark the full eligible atlas set, and keep the original file whenever the alternative is larger or fails validation.

## Quality policy

- Keep source resolution, alpha, expressions, timing, loop points, and movie frames. Do not make downscaling or lossy image/video encoding the default optimization.
- Original H.264 movie streams are already compressed. Remux and share them. Re-encoding to a lossless video codec cannot recover lost source detail and is not expected to save storage.
- Use genuinely lossless image encoding with exact transparent RGB preservation. Quality 100 in a lossy mode and near-lossless preprocessing do not satisfy this policy. Preserve required color metadata and sample precision.
- Existing backgrounds are already lossless WebP. Recompress only if a measured smaller representation preserves samples and rendering metadata.
- Current Vorbis and AAC exports are lossy delivery encodings. Retain them during this optimization. Converting them to FLAC cannot restore quality and is not a space-saving strategy. A future preservation audio profile must start from original game material and declare its PCM precision.
- Deduplicate by bytes first. Never merge files based solely on character name, movie ID, a short hash prefix, or visual similarity. Keep timing, transforms, expressions, language, and game-specific metadata in manifests even when underlying file bytes are shared.

Codec and browser constraints, with official citations, are in [storage-codec-research.md](storage-codec-research.md).

## Implementation sequence

### 1. Shared asset store and reproducible imports

Build a game-independent asset index keyed by full SHA-256 and byte length. Store immutable payloads under a common location such as `/assets/sha256/<digest>.<extension>`. Keep event manifests as references to shared payloads. Both importers and downloads must use this same identity so reuse saves server disk, desktop disk, and browser cache entries.

Start with exact byte duplicates. Make importer output deterministic and idempotent; repeated dev/build imports must not recreate per-event copies. Preserve provenance mapping each shared payload to its source package and conversion recipe. Commit new manifests only after all payloads validate, and keep the previous index usable on interrupted imports.

Live2D requires special handling. Model JSON references textures, expressions, and motions by relative filename. Rewrite these references to canonical asset URLs before computing the model JSON's own digest. Update the loader, scene inventories, file hashes, and verifiers together. Sharing a model does not imply sharing its event-specific transform or expression mapping.

Acceptance: duplicate backgrounds and models resolve to one payload across both existing events; every URL resolves; original expression and commander-variant checks pass; rerunning import changes nothing; first/last passage, seeks, bookmarks, and offline scenes still work.

### 2. Lossless image conversion

Extend extraction to compare original PNG or current lossless WebP against an exact lossless alternative, with bounded encoder work during import. Validate dimensions, sample precision, all decoded RGBA samples, and required color metadata. Choose the smaller valid representation, then put it in the shared store. Keep unsupported textures and higher-bit-depth images in their valid source representation.

Update model references and MIME types. Regenerate from source pixels where needed; recompressing an earlier export cannot recover hidden RGB that an earlier conversion discarded. Measure whole-library savings after deduplication so shared atlases are not counted twice.

Acceptance: full eligible-image equality report, browser screenshots at normal and high DPI, alpha edges and holograms intact, no atlas resize, and a measured byte reduction. Keep the existing renderer sharpness checks.

### 3. One movie picture stream, selectable audio

Prototype shared fragmented H.264 video with separate Chinese/Japanese AAC tracks through Media Source Extensions and a single media element. Reuse existing encoded AAC in this migration. Keep Chinese subtitles shared. Define a common movie descriptor with video identity, language audio identities, codec strings, duration, and subtitle identities; do not bury this in GFL2-only playback code.

Feature-detect codecs and prove playback in the supported browsers. Native multi-track MP4 switching has incomplete browser support; two independent media elements require explicit clock synchronization. Neither is accepted as working simply because the files play independently.

Keep the existing combined MP4 path as a compatibility option until the prototype passes. Avoid shipping or caching every fallback by default, since doing so would erase the savings. A server can generate and bound-cache a selected-language fallback from shared streams; a desktop host can do the same locally. If a browser-only deployment needs permanent fallback MP4s, report those bytes honestly and make the compatibility/storage tradeoff explicit.

Acceptance: full stream/sample checks and timestamps against the current files; start, pause, end, long playback, buffering, random seeks, reload resume, playback speed, language switches, captions, rapid navigation, and offline playback. Verify bounded working memory and cancellation with a large movie. This phase cannot be called complete based on the disk experiment alone.

### 4. Selective installation and honest size accounting

Offer event/chapter selection and selected voice languages. Download the active movie language by default and fetch an additional language when requested. Scene files currently enumerate both movie voice variants, so filtering must change the dependency walk rather than merely adding a setting.

Show unique incremental bytes, already-shared bytes, and reclaimable bytes. Track availability per asset and language; a single installed boolean cannot express partial languages or evicted media. Validate dependencies before claiming an event works offline. Switching to a missing language offline must leave the playable track available and explain the missing download.

Use a bounded download queue with one in-flight transfer per content identity across jobs. Avoid accumulating a whole large movie in JavaScript chunks before caching. Persist completed objects and install state transactionally, handle quota failure, and support retry without downloading existing valid data again. Check storage estimates and request browser persistence where available, without promising a 20 GB browser quota.

Acceptance: installing two events transfers shared payloads once; adding Japanese installs only its missing dependencies; partial download/cancel/retry works; quota errors preserve valid progress; corrupted or evicted assets are detected; size totals agree with the unique index.

### 5. Reclamation and compatibility migration

Build a reachability-based cleanup operation over retained event versions, selected languages, active transfers, opening previews, covers, Cubism runtime, and Undo state. Verify nested Live2D references. Produce a dry-run report before deleting anything. Manifest-unlisted files alone are insufficient evidence.

Make removing an event actually release unreferenced media after the Undo retention window. Preserve shared media still needed elsewhere. Migrate old CacheStorage URL entries into canonical identities, verify their hashes, then retire old keys. Keep reading saves and bookmarks, which identify passages rather than media payloads.

For the four known legacy movie files, first check current generated scenes and retained versions. Preserve supported old URLs through the host's alias mapping or an explicit migration, then retire duplicate physical files. Fix the exporters at the same time so old outputs do not return on the next import.

Acceptance: dry-run identifies expected candidates; shared models survive removing either event; Undo restores a usable installation; interrupted cleanup is recoverable; only unreferenced objects are reclaimed; the existing opening preview and supported old links work.

### 6. Desktop/server storage and build packaging

Use an external managed library directory for desktop mode and the private server. Keep the frontend bundle separate from the media library. Avoid automatically copying the full library into each production build and release. Exclude source archives, decoded WAVs, analysis output, and diagnostic renders from shipped artifacts.

Keep original game files or reproducible extraction provenance according to an explicit retention policy; do not silently delete the user's source installation. Disposable import workspaces can have a verified cleanup command once output integrity is established. Report import workspace and player-library usage separately.

Serve large files with correct MIME types and byte ranges, or provide tested segmented media delivery. Browser cache, IndexedDB, and OPFS remain subject to browser storage policy; OPFS alone does not provide native desktop disk guarantees. Preserve one shared media identity and dependency model across browser, desktop, and server backends.

Acceptance: building the frontend does not duplicate the external library; a chosen disk library survives app updates; free-space and interrupted-write failures are handled; remote playback supports seeking; server and desktop mode read the same manifests; no game installation is required on a reading device after import.

## Tracking

- [x] Research official codec and browser constraints.
- [x] Measure the current exported library and exact duplicates.
- [x] Measure shared movie payloads and sample exact atlas compression.
- [x] Implement the shared store and deterministic importer migration.
- [x] Convert eligible images after full equality validation.
- [ ] Prove shared-video playback, then migrate movie packaging.
- [ ] Add selective installation, incremental sizing, and resilient downloads.
- [ ] Migrate old cache keys and implement safe reclamation.
- [ ] Separate the external library from builds for desktop/server delivery.

Next, prove shared-video playback before retiring combined movie payloads. The common asset identities are now available for that work.
