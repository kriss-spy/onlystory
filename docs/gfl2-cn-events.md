# GFL2 CN narrative event catalog

## First import batch — 2026-10-16

Six event workers prepared these installed-client packages. The shared importer adds them to the normal GFL2 library alongside the two existing events.

| Event          | Imported edition                                              | Sections | Source scripts | Dialogue rows | Import evidence                          |
| -------------- | ------------------------------------------------------------- | -------: | -------------: | ------------: | ---------------------------------------- |
| 异乡乐徽       | 于灰败的羽翼中（重制版）                                      |       10 |             16 |         1,532 | [Details](gfl2-daiyan-revised-import.md) |
| 方糖特调沙龙   | 苦涩荆棘与矢车菊（重制版）                                    |       10 |             17 |         2,621 | [Details](gfl2-cafe-revised-import.md)   |
| 交织突进       | Current installed story                                       |       11 |             20 |         1,864 | [Details](gfl2-interwoven-import.md)     |
| 循迹追演       | Current installed story; identical rerun scripts counted once |        4 |              5 |           227 | [Details](gfl2-trace-import.md)          |
| 狂想四重奏     | Current installed story                                       |       10 |             24 |         1,261 | [Details](gfl2-quartet-import.md)        |
| 玻璃岛的驻行者 | 上篇 / 下篇 within one event                                  |       19 |             44 |         2,302 | [Details](gfl2-glass-island-import.md)   |
| **Total**      |                                                               |   **64** |        **126** |     **9,807** |                                          |

The first two packages contain revised archive stories. Their titles and metadata explicitly identify that edition; the original launch scripts have not been imported as a second edition. Combat-only route nodes remain in provenance and are omitted from the reading list.

The batch includes backgrounds, music, sound effects, Live2D models and expressions, and Glass Island's two movies with Chinese/Japanese audio and 93 subtitle cues. Dialogue voice extraction is not implemented. Some original Unity animation and presentation commands remain unsupported, including CustomCharacter animations; source commands and limitations are retained. Exact missing references include 克罗丽科 in 交织突进, literal character label 0 and SE 2018034 in 狂想四重奏, and SE 2021001 in Glass Island. Glass Island also references a verified nonvisual timing prefab; it has no image to display.

Assets use the common content-hashed library. New eligible character atlases were converted to lossless WebP with exact RGBA comparisons; reused assets share the existing object. A physical audit after integration found 3,507,852,401 bytes across the whole private library, including both prior events, with 20,044 bytes of exact duplicates and no malformed manifests. This is apparent file size, not an incremental batch size or allocated disk usage.

Automated coverage checks compare every imported reader to its archived passages and scene steps, enforce unique IDs and edition labels, and verify SHA-256 and byte counts for the batch's published media. Browser checks cover all six opening/final passages and Glass Island's chapter folding and recovered movie.

Validation: production build, 36 unit checks, 18 import/hosting checks, and all 81 browser cases passed across the initial run and targeted reruns. An overlapping browser run collided with the default trace-output directory; affected cases passed with separate output directories. The full-scene offline-download check now permits 60 seconds for downloading and still verifies cached character files, backgrounds, music and playback with the network disabled; its final run completed in 27.6 seconds.

## Full catalog

### Artwork and release-order correction

金翅雀与橄榄枝's 24 reader section names now use installed `StageData` codes and localized titles, joined to the exact `AvgPlotData` entry and script list. For split battle stories, plot kinds 11 and 21 receive explicit 战前 and 战后 display labels, such as `CA-1-1 精英姿态 · 战前` and `CA-1-1 精英姿态 · 战后`; standalone stories retain their `CS` code. Existing section IDs and passage links are preserved. Both tables' hashes and each section's stage/plot identity are retained in import provenance. The build, 18 import/hosting checks and seven catalog browser checks passed after this naming correction.

#### Exhaustive imported-CG audit

The earlier browser checks sampled a few CG scenes. A later audit found two renderer bugs in 伊利昂之围: drawing another background discarded separately shaded transparent pieces on the same layer, and a delayed background removal suppressed a subsequent redraw. These caused seven CG-reference occurrences to be absent from the scene state: `M22022` rows 330/333/336/339/342/345 and `M23027` row 155. The renderer now retains individually addressed composite pieces and permits background redraws while preserving the existing delayed-character behavior. Two unit regressions reproduce the failures before the fix. Normal-reading browser regressions also cover both repaired sequences.

