# 于灰败的羽翼中 import

This package uses the current CN installed campaign titled 于灰败的羽翼中. Its original event branding was 异乡乐徽. It is explicitly the revised version; no recovered text here is represented as the original release.

## Source route

ChapterData 3001 contains the narrative route. StoryData predecessor/successor links agree with increasing map X position:

30381 → 30301 → 30302 → 30303 → 30382 → 30304 → 30305 → 30306 → 30307 → 30308 → 30309.

Node 30306, GW-1-6 污秽序曲, has no AvgPlotData rows and contributes no story text. The six kind-11 side nodes 30341–30346 have no AvgPlotData rows either. The package includes the ten story-bearing nodes and records combat-only omissions in its provenance.

The route maps to 16 scripts: A13001–A13010, A13012–A13014, A13016–A13018. Each node's plots are ordered by AvgPlotData field 5, then plot ID, then the script list and original grid row order.

Other chapters sharing the title are 1001, 4001, 91009, 93001, 94001 and 994001. These are not additional story versions in this package. The current StoryData rows in 93001 and 994001 have no AvgPlotData narrative rows.

## Recovery status

Pending extraction and asset coverage verification. Source tables are read from the user's installed CN game cache. The importer reuses the existing bounded table reader, catalogue resolver, UnityFS decoder, Cubism exporter and CRI audio decoder.

## Source command audit

All 16 books end at an original Text row and have no EndScenario command. The compiler must preserve this source EOF boundary explicitly rather than claim the game supplied an EndScenario row. There are no Selection, jump or Video commands.

The source has 1,532 Text commands, 514 Character commands, 36 Bgm commands and 176 Se commands. Shake occurs 11 times and SetShader occurs 6 times; they remain presentation commands in the original command archive.

No movie extraction is required because the mapped books reference no Video commands. This does not claim the original event never had other promotional or combat movies.

## Reproduce this package

```powershell
node scripts/gfl2-event-package.mjs --index scripts/events/gfl2-daiyan-revised.json
python scripts/gfl2-extract-event.py scripts/events/gfl2-daiyan-revised.json
node scripts/gfl2-event-package.mjs scripts/events/gfl2-daiyan-revised.json
python scripts/gfl2-media.py --books .cache/gfl2-daiyan-revised/books --book-glob '*.book.json' --output public/private/gfl2-daiyan-revised/media --cache .cache/gfl2-daiyan-revised/media --url-prefix /private/gfl2-daiyan-revised/media/
python scripts/gfl2-characters.py --books .cache/gfl2-daiyan-revised/books --book-glob '*.book.json' --output public/private/gfl2-daiyan-revised/characters --url-prefix /private/gfl2-daiyan-revised/characters/
python scripts/gfl2-characters-verify.py public/private/gfl2-daiyan-revised/characters/manifest.json
node scripts/gfl2-media-verify.mjs public/private/gfl2-daiyan-revised/media/manifest.json
```

The extraction steps produce raw assets. The parent library storage migration deduplicates them and converts eligible textures losslessly before scene integration.

## Verified text and characters

Compilation produced 10 story sections from 16 scripts, containing all 1,532 source Text rows, with zero unresolved text or speakers. The descriptor fixes the expected section and script counts so source changes fail visibly. The route retains combat-only node 30306 in coverage.

Each original book ends with Text. The compiler's `allowSourceEof` option accepts only that checked case and records `boundary: "source-eof"`. It adds no source EndScenario command. The audit is retained at `.cache/gfl2-daiyan-revised/command-audit.json`; source book hashes and catalogue/GFF segment identities are in generated provenance.

Character extraction recovered 15 of 15 used labels, 14 Cubism models and 243 hashed files, totaling 37,826,526 bytes before storage migration. The character verifier checked all file hashes, model references and 145 expression entries. It reported zero unresolved character labels or source pattern inconsistencies.

Source presentation commands remain available in section archives. Recovered Cubism assets and commands do not imply exact reproduction of the game's Unity shaders, particles or camera effects.

## Verified media

Media extraction and file verification completed with 18 background/sprite labels, 12 BGM cues and 91 sound-effect cues across all 16 books. The manifest inventories 138 hashed media files totaling 78,648,752 bytes before storage migration, with zero unresolved media references.

Audio recovery uses the pinned vgmstream r2117 decoder for source HCA rather than FFmpeg's incompatible native HCA decode. The manifest retains original cue graph provenance, reachable waveforms and loop regions. Browser playback preserves loop beds or a first one-shot variant; original CRI random sequencing, gains and pitch are not reproduced exactly. This importer recovers BGM and sound effects, not spoken dialogue tracks.

Raw character plus media bytes total 116,475,278. Shared storage migration can lower the installed library increase because these event outputs include assets already used by other stories.
