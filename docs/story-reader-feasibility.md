# Story reader feasibility research

Research checked on 2026-10-15. These findings distinguish verified repository contents, project claims, and engineering recommendations. We inspected primary project sources, fetched sample data, and read the local GFL2 prototype. We did not run the extraction pipelines, audit complete archives, or compare community playback end to end against the games. The GFL2 simulator browser check returned an internal error; its separate data endpoints worked.

## Overall assessment

**Build it. A common browser reader is feasible for all four games.** The common reading interface is straightforward compared with importing each game's scene semantics and checking archive completeness. Existing community projects demonstrate browser playback for Blue Archive, GFL1 and PJSK. GFL2 has usable public converted scripts plus local extraction evidence, but faithful character and 3D playback remains the largest uncertainty.

| Game | Text + images + BGM/voice | Faithful scene playback | Best starting point | Principal uncertainty |
| --- | --- | --- | --- | --- |
| Blue Archive | High confidence | Strong existing 2D player; special effects need tests | BA Archive player and scripts | Asset layout, newer commands, animation/runtime dependencies |
| Girls' Frontline 1 | High confidence | Strong existing VN implementations | gfStory-en / gfStory; Cutscene Interpreter | Battle/map dialogue and late-event completeness |
| Project SEKAI | High confidence | Existing Live2D interpreter and extraction tools | Sekai Viewer `dev` and Assets Updater | Concurrent effects, incomplete command handling, region differences |
| Girls' Frontline 2 | Tested text/CG/BGM/SFX; voice playback untested | Tested local opening excerpt; broader fidelity unproven | Local prototype plus OGAS converted Utage data | Character commands, custom effects, native 3D/timelines, archive coverage |

These ratings are engineering judgments based on the evidence below, not certifications of every story. A claim of "supports game X" should name supported story categories and disclose missing scenes and effects.

The recommended product is one library, one reading interface, four importers, and game-specific scene renderers where needed. Design the general UI and its feature behavior first, checking the design against all four games and both deployment modes. GFL2 is the first integration candidate after that design work, because the user knows its presentation and an existing prototype provides a concrete foundation. Use common controls and themes without forcing Blue Archive's Spine presentation, PJSK's Live2D timeline, and GFL2's Utage/3D commands into an impoverished dialogue-only format. The proposed service and package boundaries below remain architectural hypotheses until the UI/feature review establishes their requirements.

The practical target is complete reading with strong 2D presentation, explicit unsupported-command reports, and video support. Exact reproduction of every native 3D sequence should be a separate goal. Authentic prerendered movies can be converted for browser playback; real-time 3D scenes require a renderer port or an explicitly labeled recorded fallback.

## Blue Archive

**Feasibility: high for a substantial browser reader; medium for faithful playback of every special scene.** The strongest starting point is the existing BA Archive player, rather than rebuilding the game's script interpretation from reverse engineering.

