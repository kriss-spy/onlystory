# Onlystory

A shared visual novel reader interface for Girls' Frontline 2, Project SEKAI, Blue Archive and, later, Girls' Frontline.

The GFL2 CN library contains **36 event/story collections**, 715 readable sections and 1,288 scripts as of 2026-10-16. It includes original text, backgrounds/CGs, Live2D characters and expressions, BGM/SFX, movies, available Chinese subtitles and selectable Chinese/Japanese movie audio. Male/female variants, real choice branches, bookmarks, checkpoints, seeking and chapter downloads use the common reader. Collections default to release order, newest first. Optional side stories remain inside their events; the category selector offers All collections, Main story and Event.

PJSK, Blue Archive and GFL1 have no real imported stories yet. See the [Blue Archive readiness assessment](docs/blue-archive-readiness.md) before starting its first real import.

The earlier twelve-passage GFL2 opening remains a separate presentation preview with original CGs, music and sound effects. Its links and saves still work.

## Run

Requires Node.js 22.12 or newer. Developed with Node.js 24 and Chrome on Windows.

```powershell
npm ci
npm run dev
```

Open <http://127.0.0.1:4173>. The server listens only on loopback. No account or game installation is needed. Do not expose the development server as a private production server.

Install, development and build use existing generated imports; they do not rerun the game importer. To regenerate GFL2 data explicitly, run `npm run import:gfl2`. Its recovery inputs include the sibling `../onlystory-gfl2/prototype`, extracted books under `.cache`, media manifests, and source tables. Set `ONLYSTORY_GFL2_PROTOTYPE` and `ONLYSTORY_GFL2_TABLES` to alternate directories, or `GF2_GAME_ROOT` to an alternate installed game. Reading or rebuilding a restored project needs no game installation.

Imported text, commands, media and provenance stay in ignored `src/generated/` and `public/private/`. The frontend bundle includes private catalog metadata and opening text; media are served separately from the library. Keep both private. Without sources or a prior import, the library is empty.

Read the [current GFL2 import report](docs/gfl2-remaining-import.md), [text import guarantees](docs/gfl2-full-text.md) and [opening scene-preview notes](docs/gfl2-preview.md) for boundaries. Browser motion/shaders approximate Unity. Holograms and source shadow masks are rendered, with hologram tone adjusted against the supplied game reference. Some particles/effects remain unsupported; regular dialogue has no voice track. Explicit missing text/assets/expressions are recorded in the import report. 静默突触's final chapter is scheduled for 2026-10-20 and is excluded from the current import.

For a production build, run `npm run build`, then `npm run preview` or `npm start`. The frontend build excludes the media library. The provided hosts serve it separately from `public/private`; set `ONLYSTORY_LIBRARY` to an external directory containing `private` to use another library root. Keep that library alongside the frontend when deploying. The host also resolves previous asset URLs and supports media byte ranges. App routes have an `index.html` fallback; missing media returns an error.

Follow [deployment and archive restoration instructions](docs/deployment.md) to move to another machine. A prebuilt copy needs Node, `dist`, `scripts/library-server.mjs` and the complete media library. A source rebuild also needs `src/generated`, `public/vendor` and the locked npm dependencies. Media and generated imports are ignored by Git, so a code-only checkout is not a library backup.

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

Only a completed download is marked **On this device** for its installed voice language. Downloads share asset transfers and stream into CacheStorage. Managed installations are checked for missing cached files at startup. Removing an episode clears its availability flag with Undo; shared cached media remain in this milestone. Jobs stop when the tab closes. Cached media work in an already loaded app without the media server; reopening the whole app offline needs a future desktop host or offline application shell.

`public/private` contains locally imported game material. `public/demo` contains authored SVG scenes, stand-ins, speech synthesis, a generated tone and a six-second video for design checks. Real GFL2 characters use PixiJS and Cubism, loaded when needed. Cubism Core is local under `public/vendor`; setup fetches it from the official Live2D host only if missing and preserves its license header and provenance. Runtime fonts and media need no external service. The GFL2 text is Chinese-only; the English preference does not translate it.

## Verify

```powershell
npm run verify
npm run format:check
```

Browser tests use installed Google Chrome through Playwright in an isolated headless profile. They do not use your signed-in browser. Install Chrome or adjust the Playwright browser configuration. Failure traces and viewport screenshots go to ignored `test-results/`.

Read the [milestone behavior and boundaries](docs/milestone-one.md), [design history](docs/reader-design.md), [feasibility research](docs/story-reader-feasibility.md) and [UI requirements](docs/UI-ANTI-PATTERNS.md).

## Next integration

GFL2 is ready for this handoff with documented source gaps and browser fidelity limits. The [Blue Archive assessment](docs/blue-archive-readiness.md) identifies the manifest, decoder, renderer, localization and verification work for its first real story. The common reader can be reused; real BA support is not implemented yet. Exact Unity effect/timing fidelity, desktop packaging, an authenticated private server, cross-device sync and content-version migrations remain separate work.

The [storage optimization plan](docs/storage-optimization-plan.md) records the measured baseline and implementation order for shared assets, exact lossless texture compression, shared movie streams, selective language downloads, cleanup, and external desktop/server libraries. Its [codec research](docs/storage-codec-research.md) and [saved measurements](docs/storage-baseline.json) support the decisions. Run `python scripts/storage-audit.py` to refresh the read-only asset inventory.
