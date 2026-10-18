# GFL1 Steam global pipeline

## Collection artwork

All 60 imported collections use original artwork from the installed Steam EN client. Chapters 0–13 use their native chapter-map banners from `resourcetitle.ab`; the 37 native events and the nine collaborations use campaign-selection banners from `resourceiconops.ab`. Cube+ shares the original Cube campaign banner. The installed client ships no 480×155 `_base` variant for Operation Rabbit Hunt, so its original 298×149 `missionselect_RabbitHunt` selection texture is exported at native size with that limitation recorded in the artwork record. No unofficial artwork was needed. These are original selection banners, not newly commissioned illustrations or generated covers.

Run `.cache/gfl1-venv/Scripts/python.exe scripts/gfl1-covers.py --library-root .cache/gfl1-library` after importing the catalog. The script reads the game without modifying it, exports lossless WebP files into `private/gfl1/covers`, and adds only GFL1 entries to `src/cover-art.json`. It avoids the shared `private/covers` junction. Normal reading and builds use the exported library and do not need Steam or network access.

Each record retains the original bundle name/hash, texture name/path ID, decoded pixel hash, exported file hash and publisher credit. Banners retain their full native proportions in the catalog and collection headers. The artwork manifest supports separately labeled unofficial artwork with creator/source credit if a future collection needs a fallback. `tests/gfl1-covers.spec.ts` checks all 60 local images, source records, browser decoding, proportions, mobile overflow and visible credits.

## Main-story coverage

`--all-story` discovers the 14 numbered main-story replay rows from installed `5186.stc` and combines them with the 37 event collections. It does not infer released chapters from `ChapterConfig`: that file includes Chapter 14, but this installation has no Chapter 14 replay row or scripts. The 373 main-story source scripts are each published once, including all native Normal, Emergency and Night sections. Four unassigned scripts remain in explicit appendices rather than receiving invented replay placement. The original Chapter 1 collection ID and passage IDs remain valid. Its collection now includes Emergency and Night too.

Chapter names use native `ChapterConfig` titles; sections, mission titles, triggers and ordering use native replay/story tables. Collection release dates describe initial English availability, not the later addition of Night mode. Their sources are retained in `scripts/gfl1-release-dates.json`.

The legacy visual commands `拉伸`, `平移`, `打海猫2` and `开火` are retained as unavailable native effects with reader notices. They no longer truncate dialogue. Native audio commands on those rows still play. Chapter 13 references original background names `TEAPARTYNIGHT` and `LAKE`, which have no exact installed texture or matching historical manifest asset. These are visible missing-image notices and collection warnings. `gunCGlake` is a different native identity and is not silently substituted. Missing optional media URLs are omitted from packages, allowing the strict decoder to retain the original dialogue.

The new `BGM_SpecialOPS` references at `5-1-1N:13`, `7-3-2E:7` and `7-4-1E:1` are verified spelling/binding mismatches. Pinned corresponding CN scripts have the same row counts and control tags, but use `BGM_NightOPS`; that native cue maps to installed `GUN_CineTense_loop`. The scoped alias retains source hashes and native bank hash. The five previously unresolved audio cues remain unresolved.

To regenerate the complete catalog:

```powershell
.cache/gfl1-venv/Scripts/python.exe scripts/gfl1-catalog.py --stc-root "<GAME>/GirlsFrontLine_Data/StreamingAssets/Res/Pc/stc" --all-story --output .cache/gfl1/collections.json
.cache/gfl1-venv/Scripts/python.exe scripts/gfl1-extract.py --selection .cache/gfl1/collections.json --output .cache/gfl1 --reuse-cache .cache/gfl1 --library-root .cache/gfl1-library --vgmstream PATH/TO/vgmstream-cli.exe
npm run import:gfl1
```

Use `tests/gfl1-main-story.spec.ts` for exact source inventory, complete-dialogue, section navigation and early/late playback checks. The expanded package audit checks every published graph and asset and permits only the two explicitly named Chapter 13 image gaps.

## Expanded native event catalog

