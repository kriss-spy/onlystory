# Move Onlystory to another machine

Checked on 2026-10-16 with a fresh project directory on Windows: `npm ci` and `npm run build` succeed without the sibling extraction project, `.cache`, or an installed game. The production host uses Node built-ins and can serve a relocated build and an external library. This is a same-machine relocation check, not a claim of testing another operating system or physical computer.

The relocated production build was also opened in Chrome with an external library directory. It passed checks for 36 collections, newest-first default sorting, the real 爵士 hologram after a deep-link reload, canonical and legacy asset byte-range responses, missing-media 404s, and the bundled Cubism runtime.

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

The frontend is small compared with the media library and deliberately excludes `public/private`. Copying `dist` alone will show the catalog but fail to load stories and media. Keep `shared/index.json`: older URLs depend on its alias map.

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

## Include the PJSK episode

PJSK media use a supplementary library rather than `public/private`. Copy `.cache/pjsk/library`, or set `ONLYSTORY_PJSK_LIBRARY` to its relocated directory containing `private`. For a source rebuild, also retain `src/generated/pjsk-cn-unit-30001.json`. The production host and Vite hosts serve both media roots. PJSK media are excluded from `dist` just like the main GFL2 library.

To regenerate the episode, keep `.cache/pjsk/http` and `.cache/pjsk/packages` as well, then run `npm run import:pjsk -- --scenario mmj_01_01 --install --offline`. With network access, the same command without `--offline` can acquire its sources and assets. See [PJSK pipeline notes](pjsk-pipeline.md) for the explicit CN-text/JP-media pairing and supported episode.

## Move reading progress separately

Export reading data from the current app and import it on the destination. Browser localStorage and CacheStorage are outside the project archive. Progress is specific to browser profile and origin, including the port. A JSON progress backup contains saves and preferences, not downloaded media. The restored media library remains available through the local host. Reopening the entire app offline still requires an offline application shell that has not been implemented.

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

Open `/games/gfl2` and confirm newest release order with 36 collections. Open a real reader directly by URL, reload it, and check backgrounds, a character, sound and a movie. Confirm a nonexistent `/private/` URL returns 404 rather than HTML. A movie request with a `Range` header should return 206. These checks distinguish a working media host from a frontend-only deployment.

Source checks:

```powershell
npm run test
npm run build
npm run test:import
npx playwright test tests/catalog-filters.spec.ts --workers=1
```

Some import checks verify recovered source files and expect the full archived recovery inputs. They are not required to run a prebuilt copy. Source recovery details and known gaps are in [the GFL2 import report](gfl2-remaining-import.md).
