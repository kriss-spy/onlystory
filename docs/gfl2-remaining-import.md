# Remaining GFL2 CN story events

Imported 2026-10-16 (China time). All 36 named narrative event identities in the installed CN catalog are now represented. This batch adds 28 events, 562 story sections, 1,031 unique scripts and 88,875 original Text commands. The full library contains 715 sections, 1,288 scripts and 117,636 Text commands. Login rewards, shops and combat-only campaigns are outside this catalog.

The first two events retain their revised archive labels; this batch does not reconstruct removed original editions. 静默突触 includes 初篇、承篇、转篇. Its configured 终篇 opens on 2026-10-20 and is deliberately absent from the playable list. The event page and completion text disclose this.

| Event                | CN debut   | Story sections | Scripts | Source text rows |
| -------------------- | ---------- | -------------: | ------: | ---------------: |
| 驻足之地             | 2024-07-16 |              8 |      10 |              578 |
| 拂晓的回响           | 2024-08-06 |             12 |      20 |             1293 |
| 远日点               | 2024-08-27 |             31 |      88 |             3462 |
| 逃离赛博格           | 2024-10-09 |             11 |      18 |             1511 |
| 纪念日礼赞           | 2024-10-29 |             10 |      10 |              569 |
| 共诉隐匿时           | 2024-11-19 |             10 |      10 |              735 |
| 密米尔的返演         | 2024-12-10 |             35 |     107 |             3690 |
| 烟火迎春归           | 2025-01-21 |             15 |      24 |             1821 |
| 素银匿信             | 2025-02-11 |             13 |      13 |             1045 |
| 匿影而生             | 2025-03-04 |             13 |      21 |             1429 |
| 错位锚定             | 2025-03-25 |             44 |      82 |             4592 |
| 镜茧与囚蝶           | 2025-05-06 |             15 |      33 |             2661 |
| 心跳游乐园           | 2025-05-27 |             13 |      23 |             1527 |
| 沉没夜潮             | 2025-06-17 |             11 |      21 |             1527 |
| 火花之罪             | 2025-07-08 |             50 |      90 |             8329 |
| 虚境新始             | 2025-09-09 |             13 |      27 |             2219 |
| 歧路双轨             | 2025-09-30 |             29 |      50 |             4814 |
| 前进吧，王牌配送员！ | 2025-11-11 |             11 |      18 |             1080 |
| 铸碑者的黎明         | 2025-12-02 |             38 |      60 |             5087 |
| 信号波重度依赖       | 2026-01-13 |             14 |      24 |             3087 |
| 瑞骋迎春至           | 2026-02-03 |             14 |      24 |             2479 |
| 月下安魂曲           | 2026-02-24 |             15 |      25 |             3040 |
| 镜像冗余             | 2026-03-17 |             42 |      70 |             9834 |
| 琥珀月光             | 2026-04-28 |             13 |      22 |             2334 |
| 忒弥斯棋局           | 2026-05-19 |             15 |      23 |             2785 |
| 梦中的永无岛         | 2026-06-09 |             18 |      29 |             4359 |
| 寂静的匹丝缇         | 2026-08-11 |             14 |      28 |             3121 |
| 静默突触             | 2026-09-22 |             35 |      61 |             9867 |

## Sources and reproduction

