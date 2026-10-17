# PJSK story import pipeline

The source import stage acquires regional master metadata and one real scenario, validates references, and writes a package containing native commands, text, media references and provenance. Source-only packages have `playbackReady: false`.

The playback stage installs all 125 CN main-story episodes and all 1,498 available event episodes. They appear in the normal PJSK catalog and use the common reader's controls, saves, bookmarks and downloads. The browser approximates Unity's animation timing, particles and transitions; main-story 3D performances use their original songs with an explicit limitation.

The original regression fixture is the complete CN MORE MORE JUMP! episode **崇拜的偶像！**, scenario `mmj_01_01`. Its 61 original dialogue passages and closing passage use all 176 source commands, original Japanese voices, four Live2D costumes, facial/body animation, backgrounds, music, sound effects, fades, flashbacks, captions and shakes.

## Run

```powershell
# CN MORE MORE JUMP! main story prologue, mmj_01_00
npm run import:pjsk

# Repeat using only checksum-verified local inputs
npm run import:pjsk -- --offline

# Install the full first episode, with original JP media and Live2D
npm run import:pjsk -- --scenario mmj_01_01 --install

# Rebuild the playable episode offline after its first install
npm run import:pjsk -- --scenario mmj_01_01 --install --offline

# List metadata-indexed unit or event episodes
npm run import:pjsk -- --region cn --kind unit --list
npm run import:pjsk -- --region cn --kind event --list

# Import an event episode by its scenario ID
npm run import:pjsk -- --region cn --kind event --scenario event_01_01

# Acquire and inventory the pinned nine-event corpus, then prefetch bulk media
npm run acquire:pjsk-corpus
npm run prefetch:pjsk-corpus

# Install the corpus through one publisher; resume verifies completed outputs
npm run install:pjsk-corpus -- --resume

# Verify required catalog entries, command counts, hashes and browser playback
npx playwright test tests/pjsk-corpus.spec.ts --workers=1

# Other regions use their own metadata and assets
npm run import:pjsk -- --region jp

# Explicitly replace pinned URL snapshots with current remote inputs
npm run import:pjsk -- --refresh

npm run test:pjsk
```

Regions are `cn`, `jp`, `en`, `tc` and `kr`. Story kinds are `unit` and `event`. Card, character, area, special and MySekai stories are not indexed yet. `--scenario` selects exactly one metadata entry; missing or ambiguous entries fail. Source imports have no cross-region fallback. `--list` lists metadata, not verified scenario availability or release readiness.

Playback installation accepts CN event stories and all six groups' unit stories, paired explicitly with JP media and the shared Live2D namespace. Event titles, CN release dates, grouping and episode order come from checked event metadata. The installer rejects unsupported commands before publishing a catalog entry. `--install` is not a promise that every source-importable episode can play. This is an explicit language pairing: CN text, JP voices/backgrounds/audio and shared original Live2D. Source URLs and SHA-256 remain recorded for acquired files.

The renderer supports three-model layouts, bottom-entry positions, inline dialogue effects/sounds, source choices and ending movies through the common reader. Choices retain their original options and continue along the native linear scenario. Movie preparation runs native commands before showing the movie and keeps the scene runtime mounted. Unknown commands and overlapping dialogue voices still block installation. Source-only import retains unsupported records.

Browser animation, particles, camera, shaders and transitions approximate Unity presentation. Native `still_*` effect textures are particle atlases over the original background, never replacement full-screen artwork. Event 150's ending also uses CRI BGM block requests. Their original `BgmBlockIndex` values remain in snapshots and diagnostics, while playback uses the continuous extracted score: the public assets do not expose authoritative CRI block routing. The episode's catalog capabilities and install report disclose this limitation; exact music-block fidelity remains unverified.

Sources default to ignored `.cache/pjsk/http`; packages default to ignored `.cache/pjsk/packages`. Override these with `--cache DIRECTORY` and `--output DIRECTORY`. Neither path uses `public/private`, so the default importer does not write through a worktree's shared media junction. Imports run only when requested, never during install, build or development server startup.

