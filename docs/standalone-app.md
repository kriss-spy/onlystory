# Standalone Onlystory

The Windows and Linux desktop applications bundle the app runtime and work without a deployed
Onlystory backend. Original story assets download from the recorded public
sources and are processed on the user's machine. The web build uses the same
importer and offline library. The current release files, sizes and SHA-256 hashes
are listed in `release/artifacts-current.json`; compare downloads against
`release/SHA256SUMS.txt`. Older verification records identify their own builds and
do not establish verification of a newly rebuilt artifact.

Game covers, event covers, title logos, group logos and school emblems are
bundled with the app under `/catalog-art/`. They are available before downloading
a story and are included in the web app's offline shell. Story media remains a
separate download or import. The same catalog bundle goes into Windows, Linux
and web packages.

Settings → Language → App language selects English, Chinese or Japanese for the
whole app. The choice is saved on this device and included in progress backups.
Catalog language and Text language remain separate settings for titles and
dialogue.

## Using the desktop app

Run `Onlystory-0.3.1-portable-x64.exe`, or install
`Onlystory-0.3.1-Setup-x64.exe`. The portable executable needs no installation;
its saved library still lives in the current user's app-data folder. These are
unsigned development builds.

On Linux x64, extract `Onlystory-0.3.1-linux-x64.tar.gz`, open a terminal in
the extracted directory and run `./onlystory-desktop`. If your archive tool drops
the executable permission, restore it with `chmod +x onlystory-desktop`. Run it as
your normal desktop user. This archive needs a graphical Linux desktop and the
system libraries required by Electron. Packaging on Windows does not verify
Linux launch, audio, downloads or offline restart; those checks must run on Linux.
The Linux archive is portable and has no installer. Its saved library uses the
current user's app-data directory, rather than the extracted application folder.

Browse a game's catalog and press the header's download button to enter
multi-select mode. Select events, or individual stories inside an event, then
press the same button again to download. The button shows a circular progress
indicator while the queue runs. The adjacent cancel button stops the queue;
Escape exits selection before downloading. Supported sources are:

- Every imported Blue Archive JP story in the pinned library: Japanese text,
  Spine models, backgrounds, voices, music, effects and supported movies.
  Completely aligned chapters also include official global English dialogue and
  choices. Recipes cover the prologue, main, group and event stories. See
  [the English coverage and exclusions](ba-english-verification.json).
- Every imported Project SEKAI CN main-story and event chapter, with Japanese
  media: 125 main-story chapters and 1,498 event chapters in this snapshot.
  Browse or search the PJSK catalog by chapter or event title.
  Select several chapters to queue them. Each chapter includes its text, Live2D,
  backgrounds, music, voices, effects and any supported movies or performances.

The 128 additional CN event chapters whose original scripts return 404 cannot be
downloaded. They remain outside the available library, rather than being marked
downloadable. The [source check](pjsk-unavailable-source-check.json) records the
current responses. This is CN main and event coverage, not every regional,
card-side or special story in the game.

Fresh standalone and static installations mark GFL1/GFL2 stories pending because
they have no standalone acquisition recipes. A local library host can serve the
existing imported chapters. Only a confirmed need for further reverse engineering
qualifies a story for the Unsupported label.

The BA downloader verifies each file's size and SHA-256, keeps verified originals
for retry, and processes three source downloads concurrently. Cancel stops active
requests. Already verified complete files are reused after retry or restart;
interrupted files restart from the beginning. Import progress and cancellation
also work while navigating within the app. Keep the process open until import
finishes. Only a completed import marks the chapter installed.

PJSK uses the same mirror and browser downloader on desktop and the web. Pinned
recipes contain dependency metadata and model-reference edits, with no story or
media bodies. Recipes are compressed and loaded on selection; the PWA does not
precache all chapter instructions on startup. Downloaded originals are verified
with SHA-256, or the pinned upstream size and MD5 for deferred voice files.
Chapters share a three-request queue and reuse verified cached media. Canceling
a queued chapter leaves the active chapter running. Completed files survive
retry and restart, and chapters become installed only after all dependencies and
generated script/model settings pass verification. Queued jobs themselves do not
survive quitting the app; select unfinished chapters again to resume from saved
files.

PJSK installation inventories live in the media cache, with one small pointer per
chapter in the saved library. This keeps the full catalog's installation index
below localStorage's quota. Startup checks inventory dependencies and reuses
checks for shared files; missing or malformed inventories mark the affected
chapter for download again.

After installation, **Read story** opens the existing reader. The chapter remains
available after restarting the app without internet access. Preferences, reading
progress and bookmarks use the existing local storage format. Removing an episode
offers Undo for 30 seconds. Cleanup then removes unreachable cached media while
preserving shared dependencies used by other chapters. Original source packs and
native conversion caches remain separately retained for reuse.

The app starts a static loopback host inside the executable, bound only to
`127.0.0.1`. It serves bundled UI code and playback runtimes, rejects `/private/`
requests, and closes with the app. This needs no external hosting, account, domain
or paid service. A saved local port preserves the browser storage origin between
launches. If another process occupies that saved port, startup reports the error
instead of silently switching to an empty library origin.

Electron's renderer has Node integration disabled, context isolation, sandboxing
and normal web security enabled. Its preload exposes the pinned BA source reader,
cancellation and a fixed media converter. It accepts no arbitrary URLs, command
arguments or filesystem paths from the renderer. External source links open in
the system browser. The importer
worker allows the decoder's generated codec bindings; the renderer uses Pixi's
CSP-compatible uniform interpreter.

## Using the web app

`Onlystory-web.zip` contains the static web application, without game media.
Serve its contents over HTTPS with SPA fallback to `index.html`. The existing PWA
controls install it in a separate window and prepare offline launch.

