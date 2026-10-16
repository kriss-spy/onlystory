# 伊利昂之围 import

The private import contains one event, with 上篇 / 中篇 / 下篇 represented as sections of the same story list. There are 65 readable stories: 51 main stories and 14 optional side stories. They contain 101 original books, 14,511 dialogue/narration rows, three single-option prompts, four video passages, and two explicit end passages after chapter-ending movies.

## Reproduce locally

With the existing sibling prototype and installed game available:

```powershell
python scripts/gfl2-ilion-extract.py
python scripts/gfl2-media.py --books .cache/gfl2-ilion/books --book-glob '*.book.json' --output public/private/gfl2-ilion/media --cache .cache/gfl2-ilion-media --url-prefix /private/gfl2-ilion/media/
python scripts/gfl2-characters.py --books .cache/gfl2-ilion/books --book-glob '*.book.json' --output public/private/gfl2-ilion/characters --url-prefix /private/gfl2-ilion/characters/
npm run import:gfl2
npm run test:import
```

Movie extraction is documented separately by its extractor and retained provenance. `GF2_GAME_ROOT`, `ONLYSTORY_GFL2_TABLES`, and the existing `ONLYSTORY_GFL2_PROTOTYPE` override their respective local source locations. The generated private content remains available when local extraction sources are absent; normal builds do not re-extract game bundles.

## Source and ordering

`ChapterData` IDs 4047, 4048 and 4049 are checked against the exact localized titles 伊利昂之围·上篇, 伊利昂之围·中篇 and 伊利昂之围·下篇. `StoryData` joins each map node to `StageData`; `AvgPlotData` supplies its original book labels, sorted by recorded plot type then the original script list. Main nodes retain the predecessor chain, checked against the original map position. Battle stages without AVG books are excluded from the reading list.

The fourteen side nodes use the independently corroborated raw kind 14 / flag 1 classification. Their raw predecessor/successor relationships determine the attachment and branch sequence. Two chains contain two side stories. Both members retain the same branch ID and main-story anchor, allowing the reader to follow the branch without inserting it into the main route. These relationships establish the source map layout; they do not prove fictional chronology or spoiler-safe unlock conditions.

`AdvBookAssetPathMappingSO` provides the full, case-sensitive path for each of the 101 books. The existing Addressables parser resolves each path through UTF-16LE MD5 catalogue keys and the GFF packing index. Four original physical segments contain the selected books. The extractor follows the exact catalogue internal ID, validates the serialized book name, and retains source path, bundle offset/size, serialized path ID and SHA-256. Generated provenance also records every input table and extracted book hash. This is ordinary offline parsing, not runtime game observation or retained REA evidence.

## Script boundaries and fidelity

All dialogue text, speakers and gender variants resolve through the original localization tables. Unknown control flow fails import. M24011 contains three single-option selection prompts whose target labels immediately follow each selection; the importer checks this pattern, preserves their localized prompt text and original commands, and refuses divergent targets or multiple-option flow. No narrative choice is silently discarded.

Four books contain only an original `Video` command followed by `EndScenario`. Those become actual video passages with the original numeric movie IDs. Two movies finish their containing story and receive an explicit end passage using the original EndScenario row. No invented dialogue is used for a movie.

Additional presentation commands are retained in the source archives: ChangeSoundVolume, LayerSortingOrder, CustomCharacter, SetTrigger, ChangeUIType, PlayCharAnim and AutoPlay. Retaining a command does not establish exact reproduction of Unity prefab animation, shader behavior, particles, CRI sequencing or game-controlled automatic timing. Refer to generated scene manifests for unresolved resource references and the renderer for supported behavior.

The importer writes separate `gfl2-ilion.json` / `gfl2-ilion-scenes.json` manifests and `/private/gfl2-ilion/` packages, preserving the existing 金翅雀与橄榄枝 import.