`--install` stores media in `.cache/pjsk/library/private/pjsk`, with content hashes as filenames, and publishes catalog metadata in `src/generated/pjsk-cn-unit-30001.json`. It rewrites model references to local files, including required textures, moc, physics, motions and facial motions. Cached media hashes are verified when rebuilding offline. The episode needs approximately 18 MB plus its program and catalog. The PJSK library is separate from the shared GFL2 media. Set `ONLYSTORY_PJSK_LIBRARY` for both the importer and host to relocate it; `--library` changes only the installer's destination.

Development, preview and production hosts serve the supplementary library alongside the main library. It is excluded from frontend build output. Back up the PJSK library and generated catalog as well as the source packages/cache. A Git checkout or `dist` alone does not contain the episode. See [deployment instructions](deployment.md).

The cache pins each URL to a SHA-256 digest and acquisition time. Offline runs verify both digest and byte length before use. Corruption fails with a repair instruction. `--refresh` fetches new inputs; it cannot be combined with `--offline`. HTTP 404 and non-JSON responses fail without retries. Transient server/network failures get up to three attempts with a 30-second request timeout. Existing output is replaced atomically only after scenario validation succeeds. A refresh that fails validation can update the input cache but preserves the previous package.

Keep both directories for a reproducible backup. Packages retain exact scenario JSON text as `rawScenario`, plus the parsed scenario, selected master records and source hashes. The complete original master table remains in the source cache. Replaying offline produces the same package bytes for the same cached inputs and output location.

## Package contract

- `entry` identifies region, kind, collection, episode, title, bundle path and original episode/chapter metadata. IDs include region and kind.
- `scenario.timeline` preserves source order, each original snippet, its referenced record, delay and progress behavior. Waits remain native instructions. Absolute timestamps require runtime completion information and are not guessed.
- `scenario.initial` retains the source's `First*` fields. `scenario.source` retains all parsed source fields, including unknown ones. `rawScenario` preserves the original JSON, including integer spellings that JavaScript's number parser cannot represent exactly.
- `scenario.transcript` includes dialogue, fullscreen narration, telop and place captions in encounter order. Original text, line breaks, speaker and voice metadata remain intact. Dialogue motions and inline sound/effect references are inspected as well as standalone commands.
- `scenario.dependencies` deduplicates background, BGM, voice, costume, motion, expression, sound, effect and bundle references, retaining use locations. Background/BGM/voice paths are candidates with `unverified` status. Other mappings remain `unresolved`. `bgm00000` is treated as silence. No dependency is marked downloaded.
- `report` records coverage, issues, source URLs, checksums, acquisition times, byte lengths and relative cache paths. Unknown actions/effects/layout/sound modes, interaction commands and malformed media references are explicit issues. A zero issue count means the inspected source values were recognized, not that a renderer supports them.

Malformed table references, mismatched scenario identity or invalid snippet timing stop publication. Unknown commands are preserved and reported. Media paths with invalid characters become unresolved references; the importer does not silently trim names or guess replacement files.

The installed program adds dialogue boundaries with scene snapshots before/after each passage and native command groups. Normal advancement executes source commands with delays and wait barriers while allowing motions, music fades and visual transitions to overlap. Seeking restores snapshots without replaying earlier sound effects. Fast-forward cancels pending commands and restores the target state. Voice waits until scene preparation completes. Body and facial motion use separate Cubism motion managers; mouth movement follows an analyser on the original voice audio. Teardown cancels pending operations, animations and audio and releases model resources.

## Verified samples

Checked on 2026-10-16 with live downloads and subsequent offline imports.

| Region / episode | Snippets | Dialogue | Fullscreen text | Captions | Voiced text records | Issues |
| ---------------- | -------: | -------: | --------------: | -------: | ------------------: | -----: |
| CN `mmj_01_00`   |      224 |       77 |               5 |        5 |                  79 |      0 |
| JP `mmj_01_00`   |      224 |       77 |               5 |        5 |                  81 |      0 |
| EN `mmj_01_00`   |      224 |       77 |               5 |        5 |                  79 |      0 |
| TC `mmj_01_00`   |      224 |       77 |               5 |        5 |                  79 |      0 |
| KR `mmj_01_00`   |      224 |       77 |               5 |        5 |                  79 |      0 |
| CN `event_01_01` |      227 |       63 |               0 |        4 |                  62 |      4 |

