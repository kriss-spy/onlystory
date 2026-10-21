# Move Onlystory to another machine

Checked on 2026-10-16 with a fresh project directory on Windows: `npm ci` and `npm run build` succeed without the sibling extraction project, `.cache`, or an installed game. The production host uses Node built-ins and can serve a relocated build and an external library. This is a same-machine relocation check, not a claim of testing another operating system or physical computer.

The relocated production build was also opened in Chrome with an external library directory. It passed checks for 36 collections, newest-first default sorting, the real 爵士 hologram after a deep-link reload, canonical and legacy asset byte-range responses, missing-media 404s, and the bundled Cubism runtime.

## Test the current web release on Linux

`Onlystory-web.zip` is the cross-platform app package. It is different from the
large recovery archive described below. It bundles catalog artwork; story media
is downloaded separately. Current
filenames, sizes and hashes are in `release/artifacts-current.json` and
`release/SHA256SUMS.txt`.

Install Node.js 22.12 or newer, extract the web ZIP and open a terminal in its
extracted directory:

```sh
node serve.mjs
```

Open `http://127.0.0.1:4173` in Chrome or Chromium. Keep the terminal open during
initial setup and downloads. Do not use `file://`. The included runner serves
app deep links, returns 404 for missing assets and listens only on loopback.
If the port is occupied, use `PORT=4180 node serve.mjs`, then retain that address
for access to the same progress and downloads. No npm dependency installation or
public HTTPS host is needed for this package. A local browser can use service
workers on loopback.

On Linux, check opening and reloading a story URL, BA original-file import, a
PJSK download, character and audio playback, paragraph-by-paragraph BA letters,
and reopening downloaded content offline after the shell reports ready.
A production build on Windows does not verify these Linux behaviors.

A Linux x64 desktop archive and Windows portable/installer builds are also
available. See [desktop launch instructions](standalone-app.md). The Linux
archive needs a graphical desktop and Electron's system libraries. Its runtime
checks remain separate from web-browser checks.

## Restore the archive

Extract the ZIP64 archive with a ZIP64-capable tool. Keep the paths inside it:

```text
handoff/
  ARCHIVE-MANIFEST.json
  onlystory/
    src/generated/          compiled catalog metadata, required to rebuild
    public/private/         imported stories, models, images, audio and movies
      shared/index.json     canonical assets and old-URL aliases
    public/vendor/          local Cubism Core and provenance
    scripts/                importer, archive and host tools
    docs/                   source findings, limitations and these instructions
    .cache/                 recovered GFL2 source inputs and research
    private-review/         review screenshots and audit evidence
    package.json
    package-lock.json
  onlystory-gfl2/            original extraction project and prototype
  gfl2-source-tables/        snapshot of installed source tables
```

The archive includes project code, tests, configurations and demo assets as well. It excludes `node_modules`, `dist`, top-level browser test output, and the installed game itself. No working resources are deleted. The ZIP contains a per-file SHA-256 inventory; the adjacent `.zip.sha256` checks the ZIP itself. The archive tool reads every entry back and verifies its hash before declaring success.

In PowerShell, compare the adjacent checksum with:

```powershell
Get-FileHash 'C:\path\to\onlystory-gfl2-resources-2026-10-16.zip' -Algorithm SHA256
Get-Content 'C:\path\to\onlystory-gfl2-resources-2026-10-16.zip.sha256'
```

## Build and run the restored project

Install Node.js 22.12 or newer; Node 24 was used for validation. From the restored `onlystory` directory:

```powershell
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:4173`. Dependency installation requires registry access. Cubism setup uses the bundled runtime; it downloads from the official Live2D host only when the local runtime is missing. Reading the restored library needs no game installation, Python, extraction tools, account, or external media service.

Normal installation, development and build **do not reimport game data**. `npm run import:gfl2` is an explicit recovery/development operation. Do not run it just to view the restored library.

For development, use `npm run dev` after `npm ci`. Browser checks require installed Google Chrome, as configured in `playwright.config.ts`.

## Run a prebuilt copy without npm dependencies

