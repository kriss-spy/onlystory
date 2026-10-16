# 方糖特调沙龙 revised story import

The installed CN client provides 苦涩荆棘与矢车菊. This import labels it as the revised story associated with 方糖特调沙龙. It does not claim to recover the original event script.

## Source graph

Installed tables checked on 2026-10-16, China time:

- `ChapterData` chapter 3002 resolves to 苦涩荆棘与矢车菊.
- `StoryData` contains ten narrative nodes in chapter 3002. Chapter 4002 has no narrative rows in this installation.
- `StageData` supplies node codes and localized titles. `AvgPlotData` supplies the book identities.
- Nodes ordered by source x position agree with every predecessor link. Node 30486 falls between 30403 and 30404.
- Plot kinds 11 and 21 order the before/after combat scripts. The story-only node 30486 uses plot kind 1.

| Story ID | Code   | Title      | Books          |
| -------- | ------ | ---------- | -------------- |
| 30401    | CA-1-1 | 约定之日   | A16001         |
| 30402    | CA-1-2 | “噩兆”     | A16002, A16003 |
| 30403    | CA-1-3 | 逃离追击   | A16004, A16005 |
| 30486    | CS-1-1 | 安全屋     | A16006         |
| 30404    | CA-1-4 | 记忆的洗礼 | A16007         |
| 30405    | CA-1-5 | 三级底层   | A16008, A16009 |
| 30406    | CA-1-6 | 阴霾渐袭   | A16010, A16011 |
| 30407    | CA-1-7 | 驰援突围   | A16012, A16013 |
| 30408    | CA-1-8 | 三代人形   | A16014, A16015 |
| 30409    | CA-1-9 | 破解通讯   | A16016, A16017 |

The resource stages in chapter 93002 and challenge stages in chapter 994002 have no plot joins and do not add reader sections. Chapters 1002, 4002, 91010 and 94002 have no story rows in this installation.

Extraction results and verification will be recorded below once the package is generated.

## Extraction and fidelity

The package contains 10 sections, 17 source books, and all 2,621 `Text` rows. Every generated male/female passage and text ID was checked against `AvgContentData` and `LangPackageTableCnData`. Passage IDs are unique and section ordering matches the source graph. The result is recorded in `.cache/gfl2-cafe-revised/text-verification.json`.

All 17 original books end at a `Text` row without an `EndScenario` command. The descriptor explicitly accepts this source EOF convention. The compiler records the boundary rather than inserting an invented source command.

The original A16001 rows 426 and 427 are argument-free `WaitInput` and `EndPage` commands, following dialogue and `CharacterOff` and preceding a black-screen transition. They are linear page boundaries. The import retains them, together with `SetShader`, `Shake`, and `RuleFadeIn`, as presentation commands. These are not branching commands. Exact Unity shader, shake, rule-fade and page-wait timing are not reproduced by the reader.

No active `Video` or `Selection` commands occur in the 17 books.

Character recovery completed with 29 of 29 labels, 27 models, 423 hashed files, 229 expression entries, and zero unresolved entries. `gfl2-characters-verify.py` checked file hashes, source segment provenance, model references, expressions, and complete label coverage. The recovered character files total 70,292,599 bytes before the parent storage migration.

Media recovery and `gfl2-media-verify.mjs` passed with 35 background labels, 15 music cues, 39 sound-effect cues, 276 original media files, and zero unresolved entries across all 17 books. File hashes, source provenance, cue identities and loop regions were checked. Two black-screen setting labels use the existing explicit black-color representation. CRI random sequences, pitch, and gain scheduling retain the existing browser approximation; source alternatives remain in the manifest.

Individual dialogue voice lines are outside the current media extractor, which covers backgrounds, music and sound effects. Original voice IDs remain in the archived commands.
