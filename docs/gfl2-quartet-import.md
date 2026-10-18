# 狂想四重奏 import

The current installed CN story is packaged as `gfl2-quartet`. Its event branding and chapter title are both 狂想四重奏. This package does not claim to recover an earlier edition.

## Source selection

The installed `ChapterData`, `StoryData`, `StageData`, `AvgPlotData`, `LangPackageTableCnData`, and `AvgContentData` determine chapter identity, ordering, script references, and text. Chapter 4008 is the narrative route. Chapters 3005 and 93005 have no `StoryData` nodes. Chapters 94008 and 994008 contain five nodes each with no mapped plots.

Chapter 4008 has 17 source nodes. Eleven belong to the main route, including the story-free combat stage 30806. Six other nodes have no plot scripts. The package retains the ten story-bearing route nodes in source link order. The two MS stages, 30881 and 30882, are part of this route, with kind 2 and predecessor/successor links, rather than optional side branches.

| Stage  | Title      | Books         |
| ------ | ---------- | ------------- |
| MA-1-1 | 错误交换   | A02001–A02002 |
| MA-1-2 | 意外来访   | A02003–A02004 |
| MS-1-1 | 危险通缉   | A02005–A02006 |
| MA-1-3 | 僵硬的玩偶 | A02007–A02008 |
| MA-1-4 | 入侵大作战 | A02009–A02012 |
| MA-1-5 | 可靠的伙伴 | A02013        |
| MS-1-2 | 意外碰面   | A02014–A02018 |
| MA-1-7 | 唐突的登场 | A02019        |
| MA-1-8 | 舞台的中心 | A02020–A02021 |
| MA-1-9 | 狂想落幕   | A02022–A02024 |

The release date field follows the supplied batch specification. It is not inferred from current table timestamps.

## Extraction and boundaries

The extractor resolved all 24 original book paths through the installed catalogue. It records source bundle locations, source segment SHA-256 hashes, mapping hash, and Unity object IDs in `.cache/gfl2-quartet/books-provenance.json`. The generated provenance also records original book and source table hashes.

All 24 original books end on a `Text` command without `EndScenario`. Each final active row was inspected before enabling `allowSourceEof`. Compilation preserves all original command rows in the section source payloads and retains this source EOF boundary in book provenance. No synthetic final dialogue or choice is added.

Compilation produced ten sections, 24 books, and 1,261 dialogue passages, with zero unresolved text IDs or speaker IDs. There are no video commands or choice branches. The source contains three `WaitInput` and three `EndPage` commands, all without arguments. The source presentation commands remain available for the shared player.

## Asset recovery and limitations

Media extraction recovered 23 backgrounds and 159 BGM/SE cues in 193 files, totaling 82,997,294 bytes. One source cue is unavailable: A02002 row 27 references SE 2018034, whose original setting names `BGE_Metalbox_Close_01` in `BGE_AVG_Chapter08`. That cue is absent from the installed bank's `CueNameTable`. The unresolved manifest preserves the setting, bank hash, script, and row. No other cue is substituted. The shared media extractor currently recovers BGM and SE; it does not recover dialogue voice audio. Original dialogue voice IDs remain in the book source.

Character extraction recovered eleven labels and ten distinct models in 116 files, totaling 20,852,285 bytes. The remaining label is the literal `0`, used by `Character` commands at A02022 rows 57 and 61. The installed character settings have no entry for this label. This book's `entityIndexTbl` and `entityDataList` are empty, so there is no original string substitution to restore. These rows and the unresolved manifest entries remain intact. No character alias is invented.

Cubism files and expression references were recovered offline. Browser rendering and timing are separate shared-player checks.

Verification checked all 309 media and character files against their manifest byte counts and SHA-256 hashes, all 106 model file references, and all ten reader/source payload pairs. Reader passage counts match all 1,261 imported dialogue rows. The strict character completeness verifier remains expected to fail on the documented unresolved literal label `0`.

## Reproduction

```powershell
node scripts/gfl2-event-package.mjs --index scripts/events/gfl2-quartet.json
python scripts/gfl2-extract-event.py scripts/events/gfl2-quartet.json
node scripts/gfl2-event-package.mjs scripts/events/gfl2-quartet.json
python scripts/gfl2-media.py --books .cache/gfl2-quartet/books --book-glob '*.book.json' --output public/private/gfl2-quartet/media --cache .cache/gfl2-quartet/media --url-prefix /private/gfl2-quartet/media/
python scripts/gfl2-characters.py --books .cache/gfl2-quartet/books --book-glob '*.book.json' --output public/private/gfl2-quartet/characters --url-prefix /private/gfl2-quartet/characters/
```