The installed CN `mmj_01_01` has 176 snippets, 61 dialogue records, seven captions, 47 voiced records and zero source issues. All 57 of its unique voice/music/sound-effect files decoded successfully in Chrome.

CN metadata listed 125 unit episodes and 1,626 event episodes. These are metadata counts, not a completeness audit or a count of imported episodes. Five regional versions of the prologue, the CN first unit episode and all 75 event episodes in the validation corpus have been source-imported. The event corpus contains 17,049 native commands, 5,511 dialogue records, 182 captions, three full-screen text records and 5,236 voiced text records.

Event 1's first episode has four voice IDs ending in a space, at snippet indexes 124, 131, 197 and 207. Exact filenames containing those spaces exist; trimming them produces missing assets. Installation preserves the original IDs, encodes the exact filenames and records successful source URLs, hashes and sizes in the resolution report. Facial motion filenames with embedded spaces use the same evidence-based approach. Original scenario JSON remains unchanged.

The automated importer suite checks timing preservation, fullscreen narration, inline sound, motions, broken references, unknown commands, malformed voice IDs, metadata paths, offline identity, corruption detection, refresh repair, HTTP failures and preservation of a previous output after validation failure. It uses authored fixtures and temporary directories, with no network or game material required.

The episode's browser checks cover every passage through the end, voices and bookmark/reload restoration, browser-cache downloads and offline playback, a 320px reader, fast-forward cancellation and the distinction between spoken lip sync and voiced inner monologue. Navigation regressions cover BGM continuity during held Space, fast-forward toggles and actual progress dragging, scripted track changes and silence, and passage seeks completing within 250 ms after startup. The production host also opened a deep link with the real model and no runtime errors. Reinstalling offline reproduced the exact catalog bytes and scene URL. All 146 media/provenance files passed SHA-256 verification.

The player prepares body/facial motions, backgrounds and decoded music/sound effects during initial loading. Normal passage advances preserve native animation waits. Repeated Space advances apply the target passage immediately and cancel pending waits, as progress seeking and fast-forward do. The loading overlay appears only during startup. Changing playback mode preserves the current BGM unless the target passage calls for a different track or silence.

After initial loading, a background click or single Space press can also interrupt pending scene commands once the text is revealed. For example, `event_150_01:64` has delayed commands totaling more than ten seconds. The reader previously discarded manual advances during that interval. It now restores the destination snapshot and cancels the previous command sequence. Automatic reading still waits for scene readiness, and the first click on partially revealed text still reveals the text.

At `wonder_01_02:12`, both characters' brows shimmered despite constant brow parameters, smooth geometry and stable drawable opacity/order. The 1× canvas and identity color-filter pass caused abrupt pixel changes during subpixel motion. The renderer now targets two physical samples per native scene pixel, capped at two physical pixels per CSS pixel, and skips identity color passes. Active tint, hologram, blur and flashback filters track canvas resolution. The real-renderer regression in `tests/pjsk-eyebrows.spec.ts` measures both brow meshes while moving each model in 0.05-pixel increments; the old renderer failed and the corrected renderer passed.

At `mmj_01_01:130`, normal advancement into Minori's closed-eye expression briefly reopened both eyes every second. Direct seeking did not reproduce it because seeks disable the initial fade. Cubism was restarting the 0.1-second expression fade at every one-second facial loop, exposing the underlying body's open eyes. Facial motions now disable loop fade-in while retaining the initial expression transition. `tests/pjsk-blinking.spec.ts` reproduces normal entry, samples both rendered eye parameters across three loops and checks that the next expression opens the eyes again. The original renderer failed with eye openness above 0.93; the corrected renderer keeps both closed below 0.001. The regression, eyebrow and multi-model animation checks passed, as did the build and 42 unit tests.

