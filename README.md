# Onlystory

Windows and Linux desktop builds and the offline web app are documented in
[Standalone Onlystory](docs/standalone-app.md), including download/import flows,
supported chapters and build commands.

A shared visual novel reader interface for Girls' Frontline 2, Project SEKAI, Blue Archive and Girls' Frontline.

The [complete content inventory](docs/content-inventory.md) lists every collection
and story, with dialogue languages, voices, movie audio and download availability.

The GFL2 CN library contains **36 event/story collections**, 715 readable sections and 1,288 scripts as of 2026-10-16. It includes original text, backgrounds/CGs, Live2D characters and expressions, BGM/SFX, movies, available Chinese subtitles and selectable Chinese/Japanese movie audio. Male/female variants, real choice branches, bookmarks, checkpoints, seeking and chapter downloads use the common reader. Collections default to release order, newest first. Optional side stories remain inside their events; the category selector offers All collections, Main story and Event.

PJSK contains all 125 main-story episodes across six groups and all 1,498 available CN event episodes across 182 events. It uses original Chinese text, Japanese voices, Live2D, backgrounds, music, sound effects and available movies. Another 128 future event episodes have metadata but no original CN scripts yet. Covers, group filters and release ordering use the original metadata. Voices cache on first playback; download a chapter before reading it offline. Browser effects approximate Unity, and main-story 3D performances use the original songs with an explicit playback limitation. See the [pipeline notes](docs/pjsk-pipeline.md) and [archive build procedure](docs/pjsk-archive-build.md).

GFL1 imports Chapters 0–13, including all available Normal, Emergency and Night sections, all 37 replay events, and all nine English collaboration events: 60 collections, 2,254 scenes and 117,788 retained source rows. All 373 main-story scenes and all 403 collaboration scenes are readable. Of the full catalog, 2,253 scenes compile fully; one native reference has no source file. Investigations, quizzes, password locks, branch-specific scene state and native Live2D shooting scenes work in the reader. Original images, 251 BGM cues and 306 sound effects are recovered; five BGM and six SFX cues remain unresolved. Four epilogue sounds use exact cue matches recovered from the installed GFL2 bank, with cross-title provenance. Three original backgrounds and four legacy visual effects are unavailable; dialogue remains readable with explicit notices. Native replay ordering, gameplay-triggered extras and unresolved placement stay explicit. See the [GFL1 pipeline and known gaps](docs/gfl1-pipeline.md) for extraction and verification.

Blue Archive includes 613 JP main-story/prologue segments across 26 collections, 68 Club group stories across 27 collections and 978 event chapters across 57 event collections, from pinned JP build 1.73.459696. Both main-story parts, the Final volume, the visible released Club stories and all standard events are included. Original backgrounds, Spine characters, music, available Japanese voices and movies use the shared reader and download storage. Catalog rows use the original JP event title logo over the event lobby art, with school badges derived from the official pickup roster. Nine native Unity 3D cutscene cues, seven in main stories and two in events, are marked unavailable with an explicit Continue button; browser effects approximate Unity motion and scoped source gaps are documented. Run `npm run acquire:ba` to prepare the local library. Coverage is complete for the visible released modes in this pinned build, not necessarily the current JP server. See the [Blue Archive pipeline](docs/blue-archive-pipeline.md).

All 1,659 BA segments have standalone download recipes. The desktop apps download
original files directly; the browser imports user-supplied originals because the
official hosts block browser fetches. Both compile locally and support offline
reading without a hosted Onlystory backend. Use the catalog toolbar to select
stories and press download again to start. See the [recipe guide](docs/ba-download-recipes.md)
and [verification record](docs/ba-download-verification.json).

The 1,519 aligned BA chapters also include real English dialogue and choices from
the pinned official global database. The remaining 140 retain Japanese. Switch JP/EN in the reader without moving the
passage; unmatched or unreleased chapters retain Japanese. The exact coverage
and exclusions are in [the English verification record](docs/ba-english-verification.json).
The reader only lists dialogue languages supported by the current story.
Event labels use JP, CN and EN to show supported text languages across all four
games. Catalog language is a separate per-game setting. Pinned BA and PJSK regional
metadata supplies localized collection and chapter titles; search matches every
supplied title language, with original titles used when translations are absent.

