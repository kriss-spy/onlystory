# BA standalone download recipes

The BA chapter importer reads original public game files. It does not fetch
prepared Onlystory chapters or media from a hosted Onlystory backend.

`src/downloads/ba/catalog.json` lists chapter recipe names, compressed hashes and
input byte totals. The loader fetches a chapter's recipe when needed. Each recipe
contains original-file hashes, Unity object selectors, asset mappings and chapter
metadata. Recipes do not contain story dialogue or media bodies.

The existing prologue recipe uses the pinned BA Archive script and name table.
Other chapters decode their rows and character names from the pinned official JP
`ExcelDB.db`. The database importer verifies the complete encrypted input before
decoding its tables with the committed version-specific schemas. The same original
database supplies every chapter, so the desktop original-file cache can reuse it.

Recipes for the 1,519 completely aligned, released chapters also include the
pinned global English database as an original input. Both databases are verified
before decoding. Chapter-wide row order, narrative anchors and choice groups must
agree; English is withheld for the other 140 chapters. Translations include
dialogue, speakers, player-name fallbacks, choices and authored text pauses.
See [ba-english-verification.json](ba-english-verification.json) for exact source
hashes, coverage and exclusions. English availability does not imply English
voice audio.

The official game CDN does not permit ordinary cross-origin browser downloads.
The Windows app downloads original files directly. Browser users supply original
files through the importer. Neither flow needs an Onlystory server. Movie and split
voice conversion uses the app's fixed media converter, with input hashes checked
before conversion.

## Regenerating recipes

Prepare the current BA library using the acquisition pipeline in
[blue-archive-pipeline.md](blue-archive-pipeline.md). Preserve its original-file
cache. Then run:

```powershell
.cache/ba-downloader/.venv/Scripts/python.exe -X utf8 scripts/prepare-ba-downloads.py
node scripts/prepare-ba-downloads.mjs
npx vitest run src/downloads/ba-catalog.test.ts
```

The Python step verifies original files and resolves every declared media output.
It matches text bodies by SHA-256 and decoded texture pixels against the prepared
native exports. It records the original ZIP member and Unity object ID. The Node
step decodes selected textures with the same JavaScript library as the app. It
checks dimensions, permits at most one intensity level of difference per channel
from native decoding, and pins the exact JavaScript RGBA hash used at import.

The Node step also checks original encrypted voice-archive members and pins media
converter input hashes. It publishes a shared source registry, fixed native
transform registry and compressed chapter recipes. Its verification cache under
`.cache/ba-all-downloads` lets an interrupted texture check resume after the last
completed original pack.

The database key must be present in `.cache/ba-all-downloads/key.txt` before the
Node step. Use the existing JP downloader key provider for the pinned game build;
a future build requires a matching verified database, key and schema snapshot.

The [verification record](ba-download-verification.json) includes exhaustive
original database compilation and media conversion checks. Static-host browser
tests import original files, recover a corrupt cached recipe and cold-launch the
reader offline. Those playback checks are representative, rather than a claim
that every passage in every chapter has been played through.
Existing reader limits, including the declared Unity 3D cutscene barriers, remain
documented in the pipeline guide.

## Browser movie conversion check

The [browser verification record](ba-browser-movie-verification.json) covers the complete original 59-second `212000_MV` movie and its separate soundtrack. The production static app imported verified originals with browser FFmpeg, produced a 1280 × 720 H.264/AAC movie, then opened it in a new offline window and sought near its end with decoded video and audio. No prepared chapter or media was seeded, no native bridge was present, and no private backend served content. The record includes the measured import time and exact tested build. This is representative evidence for one complete movie; longer movies and other browsers have not been timed by this check.
