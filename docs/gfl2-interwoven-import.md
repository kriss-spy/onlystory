# 交织突进 import

The import reads the current installed CN story under chapter 4006, titled 交织突进. ActivityConfigData IDs 6 and 200 share this branding. No separate original or rewritten text edition has been established for this event.

## Source order

StoryData defines eleven story-bearing nodes. Their predecessor chain agrees with their map x positions:

| Story ID | Code   | Title          | Books          |
| -------- | ------ | -------------- | -------------- |
| 30586    | LS-1-1 | 暗流之下       | A23001         |
| 30501    | LA-1-1 | 高昂的希望     | A23002, A23003 |
| 30502    | LA-1-2 | 盘根错节       | A23004, A23005 |
| 30503    | LA-1-3 | 鹬蚌相争       | A23006, A23007 |
| 30504    | LA-1-4 | 虚妄幻觉       | A23008, A23009 |
| 30505    | LA-1-5 | 沉睡的实验品   | A23010, A23011 |
| 30506    | LA-1-6 | 交汇的瞬间     | A23012, A23013 |
| 30507    | LA-1-7 | 地下交易       | A23014, A23015 |
| 30508    | LA-1-8 | 通往梦想的道路 | A23016, A23017 |
| 30509    | LA-1-9 | 开辟而出的选择 | A23018, A23019 |
| 30587    | LS-1-2 | 留存的证据     | A23020         |

AvgPlotData kind order places pre-combat kind 11 before post-combat kind 21. Book order follows each plot's script list, then original grid row order. Original commands remain in the source payloads.

Six kind-11 nodes, 30541 through 30546, are combat branches named 觅光行旅I through VI and contain no AvgPlotData. They are excluded from the reader rather than populated with invented dialogue. Other configured chapters 1009, 3003, 91017 and 93003 have no StoryData records. Chapters 94006 and 994004 have combat nodes without plots.

## Provenance

The source is the user's installed CN client at `D:/Program Files/GF2Exilium`, its current localization and narrative tables, and its Addressables assets. Extraction reuses the existing bounded catalogue, GFF and CRI parsers from the sibling `onlystory-gfl2` workspace. This work does not perform new executable decompilation or claim new REA evidence IDs. Generated provenance records table, mapping, book and extracted-media hashes.

The spec's date is catalog metadata supplied for integration, not a debut date independently verified from these tables. Configuration order and local activity timestamps are not proof of release chronology.

## Reproduction

Run from the OnlyStory repository root:

```powershell
node scripts/gfl2-event-package.mjs --index scripts/events/gfl2-interwoven.json
python scripts/gfl2-extract-event.py scripts/events/gfl2-interwoven.json
node scripts/gfl2-event-package.mjs scripts/events/gfl2-interwoven.json
python scripts/gfl2-media.py --books .cache/gfl2-interwoven/books --book-glob '*.book.json' --output public/private/gfl2-interwoven/media --cache .cache/gfl2-interwoven/media --url-prefix /private/gfl2-interwoven/media/
python scripts/gfl2-characters.py --books .cache/gfl2-interwoven/books --book-glob '*.book.json' --output public/private/gfl2-interwoven/characters --url-prefix /private/gfl2-interwoven/characters/
```

The event compiles to 11 sections and 1,864 text passages from 20 books. All localized text and speakers resolve. Its source contains no Selection or Video commands. An audit of dynamic row entities found no changed Bg, Sprite, Character, Bgm, Se or Video command rows, so the extractors' direct row label scans cover the actual references.

Source inspection and command counts are retained in `.cache/gfl2-interwoven/catalog-inspection.json` and `.cache/gfl2-interwoven/command-audit.json`. The complete original commands are retained in the event's section payloads. Runtime scene conversion and shared lossless storage conversion are completed by the parent integration pass.

## Extraction results and remaining gap

- 24 background/graphic labels, 24 BGM cues and 54 sound cues were recovered into 104 media files. The media verifier passes and reports no unresolved media labels.
- 42 of 43 Character labels were recovered, covering 39 Cubism models. Original character files total 100,425,927 bytes before shared storage and lossless image conversion.
- The only unresolved character reference is `A23016:82`, `Character 克罗丽科 Disdain,0 中`. The following Text command also names `克罗丽科`. The current settings contain `克罗丽科SR`, `克罗丽科SSR` and other forms, but no exact `克罗丽科` CharacterName. Picking a model from those alternatives would require an inferred alias. The import retains the original reference and records the mismatch instead of supplying a guessed portrait.

The character verifier checked file hashes, model files and their referenced assets before failing its complete-label-coverage assertion because of that single missing setting. This is a source/settings gap, not a successful complete character verification. Parent integration must preserve or explicitly repair this limitation with recorded evidence.

All eleven reader/source payload URL pairs exist. The source route starts at `LS-1-1 暗流之下` and ends at `LS-1-2 留存的证据`.