The build, 40 unit tests and all 42 importer/host tests passed after event support was added. An earlier broader browser regression run, excluding a GFL2 raw-source audit whose extraction inputs are absent from this worktree, finished with 106 passes and 27 failures. Those failures cover GFL2 playback and catalog/stress checks; their output is saved locally in `.cache/pjsk/browser-regression.log`. The failed catalog sort check passed when rerun alone; the stress-catalog check still failed. The whole-repository formatter also reports seven unchanged files; all files changed for this integration pass formatting.

## Real-work validation milestone: nine complete events

Decision on 2026-10-16: validate **nine complete CN events, 75 episodes**, with explicit JP media pairing. This is the next pipeline milestone. The existing MMJ main-story episode remains a regression fixture and does not count toward the 75.

The corpus is pinned in [pjsk-validation-corpus.json](pjsk-validation-corpus.json), including every expected episode ID, scenario ID and source path from the checksum-pinned local CN metadata. All 75 episodes are acquired and installed, including a successful offline rebuild. The programs contain 5,594 reader passages and preserve all 17,049 native commands. The corpus uses 7,666 unique media/provenance files totaling approximately 631 MB, plus scene programs. Source acquisition, installation and browser reports live under `.cache/pjsk/validation/`; staged bulk/model downloads live under `.cache/pjsk/prefetch/`. Installation is complete; the full fidelity milestone remains open, including authoritative CRI music-block routing and native reference comparisons.

On 2026-10-17, all 17 final browser checks passed against the production host, with zero retries or skipped checks. These verify catalog grouping and opening/middle/ending snapshots for every episode, all command counts and file hashes, character animation after loading thirteen models, the three choice points, both ending movies with native prelude and continuation, text-layout movie controls, warm navigation and BGM continuity. The live development backend was also checked for all nine event links. Results are in `.cache/pjsk/validation/browser-results-final.json`; per-event screenshots are under `test-results-pjsk-final/`. Warm navigation remained within the existing 250 ms target.

Visual review exposed a Core memory-growth defect in the thirteen-model episode `event_03_01`. Earlier models retained typed-array views into a replaced 16 MiB heap after later models expanded it to 32 MiB, so their parameters changed without updating rendered geometry. The shared loader now prepares Core memory before model creation. A 64 MiB request creates a 128 MiB heap in this Core build and keeps all thirteen models on the same buffer. A canvas-animation regression failed before the fix and passed afterward. This reservation covers the installed corpus; larger future casts need their own memory check. Facial-motion updates also use the framework's seconds-based clock.

| Event ID | Source bundle               | Episodes | Validation purpose                                             |
| -------- | --------------------------- | -------: | -------------------------------------------------------------- |
| 1        | `event_stella_2020`         |        8 | Leo/need; evidence-backed repair of malformed voice references |
| 2        | `event_jackpod_2020`        |        8 | Nightcord cast, costumes and scenes                            |
| 3        | `event_potato_2020`         |        8 | Wonderlands×Showtime cast, costumes and scenes                 |
| 4        | `event_sportsfestival_2020` |        8 | Mixed-unit event and shared assets across casts                |
| 5        | `event_restart_2020`        |        8 | MORE MORE JUMP! event versus the existing main-story fixture   |
| 6        | `event_forward_2020`        |        8 | Vivid BAD SQUAD cast, costumes and scenes                      |
| 9        | `event_newyear_2020`        |       11 | Anthology and event ordering beyond eight episodes             |
| 100      | `event_persona_2023`        |        8 | Later-era compatibility holdout                                |
| 150      | `event_scratch_2024`        |        8 | Second later-era compatibility holdout                         |

Seven early events cover the five unit casts, mixed casts and a different event structure. Two later-era holdouts test whether the implementation generalizes beyond the early corpus. All nine events now have acquired scenarios, command inventories and installed original media. Coverage claims follow the recorded scenario inventory.

### Work sequence and parallel ownership