BA emotion bubbles play their original mapped sound effects. Letter pages reveal
one paragraph per click, retain previous paragraphs and fit both English and
Japanese text without overlapping the dialogue area. Hologram scanlines are
stronger while preserving pale character highlights. Native Unity effects remain
browser approximations.

The earlier twelve-passage GFL2 opening remains a separate presentation preview with original CGs, music and sound effects. Its links and saves still work.

## Try a release on Linux or Windows

The current artifact filenames, sizes and SHA-256 hashes are recorded in
`release/artifacts-current.json`, with checksums in `release/SHA256SUMS.txt`.
The Windows release has a portable executable and an NSIS installer. The Linux
x64 desktop release is a `tar.gz` archive. Extract it and launch
`./onlystory-desktop` from the extracted directory as your normal user.
Linux runtime verification must run on Linux; producing the archive on Windows
does not establish it.

To try the web app, extract `Onlystory-web.zip`, install Node.js 22.12 or newer,
and run `node serve.mjs` in the extracted directory. Open
`http://127.0.0.1:4173` in Chrome or Chromium. Do not open `index.html` directly.
This loopback runner needs no HTTPS hosting or domain. It serves only the app;
PJSK supports downloads, BA uses original-file imports, and GFL1/2 need a separate
prepared library host. See [the setup instructions](docs/standalone-app.md).

## Run

Requires Node.js 22.12 or newer. Developed with Node.js 24 and Chrome on Windows.

```powershell
npm ci
npm run dev
```

Open <http://127.0.0.1:4173>. The server listens only on loopback. No account or game installation is needed. Do not expose the development server as a private production server.

Install, development and build use existing generated imports; they do not rerun the game importer. To regenerate GFL2 data explicitly, run `npm run import:gfl2`. Its recovery inputs include the sibling `../onlystory-gfl2/prototype`, extracted books under `.cache`, media manifests, and source tables. Set `ONLYSTORY_GFL2_PROTOTYPE` and `ONLYSTORY_GFL2_TABLES` to alternate directories, or `GF2_GAME_ROOT` to an alternate installed game. Reading or rebuilding a restored project needs no game installation.

Imported text, commands, media and provenance stay in ignored `src/generated/` and `public/private/`. The frontend includes catalog metadata and download recipes; imported game media are served separately. A fresh static installation can acquire supported BA/PJSK chapters. GFL chapters remain pending there until a local library is available; the reader does not request nonexistent private chapters.

Read the [current GFL2 import report](docs/gfl2-remaining-import.md), [text import guarantees](docs/gfl2-full-text.md) and [opening scene-preview notes](docs/gfl2-preview.md) for boundaries. Browser motion/shaders approximate Unity. Holograms and source shadow masks are rendered, with hologram tone adjusted against the supplied game reference. Some particles/effects remain unsupported; regular dialogue has no voice track. Explicit missing text/assets/expressions are recorded in the import report. 静默突触's final chapter is scheduled for 2026-10-20 and is excluded from the current import.

For a production build, run `npm run build`, then `npm run preview` or `npm start`. The frontend build excludes the media library. The provided hosts serve it separately from `public/private`; set `ONLYSTORY_LIBRARY` to an external directory containing `private` to use another library root. Keep that library alongside the frontend when deploying. The host also resolves previous asset URLs and supports media byte ranges. App routes have an `index.html` fallback; missing media returns an error.

Follow [deployment and archive restoration instructions](docs/deployment.md) to move to another machine. A prebuilt copy needs Node, `dist`, `scripts/library-server.mjs`, `scripts/local-environment.mjs` and the complete media library. A source rebuild also needs `src/generated`, `public/vendor` and the locked npm dependencies. Media and generated imports are ignored by Git, so a code-only checkout is not a library backup.

### Codex worktrees