`npm run audit:cg` checks all 257 imported source scripts across eight events, comparing every one of the 1,747 active `Bg`/`Sprite` rows against its compiled book and scene commands. It checks all 53 CG references and 45 unique published images in the browser and records the source row, asset URL, dimensions, opacity, screenshot and original-passage link. The image SHA-256 must match its canonical filename. Stored browser evidence must match the current renderer and audit-code hash before a report can be generated. The audit uses bounded Chrome batches because a long WebGL test process encountered resource timeouts; a failed batch stops the command rather than silently retrying a missing image.

| Imported event         | Graphic commands checked | CG references | Unique CG images |
| ---------------------- | -----------------------: | ------------: | ---------------: |
| 金翅雀与橄榄枝         |                      323 |             1 |                1 |
| 伊利昂之围             |                      846 |            30 |               22 |
| 方糖特调沙龙 · revised |                      151 |             3 |                3 |
| 异乡乐徽 · revised     |                       64 |             0 |                0 |
| 玻璃岛的驻行者         |                      138 |            15 |               15 |
| 交织突进               |                      118 |             0 |                0 |
| 狂想四重奏             |                       90 |             4 |                4 |
| 循迹追演               |                       17 |             0 |                0 |

The review artifact is `private-review/cg-audit/index.html`, with machine-readable `report.json`, every source graphic row in `source-audit.json`, and per-reference screenshots. All 45 unique CG screenshots were also visually inspected in contact sheets. CG identification uses original graphic labels and source texture paths containing `CG`; all other background/sprite source commands are included in the broader preservation check. An intentionally hidden image at `M23002:28` is checked at its later explicit reveal, rather than forcing it visible early.

Final validation passed: the complete `npm run audit:cg` command, including the 53 browser references and source-preservation check, all 45 payload digest checks, 10 transition/effect browser regressions, 38 unit checks, 18 import/hosting checks and the production build.

Known non-CG graphics remain separate: four unresolved original `地图` prefab references in 伊利昂之围, and two references to Glass Island's proven nonvisual timing prefab `延后句子结束用物品`. This audit covers the installed imported editions. It does not establish pixel-perfect Unity effects/animation parity or coverage of unimported original editions and events.