1. **Inventory all 75 episodes before publication.** Produce per-event and aggregate counts for native actions, effects, layouts, sound modes, inline effects/sounds, overlapping voices, movies, interactions, costumes, backgrounds and audio. Record every unsupported value and malformed reference. Check that later holdouts add useful content diversity; document evidence if either must be replaced because sources are unavailable. Never substitute an easier event merely to avoid a renderer blocker.
2. **Complete event 1 as the first vertical slice.** Generalize event metadata, catalog grouping, ordering and next-episode navigation. Remove the CN/MMJ/unit-only installation restriction through explicit event support, rather than just bypassing the guard. Replace hardcoded MMJ labels, category, collection and date with source-derived metadata. Preserve CN text and the declared JP media pairing. Resolve its four voice identifiers with verified asset evidence and an explicit correction map retaining original values.
3. **Run three parallel workstreams.** A corpus agent acquires and inventories events in isolated directories. An installer/catalog agent owns metadata, publication, corrections and offline rebuilds. A runtime/test agent owns missing command behavior and manifest-driven browser checks. The parent integrates their changes, assigns non-overlapping files and runs final acceptance. Browser performance gates run serially on this workstation.
4. **Publish through one writer.** Concurrent installers currently read and rewrite the same `sources.json`, which can lose other workers' additions. Give each acquisition worker separate cache/package/library/output roots; merge through the parent after verification. Shared publication may run concurrently only after locking or equivalent safe merging is implemented and tested.
5. **Finish events 2–6 and 9, then run events 100 and 150 as holdouts.** Fix defects exposed by holdouts and rerun affected corpus checks. Preserve the first holdout failure reports so the generalization test remains reviewable.

### Completion gates

- **75 of 75 episodes, nine of nine events.** Every expected manifest entry imports, compiles, installs, appears under its correct event and reaches its actual ending through normal browser playback. Mandatory corpus tests fail when required fixtures are missing; they must not silently skip. Compare expected and actual passage/native-command counts and scene states. Event endings and continuation must follow metadata order.
- **Zero unresolved playback blockers.** No unknown or dropped commands, missing assets, decode errors, runtime exceptions or asset HTTP errors. Unsupported movies, interactions, layouts or inline effects remain blockers until correctly implemented. Corrections record the original value, replacement, reason and evidence; no silent trimming or cross-region fallback.
- **Reproducible installation.** Rebuild all 75 episodes offline into fresh mirrored roots preserving the relative cache/package directory layout, then compare package bytes, catalog bytes, program URLs and media hashes. The source report stores cache paths relative to the package output directory, so relocating only that directory changes package bytes. Verify corruption is rejected and a failed replacement preserves the last valid published event. Keep raw sources, acquisition records and checksums.
- **Reader integration for every event.** Check complete episode order, next-episode continuation, save/reload, bookmarks and deep links across episode boundaries. Download every event and open each episode offline. Run the narrow-reader and audio/lip-sync checks on at least one episode per event and every newly encountered voice mode.
- **Responsive navigation.** On each event's most feature-rich episode, exercise held Space, actual progress dragging and repeated fast-forward toggles. After startup, target passage preparation completes within 250 ms on this workstation, no loading overlay reappears, same-track BGM continues, scripted changes and silence work, and canceled commands cannot alter the destination. Repeat across distinct costumes/backgrounds/music. Record startup time and peak memory separately so preloading costs remain visible.
- **Feature evidence and resource cleanup.** Inventory and verify every encountered command/layout/effect variant, with a short original-game reference comparison for each newly implemented behavior. Check teardown releases models/audio and repeated event switching does not continually grow retained resources. Snapshot consistency alone does not establish original-game fidelity.
- **Integration regression.** Build, unit tests, importer/host tests, the existing MMJ fixture and manifest-driven PJSK browser checks pass. Report unrelated existing failures separately; retries and initial failures remain in the verification report.

The milestone is complete only when all gates have evidence for the full corpus. Store the inventory, per-episode results, timings, correction evidence and aggregate completion report together under `.cache/pjsk/validation/`. The manifest distinguishes `status: installed` from `milestoneStatus: validation-in-progress`; installation and checkpoint tests do not establish full native timing or effect fidelity. This scope covers the selected CN-text/JP-media event workflow; other locales and the entire archive require separate validation.