The expanded selection contains all 37 negative-campaign collections in the installed Steam English replay registry, plus all 14 numbered main-story chapters, 0–13. It includes Arctic Warfare, Singularity, Isomer, Shattered Connexion, Polarized Light, Mirror Stage, Poincaré Recurrence, Fixed Point, Longitudinal Strain, Slow Shock and the later replay collections. This covers the native event registry, not every script in the game archive.

Release sorting uses first English-server availability from the sourced [release-date registry](../scripts/gfl1-release-dates.json). Reruns, permanent campaign additions and the Steam port do not reset these dates. Seasonal and minor events interleave with main events, and newest-first reverses the chronological sequence. Source order remains the installed replay menu order, which differs from English release order. Import provenance retains each date's source and any conflicting-source notes.

Native replay references select 1,478 event scene entries. One entry, Maze Guess `-59-EXT-AR1`, has no source asset in the installed archive and remains an explicit unavailable scene in its native position. Quantum Fluctuations includes 24 explicitly referenced `-77-A-*` scripts from another campaign prefix. The 306 scripts without native replay placement remain in separate, clearly marked appendices.

The missing Maze Guess reference is recorded by native story-util row 1097 for mission 11321. All five installed text bundles, 6,192 TextAsset entries in total, lack that name or an alias. The public `gf-data-us` current archive and January 2023/July 2024 snapshots also lack it, and exact filename histories return no revisions. Dimbreath's archived English corpus likewise lacks it. Local evidence and raw response hashes are retained in `.cache/gfl1/maze-source-audit.json` and `.cache/gfl1/maze-public/audit.json`. No replacement dialogue is generated.