The `onlystory` local environment in `.codex/environments/environment.toml` runs `node scripts/setup-worktree.mjs` when Codex creates a worktree. Select this environment when starting a worktree chat. Setup runs `npm ci`, copies missing `src/generated` files from the main checkout, and links `public/private` to the main media library without copying its contents. Windows uses a directory junction. The main checkout must retain its imported library. Set `ONLYSTORY_SOURCE` or `ONLYSTORY_LIBRARY` before setup to use another source checkout or library root.

Each worktree saves its media path and a separate server port in ignored `.codex/worktree.local.json`. Run, Build and Test actions are available in Codex. Ordinary `npm run dev`, `npm run preview`, `npm start` and Playwright checks also read this configuration, so no manual environment variable is needed. `ONLYSTORY_LIBRARY` and `PORT` remain explicit overrides. Servers fail if their selected port is occupied instead of silently switching ports. Existing generated files are preserved when setup runs again; use a new worktree for a fresh copy.

Only dependencies, generated imports, build output and test artifacts consume additional worktree storage. Importer caches stay in the main checkout. The linked media are shared and writable: run importers, media conversion and cleanup in the main checkout, or use a separate library for asset-changing work. Do not point a setup script at a media copy you intend to edit independently.

## Included

- Library, searchable episode catalogs, bookmarks and download management.
- Scene-first, reading-desk and text-only layouts, collapsible chapters and narrow-screen drawers.
- Icon-only reading controls, tooltips, keyboard shortcuts and searchable commands.
- Choices, immediate history rewind, branch-aware bookmarks, autosave and checkpoints.
- All 715 imported GFL2 sections with recovered scene state, next-section navigation, original variants and configurable player-name placeholders. Chapter files load individually; media load as needed.
- Original GFL2 CG layers, fades, message windows, shadows, communication holograms, BGM/SFX and movies. Unknown or unsupported source effects remain documented rather than being claimed as exact game playback.
- Light/Dark/System appearance, independent text and voice languages, reduced motion.
- Actual media downloads into browser CacheStorage, cancellation, retry and transfers across app navigation.
- Local progress, JSON export/import and explicit missing-media, incomplete-archive, offline and expired-session design cases.

Use **Commands → Cross-game design checks**, or `/lab`, for fictional regression fixtures. They do not appear in the normal game catalogs or downloads. Their game names describe design targets, not verified game support.

The original opening scene preview is linked from `/lab`. Its optional download is under `/manage?previews=1`.

## Shortcuts

| Key                                   | Action                        |
| ------------------------------------- | ----------------------------- |
| Scene click/tap / Space / Right arrow | Reveal text, then advance     |
| Left arrow                            | Previous passage              |
| A / F                                 | Toggle auto / fast-forward    |
| H / B / C                             | History / bookmark / chapters |
| U                                     | Hide or show controls         |
| Comma                                 | Settings                      |
| Ctrl/Cmd+K or ?                       | Search commands and shortcuts |
| Escape                                | Close the current panel       |

Shortcuts yield to inputs, selections, native media controls and browser modifier keys. On the smallest screens, Save points moves into the command palette.

## Data

Progress and preferences use `onlystory.v1` in localStorage. Media use `onlystory.media.v1` in CacheStorage. Each origin and browser profile has separate storage. JSON backups contain reading state and preferences, not media. Import merges bookmarks/checkpoints and keeps newer progress. It never imports another device's installation flags.

Unreadable stored JSON is copied to `onlystory.recovery` before a fresh session starts. If that copy fails, the app preserves the original and stops persistent writes. Export a session backup in that case.

Only a completed download is marked **On this device** for its installed voice language. Downloads share transfers across jobs and windows and stream into CacheStorage. Selection shows incremental and reused bytes before transfer. Managed installations are checked for missing cached files at startup. Removing an episode allows Undo for 30 seconds, then reclaims media no remaining installation needs. Verified source originals and native conversion caches are retained separately for reuse. Jobs stop when the tab closes. The production app can reopen offline once its application shell is ready, using downloaded stories and media.

## Install and read offline

Run `npm run build` and `npm start`, then open the app at its usual address. In **Settings → App installation**, wait for **Ready to open offline**. Use **Install Onlystory** when offered, or your browser's Install app / Add to Home Screen command. On iPhone or iPad, use Safari's Share menu. The installed app requests its own standalone window. Installation support and browser menu wording vary by platform.