## Complete main-story corpus

### Catalog artwork

`npm run import:pjsk-artwork` acquires and publishes original artwork for the installed corpus: nine CN event story banners, six main-story chapter covers and six native CN unit logos. Main-story art uses verified JP chapter images where the CN paths are unavailable. The script stores content-addressed PNGs in the PJSK media library, records source URLs, dimensions and checksums in `.cache/pjsk/artwork/manifest.json`, and merges only PJSK entries into `src/cover-art.json`. It leaves the story media index unchanged. `--offline` verifies and republishes all 21 cached files.

Catalog cards and collection headings display the covers and group marks. Mixed events use an explicit Mixed badge. Shared group definitions keep labels consistent with the filter. Mobile PJSK rows allow room for the artwork, badge, release date and wrapped title. Browser checks require every cover and logo to decode, preserve group/release filters, and fit mobile rows in dark mode.

### Main-story installation

The source-pinned [main-story manifest](pjsk-main-corpus.json) contains every CN `unitStories.json` entry: 125 episodes across six groups. Leo/need, MORE MORE JUMP!, Vivid BAD SQUAD, Wonderlands×Showtime and Nightcord each have a prologue plus twenty episodes. VIRTUAL SINGER has twenty episodes spanning the five SEKAI settings. Its source order values are 4–23 and remain unchanged.

Each group has its own main-story collection and group-filter metadata. Existing MORE MORE JUMP! episode IDs, saved reading positions and collection identity remain compatible. Acquisition and installation reports are separate from the event milestone under `.cache/pjsk/main-validation/`.