Including all main-story chapters and collaborations, the published catalog has 2,254 scenes, 117,788 retained source rows and 120,905 compiled passage nodes. There are 2,253 fully compiled scenes and one missing-source placeholder. Additional compiled nodes preserve investigation subsets, quiz retries and branch-specific continuation state; they do not add source dialogue. Extraction resolves 768 background entries, 530 portrait entries, 251 BGM cues and 306 sound effects. Five BGM cues (`SpecialActivity`, `bossbattle_loop`, Valhalla's jukebox song `m_va_spirit_potion`, and the intra-script pause/unpause cues `BGM_Pause`/`BGM_UnPause` referenced by Glory Day rows) and six SFX cues (`AVG_20Winter_Error`, `AVG_20Winter_Open_Light`, `AVG_The_Division_Grenade_Explosion`, plus `AVG_2023Slow_Heart_telescreen3`, `AVG_Division_Camera` and `AVG_Division_Flare_Gun` from the collaborations) remain unresolved. The three missing backgrounds are Chapter 13's `TEAPARTYNIGHT` and `LAKE` and Through the Looking-Glass's `2022saros_Sky` at `-64-3-0:4` and `-64-4-0:208`; each is a visible missing-image notice. Collection notices disclose these gaps; no unrelated tracks replace them.

## Collaboration events

All nine collaborations released on EN are selected through [the collaboration registry](../scripts/gfl1-collaborations.json): Operation Rabbit Hunt, Valhalla, Glory Day, Dream Theatre, Bounty Feast, My Devil's Frontline, The Glistening Bloom, Through the Looking-Glass and Lorenz Butterfly. Together they add 403 original English scenes. Their first EN dates join normal release sorting, and the Collaboration filter includes all nine.

The installed replay table omits collaborations. The importer uses original `5044.stc` story relationships and `5016.stc` mission titles instead, and records `replayId: null`. Rabbit Hunt has no surviving story-util rows; its four native mission subs and explicit original file suffixes establish its sequence. Bar stories, named tutorials, triggered dialogue, alternate endings and source scenes without a confirmed placement remain separate from the main sequence. Original dialogue is never reordered inside a script.

Valhalla's eight `VA11_*` bar scripts retain their jukebox choices and preferred/alternative drink response branches. Drink-outcome choices replace ingredient mixing; native perfect/good recipe IDs remain in the audit. Bounty Feast's snowfall uses an approximate browser overlay with reduced-motion support and retains its native start/reset commands. Lowercase night tint, a slow background fade and one bounded legacy tutorial delimiter repair are supported. All nine use official native collection banners with source hashes and publisher credit; Operation Rabbit Hunt's banner is the native 298×149 selection texture because no larger `_base` variant ships in this client.

Source-row deep links replay prior original choices instead of inventing story state: reaching a Valhalla bar row requires the jukebox answer on the link (`choices`), and row links without it stop before the choice rather than guessing. The audio gaps disclosed in the catalog-audit counts above fall inside the collaborations: Valhalla's jukebox song `m_va_spirit_potion` has no exact stream, Glory Day's `BGM_Pause`/`BGM_UnPause` have no current template entries, Bounty Feast lacks `AVG_Division_Camera` and `AVG_Division_Flare_Gun`, and Lorenz Butterfly lacks `AVG_2023Slow_Heart_telescreen3` plus the `2022saros_Sky` background on two rows. Each stays an explicit unavailable entry with its notice; no other cue is substituted.

Hitoribocchi's `-14`/`-15` scripts are present only in Chinese and the collaboration never released on EN. They remain archived and excluded from the English catalog. They are not translated or given a fabricated EN release date.

To regenerate all main chapters, replay events and collaborations, pass both `--all-story --collaborations` to `scripts/gfl1-catalog.py`, then pass that generated registry to extraction with `--selection`. Run the normal importer and cover exporter afterward. The collaboration registry is separate from the native replay table so future changes cannot silently create fictitious replay rows.

## Audio recovery and evidence

Six of the original eleven missing cues now resolve through the checked [audio alias registry](../scripts/gfl1-audio-aliases.json), without changing archived scripts. `Room` maps to native `BGM_Room` only at `-41-3-7:90`, matching the corrected CN script at the same scene and control row. `AVG_Gray_Hand_Mech` maps to native `AVG_Grey_Hand_Mech`, supported by three corresponding CN/EN script rows. Source commits, hashes, native bank hashes and stream indexes remain in provenance.

All four `BGE_*` epilogue identifiers exactly match the installed GFL2 `BGE_AVG_Chapter01` CueNameTable. Their original bank, native decryption-key sidecar and stream indexes are retained under `.cache/gfl1/recovered-banks/`. Each bank decode was compared byte-for-byte against the corresponding isolated original HCA decode. The cross-title source is explicit in provenance; this bank is not presented as part of the GFL1 installation. The recovered Ogg files join normal chapter downloads and use the existing reader sound channels.

Alias use is guarded by native bank and sidecar hashes. Cache reuse also requires matching stream mapping and audio kind. A conflicting new AudioTemplate mapping or an occurrence outside an approved source-row scope leaves the cue unresolved for review. `--reuse-cache` copies the recovered banks and keys so audio-only extraction remains reproducible. Normal reading and builds need only the decoded media library.

The investigation inventoried all 352 installed CRI banks and 1,450 streams, plus built-in Unity resources. Historical English native banks/templates and corresponding regional scripts were checked. `SpecialActivity` has two disabled, conflicting template targets, so neither is selected. There is no verified binding for `bossbattle_loop`. The remaining earlier AVG cues also occur uncorrected in other regions and lack exact streams, including the checked historical bank. Similar `21Winter_*` and `BT_The_Division_*` names are candidates, not verified replacements. The collaboration-era gaps were checked the same way: `m_va_spirit_potion` is absent from installed banks and current/historical archives, `BGM_Pause`/`BGM_UnPause` have no AudioTemplate entries, and `AVG_Division_Camera`, `AVG_Division_Flare_Gun` and `AVG_2023Slow_Heart_telescreen3` have no exact streams. Local investigation records remain under `.cache/gfl1/audio-recovery-{bgm,avg,bge}.json`.

## Interactive scenes and branch state

The 21 formerly blocked, available source scripts now compile completely. Native `<t>` and `<cg>` investigations return to menus with the inspected location removed; subset nodes preserve the chosen order through reloads. The shared unnumbered passage in `-58-S4-1` remains reachable on each relevant visit. Native `<r>` quizzes retain their `<true>` answer key, show the source's incorrect-answer dialogue and return to a retry menu until the correct answer unlocks the report. Retry back-edges require exactly matching persistent scene state.

`InputBox` renders an actual password form. Incorrect codes retry without advancing; the original source keycode unlocks the next passage. Keyboard advance and fast-forward cannot bypass the lock. The source error strings remain in the package.

The three `ShootPanel` gates in `-77-A-44` render the original injured-William and Commander-gun Cubism models over native background 890. The required manual shot triggers the source's timed pistol/tinnitus clips and then continues. Six original target motion files and four gun motions converted from native unweighted Hermite curves are packaged with both MOC3 files and original textures, 16 assets total. Numeric motion-code mapping is inferred and retained in extraction provenance; browser framing and tween presentation remain approximate. These are live model scenes, not invented movie files. Model resources are included in downloads and loaded through the shared cache-aware Cubism adapter.

When choice paths have different persistent backgrounds or audio at a common source row, the compiler creates state-specific node variants until those states converge. Source row numbers remain stable. Existing GFL1 source-row links and saved paths replay their choices into the correct variant; explicit variant links remain exact. Invalid or skipped saved paths still fail validation.

Unsupported interactions and ambiguous branch joins stop at an explicit blocking passage. Their original source rows remain available; the importer does not invent choices or silently discard the remaining text. Native effect-prefab references remain disclosed approximations. A prefab named `NoiseVideo` is not treated as evidence of a movie file.

The archive retains all 3,713 original TextAsset entries under content hashes, including duplicate names (3,251 unique names). The English tip `-71-15-EXT` uses a narrowly verified GB18030 decoding: the exact 218-byte source round-trips without loss. Its readable UTF-8 export and byte-identical raw export both remain available, with encoding provenance.

To rebuild this selection, generate the registry first, then extract against that exact selection:

```powershell
.cache/gfl1-venv/Scripts/python.exe scripts/gfl1-catalog.py --stc-root "<GAME>/GirlsFrontLine_Data/StreamingAssets/Res/Pc/stc" --all-events --output .cache/gfl1/collections-expanded.json
.cache/gfl1-venv/Scripts/python.exe scripts/gfl1-extract.py --all-events --selection .cache/gfl1/collections-expanded.json --output .cache/gfl1-expanded --reuse-cache .cache/gfl1 --library-root .cache/gfl1-library --vgmstream PATH/TO/vgmstream-cli.exe
$env:ONLYSTORY_GFL1_EXTRACTED = '.cache/gfl1-expanded/extracted.json'
$env:ONLYSTORY_GFL1_COLLECTIONS = '.cache/gfl1/collections-expanded.json'
$env:ONLYSTORY_GFL1_STAGE_DIR = '.cache/gfl1-expanded/compiled'
npm run import:gfl1
```

Staging writes catalog, report and provenance into the stage directory while adding content-addressed packages to the media library. It leaves the live catalog unchanged. Clear `ONLYSTORY_GFL1_STAGE_DIR` and import again to publish after verification. Preserve the extraction directory, including `archive/`, caches and source scripts, alongside the media library for future rebuilds.

The following sections record the original four-event validation milestone and its regression cases; their smaller counts describe that subset.

## Initial validation milestone

The validation milestone imports four source-script inventories from the installed Steam English client, plus the existing Chapter 1 Normal baseline. This exercises early events, map and round triggers, alternate endings, later visual commands and real choice branches.

| Collection           | Campaign IDs            | Scripts | Source passages |
| -------------------- | ----------------------- | ------: | --------------: |
| Chapter 1 Normal     | 1                       |      12 |             113 |
| Operation Cube       | -1                      |      11 |             326 |
| Deep Dive            | -10, -11, -12, -13      |      46 |           1,062 |
| Continuum Turbulence | -24, -25, -26, -27, -28 |      86 |           4,020 |
| Dual Randomness      | -41                     |      80 |           4,513 |
| Total                |                         |     235 |          10,034 |

The events contain 60 choice nodes and 200 numbered branch rows. Every nonblank source row is retained with its original one-based line number, and every compiled node is reachable across the alternatives. The two Hurricane Rescue scripts under campaign -27 were added after recovering the native Continuum Turbulence replay definition. Bare anniversary-letter filenames such as `-1.txt` are excluded: event selection requires the campaign ID followed by a hyphen.

## Rebuild

Python 3.13, UnityPy and the official [vgmstream r2117 Windows CLI](https://github.com/vgmstream/vgmstream/releases/tag/r2117), plus FFmpeg, were used. Node uses the project's installed dependencies.

```powershell
python -m venv .cache/gfl1-venv
.cache/gfl1-venv/Scripts/python.exe -m pip install -r scripts/gfl1-requirements.txt
.cache/gfl1-venv/Scripts/python.exe scripts/gfl1-extract.py --milestone --output .cache/gfl1 --library-root .cache/gfl1-library --vgmstream PATH/TO/vgmstream-cli.exe
.cache/gfl1-venv/Scripts/python.exe scripts/gfl1-catalog.py --stc-root "<GAME>/GirlsFrontLine_Data/StreamingAssets/Res/Pc/stc"
npm run import:gfl1
npm run dev
```

Use the same library root for extraction, importer and server. In this worktree, ignored `.codex/worktree.local.json` selects `.cache/gfl1-library` and port 8953. Its other game directories link the existing library; GFL1 media stay local. Do not write through the shared `public/private` junction. A main checkout can instead use `--library-root public` with its normal local-environment configuration.

The extractor discovers Steam EN app 3887700 through Steam's registry and library manifest. `--game-root` or `GF1_GAME_ROOT` overrides discovery. It reads the installed resources without starting or modifying the game. `--campaigns` selects explicit campaign IDs in addition to the Chapter 1 baseline; omitting both campaign options imports only that baseline. `--audio-only` refreshes audio from an existing extraction. `--ffmpeg` selects its executable.

The catalog tool reads native STC tables and recovers `story_playback` and `story_util` localization directly from `assettexttable.ab`; it needs no manually generated probe cache. `--scripts`, `--localization-dir` and `--output` override its paths. The importer reads `.cache/gfl1/extracted.json` and `.cache/gfl1/collections.json`; `ONLYSTORY_GFL1_EXTRACTED` and `ONLYSTORY_GFL1_COLLECTIONS` override them. Normal builds do not require Steam or run extraction.

## Ordering and coverage

`scripts/gfl1-catalog.py` decodes installed `5044.stc` story relationships and `5186.stc` replay collections. It validates lengths, row counts, complete file consumption and sparse ID/offset indexes. Field names follow the [community STC schemas](https://github.com/gf-data-tools/gf-data-ch/tree/main/stc); values and bundle hashes come from the installed English client.

Native replay sections organize the event catalog. Unnumbered native subchapter-zero material, including Deep Dive’s Imaginary Maze, is listed as additional gameplay material outside the main sequence. Map, round, step and failure dialogue retain native trigger IDs and appear separately because gameplay controls their timing. Repeat endings are alternatives. Sixteen CT/DR source scripts lack selected native replay references and appear in an explicitly unresolved appendix. These scenes each have a separate path, so the reader does not automatically chain unrelated scripts. No selected native reference is missing. Chapter 1 retains mission/phase filename order and the native ChapterConfig title. No release dates are invented.

## Text, images and audio

- `scripts/gfl1-story.mjs` compiles ordered commands, real choices, interleaved numbered branches and joins. Branches propagate independent persistent scene/audio state. Unknown syntax and ambiguous joins block playback and remain audited; source rows after a block are preserved.
- Packages contain complete background, portrait, BGM, mask, sparks and looping-sound snapshots. Seeking and saved branch links restore state; a separate end node preserves the final dialogue.
- Original lossless RGBA images cover 87 background entries, 94 portrait names and all 167 required expression pairs. BIN/CG and montage Pic dependencies are extracted. External Unity references are resolved. NytoIsomer uses its native GameObject name because its imageName incorrectly retains MP5Mod. Raw portrait orderScale metadata is preserved for further fidelity work; browser actor scaling remains approximate.
- Audio resolves logical aliases through installed AudioTemplate, inventories CRI subsongs, copies external AWB sidecars when present and records source/output hashes, stream indexes, durations, sample rates and native loop metadata. There are 32 recovered BGM cues and 36 sound effects. Repeated commands apply in source order; the last action on each SE1/SE2 channel replaces or stops its previous cue. Unnumbered SE is audited as SE1. Loop snapshots restore on seeking; browser looping repeats the decoded clip. One-shots finish across natural dialogue advancement but stop on seeking, fast-forward, completion and unmount. Music and effects have separate volume controls. Dialogue voices are not imported.
- BGM_Sunshine resolves to the original home_formation_factory bank (64.862 seconds); Gunfight uses exact AVG subsong 263 (4.464 seconds). Duplicate exact-name GF_MAP3_BGM subsongs use the first native bank index with all candidates recorded in provenance.

The initial milestone had three unresolved BGM cues across five source references. `Room` at -41-3-7:90 is now recovered through the scoped native-script correction above. `bossbattle_loop` at -11-4-1:1, -11-4-2End:4 and -25-2-1:30 and `SpecialActivity` at -24-8-1:43 remain unresolved after the full bank audit. Collection notices disclose the gaps.

## Rendering limits

Original assets are displayed with browser approximations of Night, memory masks, sparks, letterboxing, actor coordinates/shake and CG/Pic montages. Native transitions and rate/timing semantics are not reproduced exactly. Plain text preserves readable color/size-tag content; style runs remain in packages and text styling is audited. Native rolling credits at -41-6-2:132 remain unavailable and have an explicit reader notice. The original script is accessible from Story information. Command-only rows remain seekable passages with manual advancement; empty dialogue panels are hidden in scene view. Native automatic sequencing is unverified.

Communication uses the native LayerBord and LayerBord_Top sprites, a clipped full-color portrait, blue patterned screen and scan line. The supplied reference shows tactical terrain underneath. The native White utility texture is translucent black, with alpha 65/255. It shades a gameplay underlay; it is not an opaque white background. `scripts/gfl1_gameplay.py` resolves native story relationships from 5044.stc and mission terrain from 5016.stc, exporting 88 original map rasters for 1,692 script references. A selection-registry extraction derives its native campaign scope from the selected scripts' campaign prefixes when no `--campaigns` argument restricts it, so collaboration and replay-event scripts keep their native terrain instead of silently falling back to Chapter 1 only; 549 scripts without an unambiguous single terrain resource remain audited as approximate. Cube -1-4-1 uses native mission 10004 and Chapter1_Y; its rerun terrain remains separate in provenance. Terrain camera framing and blur are approximate, and tactical units/nodes are not drawn. Ambiguous multi-resource maps remain audited; communication can retain illustrated context as a fallback. Reduced motion applies to both browser animation and JavaScript montages, including the operating system preference; ordinary flashes never obscure the scene with an empty montage.

## Outputs and verification

The archive cache retains all 3,713 TextAssets. `.cache/gfl1/import-report.json` records per-scene accounting, command approximations, asset gaps and native collection provenance. The served `private/gfl1/provenance.json` includes that report and archive hashes. Content-addressed chapter packages, original scripts, images and Ogg audio live under `private/gfl1` in the selected library. `src/generated/gfl1-catalog.json` contains only lazy metadata. These generated/private files are ignored by Git and must accompany a deployed library. A checkout without the optional catalog still builds.

```powershell
node --test scripts/gfl1-story.test.mjs
.cache/gfl1-venv/Scripts/python.exe -m unittest discover -s scripts -p 'gfl1*test.py'
npm test
npm run test:import
npm run build
npx playwright test tests/gfl1.spec.ts tests/gfl1-milestone.spec.ts tests/gfl1-backgrounds.spec.ts --workers=1
```

Compiler checks cover the actual event corpus, branch reachability and every source row. Decoder checks reject broken choice links and invalid nested montage/loop assets. Browser checks exercise event lists, choices, reload/link restoration, original image loading, real audio playback, seeking, reduced motion and downloaded playback with private-media requests blocked.

The full GFL2 browser suite still requires source-book caches absent from this worktree. An earlier shared-reader run passed 37 of 38 selected tests; the remaining large-catalog test assumes a fixed source-order scroll position despite the existing newest-release default. These limits are separate from the GFL1 milestone.

### Milestone validation on 2026-10-16

The production build passes. All 45 unit tests pass with one existing skip; all 39 importer tests, 10 Python tests and 15 GFL1 browser tests pass. Browser checks cover every one of the 235 packages and all local dependencies, exactly five unresolved music references across three cues, branch saves/shared links, real sound playback and stops, offline media, and desktop/mobile reduced-motion effects. Independent ordering review corrected unnumbered ancillary placement. Desktop and phone screenshots were inspected after hiding the empty montage dialogue panel.

The persistent worktree server remains in tmux/psmux session `onlystory-gfl1-backend` on port 8953. Generated catalog/media remain local and ignored by Git.

### Background correction

The two reported reproductions were locked down before the fix: Cube -1-4-1:19 rendered the White shade over a white canvas, and CT -24-8-1:88 had no blackout presentation. Cube now composites its original mission terrain, native shade and portrait separately. The terminal empty White passage after a blackout settles on black and keeps that endpoint on the end card. Natural advancement uses an approximate 0.6-second fade; seeking restores the endpoint immediately, and reduced motion disables the fade. Other native transition timing remains audited as approximate. Ordered commands determine the preceding blackout state, including rows containing multiple screen/dot commands.

To refresh only terrain in an existing extraction, use the extractor's `--gameplay-only` flag with the existing `--output` and `--library-root`, then rerun `npm run import:gfl1`. The helper reads both native tables directly, requires no generated catalog cache, records selected mission variants and hashes, and audits missing or ambiguous rasters. The original gray field came from a material/composition error even though the texture file existed; dependency-presence checks alone could not detect it. Browser regression checks now verify the actual map raster, seek/reload behavior, natural fade progress, final black endpoint and rewind.

After this correction, all 18 compiler tests, 45 unit tests, 13 Python tests and 17 GFL1 browser tests pass. The production build passes; the existing unit skip remains unchanged.

### Repeated background clicks

Rapid double/triple clicks on artwork could create a browser selection, initially only a newline and sometimes extending into the next passage's speaker label. The reader's selection guard then suppressed pointer advancement while Space continued to work. Whitespace-only selections no longer block clicks, and GFL1 artwork is nonselectable and nondraggable. Dialogue drag selection remains available. `tests/gfl1-input.spec.ts` checks repeated native mouse click counts through For the Future passages 16–25 and verifies selecting dialogue, clearing the selection and resuming reading. The shared reader's existing selection/choice check also passes.

### Collaboration import and validation on 2026-10-17

The nine-collaboration import published 2,254 scenes (403 collaboration scenes across nine collections, `replayId: null` provenance) and re-exported covers for all 60 collections, including the nine collaboration banners. Three regressions were found and fixed before final validation: the cover exporter accepted the native 298×149 Rabbit Hunt selection banner (the only original artwork shipped for it); `recover_gameplay` now derives its campaign scope from the selected scripts' prefixes when a selection-registry run passes no `--campaigns`, restoring 1,692 native terrain references for events and collaborations; and the reader's strict validators accept the `snow` overlay effect and private asset names with spaces (a collaboration cue keeps its native space in its name). `tests/gfl1-milestone.spec.ts` and `tests/gfl1-audio-recovery.spec.ts` expectations were updated to the current published state, and the expanded-package image-gap allowlist now names the documented Looking-Glass `2022saros_Sky` gap alongside the Chapter 13 gaps.

After this correction: all 45 unit tests, all 67 importer tests (including the three GFL1 compiler suites), all 33 Python tests, and the GFL1 browser suites pass (collaborations 3, covers 2, event-filter/status and release-order 6, expanded 5, backgrounds and audio recovery 5, milestone 8, core 18, interactions/input/covers 16). The production build passes; the dev server in psmux serves the worktree on port 8953.