- `scripts/events/gfl2-cn-*.json` records the selected installed chapter identities, release-date source, expected counts, reviewed command additions, and explicit source gaps. Release chronology follows the [GFL2 event archive](https://iopwiki.com/wiki/GFL2_Events), cross-checked during the catalog research; table configuration IDs are not release dates.
- `scripts/gfl2-event-package.mjs` reads installed ChapterData, StoryData, StageData and AvgPlotData, restores packed predecessor/successor IDs, and validates the main DAG plus optional branches. Kind 11/12/14 optional paths and kind 13 main-route nodes are included when they carry stories. Combat-only nodes remain in provenance without empty reader cards.
- Books are extracted read-only by `scripts/gfl2-extract-event.py`; each event provenance retains exact book and localization table SHA-256 hashes. `npm run import:gfl2` rebuilds the readers, command archives and scene programs from these private inputs.
- `scripts/gfl2_grid.py` restores dynamic argument strings before media discovery. `scripts/gfl2-split-assets.py --batch .cache/gfl2-remaining/batch.json --assets public/private/gfl2-remaining-assets` assigns the union extraction to each event through references rather than payload copies.
- `scripts/gfl2-covers.py` downloads matching event PV art from the [official CN video API](https://gf2-web-preregister-api.sunborngame.com/website/video_list?page=1&limit=200). Each cover retains official title/ID, URL, dimensions and SHA-256. Some official API titles contain typos; catalog names follow installed Chinese localization.

## Choices, movies and storage

忒弥斯棋局 contains 15 real choice groups across A29008, A29014, A29018 and A29021. Their 42 option rows and 37 jumps are retained as a graph, including wrong-answer loops and alternatives physically stored after EndScenario. A separate single-option prompt in another event remains readable. Choices are never concatenated into one path. Scene state follows the selected edge history. Save validation and shared URLs preserve repeated choice visits.

This batch includes 14 distinct movie references. Movies 11801, 11901 and 12001 have separate male/female source files; both are recovered. Each source variant has separately selectable Chinese and Japanese audio, and installed Chinese subtitles are recovered from USM SBT timing plus VideoSubtitleData/AvgContentData. MP4 exports copy original H264 pictures; original ADX audio is decoded with the pinned vgmstream build and encoded as AAC. These exports do not claim lossless audio compression.

Media are shared by verified payload hashes. Character PNG atlases are converted only when lossless WebP reproduces every RGBA byte and reduces size. Movie downloads select the requested gender/voice combination and record that combination for offline availability.

The exported private library occupies 9,275,124,542 bytes (8.64 GiB), including readable source archives, manifests, models, covers and movies. The duplicate inventory reports 20,044 redundant bytes; this is a physical-file measurement, not a bandwidth estimate. Original game assets and extraction caches are outside this number.

## Explicit source gaps and rendering limits

- A18011:14 has no text reference. M17020:9 and :15 both reference missing language record 430855. Only these reviewed rows receive a visibly labeled source-gap placeholder; all other missing text still fails import. Original rows remain unchanged in the command archive.
- Background prefabs 地图 and 延后句子结束用物品 have no extracted original Texture2D; the latter is a previously verified nonvisual timing helper. Audio cues BGE_Metalbox_Close_01 and BGE_Act_Female_114_Dodge are absent from their installed cue sheets. These references remain explicit gaps.
- All 351 character labels in the batch resolve. Eighteen requested expression names lack an original setting/expression ordinal mapping. They are reported explicitly; no guessed expression mapping is supplied.
- Presentation commands remain archived even when a Unity-specific particle, shader, text-group animation or page effect lacks equivalent browser rendering. The importer does not claim pixel-perfect parity with the running game.

## Verification

Source/scene/file integrity checks cover every imported section. `npm run audit:cg` checks all source Bg/Sprite commands and every identifiable CG reference, then opens each reference in Chrome, verifies its original payload URL, visible state and dimensions, and saves a screenshot plus a versioned JSON result. The completed audit passed all 7,027 graphic command checks and all 142 CG references (119 unique images). See `private-review/cg-audit/index.html` for screenshots and payload hashes. Browser tests also cover every event opening/final boundary, catalog filters/release sorting/covers, actual choice loops and out-of-line branches, gender-specific movies, and the unreleased finale notice.

A separate read-only source check matched all 1,725 background/audio records in the new extraction against the installed source: 1,868 distinct texture segments/HCA waveforms across 88 cue sheets, with no mismatches. Reuse checks distinguish an HCA waveform hash from its ACB container hash and verify original cue reachability.

The expanded download manager keeps inactive rows memoized and limits progress publication to ten updates per second. The existing full-catalog movie download/offline-seek test fell from a 1.7-minute timeout to a 7.4-second pass; filtering to one row before the fix took 7.5 seconds, isolating list redraw cost. Concurrent WebGL regression checks exceeded their five-second startup polls; the same scene/subtitle checks all passed serially.

Final validation: production build, 41 unit checks, 22 import/hosting checks, all 715 reader payloads through the runtime decoder, 55 catalog/new-content browser checks, and all 142 CG references passed. The additional reader/storage cases each passed across serial or fresh-browser runs. A single long Chrome run passed 44 of 45 checks but timed out on the movie transfer; rerunning the complete storage file in fresh Chrome passed all three checks in 10.7 seconds. This long-run test timing limitation remains recorded rather than being called a full monolithic-suite pass.