| Resource | What it actually provides | Practical use and limits |
| --- | --- | --- |
| [BA Archive monorepo](https://github.com/ba-archive/blue-archive), [live site](https://blue-archive.io/) | Viewer, editor, translation tooling, and a separate `lib/ba-story-player` component | The direct reference for scene playback. The old [standalone viewer](https://github.com/ba-archive/blue-archive-story-viewer) was archived in 2023 and directs development to this monorepo. Root license is AGPL-3.0. |
| [Player component documentation](https://github.com/ba-archive/blue-archive/blob/main/lib/ba-story-player/README.md) | Accepts story data and a configurable asset-server URL; documents CN/JP/EN/TW selection, fullscreen, and MP3 fallback | This is an embeddable engine, not merely a transcript website. Documentation is not a completeness guarantee. |
| [Actual prologue script](https://github.com/ba-archive/blue-archive/blob/main/apps/blue-archive-story-viewer/public/story/main/11000.json) | Ordered command-bearing JSON with background, BGM, sound, transition, Japanese voice, selection-group, and localized text fields | Enough structure to translate into a common reader format without OCR. The sample contains JP/CN/TW/EN/TH text; not every episode or player version necessarily supports every field. |
| [ZM-Kimu/Blue-Archive-Asset-Downloader](https://github.com/ZM-Kimu/Blue-Archive-Asset-Downloader), [English documentation](https://github.com/ZM-Kimu/Blue-Archive-Asset-Downloader/blob/main/docs/README.en.md) | Claims download and extraction of bundles, media and tables for CN, Global and JP; MIT tool code | Strong candidate for development-time acquisition. Current documentation requires Python 3.11+/uv and .NET 10, warns interfaces change, and suggests 50 GB free space for a full regional extraction. This is extraction capacity, not final reader download size. No assets were downloaded in this research. |
| [LADR](https://github.com/lorearchive/LADR), [reader](https://ladr.lorearchive.org/), [JSON corpus](https://github.com/lorearchive/ladr-json) | A React text-oriented story reader and separately maintained JSON | Useful for transcript/search presentation. MIT explicitly excludes game Excel tables and the related JSON/image repositories. The current JSON repository visibly lists volumes 1–4 and volume 5 chapter 1; do not infer complete/current story coverage. |
| [K0lb3's older asset downloader](https://github.com/K0lb3s-Datamines/Blue-Archive---Asset-Downloader) | Global download/extraction and table-decryption code | Historical format reference, archived October 2023; not a first choice for a current pipeline. |

The [BA script translator source](https://github.com/ba-archive/blue-archive/blob/main/lib/ba-story-player/lib/layers/translationLayer/index.ts) confirms actual parsing of waits, choices, character positioning/expressions, camera commands, background effects, Spine backgrounds and `#video` instructions. It turns raw rows into a presentation structure before rendering. The [sound layer](https://github.com/ba-archive/blue-archive/blob/main/lib/ba-story-player/lib/layers/soundLayer/index.ts) handles BGM loop ranges, sound effects and Japanese voice. This directly supports the proposed architecture of a game-specific importer feeding a common player.

There is still adaptation work. The [resource resolver](https://github.com/ba-archive/blue-archive/blob/main/lib/ba-story-player/lib/utils.ts) expects specific image/audio/table paths and rewrites some Spine assets to a separate Spine 4.2 dataset; an arbitrary extracted directory will not automatically match it. Start with background, portraits, dialogue, choices, BGM, SFX and video; treat game-specific animation/effect fidelity as a separate compatibility tier. This is an engineering recommendation based on those code paths.

Code licensing needs a deliberate decision: the monorepo root says AGPL-3.0, while [the player package manifest](https://github.com/ba-archive/blue-archive/blob/main/lib/ba-story-player/package.json) still says GPL-3.0 and depends on Esoteric Software's Spine runtime. Resolve the applicable licenses before copying or distributing that component. Neither code license licenses Nexon's/Yostar's game assets.

**Maintenance observation:** GitHub API metadata reported a repository push on 2026-08-18 for BA Archive and 2026-08-30 for ZM-Kimu's downloader. A push timestamp demonstrates activity, not successful current extraction or complete newest-story coverage. [BA metadata](https://api.github.com/repos/ba-archive/blue-archive), [downloader metadata](https://api.github.com/repos/ZM-Kimu/Blue-Archive-Asset-Downloader).

Two names should not be mistaken for a browser story solution: [Shittim Server](https://github.com/Neoexm/Shittim-Server) is a private server for the Steam game client, and [shittim-chest](https://github.com/reykim7854/shittim-chest) describes an interactive app without documenting a full story-import/playback pipeline. The first still needs the game installation; neither is the principal route recommended here.

## Girls' Frontline 1

**Feasibility: high for ordinary illustrated VN scenes; completeness and special sequences need explicit auditing.** Existing web playback and extraction pipelines already demonstrate the main technical path.

| Resource | What it actually provides | Practical use and limits |
| --- | --- | --- |
| [gfStory](https://github.com/gudzpoz/gfStory), [Chinese simulator](https://gfstory.pages.dev/simulator) | Vue simulator/editor/reader plus Python unpacking pipeline | Closest match to a VN player. Its README explicitly warns that many combat and map-point scenes have not been archived and that the maintainer has little motivation to maintain it. This warning does not mean the entire post-chapter-13 main story is missing: it concerns the combat/point-scene archive. |
| [gfStory-en](https://github.com/shiropantsu/gfStory-en), [English simulator](https://gfstory-en.pages.dev/simulator) | English fork with a documented build, extraction and static-site workflow | Useful English starting point, but requires checking later-event coverage separately. The source repository is not proof that the deployed corpus contains every latest event. |
| [GFL Cutscene Interpreter](https://gfl.amaryllisworks.pw/) | Script-driven scrolling reader with portraits/backgrounds, audio controls, effects, text search, exports and language options | Useful both as a reader now and a comparison corpus. It is not the same presentation as a timed, full-screen VN player. The page links directly to gfStory-en as a separate interactive player. |
| [Interpreter offline downloader](https://gfl.amaryllisworks.pw/offline_downloader/) | Maintainer-supplied Python workflow to create a local site mirror | Existing route to independent/local use without GFL installed; validate resulting scene coverage. |
| [gf-resource-downloader](https://github.com/gf-data-tools/gf-resource-downloader), [CN data](https://github.com/gf-data-tools/gf-data-ch), [English/US data](https://github.com/gf-data-tools/gf-data-us) | Resource acquisition and regional extracted metadata used by gfStory | Development-time pipeline ingredients, not a ready universal content pack. The gfStory-en [submodules](https://github.com/shiropantsu/gfStory-en/blob/main/.gitmodules) explicitly select the US data repository. |

The [English build script](https://github.com/shiropantsu/gfStory-en/blob/main/build.sh) downloads regional resources, unpacks backgrounds/characters/audio, generates story/chapter JSON, and builds a static site. This is concrete evidence that GFL 1 reading can run without its installed client once the conversion is done. Its dependencies include ffmpeg, vgmstream and image tooling, so acquisition/conversion belongs in development or an offline import tool, not the browser's normal reading flow.

The [gfStory player source](https://github.com/gudzpoz/gfStory/blob/main/src/components/viewer/StoryTeller.vue) implements sprites/backgrounds, looping BGM, SFX, dialogue options, history and adjustable automatic reading speed. The [compiler](https://github.com/shiropantsu/gfStory-en/blob/main/src/story/compiler.ts) already translates presentation lines through an intermediate representation. These are useful behavioral and format references even if a new common player is written.

The [Cutscene Interpreter JavaScript](https://gfl.amaryllisworks.pw/script.js) provides a pure `convertGFLTextToOpcodes` parser for MICA `.txt` scripts and explicit background, BGM, sound, portrait and video handling. It maps EN/CN/JP/KR resource languages, although actual episode availability and aligned translation coverage still vary. Its video handling includes a whitelist of special sequences: support for a `video` command is not proof of complete cinematic fidelity.

**Code reuse caution:** the interpreter declares AGPLv3 and exposes its delivered JavaScript, but its source-repository link requires an account. No root license file was found in the inspected gfStory/gfStory-en trees, and GitHub metadata reports no detected license. Public visibility alone is not a reuse grant; use them as references or seek permission before copying substantial code. Regional extracted data likewise has no detected repository license, which does not confer ownership of game content. [Interpreter license](https://gfl.amaryllisworks.pw/LICENSE.html), [gfStory metadata](https://api.github.com/repos/gudzpoz/gfStory), [English fork metadata](https://api.github.com/repos/shiropantsu/gfStory-en).

**Maintenance observation:** API metadata reported pushes on 2025-11-08 for gfStory, 2025-03-14 for gfStory-en, 2026-09-24 for CN data, 2026-09-08 for US data, and 2026-10-01 for the resource downloader. Recent data activity therefore exists even while the player forks are older; it does not establish that their build pipelines still run unchanged. [CN metadata](https://api.github.com/repos/gf-data-tools/gf-data-ch), [US metadata](https://api.github.com/repos/gf-data-tools/gf-data-us), [downloader metadata](https://api.github.com/repos/gf-data-tools/gf-resource-downloader).

For acceptance, compare at least one early scene, a late event, a branching scene, a battle/map-point dialogue and a video/effect-heavy scene against a game recording. Record exact missing commands and assets. For GFL 1, corpus completeness is a more immediate risk than basic browser rendering.

## Girls' Frontline 2

**Feasibility: high for a reading application; medium for broader 2D staging; unproven for native 3D/timeline fidelity.** Public converted story data exists, so starting from raw bundles is no longer the only route.

| Resource | Verified usefulness | Limits |
| --- | --- | --- |
| [OGAS GF2 Story Simulator](https://ogas.app/gf2/story/) | Public web application; its delivered client reads converted Utage books and resolves images, Live2D, audio, movies and subtitles | Browser navigation returned HTTP 500/Internal Error during this check. Separate HTTP fetches returned the app shell and compiled scripts. No public source repository or reuse license was established. Do not treat it as a dependable service or proven complete player. |
| [OGAS script mapping](https://assets.ogas.app/gf2/Utage/AdvBookAssetPathMappingSO.json) | Returned HTTP 200 with 3,105 plot-ID mappings | A catalog count, not 3,105 verified complete playable episodes. Coverage, provenance and availability of every dependency remain unaudited. |
| [OGAS A33001 book](https://assets.ogas.app/gf2/Utage/NewAVG_Activity/ChapterActivity33/A33001.book.json) | Returned a real 399-row Utage grid with command, argument, wait, text and voice columns; corresponds to the local prototype's opening script | Also contains six entity-data rows. The delivered client restores entity rows from `entityDataList` using `entityIndexTbl`; reading only raw row strings loses data. No claim of byte identity with the local installation. |
| [OGAS A02001 book](https://assets.ogas.app/gf2/Utage/Activity/ChapterActivity02/A02001.book.json) | A second real book returned 195 rows | Confirms another accessible scenario, not full archive coverage. |
| [exilium-tools](https://github.com/0x795E69D8/exilium-tools) | Bundle extraction, update comparison, audio extraction and movie-subtitle tools; GPL-3.0 code | Particularly relevant to the existing prototype's remaining import work. Test against the actual regional client and version. |
| [GF2AssetBundleDecryption](https://github.com/nijinekoyo/GF2AssetBundleDecryption) | Bundle decryptor and localization-table JSON export | Its [story parser](https://github.com/nijinekoyo/GF2AssetBundleDecryption/blob/main/Decryption/LangPackageTable.go) deserializes a text map. "Story mode" does not recover full ordering, character staging or sound assignment by itself. No root license was present in the inspected tree. |
| [GF2Decrypter](https://github.com/66hh/GF2Decrypter), [GF2ExiliumData](https://github.com/66hh/GF2ExiliumData) | Historical unpacker and data reference | Both archived; data repository last push reported 2023-10-08. Useful format history, unsuitable as the sole current catalog. |

The [bundle tool documentation](https://github.com/0x795E69D8/exilium-tools/blob/main/gf2_ab_decrypt/README.md) explicitly supports splitting concatenated bundles, catalog-based renaming, and header/size verification. The [audio tool](https://github.com/0x795E69D8/exilium-tools/blob/main/audio_extractor/README.md) exports ACB/AWB audio and loop metadata using vgmstream and FFmpeg. The [subtitle tool](https://github.com/0x795E69D8/exilium-tools/blob/main/subtitle_extractor/README.md) extracts USM `@SBT` tracks to SRT. Subtitle extraction alone does not convert the movie's image or audio streams.

OGAS's first-party delivered [client chunk](https://ogas.app/gf2/story/_app/immutable/chunks/p10Vd68h.js) is useful evidence even though runtime playback failed. It loads the mapping and books, resolves text through `AvgContentData` and language tables, substitutes the chosen commander/name, and maps original USM references to WebM video, separate Opus audio and SRT subtitles. It also resolves `.model3.json` Live2D resources and background images. Its [settings UI code](https://ogas.app/gf2/story/_app/immutable/nodes/2.DIERL9QZ.js) offers CN/JP/KR voices and multiple text languages. Those controls are not evidence that every selected locale/media combination exists or that translations are official. The [audio table](https://assets.ogas.app/gf2/Table/AudioData.json) returned 80,693 records and the [video table](https://assets.ogas.app/gf2/Table/VideoData.json) returned 59 records. Neither is an asset-completeness count. These hashed deployment URLs may change.

### What the existing local prototype proves

We inspected `C:\Users\krisspy\Projects\onlystory-gfl2`. Its older `feasibility.json` predates later progress and understates what is now present.

| Local evidence | What it establishes |
| --- | --- |
| [build_prototype.py](C:/Users/krisspy/Projects/onlystory-gfl2/build_prototype.py), [archive verification](C:/Users/krisspy/Projects/onlystory-gfl2/prototype/verification.json) | Broad reading prototype: 4,443 extracted text entries across 24 sections, six background previews, advance/backlog/save/resume/navigation. Numeric content-ID ordering and manual backgrounds are explicitly approximations. |
| [build_opening.py](C:/Users/krisspy/Projects/onlystory-gfl2/build_opening.py), [opening data](C:/Users/krisspy/Projects/onlystory-gfl2/prototype/opening.json) | A stronger slice: original A33001 rows 1 through 43, twelve Text commands and 31 preceding commands, original CG assignments, speaker lookup, music and four sound-cue references. |
| [resource mapping findings](C:/Users/krisspy/Projects/onlystory-gfl2/resource_mapping/findings.md) | A tested chain from plot IDs through Utage paths, hashed Addressables keys, catalog dependencies and physical bundle segments. Also documents original audio cue-to-waveform extraction and loop bounds. |
| [scene.html](C:/Users/krisspy/Projects/onlystory-gfl2/prototype/scene.html), [opening verification](C:/Users/krisspy/Projects/onlystory-gfl2/prototype/opening-verification.json) | Browser scene interpreter with layered images, effects, audio controls, backlog and previous-line visual restoration. Earlier recorded checks say all twelve steps were traversed with working decoded audio; this research inspected those checks rather than repeating them. |

The excerpt stops before the first Character command at row 45. It therefore does not establish character rendering, choice semantics, complete event playback, or 3D support. Storm uses two original loop samples but does not reproduce CRI's full random thunder/gain behavior. Backward seeking restores visuals and clears audio. Effects and shaders are approximations, and the recorded checks explicitly lack a frame/audio comparison with the original game.

The best next GFL2 experiment is to import the full A33001 book, resolve its first character commands and media, and run it through the shared controls. Preserve the local importer as an independent source; evaluate OGAS as an optional import source rather than a runtime dependency.

## Project SEKAI / PJSK

**Feasibility: high, with a particularly useful existing Live2D scene interpreter.** The initial work is adapting known formats and checking completeness, rather than discovering a story format from scratch.

| Resource | What it actually provides | Practical use and limits |
| --- | --- | --- |
| [Sekai Viewer](https://github.com/Sekai-World/sekai-viewer), [live site](https://sekai.best/) | Browser story playback with Pixi/Live2D and audio; GPL-3.0 source | Use its default `dev` branch. Inspected manifests report `dev` 1.21.5 versus stale `main` 1.7.1. |
| [Story loader](https://github.com/Sekai-World/sekai-viewer/blob/dev/src/utils/storyLoader.ts) | Maps master metadata to unit/event/card/character/area/special scenarios, then loads script and media | Includes scenario/model-specific fixes. MySekai conversations have a separate path; do not assume identical scene support. |
| [Scenario definitions](https://github.com/Sekai-World/sekai-viewer/blob/dev/src/story-scenerio.d.ts) | Detailed script structure and comments on command semantics | Contains some explicitly uncertain behavior. Useful documentation, not proof every command is implemented. |
| [Sekai Assets Updater](https://github.com/Sekai-World/sekai-assets-updater) | Bundle download/deobfuscation/extraction; Live2D recovery; texture, audio and USM movie conversion; MIT code | [Example configuration](https://github.com/Sekai-World/sekai-assets-updater/blob/main/config.example.py) contains placeholders for game cryptographic material/endpoints. Installing the tool alone is not a completed asset pipeline. |
| [Regional master dumps](https://github.com/Sekai-World/sekai-master-db-en-diff), [CN example](https://github.com/Sekai-World/sekai-master-db-cn-diff) | Episode titles, IDs, assetbundle names, scenario IDs and other metadata | An index into scenes, not the full scene scripts or assets. |
| [twintail](https://github.com/duosii/twintail) | Independent download/encryption/decryption CLI | README explicitly supports JP and EN; do not generalize to every region. |
| [MySekaiStoryteller](https://github.com/Untitled-Story/MySekaiStoryteller) | Separate Live2D/timeline implementation and fan-story authoring tool; GPL-v3 code | Tauri application, not a complete official-story archive; Android uses automatic timeline playback without tap-to-advance. Useful secondary implementation reference. |

The format includes ordered `Snippets` with action, reference index, delay and wait/immediate behavior, plus separate dialogue, character-layout/motion, effect and sound records. Dialogue includes speaker, voice, expression/motion and lip-sync information. Scene initialization carries background, music and layout. Preserve concurrent commands; reducing each snippet to a single "next line" event would lose timing. [Scenario format](https://github.com/Sekai-World/sekai-viewer/blob/dev/src/story-scenerio.d.ts).

Existing playback is substantial but not exhaustive. The [action dispatcher](https://github.com/Sekai-World/sekai-viewer/blob/dev/src/utils/Live2DPlayer/action/index.ts) implements dialogue, sound and character/layout actions, while `InputName` and `Selectable` are not dispatched. The [effects dispatcher](https://github.com/Sekai-World/sekai-viewer/blob/dev/src/utils/Live2DPlayer/action/special_effect/index.ts) implements movies, camera/background changes, wipes, blur and other effects, but lacks dispatch entries for `ChangeCardStill`, `ChangeBackgroundStill` and `SimpleSelectable`. Import validation must report these instead of silently accepting every script.

### Five regional scenario pipelines verified

The [current URL configuration](https://github.com/Sekai-World/sekai-viewer/blob/dev/src/utils/urls.ts) and [production environment](https://github.com/Sekai-World/sekai-viewer/blob/dev/.env.production) identify regional master data and `storage.sekai.best` assets. The same actual scenario was fetched and parsed from five namespaces:

| Region | Checked scenario |
| --- | --- |
| Japanese | [mmj_01_00.asset](https://storage.sekai.best/sekai-jp-assets/scenario/unitstory/idol-story-chapter/mmj_01_00.asset) |
| English | [mmj_01_00.asset](https://storage.sekai.best/sekai-en-assets/scenario/unitstory/idol-story-chapter/mmj_01_00.asset) |
| Simplified Chinese | [mmj_01_00.asset](https://storage.sekai.best/sekai-cn-assets/scenario/unitstory/idol-story-chapter/mmj_01_00.asset) |
| Traditional Chinese | [mmj_01_00.asset](https://storage.sekai.best/sekai-tc-assets/scenario/unitstory/idol-story-chapter/mmj_01_00.asset) |
| Korean | [mmj_01_00.asset](https://storage.sekai.best/sekai-kr-assets/scenario/unitstory/idol-story-chapter/mmj_01_00.asset) |

Despite the `.asset` extension, these responses are JSON. Each had 224 snippets and 77 dialogue entries with localized speaker names. The JP fixture had 76 voiced entries, and each other fixture had 74. This verifies one real scenario per region, not complete regional archives, identical scene semantics, or availability of every referenced media file.

An unusually relevant [viewer-reborn extraction roadmap](https://github.com/Sekai-World/sekai-viewer-reborn/blob/main/docs/viewer-implementation/live2d-story-reader-extraction-roadmap.md) discusses separating the existing imperative Pixi/Cubism/Howler interpreter from its React host, injecting asset/data/text/audio adapters, and defining a framework-neutral player API. That is close to the boundary needed here. However, the roadmap describes unfinished StoryReader runtime and scenario-to-model mapping. Use the legacy player as the working reference; do not assume reborn already offers a finished drop-in reader.

## Recommended implementation

The following is a proposed design derived from the evidence, not a description of existing onlystory code.

### Keep acquisition out of normal reading

Use a development/import pipeline:

```text
Community exports or installed-game assets
    -> regional game importer and dependency resolver
    -> versioned story package + coverage report
    -> library service with disk-backed asset storage
    -> shared web reader inside the desktop app or a remote browser
```

The reading device needs the reader and access to chapter assets. It does not need a game installation, extraction tools, or game credentials. A community export can seed a package; an installed copy can supply missing assets during development. Both modes should resolve imported packages through their own library service rather than depend on hotlinks and third-party CORS behavior.

Packages should include game, region, source version, text locale, voice locale, stable episode/line IDs, reading-order metadata, original scripts, converted commands, asset hashes/dependencies, and a machine-readable coverage report. Keep original command names and arguments beside normalized data so unsupported behavior remains recoverable. Never substitute numeric text-ID sorting for proven script order without labeling it as transcript mode.

### Standalone desktop and server modes

Both modes are part of the intended product. First design their user-facing library, availability and progress behavior. After the shared UI/feature review, use GFL2 to validate the proposed reader/library boundary and local standalone operation.

| Mode | Reader and library | Asset location | Intended use |
| --- | --- | --- | --- |
| Standalone desktop | Desktop window containing the shared web UI; starts its local library service automatically | User-selected disk folder; progress and catalog stored locally | Offline personal reading without hosting infrastructure or manual server setup |
| Server | Headless library service serving the same UI to authenticated browsers | Server disk or an optional private object store | Reading from devices without game installations; shared library and progress across devices |

Keep importers, story packages, the playback engine and library operations shared. A desktop shell supplies installation, window lifecycle and folder selection. The server supplies remote authentication and network access. The local service should bind to loopback by default and validate access/origins; exposing it to the network is an explicit server-mode configuration. Avoid requiring a separate user-installed server to launch the desktop app. Select the shell technology after a small packaging and media-playback check; this research does not establish Tauri versus Electron as a requirement.

Desktop mode removes cloud storage/egress needs and browser-managed quota dependence for the primary library. It does not reduce the asset collection's actual disk size. Keep disk capacity, hosted storage/bandwidth, browser cache capacity and decoded-media RAM as separate budgets. A desktop wrapper alone does not make expensive animation or large decoded textures cheaper.

Import selected chapters, events and voice languages instead of whole game installations. Store shared assets once using content hashes, track which packages reference them, and delete an asset only when no retained package needs it. Retain original source archives separately when useful for recovery; do not require duplicate original and converted copies in the active reading library. Show estimated package download size and actual installed size, and provide explicit removal/redownload controls. Measure representative packages before deciding whether hosting several games is affordable; the full game-cache sizes do not answer that question.

Use one library API for catalog queries, asset streams and progress in both modes. Support byte-range media requests so movies can seek without downloading an entire file first. Keep story state independent of machine-specific paths, allowing package transfer and save export/import. A desktop client can later connect to a server or download selected packages from it, but bidirectional offline sync and conflict resolution should follow the initial standalone and online server flows.

### Share controls and state; allow different scene renderers

The shared layer should own library/chapter navigation, search, backlog, font size, text speed, auto mode, fast-forward, read/unread state, choices, bookmarks, save/resume and theme selection. Game themes can change fonts, colors and ornament while keeping control positions and shortcuts stable.

The playback contract needs dialogue, choices/jumps/variables, layered images, characters with expression/motion, transitions/camera/effects, BGM/SFX/voice, movies/subtitles, waits and parallel command groups. Game renderers can retain native command extensions for Spine, Live2D and custom effects. A web renderer can compose DOM text/controls, Pixi/WebGL scenes, Web Audio and HTML video. Existing BA/PJSK implementations establish that browser animation is practical, but their different runtime/data assumptions argue against one universal character renderer.

Fast-forward must evaluate state changes and choices while shortening presentation waits. It must stop at unresolved choices or unsupported control-flow commands. Merely raising animation speed or skipping command execution can corrupt scene state. Backlog jumps and saves should restore background/character state, variables, choice history and current looping audio from checkpoints. Persist a stable line ID, package version and branch state rather than only an array index. The prototype's visual-only backward seek is a starting point, not the final behavior.

Offer an optional continuous-text view alongside scene mode. Both views should use the same parsed story graph and line IDs. A passage with missing animation can remain readable without falsely labeling its scene playback complete.

### Browser constraints that affect the design

- Start or resume audio from a user gesture, then manage voice/BGM/SFX channels. Browser autoplay policies make an explicit first-play action useful. Use loop start/end metadata rather than repeatedly replaying a track's intro. [Web Audio guidance](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).
- Convert Unity textures, CRI audio and USM movies during import. Preserve duration, cue grouping, intro/loop boundaries, subtitle timing and relevant alpha channels. [UnityPy](https://github.com/K0lb3/UnityPy) and [vgmstream](https://github.com/vgmstream/vgmstream) are useful general tools, but game-specific encryption/catalog resolution remains a separate job.
- In remote browsers, download/cache by chapter, with selective prefetch and a visible storage budget. IndexedDB/Cache storage is local to a browser and can be evicted; persistent-storage requests and exportable saves help, but caching is not a backup. Desktop mode keeps the primary library on disk outside this cache. [Browser quota and eviction behavior](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
- Remote reading requires a reachable server, such as a personal HTTPS deployment or a home server reachable through a private network. A localhost-only desktop library is unavailable to other devices when that PC is off or unreachable. Standalone offline reading uses installed packages; offline remote-browser reading requires caching the chapter beforehand. Online server clients can share server-stored progress; separate standalone libraries initially use manual save import/export.
- In server mode, gate both the UI and every asset path with authentication. A private repository or unlisted URL does not make a public asset bucket private. A service worker should cache only the intended private content on each device.

### Import validation and fidelity labels

Generate a report per episode with unresolved text IDs, unknown commands, missing models/motions/images/audio/video, unsupported control flow and required runtime versions. Distinguish transcript available, illustrated reading available, scene playback tested, and comparison against the original passed. These should be measured attributes, not one global "supported" flag.

The acceptance set should cover an early and late episode, a choice, animation/effect-heavy dialogue, voice+BGM+SFX overlap, a movie/subtitle segment, backward seek, fast-forward and save/resume. Add a GFL battle/map-point scene, a PJSK concurrent-motion scene and a GFL2 character/3D sequence. Compare representative results with the original game or a recording. Do not accept an empty console as evidence of story fidelity.

## Development order and feasibility gates

1. **Design the general UI and feature behavior.** Work through library, story selection, scene reading, history/navigation, settings and package management. Compare layout options and desktop/narrow-screen states. Use game-independent sample content for interactive design studies, then check all four games' needs before choosing the direction. See [reader-design.md](C:/Users/krisspy/Projects/onlystory/docs/reader-design.md). Implementation of a complete GFL2 episode is deferred until this review.
2. **Derive the player contract from the design and cross-game cases.** Define advance/reveal, auto, fast-forward, choice handling, history jumps, saves, media controls and asset-availability states. Check BA choices/effects, PJSK concurrent motions, GFL2 message windows/movies/3D boundaries and GFL1 incidental dialogue. Preserve game-specific capabilities; do not freeze the package schema or universal renderer around the GFL2 excerpt.
3. **Use GFL2 as the first integration validation.** The user can judge its fidelity, and A33001 supplies real scripts, images and audio. Connect the agreed controls to that excerpt, then extend through character staging toward one complete episode. Measure asset size and memory. When another game's needs conflict with the proposed contract, revise it before expanding GFL2-specific behavior.
4. **Prove both deployment modes with that same package.** Package a desktop app that reads from disk offline without manual server startup. Run the service headlessly and verify authenticated browser reading/progress on another device. Neither mode should require the game on the reading device. Validate representative voice/movie playback before choosing a desktop shell.
5. **Integrate PJSK or Blue Archive, then the other.** Use a familiar episode the user can assess to test whether the shared design actually accommodates another presentation system. Expand coverage only after this cross-game check. Only commit to faithful GFL2 3D playback after a representative scene has a demonstrated path.
6. **Add GFL1 later.** Its tools remain useful design/format references now, but the user has not played it and cannot readily identify fidelity mistakes. Use recordings and corpus checks for later integration. Review code permissions before reusing gfStory implementation code.

This is an order for reducing uncertainty, not a calendar estimate. A useful unified reader has strong feasibility evidence. Complete current archives in every region and exact native-engine reproduction remain substantially larger, unproven commitments.

## REA's role

[REA](https://github.com/morluto/rea) connects agents to inspection tools for .NET, native binaries, JavaScript and runtime evidence. It is useful when an importer needs to discover a table schema, hashed resource lookup, command meaning or custom playback behavior. It does not supply a game-specific archive, asset inventory or automatic cross-game converter. Its [README](https://github.com/morluto/rea/blob/main/README.md) documents static .NET metadata/CIL inspection and optional native analysis providers.

Use existing public scripts and working community parsers first. Use focused reverse engineering for missing parts, preserve source-version evidence, then validate behavior against the game. The local GFL2 mapping work already demonstrates why that focused approach matters. No REA tool run or new game-binary analysis was performed during this research.

## Privacy, licenses and remaining decisions

Treat private hosting as an access-control decision, not as permission to redistribute game content. Keep the application, imported story packages and upstream source-code licenses distinct. Several tools explicitly say their licenses do not grant game-asset rights; the [GFL2 extraction disclaimer](https://github.com/0x795E69D8/exilium-tools/blob/main/gf2_ab_decrypt/README.md) is one example. This report does not establish publisher permission for hosted extracted content.

Before selecting borrowed player code, check the applicable code license and animation runtime terms. BA has an AGPL/GPL labeling inconsistency; gfStory lacks a detected root license; Sekai Viewer is GPL-3.0. Live2D and Spine have their own [Cubism SDK](https://www.live2d.com/en/sdk/license/) and [Spine runtime](https://esotericsoftware.com/spine-runtimes-license) terms. Privacy alone does not settle those dependencies.

The agreed direction is general UI and feature design first, checked against all four games and both standalone desktop and server operation. GFL2 is the first integration candidate after that design review; PJSK/Blue Archive follow and GFL1 integration comes later. Open product decisions include the preferred reading layout, navigation and replay behavior, text/voice languages and regions, latest-story coverage, animation/3D fidelity and server storage location. The architecture and implementation order should follow those decisions rather than making them implicitly through a GFL2 milestone.