The six batch events now have locally stored official PV covers. `scripts/gfl2-covers.py` retrieves the matching event IDs and image URLs from the [official website video API](https://gf2-web-preregister-api.sunborngame.com/website/video_list?page=1&limit=200); `src/cover-art.json` retains the title, source URL, dimensions and SHA-256. The first two covers represent the original event branding while the reader titles continue to identify the revised editions.

`?sort=release` now means oldest first and shows the original CN debut date. The revised packages keep their existing revision dates separately from `releaseDate`: 异乡乐徽 2023-12-25 and 方糖特调沙龙 2024-01-30. The [CN community archive](https://gf2-bbs.exiliumgf.com/threadInfo?comment_id=0&hash_flag=4&id=36986) records both original and replacement dates. The official [Café preparation announcement](https://www.taptap.cn/moment/497106031160069576) distinguishes the January 23 preparation period from the January 30 event opening. 伊利昂之围 uses its first chapter's June 30 debut rather than the final chapter's July date, and 金翅雀与橄榄枝 uses [September 1](https://www.taptap.cn/moment/843533787504575663) rather than the local import date.

The CGs were already present in the recovered media and scene programs. Browser checks now seek directly to original Café, Quartet and Glass Island CG commands and verify the canvas has loaded the CG. Screenshots were inspected, including Quartet's `MacqiatoCG_01_Panic`. No replacement artwork or extra CGs were invented for scripts that do not reference them. Validation after the correction: production build, 36 unit checks, 18 import/hosting checks and 10 targeted browser checks passed.

Checked 2026-10-16, China time. The installed CN client has 38 ActivityConfigData records resolving to 36 unique names. This list groups multi-part events and repeated configurations. It covers named theme/story events, not every login, resource, combat, shop, or web campaign. Some event stories are later archived as campaign chapters; their original event identity is retained here.

The order follows the first configuration ID, not a guaranteed release chronology. Exact debut dates are deliberately omitted because local ActivityListData start timestamps are not reliable enough to establish them.

| #   | Event branding       | Parts or lookup note                                                                                         |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | 异乡乐徽             | Original event branding. Later rewritten campaign story: 于灰败的羽翼中; not an assertion of identical text. |
| 2   | 方糖特调沙龙         | ActivityConfigData uses 苦涩荆棘与矢车菊, also the later campaign/archive title.                             |
| 3   | 交织突进             | Both configuration IDs 6 and 200 resolve to this name; counted once.                                         |
| 4   | 循迹追演             | Both configuration IDs 4001 and 24001 resolve to this name; counted once.                                    |
| 5   | 狂想四重奏           |                                                                                                              |
| 6   | 玻璃岛的驻行者       | 上篇、下篇                                                                                                   |
| 7   | 驻足之地             |                                                                                                              |
| 8   | 拂晓的回响           |                                                                                                              |
| 9   | 远日点               | 上篇、下篇                                                                                                   |
| 10  | 逃离赛博格           |                                                                                                              |
| 11  | 纪念日礼赞           |                                                                                                              |
| 12  | 共诉隐匿时           |                                                                                                              |
| 13  | 密米尔的返演         | 上篇、下篇                                                                                                   |
| 14  | 烟火迎春归           |                                                                                                              |
| 15  | 素银匿信             |                                                                                                              |
| 16  | 匿影而生             |                                                                                                              |
| 17  | 错位锚定             | 上篇、下篇                                                                                                   |
| 18  | 镜茧与囚蝶           |                                                                                                              |
| 19  | 心跳游乐园           |                                                                                                              |
| 20  | 沉没夜潮             |                                                                                                              |
| 21  | 火花之罪             | 上篇、中篇、下篇                                                                                             |
| 22  | 虚境新始             |                                                                                                              |
| 23  | 歧路双轨             | 上篇、下篇                                                                                                   |
| 24  | 前进吧，王牌配送员！ |                                                                                                              |
| 25  | 铸碑者的黎明         | 上篇、下篇                                                                                                   |
| 26  | 信号波重度依赖       |                                                                                                              |
| 27  | 瑞骋迎春至           |                                                                                                              |
| 28  | 月下安魂曲           |                                                                                                              |
| 29  | 镜像冗余             | 上篇、下篇                                                                                                   |
| 30  | 琥珀月光             |                                                                                                              |
| 31  | 忒弥斯棋局           |                                                                                                              |
| 32  | 梦中的永无岛         |                                                                                                              |
| 33  | 伊利昂之围           | 上篇、中篇、下篇                                                                                             |
| 34  | 寂静的匹丝缇         |                                                                                                              |
| 35  | 金翅雀与橄榄枝       |                                                                                                              |
| 36  | 静默突触             | 初篇、承篇、转篇、终篇；终篇预定 2026-10-20 开放                                                             |

## Evidence and availability

- [Machine-readable catalog](gfl2-cn-event-catalog.json) contains all configuration IDs, matched chapter/archive identities, and SHA-256 hashes of five installed source tables. Read-only extraction uses `node scripts/gfl2-event-catalog.mjs`. Field numbers are preserved; no complete decompiled table schema is claimed.
- The [official CN site and PV archive](https://gf2.sunborngame.com/main/ar) corroborate the event branding. The site requires JavaScript; its indexed text includes the historical PV list. Several alt-text labels contain typos, so exact titles above follow installed CN localization rather than those alt labels.
- The [official 2026-10-10 下篇 PV](https://www.bilibili.com/video/BV1KSpv6KEhe/) announces 静默突触·转篇 for October 13 and 终篇 for October 20. As of October 16, 终篇 is configured and announced but not yet open. A configured chapter is not proof of live availability.
- [Web source notes](gfl2-cn-event-web-sources.md) record additional public cross-checks and their limits.

All 36 event identities are now represented in OnlyStory. The remaining 28 were imported with their available stories and recovered media; see [batch coverage and source gaps](gfl2-remaining-import.md). 静默突触·终篇 is still excluded until its announced October 20 opening. The original/revised edition distinctions and explicit source/media gaps remain documented.
