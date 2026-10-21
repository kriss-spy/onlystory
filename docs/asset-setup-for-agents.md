# Prepare story files with a coding agent

Onlystory's catalog describes stories. It does not ship the original game files.
BA and Project SEKAI have download/import recipes. GFL1 and GFL2 currently need
a prepared local library. A downloader marked pending is not a request for game
account credentials.

Give your coding agent the repository, your game installation or extracted-source
path, the game/region you want, and a separate output directory. Ask it to follow
`AGENTS.md`, preserve the originals, report missing sources, and run the game's
import checks. Do not ask it to invent missing dialogue or replace missing media.

## Shared setup

Use Node.js 22.12 or newer and `npm ci` in a checkout of this repository. Python
extractors need their listed dependencies in an isolated virtual environment.
The Windows examples below use PowerShell. On Linux use `python3`, `.venv/bin/python`
and `export NAME=value` in place of their Windows equivalents.

Keep generated metadata in `src/generated` and point the library server at the
directory containing `private/`. Set `ONLYSTORY_LIBRARY` before importing and
starting the server if the library is outside `public`. Do not publish that
directory with the source repository.

```powershell
$env:ONLYSTORY_LIBRARY = 'D:/Onlystory-library'
npm run dev
```

Open the printed loopback URL. The server must keep running while reading its
prepared library. Streaming a local library does not install an offline copy in
the browser. Progress and downloads belong to that browser profile and origin,
so keep the same host and port when returning.

## Blue Archive

Start with the in-app getting-started guide on the BA catalog. In the desktop
app, choose a story and Download and import. In the web app, its download page
lists the exact original inputs to save and then choose for browser import.
Shared inputs can be reused across stories. Keep the app open until preparation
finishes. A global `ExcelDB.global.db` supplies verified English where available;
the original Japanese database and media remain required. A global installation
alone cannot substitute for the pinned Japanese originals.

For development acquisition, install Git, uv, .NET 10 SDK and ffmpeg, then run:

```powershell
npm run acquire:ba -- --groups=11000
npm run acquire:ba-english
npm run test:ba-import
```

The first command limits the import to the prologue. Read
[the BA pipeline](blue-archive-pipeline.md) and
[browser import instructions](ba-browser-import.md) before acquiring more.
The pinned sources have separate Japanese and global build versions. Coverage
is not a promise about today's JP or global server. Keep unsupported groups in
Japanese and preserve the reason English was withheld.

## Girls' Frontline 1

The importer expects the original Steam EN installation, including
`GirlsFrontLine_Data/StreamingAssets/Res/Pc`. Install Python, UnityPy, ffmpeg and
vgmstream-cli. Begin with Chapter 1 to verify the toolchain:

```powershell
python -m venv .cache/gfl1-venv
.cache/gfl1-venv/Scripts/python.exe -m pip install UnityPy
.cache/gfl1-venv/Scripts/python.exe scripts/gfl1-extract.py --game-root 'D:/Games/GirlsFrontLine' --output .cache/gfl1 --library-root 'D:/Onlystory-library' --vgmstream 'D:/Tools/vgmstream-cli.exe'
$env:ONLYSTORY_GFL1_EXTRACTED = "$PWD/.cache/gfl1/extracted.json"
$env:ONLYSTORY_LIBRARY = 'D:/Onlystory-library'
npm run import:gfl1
```

For the full native replay catalog, follow the staged collection selection and
extraction commands in [the GFL1 pipeline](gfl1-pipeline.md). Its extracted
scripts and native STC tables are both needed to establish collection order.
The documented missing scripts and media remain explicit archive gaps.

## Girls' Frontline 2

Read [the full-text pipeline](gfl2-full-text.md),
[the event package notes](gfl2-cn-events.md) and the per-event source notes.
The existing importer expects a recovered prototype export and installed CN
client tables. A raw installation is not a completed extraction, and there is no
one-command acquisition for arbitrary newer clients.

```powershell
$env:ONLYSTORY_GFL2_PROTOTYPE = 'D:/onlystory-gfl2/prototype'
$env:ONLYSTORY_GFL2_TABLES = 'D:/GF2/GF2 Game/GF2_Exilium_Data/LocalCache/Data/Table'
npm run import:gfl2
```

Use a separate checkout for this importer. Some historical GFL2 scripts write
under its `public/private` directory rather than the external library override.
Keep that directory with its generated metadata, or use the relocation process
in [deployment instructions](deployment.md). An agent must check that the source
index, `.book.json` exports, localization tables and package manifests match the
documented format before running the import. A newer regional client may need
new extraction and verification work. Do not call a retained prior import a
successful new acquisition.

## Project SEKAI

Use the in-app downloader for supported stories. For development and corpus
imports, read [the PJSK pipeline](pjsk-pipeline.md) and its acquisition manifests.
Source region, story language and voice availability are separate properties;
do not rename a source region to imply a translation exists.

## Verify the result

Run `npm run check`. For game-specific import failures, inspect the corresponding
`scripts/*-*.test.mjs` reports and source ledgers before changing a manifest.
Open an early and late story, check a real branch, original visuals/audio, reload
a saved passage, and inspect declared missing-media notices. For a supported
download, install one story, close and reopen the app, then read with networking
disabled. A catalog entry, successful build or stream from the local server alone
does not establish offline availability.

Report exact source versions, paths, commands, checks run and remaining gaps.
Refer to [standalone app instructions](standalone-app.md) for packaging and
[deployment instructions](deployment.md) for relocating the finished library.