For a local Linux or Windows browser test, install Node.js 22.12 or newer,
extract the ZIP, open a terminal in that directory and run:

```sh
node serve.mjs
```

Open `http://127.0.0.1:4173` in Chrome or Chromium. Keep the terminal open while
setting up the app and importing or downloading stories. Do not open `index.html`
through `file://`. The runner binds only to loopback, serves app links through
`index.html`, and returns 404 for missing files and `/private/` requests. Set
`PORT` before launch if 4173 is occupied, then keep that address consistent for
saved browser data. This local test needs no public host, domain or HTTPS
certificate. Browser offline installation works on the loopback address.

Chapter recipes are fetched on selection and excluded from startup precaching.
The generated release manifest records the rebuilt archive's actual size and
checksum. [web-release-verification.json](web-release-verification.json) is
historical evidence for the artifact named in that record.

PJSK downloads directly in the browser. For BA, **Import original files** provides
source links, a missing-file checklist, and file or folder selection. Users download
the originals through their browser, then select them in Onlystory. The importer
recognizes both the upstream filenames and the canonical recipe filenames,
verifies their contents, and builds the chapter locally. This avoids requiring
Fetch CORS access to the official BA host. The browser and desktop apps have separate
storage profiles. Selecting multiple BA chapters with the toolbar opens one
original-folder chooser in the browser; the desktop app fetches them directly.
BA imports run in sequence and reuse verified shared outputs and decoded database
rows between chapters.

## Building

```sh
npm ci
npm run check
npm run test:desktop-sources
npm run desktop:build -- --platform=win32
npm run desktop:build -- --platform=linux
npm run package:web
```

`desktop:build` builds the web app and prepares the isolated Electron application.
The explicit `win32` target produces a Windows x64 portable executable and NSIS
installer under `release/`; `linux` produces an x64 `tar.gz` archive there. Without
`--platform`, it uses the build machine's platform. Each target packages its own
FFmpeg binary and Electron runtime. Linux runtime verification still requires a
Linux machine.
Electron's pinned runtime must be downloaded on the build machine first. Running
`npm run desktop:dev` downloads it if necessary; `npx install-electron --no` is
also supported by the pinned Electron package. No original BA downloads, native
Python environment or extraction tools are needed to compile the checked-in
import recipe.

For local development, keep the Vite library server running in the existing
`psmux -L codex` session. Its URL is `http://127.0.0.1:4173`.

```powershell
npm run desktop:prepare
$env:ONLYSTORY_DEV_URL='http://127.0.0.1:4173/library'
npm run desktop:dev
```

`package:web` archives the existing `dist/` build. Rebuild first after source
changes. The release includes runtime license notices under `vendor/`, including
the reviewed Vorbis header attribution.

## Verification

```sh
npm run verify:desktop
npm run verify:ba-downloads
node scripts/verify-desktop-pjsk.mjs
node scripts/smoke-portable.mjs
npx playwright test --config playwright.pwa.config.ts tests/pwa/local-import.spec.ts
```

Set `PJSK_CHAPTER` to another catalog episode ID to exercise its real-source
download and offline restart. To regenerate the pinned catalog from the retained
maintainer imports, run `npm run build:pjsk-download-catalog`. To check all chapter
and model reconstructions using the production browser compiler, set
`PJSK_VERIFY_CATALOG=1` and run `npx vitest run src/downloads/pjsk-catalog.test.ts`.
Normal app builds use the checked-in recipes and need no maintainer media cache.

Desktop verification downloads from the real sources, imports BA, closes the
process, relaunches the saved profile, disables networking and follows the source
choice prompts through completion. Aligned chapters also switch JP/EN at the same
passage and resume English offline. PJSK verification checks Live2D and all passages
after offline restart and decodes every cached voice. Set `ONLYSTORY_EXE` to the
unpacked release executable to run those checks against the packaged application.

The web UI test needs the retained originals and input-path list from
`scripts/probe-ba-browser-import.mjs`. It rejects a corrupted original without
publishing media, imports while navigating away, and reopens the real reader
offline. Its host serves `dist/` only and rejects all game-file requests.

Evidence and screenshots are saved under `.cache/desktop-verification/`,
`.cache/desktop-pjsk-verification/` and the Playwright test output directory.
The all-BA native verifier uses a fresh profile and saved original source packs,
deliberately leaves one original uncached for a real HTTPS download, then closes
the app and reopens its installed chapters with both native and browser networking
disabled. Its `--live` option fetches every required original again. Evidence is
saved under `.cache/ba-native-verification/` and records which originals were
reused, the live response, and the chapters checked.
The [original browser feasibility proof](ba-browser-import.md) documents the
prologue texture and audio reference comparisons. The full BA library now has
[download recipes](ba-download-recipes.md) built from the pinned JP originals.
The existing Unity 3D cutscene barriers remain reader limitations. Other games'
unresolved source formats and mobile import limits remain separate work.

Use `release/artifacts-current.json` and `release/SHA256SUMS.txt` for the current
Windows, Linux and static web artifacts. The
[earlier release verification record](standalone-verification.json) includes
live-download, packaged-app, offline-restart and isolated NSIS install/uninstall
results for its recorded Windows artifacts. Those results are historical and must
not be treated as a Linux runtime check or a test of a different checksum.

The [PJSK catalog verification record](pjsk-download-verification.json) covers the
expanded 0.2.0 release, the full compiler/model reconstruction check, real-source
downloads, offline reading and current unavailable sources.

Packaging uses [Electron's security model](https://www.electronjs.org/docs/latest/tutorial/security)
and [electron-builder's Windows targets](https://www.electron.build/v26/docs/win/).