Download the stories you want before disconnecting. Once the shell and selected stories are saved, you can close every app window and reopen the same address or installed app without the media server. Undownloaded stories and catalog artwork are not automatically made available offline. Initial setup and updates need the production server; development mode does not register a service worker. Remote hosting requires HTTPS; the local loopback address works for local use.

The offline shell includes all built reader modules and local playback runtimes, stored separately in versioned `onlystory.shell.*` caches. It never precaches the private game library. App updates prepare a complete replacement before offering **Restart to update** in settings. Restart is disabled while this window has active downloads. Other open windows keep running, and the previous build's chunks remain cached for them. Progress and downloaded media are preserved. Closing all app windows also allows a prepared update to activate on the next launch.

Installation uses the same origin's browser storage. Keep the hostname and port consistent to retain access to existing progress and downloads. Browser storage can be cleared or evicted; the app requests persistent storage when downloading, and JSON backups remain useful for reading progress.

`public/private` contains locally imported game material. `public/demo` contains authored SVG scenes, stand-ins, speech synthesis, a generated tone and a six-second video for design checks. Real GFL2 characters use PixiJS and Cubism, loaded when needed. Cubism Core is local under `public/vendor`; setup fetches it from the official Live2D host only if missing and preserves its license header and provenance. Runtime fonts and media need no external service. The GFL2 text is Chinese-only; the English preference does not translate it.

## Verify

```powershell
npm run verify
npm run format:check
npm run test:pwa
```

Browser tests use installed Google Chrome through Playwright in an isolated headless profile. They do not use your signed-in browser. Install Chrome or adjust the Playwright browser configuration. The browser suite builds and serves an immutable optimized snapshot in `browser-test` mode, which also enables the synthetic stress catalog. Normal production builds omit that catalog. Isolated Vite transforms are available for direct renderer/audio probes without watching the media library. Service workers are tested separately. Failure traces and viewport screenshots go to ignored `test-results/`; build snapshots are kept under `.cache/browser-build-*`. Use an unused `PORT` if a development server is already running. The content suites require their generated imports and local media libraries.

`test:pwa` builds production output and serves each installation/offline/update test on an isolated local origin. `verify` also runs these production checks after the browser suite. Browser installation eligibility is checked apart from the isolated profile's installation restriction; actual OS installation is a manual browser action.

Read the [milestone behavior and boundaries](docs/milestone-one.md), [design history](docs/reader-design.md), [feasibility research](docs/story-reader-feasibility.md) and [UI requirements](docs/UI-ANTI-PATTERNS.md).

## Next integration

Follow the [PJSK archive build procedure](docs/pjsk-archive-build.md) to acquire and install all available events. `npm run install:pjsk-main` installs the pinned 125-episode main-story corpus. For a single chapter, run `npm run import:pjsk -- --scenario mmj_01_01 --install`. PJSK media default to `.cache/pjsk/library`, served separately alongside GFL2; set `ONLYSTORY_PJSK_LIBRARY` to relocate them. Source-only imports support five regions and unit/event metadata. The [PJSK pipeline notes](docs/pjsk-pipeline.md) cover offline rebuilding, source coverage and remaining commands.

GFL2 retains documented source gaps and browser fidelity limits. The [Blue Archive pipeline](docs/blue-archive-pipeline.md) documents the JP library, aligned global English, acquisition provenance and remaining fidelity limits. Windows and Linux packaging are available as described in [Standalone Onlystory](docs/standalone-app.md). Exact Unity effect/timing fidelity, an authenticated private server, cross-device sync and content-version migrations remain separate work.

The [storage optimization plan](docs/storage-optimization-plan.md) records the measured baseline and implementation order for shared assets, exact lossless texture compression, shared movie streams, selective language downloads, cleanup, and external desktop/server libraries. Its [codec research](docs/storage-codec-research.md) and [saved measurements](docs/storage-baseline.json) support the decisions. Run `python scripts/storage-audit.py` to refresh the read-only asset inventory.