Main-story release dates use the [original game launch on 2020-09-30](https://www.sega.jp/topics/detail/200928_1/). A later regional app-launch date previously placed these launch stories after early events. All six main-story collections now sort before events in oldest-first order and after events in newest-first order. Event dates retain their source metadata.

```powershell
npm run acquire:pjsk-main
node scripts/pjsk-prefetch.mjs --manifest docs/pjsk-main-corpus.json --report main-report.json
node scripts/pjsk-prefetch-models.mjs --manifest docs/pjsk-main-corpus.json --report main-models-report.json
node scripts/pjsk-main-interludes-prefetch.mjs
npm run install:pjsk-main -- --resume
```

Opening movies use their original `movie/<unit>_opening/<unit>.mp4` files. Native effect 37 invokes a 3D music performance. Its `IntVal` joins `episodeMusicVideoCostumes.json` to `musicVocals.json` and `musics.json`; the browser presents the exact original vocal track as an explicit, skippable audio interlude. It does not reproduce 3D choreography. The interlude identifies that limitation in the reader, episode capabilities and installation report. The five track mappings and source checksums are recorded in `performance-evidence.json`.

The VBS `light_up_legend_02` effect samples fog and light cells from the original `tex_light_up_legend.webp` atlas using an approximate browser animation. The VIRTUAL SINGER `vswonder_01_01` source assigns `partvoice_32_021_wonder` to Mikudayo; the importer resolves the exact track under `21miku_theme_park` with provenance, without changing the raw script.

`tests/pjsk-main.spec.ts` requires all 125 catalog fixtures and verifies command preservation, media hashes, group/order metadata, opening/middle/end snapshots, every next-episode link, all five opening movies and all five song interludes.

Two complete offline installations produced identical program hashes for all 125 episodes. Duplicate payloads can be served from distinct original motion URLs; the media inventory now retains the lexicographically first original source URL so download completion order cannot change the program's provenance bytes.

On 2026-10-17, all 125 episodes were installed with zero failures. The corpus contains 8,738 passages, 24,113 native commands and 9,988 unique media/provenance files totaling 623,560,709 bytes. All 17 final browser checks passed against the production host, with no skips or retries. They cover all episode checkpoints and continuation links, all opening movies and performance interludes, the VBS lighting effect, group filters, animation, manual input during scene waits, warm navigation and BGM continuity. The live psmux backend on port 4481 also showed all six main-story collections with the expected counts. Results and screenshots are under `.cache/pjsk/main-validation/` and `test-results-pjsk-main-final/`. The build, 40 unit tests and 46 importer/host tests passed.

## Full CN event archive

`docs/pjsk-all-events.json` records the complete pinned CN master: 198 events and 1,626 episodes. On 2026-10-17, 182 events have all 1,498 scripts available. The other 16 events contain 128 future episodes, with release dates beginning 2026-10-31. Their original CN scenario directories are empty. Availability evidence and acquisition reports are under `.cache/pjsk/all-events-validation/`; missing future scripts remain excluded from publication.

The final offline publication installed all 1,498 available event episodes with zero failures. Together with the existing 125 main-story episodes, the PJSK catalog contains 1,623 episodes across 188 collections. All event programs preserve their 496,616 native commands and contain 137,605 reader passages. Media staging verified all 432 required costumes and 3,363 nonvoice dependencies. The independent archive audit checked 40,301 unique content assets totaling 4,560,622,992 bytes, plus 126,113 exact deferred voice references against original directory listings. Dialogue audio uses the verified cache described below. Reports are `.cache/pjsk/all-events-validation/installation.json` and `archive-verification.json`.

Follow the [archive build procedure](pjsk-archive-build.md) to acquire sources, derive the available corpus, stage models and nonvoice media, then publish offline. Voice clips use the verified on-demand cache described below. Installation resumes by source and implementation hashes. The availability report excludes only explicitly audited missing events. Other acquisition or playback failures remain failures.

Forty shipped scripts have internal scenario IDs different from their canonical metadata IDs. `docs/pjsk-scenario-identities.json` binds each pair using both original CN and JP hashes, ordered voice IDs and command counts. The importer preserves raw scripts and rejects unreviewed identity mismatches. Group marks use the original `eventStoryUnits.json` main/sub relations, including mixed events.

PJSK catalog entries contain chapter metadata, the first passage ID and a content-addressed text reference. Text nodes and the full offline asset inventory load when a chapter opens or downloads. Existing passage IDs, bookmarks and deep links are retained. `scripts/pjsk-lazy-catalog.mjs` migrates older installed catalogs without replacing their scene programs.

The full archive adds horizontal wipes, memory filters, monitor shading and original texture-backed effects. Particle animation remains a browser approximation. Native adaptive music controls retain their source commands while playing the continuous full score; CRI cue control is not reproduced. These limits also appear in affected chapter capabilities and installation reports.

Final verification on 2026-10-17 covered every available event episode at three browser checkpoints, 4,494 checkpoints in total. Thirteen representative full-scene episodes passed 39 scene snapshots, and the 37-costume finale passed all 83 passage snapshots. All 132 distinct native movie files decoded finite metadata and original frame pixels. The movie test was corrected to wait for a completed seek rather than rejecting an already queued `loadeddata` event. Ten effect checks and both video-background checks passed, as did catalog sorting, group filters, covers, mobile layout, offline chapter downloads, manual input, animation, BGM continuity and eyebrow rendering. Direct Cubism checks validated all 432 models; both the largest cast and highest-MOC-memory episode retained valid buffers in a stable 128 MiB Core heap. The build, 42 unit tests and 67 importer/host tests passed; one pre-existing unit test remains skipped.

The restarted `onlystory-pjsk-backend` psmux session serves port 4481. A live browser check confirmed 188 normal catalog collections and 1,623 installed episodes with no page errors. Detailed reports, frame checks and screenshots are under `.cache/pjsk/all-events-validation/` and `test-results-pjsk-final-ui/`.

### Verified audio caching on demand

The full event archive publishes voice references after verifying the exact original filenames, byte lengths and MD5 ETags against pinned S3 directory listings. Publishing a chapter does not require downloading every voice clip in the archive first. Existing verified media can be reused through a content-addressed `cacheSource`.

`private/pjsk/deferred.json` is publisher-owned. It maps the SHA-256 of an original source URL to `/private/pjsk/remote/<hash>.mp3`, its byte length, original MD5 and optional local cache source. The shared development and production library middleware serves these routes. It accepts only manifest-authorized original JP audio URLs, verifies the complete byte length and MD5 before serving any audio, and persists the verified MP3 with a SHA-256 provenance sidecar. Concurrent requests for the same clip share one acquisition. A process restart reuses the persistent cache after verifying it again.

The cache limits acquisition to four simultaneous downloads and eight requests per second. HTTP 429 responses impose a shared cooldown honoring `Retry-After`. GET, HEAD and byte-range requests use the existing media server after verification. Unknown routes return 404; unavailable or malformed metadata produces an audio error rather than the reader's HTML page. The server never changes the source index or deferred manifest.

Disconnected readers leave the acquisition queue and rate limiter. An active transfer is canceled when its last subscriber leaves; another live subscriber keeps a shared transfer running. Canceled passages reserve no future request slots, so fast-forwarding cannot leave a queue of discarded voice requests delaying the current line. Real HTTP regressions cover cancellation, bounded current-voice latency and shared subscribers.

Deferred clips still need a successful first acquisition while online. A chapter is ready for offline use only after its complete download finishes; listing verification alone is not an offline download. Bulk staging remains optional and restartable, with checksummed files under `.cache/pjsk/prefetch/`. `npm run test:pjsk` includes listing-proof and deferred-cache checks covering integrity failures, concurrent acquisition, rate limits, local cache reuse, persistent restart, ranges and authorization removal.

## Closeout: 2026-10-17

Work stopped at the user's requested CN main-story and available-event reading milestone. The catalog contains 188 collections and 1,623 episodes: all 125 main-story episodes and 1,498 event episodes across 182 events. The 128 event episodes without original CN scripts remain excluded. No acquisition, publication or browser-test jobs remain active.

The backend remains running at `http://127.0.0.1:4481` in psmux session `onlystory-pjsk-backend`, namespace `codex`. Use the full session name for control commands; short pane IDs can resolve to another session. Attach with `psmux -L codex attach -t onlystory-pjsk-backend`. The temporary production-test server on port 4482 is stopped. A fresh live browser check at closeout confirmed the catalog counts with no page errors.

Archive evidence is `.cache/pjsk/all-events-validation/validation-summary.json`. The subsequent blinking fix passed its real-model regression, eyebrow and multi-model animation checks, the build and 42 unit tests. Preserve the generated catalogs, source caches and separate PJSK library as described in [deployment.md](deployment.md); Git alone does not contain the imported stories or media.

## Optional future work

1. Compare timing and character framing against a game recording. Browser playback is implemented; exact game fidelity has not been established.
2. Complete the full event-validation gates, including native reference comparisons and authoritative CRI music-block routing. Reproduce native 3D performances in a separate renderer before claiming full game fidelity for the main-story finales.
3. Acquire future CN event scripts when their original directories become available. Keep text/voice pairing explicit and audit coverage before publication.
4. Add card, character, area, special and MySekai stories, and playable libraries for other languages.

## Source references

Paths and field meanings were checked against Sekai Viewer's [story loader](https://github.com/Sekai-World/sekai-viewer/blob/dev/src/utils/storyLoader.ts), [scenario definitions](https://github.com/Sekai-World/sekai-viewer/blob/dev/src/story-scenerio.d.ts) and [regional URL configuration](https://github.com/Sekai-World/sekai-viewer/blob/dev/src/utils/urls.ts). The implementation parses the public JSON format; no player implementation was copied. Example inputs are the [CN unit master](https://raw.githubusercontent.com/Sekai-World/sekai-master-db-cn-diff/main/unitStories.json), [CN event master](https://raw.githubusercontent.com/Sekai-World/sekai-master-db-cn-diff/main/eventStories.json) and [CN prologue scenario](https://storage.sekai.best/sekai-cn-assets/scenario/unitstory/idol-story-chapter/mmj_01_00.asset). Imported game content stays outside Git.