On the source machine, run `npm run build`. Copy these paths to the destination, preserving their relationship:

```text
onlystory/
  dist/                     frontend, bundled demo and vendor runtime
  scripts/library-server.mjs
  scripts/local-environment.mjs
  public/private/           entire imported library, including shared/index.json
```

On the destination, install Node and run:

```powershell
node scripts/library-server.mjs
```

`node_modules`, source files, Python and the installed game are unnecessary for this prebuilt route. The resource archive excludes `dist`; build it after restoring, or copy an existing build separately.

The frontend deliberately excludes `public/private`. A static `dist` deployment includes the catalog and standalone BA/PJSK acquisition recipes. Existing GFL imports need a library host; a fresh static installation keeps those chapters pending before requesting private files. Keep `shared/index.json` for existing library deployments: older URLs depend on its alias map.

## Standalone static web app

All 1,623 available PJSK CN chapters have pinned original-script and JP-media recipes. All 1,659 BA JP chapters have original-file import recipes, with official English included only for completely aligned released chapters. Serve `dist` on static HTTPS hosting with SPA navigation fallback. No Onlystory backend, asset proxy, private library, Node runtime or game installation is needed by readers. Hosting must return 404 for missing `/private/` files rather than the app HTML. The app and its playback/conversion runtimes still come from the static host.

Use the catalog toolbar's download button to select collections or chapters, then press the same button again to start. PJSK fetches originals from its recorded community mirror and metadata sources. Browser BA opens an original-file/folder chooser because the official hosts do not permit browser Fetch; the native desktop apps fetch these pinned originals directly. Recipes verify inputs, rewrite media references and compile chapters locally. A chapter becomes installed only after every dependency and runtime is ready. Verified files survive cancellation and can be reused after restart. Selection shows incremental and reused bytes before transfer.

The existing media cache holds browser source files and generated output. The local device index tracks installation and progress. Ask the browser for persistent storage and keep progress backups: users can clear browser data, and persistence remains browser-controlled. Downloads continue while navigating inside the app; closing it interrupts an unfinished job. Removal offers 30-second Undo before unreachable media is reclaimed. Original source and native conversion caches are retained separately for reuse.

The 128 PJSK chapters whose CN scripts are unavailable remain outside the downloadable catalog. BA includes 1,519 aligned English chapters; the remaining 140 keep Japanese.
The pinned global release tables and whole-chapter alignment checks determine
this coverage, separately from catalog-title translations. Source changes fail checksum checks and require a reviewed recipe update. An external source can become unavailable or throttle requests. These public files cannot be made app-exclusive.

Maintainers regenerate the PJSK catalog with `npm run build:pjsk-download-catalog` and BA recipes with `node scripts/prepare-ba-downloads.mjs`. These operations require the retained reviewed imports and source inventories. Readers need only the published app and originals acquired through the supported flow. Compressed recipes carry source identities, checksums and compiler metadata; they do not embed game media.

The production-browser test serves static files only and rejects all private asset requests. Opt in to the public-mirror integration test in PowerShell:

```powershell
npm run build
$env:PJSK_LIVE_DOWNLOAD = '1'
npx playwright test --config playwright.pwa.config.ts tests/pwa/pjsk-download.spec.ts --workers=1
```

Without the environment variable, the public network test is skipped; deterministic failure checks still run.

To keep the media elsewhere, point to the directory **containing** `private`, not to `private` itself:

```powershell
$env:ONLYSTORY_LIBRARY = 'E:\OnlystoryLibrary'
$env:PORT = '4180'
node scripts/library-server.mjs
```

Equivalent POSIX command:

```sh
ONLYSTORY_LIBRARY=/srv/onlystory-library PORT=4180 node scripts/library-server.mjs
```

The directory layout in this example is `E:\OnlystoryLibrary\private\shared\index.json`. Without the variable, the host uses this project's `public` directory.

Use the supplied host rather than an arbitrary static server: it supplies SPA deep-link fallback, old-media URL aliases, media byte ranges, and real 404 responses for missing assets. It binds to `127.0.0.1`; it is suitable for reading locally on the destination machine. Remote browser access requires a separately configured reverse proxy or tunnel. Authentication and a public hosting configuration are not implemented here. Use HTTPS for browser storage features when accessed remotely.

