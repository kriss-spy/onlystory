# Confirmed event with side stories

Investigated 2026-10-16. **伊利昂之围** is a suitable real-content test for the event/branch UI. Its 中篇 has eight side stories and 下篇 has six, including two sequences containing two side stories each. The subsequent import now includes all three chapters and these branches; see [the import notes](gfl2-ilion-import.md).

## Evidence and scope

Primary evidence is the installed game's read-only table files under `D:/Program Files/GF2Exilium/GF2 Game/GF2_Exilium_Data/LocalCache/Data/Table`. The existing bounded protobuf parser in the sibling project's `table_probe.py` was used through ordinary shell commands; these findings do not have REA evidence IDs. Exact source SHA-256 values and the 14 joined records are retained in `.cache/gfl2-side-story-events.json`.

`ChapterData` IDs 4047, 4048 and 4049 explicitly resolve to 伊利昂之围·上篇, 伊利昂之围·中篇 and 伊利昂之围·下篇 through `LangPackageTableCnData`. `StoryData` joins those chapter IDs to `StageData`, which supplies the displayed stage code and title. Side nodes share raw field 11 = 14 and field 23 = 1; the main path uses field 11 = 1 or 2. These numeric fields have not been assigned decompiled schema names.

The classification is corroborated by a [gameplay recording's explicit 支线 chapter labels](https://www.bilibili.com/video/BV1qP23BGEVi/), including AE-1-3 and AE-1-4. An [official account event announcement](https://www.sina.cn/news/detail/5322090845834389.html) supplies the event context. Classification does not rely on the AE code prefix or the numeric IDs alone.

## Concrete branches

| Chapter | Side story                              | Main-path anchor recorded in raw field 5 | AVG script reference          |
| ------- | --------------------------------------- | ---------------------------------------- | ----------------------------- |
| 中篇    | AE-1-3 毒蛇的獠牙                       | AA-1-1 锋线对弈                          | E99002                        |
| 中篇    | AE-1-4 独行的白衣I                      | AA-1-2 交缠                              | E99004                        |
| 下篇    | AE-2-3 锋芒依旧 → AE-2-4 冒名顶替综合征 | AA-2-5 决战时刻                          | E99001 → E99012,E99013,E99014 |

For the first example, `StoryData` node 345812 points through raw field 5 to main node 34501, and has no raw field 6 successor. Main node 34501 instead links through field 6 to node 34584, bypassing 345812. The branch's raw position field 7 is `1625,150`, while main node 34501 is `1350,0`. This supports an indented optional branch attached to AA-1-1; it does not establish the side story's exact fictional chronology or a spoiler-safe unlock rule.

For the chained example, node 345813 points through field 5 to main node 34516 and through field 6 to side node 345818. Node 345818 points back through field 5 to 345813. That provides a genuine two-node side sequence for testing independent side-story navigation.

## Complete side lists observed

中篇: AE-1-1 与《黑暗》有关的事; AE-1-2 场外视角; AE-1-3 毒蛇的獠牙; AE-1-4 独行的白衣I; AE-1-5 声与影; AE-1-6 补给计划; AE-1-7 贯彻任性的意志; AE-1-8 独行的白衣II.

下篇: AE-2-1 聚集的祈愿; AE-2-2 帕拉达嘉急送热线; AE-2-3 锋芒依旧; AE-2-4 冒名顶替综合征; AE-2-5 独行的白衣III; AE-2-6 被遗弃的碎片.

## Boundary of the initial research

The initial focused check established the references below. A subsequent import extracted all 101 books through the exact shipped mapping, including every side story; [the import notes](gfl2-ilion-import.md) record the completed extraction and remaining presentation limits.

All 14 side nodes have matching installed `AvgPlotData` records with script labels. For example, record 34581201 references E99002 and record 34581901 references E99004. This confirms script references, **not** successful script-bundle or media extraction: the focused check did not locate E99002/E99004 in the earlier saved catalogue/asset reports, and did not resolve or extract their current bundles. Their backgrounds, characters, BGM and script contents remain to be checked before promising playable scenes.

The current live-event nodes were not present in the inspected `AvgData` archive listing. Importing this example should therefore join `ChapterData` → `StoryData` → `StageData` and `AvgPlotData`, instead of assuming `AvgData` alone is a complete event graph. Preserve the original node relationships and retain uncertain chronology as uncertain.
