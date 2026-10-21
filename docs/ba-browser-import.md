# Blue Archive browser import proof

Test date: 2026-10-19. Scope: JP prologue `11000`, desktop Chrome.

Implementation update: this importer is now connected to the app's download UI
and the Windows executable. See [standalone app instructions](standalone-app.md).
The experiment below remains the original feasibility record and now imports the
same production worker.

The experiment processes user-selected original files entirely inside a browser
worker, then opens the existing reader offline. The host serves static app code,
codec WASM and a recipe containing filenames, selectors and hashes. It rejects
every `/private/` request. No extraction server or hosted game media is involved.

This is a separate technical experiment. The production app's import UI has not
been changed.

## Inputs and processing

The user selects 156 original files, totalling 120,245,302 bytes:

- Two official `FullPatch_Prologue` ZIPs containing Unity bundles.
- 147 official JPEG and Ogg files.
- Five community effect textures already used by the native importer.
- Two pinned community JSON files for story commands and character names.

The recipe lists the original download URLs. Downloading these files through the
browser's normal download UI happens before import. JavaScript reads only the
files the user selects, so the official host's Fetch CORS restriction does not
block local processing. Availability checks and CORS findings remain separate;
see the [online asset audit](online-asset-audit.md).

The worker verifies input sizes and SHA-256 hashes, opens the ZIPs, parses Unity
assets, decodes Android ASTC textures, crops emoji sprites, extracts Spine data,
and repackages FSB Vorbis packets as standard Ogg. It compiles story text and scene
commands with the existing BA compilers. It stages the results in Cache Storage
and publishes them after all input and output checks pass.

The 232 media outputs include six Spine models, 118 dialogue voices, four music
tracks and 15 sound effects. BA uses Spine here; this proof does not test Live2D.
The worker also creates chapter, scene and provenance metadata and marks the
chapter installed using the existing local data format.

## Verification

The browser probe starts with a fresh Chrome context and an empty media cache.
It checks that a corrupted original with the correct filename and size fails its
checksum without publishing media. It then selects the actual original files.

The rebuilt chapter JSON matches the native import exactly. The scene program
also matches after substituting the newly encoded media hashes and lengths.
Texture pixels match the pinned browser decoder output exactly and differ from
the native ASTC reference by at most one 8-bit channel value. All 15 repackaged
sound effects decode in Chrome with the original frame counts and channels;
PCM differs from the native reference by at most two 16-bit levels.

The probe opens the reader, closes the page, disables networking, and reopens it.
It follows one complete authored path through all seven choice prompts to the
chapter's completion screen. This exercises one path, not every branch. No
external HTTP requests are allowed during import or playback. The existing
cache-migration code probes `/private/shared/index.json`; the host rejects that
optional metadata request with 403. No game asset is served by the test host.

Machine-readable results are recorded in [ba-browser-import-proof.json](ba-browser-import-proof.json).
Screenshots and detailed regenerated evidence remain under the ignored
`.cache/ba-browser-import/` directory.

## Reproducing the proof

From a checkout with the existing BA prologue native import and its retained
original downloads:

```sh
npm ci
npm run build
node scripts/probe-ba-browser-import.mjs
```

Chrome must be installed. Recipe preparation also uses the existing
`.cache/ba-downloader/.venv/Scripts/python.exe` environment with Pillow to compare
native reference pixels. This maintainer preparation step is not part of browser
import. Native reference media and raw pixel comparisons are never served to the
browser. The pinned experiment dependencies install into an ignored scratch
directory, leaving the app's dependency graph unchanged.

`--prepare-only` builds the standalone static experiment under
`.cache/ba-browser-import/dist`. Its page provides the source URL list and a file
picker. The automated probe serves it alongside the built app, without private
asset access.

## Limits and next work

This proves one pinned chapter on desktop Chrome. It does not establish all BA
chapters, mobile memory limits, movie conversion, later encrypted databases,
partial-import recovery, or storage persistence under eviction. The Vorbis
remuxer accepts only the two reviewed setup headers in this chapter. Production
integration needs broader format coverage, quota handling and a simpler way to
obtain and select the original files. Asking users to collect 156 files is not
yet a practical download experience.

The ZIP and Unity parsers are [zip.js](https://github.com/gildas-lormeau/zip.js)
and [unity-asset-reader](https://github.com/fatal10110/unity-asset-reader).
The texture decoder is its pinned WASM dependency. Codec setup attribution and
the preserved MIT license are in the [Vorbis header notes](../scripts/ba-import-experiment/vorbis/README.md).