## Relocate an existing PJSK library

PJSK media use a supplementary library rather than `public/private`. Copy `.cache/pjsk/library`, or set `ONLYSTORY_PJSK_LIBRARY` to its relocated directory containing `private`. For a source rebuild, also retain the corresponding `src/generated/pjsk-*.json` metadata. The production and Vite hosts serve both media roots. PJSK media are excluded from `dist` just like the main GFL2 library. A fresh static installation instead downloads selected chapters from their recipes.

To regenerate the episode, keep `.cache/pjsk/http` and `.cache/pjsk/packages` as well, then run `npm run import:pjsk -- --scenario mmj_01_01 --install --offline`. With network access, the same command without `--offline` can acquire its sources and assets. See [PJSK pipeline notes](pjsk-pipeline.md) for the explicit CN-text/JP-media pairing and supported episode.

## Move reading progress separately

Export reading data from the current app and import it on the destination. Browser localStorage and CacheStorage are outside the project archive. Progress is specific to browser profile and origin, including the port. A JSON progress backup contains saves and preferences, not downloaded media. The restored media library remains available through the local host. The production app saves an offline application shell separately from downloaded game media. On the destination, open the app online, wait for **Settings → App installation → Ready to open offline**, and download the desired stories before disconnecting. See [installation and offline reading](../README.md#install-and-read-offline).

## Rebuild imports only when changing source content

The archive preserves recovered books, original extracted assets and tables, but re-extracting from game bundles still needs the original installed game and the extraction tool dependencies. Existing provenance may contain original absolute paths; those paths are evidence, not a requirement for playback.

For regeneration from the restored recovery inputs, keep `onlystory-gfl2` beside `onlystory`, and set the table directory. These paths must match your extraction location:

```powershell
$env:ONLYSTORY_GFL2_PROTOTYPE = (Resolve-Path '..\onlystory-gfl2\prototype').Path
$env:ONLYSTORY_GFL2_TABLES = (Resolve-Path '..\gfl2-source-tables').Path
npm run import:gfl2
```

The explicit importer validates source hashes and can reject changed/mismatched inputs. The original extraction scripts additionally reference the installed game and external tools; they are not a one-command game downloader. For ordinary deployment, use the existing generated catalog and library.

## Verify a deployment

For a local library host, open `/games/gfl2`, check release ordering and open an imported reader directly by URL. Reload and check backgrounds, a character, sound and a movie. A combined movie `Range` request should return 206; shared streams use independently addressable fragments. For a static deployment, confirm GFL chapters show pending and exercise a real BA original import and PJSK download, followed by a cold offline launch. In either mode, missing `/private/` files must return 404 rather than HTML.

For public hosting, HTTPS means serving the app at an address such as
`https://your-domain.example`. A deep-link check means pasting a `/read/...` URL
into a fresh tab and reloading it, so the host must return the app's `index.html`
for that route. An update check means publishing a changed build and confirming
**Restart to update** loads it without losing saves or downloaded stories.
A missing-file check means a nonexistent asset returns HTTP 404, rather than
`index.html` with a successful status. These are hosting checks, not a requirement
to buy hosting before trying the app on Linux. The included loopback runner
already supplies local routing and missing-file handling.

No public HTTPS host has been selected or deployed by this work. The local archive and loopback verification cannot establish a future host's routing, headers, service-worker scope or browser storage policy. Use `release/artifacts-current.json` for current release identities.
[standalone-verification.json](standalone-verification.json) records historical
artifact tests and their boundaries; it does not verify a newly rebuilt Linux
archive or an unpublished public host.

Source checks:

```powershell
npm run test
npm run build
npm run test:import
npx playwright test tests/catalog-filters.spec.ts --workers=1
```

Some import checks verify recovered source files and expect the full archived recovery inputs. They are not required to run a prebuilt copy. Source recovery details and known gaps are in [the GFL2 import report](gfl2-remaining-import.md).
