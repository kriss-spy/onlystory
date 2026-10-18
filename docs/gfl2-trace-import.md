# 循迹追演 import

Imported the current installed CN story into `gfl2-trace`. This records the installed table and book contents, not an assertion that the March 2024 launch text is unchanged.

## Route and version identity

The authoritative join is ChapterData 4007 → StoryData → StageData → AvgPlotData → the installed AdvBookAssetPathMappingSO mapping. ChapterData 3004 points to 4007. ChapterData 3028 points to rerun route 4031. Both routes have the same story titles and ordered script labels A04001 through A04005. The spec imports only 4007 and records 4031 as a related run to avoid adding the same event twice. This comparison establishes identical script references in the installed tables, not historical byte identity across releases. The date 2024-03-26 is catalog metadata, not derived from the current ChapterData tables.

| Source node | Section         | Scripts        | Passages |
| ----------- | --------------- | -------------- | -------- |
| 30786       | JS-1-1 演出委托 | A04001, A04002 | 68       |
| 30787       | JS-1-2 突然袭击 | A04003         | 43       |
| 30788       | JS-1-3 可靠援助 | A04004         | 91       |
| 30709       | JA-1-9 未来回音 | A04005         | 25       |

The final node's AvgPlotData type is 21. It carries the final story and is included. Eight combat-only route nodes 30701 through 30708 have no plot links and are excluded. All twelve route nodes retain their original graph metadata in `.cache/gfl2-trace/nodes.json`.

## Book boundaries and commands

All five installed books end with an active Text row and contain no EndScenario command. The spec explicitly allows source EOF. Generated book provenance marks each boundary `source-eof`; no source dialogue or commands were removed and no EndScenario was invented.

The only additional reviewed presentation command is SetShader. A04001 rows 6 through 8 set the background's brightness, blur mode and blur radius. All three remain in the archived command list. The reader does not promise to reproduce these Unity shader effects. No branching commands or movies occur in these books.

## Recovery and checks

Raw extraction completed on 2026-10-16 with 4 sections, 5 scripts and 227 passages. All text and speaker references resolved. Generated JSON includes table hashes, book hashes, bundle segment hashes and installed mapping provenance.

Recovered media includes 6 background labels, 4 BGM cues and 14 sound cues, covering 24 files and 22,348,268 bytes before shared storage migration. The black background uses the existing documented black replacement. Character recovery includes 绛雨SSR and 黛烟SSR, plus the sound-only label SoundOnly_02, with 32 hashed files, 16 expression entries and 5,041,702 bytes before optimization. Both manifests reported zero unresolved entries.

Verification passed:

```powershell
node scripts/gfl2-event-package.mjs scripts/events/gfl2-trace.json
node scripts/gfl2-media-verify.mjs public/private/gfl2-trace/media/manifest.json
python scripts/gfl2-characters-verify.py public/private/gfl2-trace/characters/manifest.json
```

These checks validate source coverage, hashes, references and expressions. Browser playback, shared storage migration and scene compilation are handled in the parent integration task. Recorded byte counts refer to raw assets before that migration.

## Reproduce

```powershell
python scripts/gfl2-extract-event.py scripts/events/gfl2-trace.json
node scripts/gfl2-event-package.mjs scripts/events/gfl2-trace.json
python scripts/gfl2-media.py --books .cache/gfl2-trace/books --book-glob '*.book.json' --output public/private/gfl2-trace/media --cache .cache/gfl2-trace/media --url-prefix /private/gfl2-trace/media/
python scripts/gfl2-characters.py --books .cache/gfl2-trace/books --book-glob '*.book.json' --output public/private/gfl2-trace/characters --url-prefix /private/gfl2-trace/characters/
```
