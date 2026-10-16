# 玻璃岛的驻行者 import

The current installed CN source provides 19 story sections in 44 original books, with 2,302 localized text rows. The reader groups them under 上篇 and 下篇. No story text or speaker IDs remain unresolved.

## Source and order

The package specification is `scripts/events/gfl2-glass-island.json`. Source chapters 4009 and 4010 have the verified titles 驻行者·上篇 and 驻行者·下篇. Archive chapter records 3006 and 3007 have those titles but no StoryData rows, so they are not used to invent a second edition.

The route contains 24 nodes. Chapter 4009 contributes 13 story sections and chapter 4010 contributes six. Five chapter 4010 combat nodes have no story books and are excluded: 31001, 31002, 31003, 31005, and 31006. Source positions and predecessor links determine order, including the US/SS story stages between UA/SA stages. AvgPlotData determines the before/after book ordering.

Extraction uses the installed game's ChapterData, StoryData, StageData, AvgPlotData, LangPackageTableCnData, and AvgContentData tables, plus the current AdvBookAssetPathMappingSO mapping. `.cache/gfl2-glass-island/books-provenance.json` records original catalogue paths, bundle segment offsets and hashes, internal IDs, and Unity path IDs. `public/private/gfl2-glass-island/provenance.json` records table and recovered book SHA-256 hashes. Extraction does not execute the game.

All 42 text books end at a Text command without EndScenario. Books AA03001 and AA03002 each contain exactly an argument-free CharacterOff followed by Video 30301 or 30302 on UICamera, then source EOF. The package explicitly allows these audited EOF boundaries. There are no Selection, Jump, or conditional flow commands. SetShader and Shake are retained as presentation commands; the browser does not reproduce all original shaders or animation timing.

## Recovered media

- 38 background and sprite labels, exported from original textures as lossless WebP.
- 160 audio cue labels, including 10 BGM cues and 150 sound cues. CRI waveform recovery retains source cue provenance and loop boundaries. Browser playback does not reproduce the full CRI random sequencing, gain, or pitch graph.
- 17 character labels, 15 original Cubism models, 247 hashed files, and 141 expression entries. One label is sound-only; some labels share a model. All requested character patterns resolve.
- Movies 30301 and 30302, each with Chinese and Japanese audio choices. Original H.264 pictures are remuxed; original ADX audio is decoded with the pinned vgmstream tool and encoded as AAC. Original USM subtitle timing yields 48 and 45 Chinese subtitle cues. Movies are not claimed to be fully lossless because of the audio encoding.

## Exact source limitations

The Sprite label 延后句子结束用物品 at A05001 row 43 and A05006 row 117 points to `Assets/ConfigPrefab/AVG/0ob/Item/ITEM_Other.prefab`. Its exact root GameObject has RectTransform, CanvasRenderer, Animator, and CanvasGroup components, zero child objects, no Image or SpriteRenderer, and initial CanvasGroup alpha zero. It is a nonvisual timing helper. The generic extractor reports no Texture2D location; no substitute picture is assigned. `.cache/gfl2-glass-island/item-other-prefab.json` preserves the bounded serialized object evidence and source segment hash.

Sound label 2021001 at A05001 row 96 requests BGE_Act_Female_36 from BGE_AVG_Special_Somi. That cue is absent from the installed CueNameTable. The media manifest preserves the requested setting, source ACB path and SHA-256, and the failure. No similarly named cue is substituted.

## Verification

The event compiler verified chapter identities, connected main-route ordering, table text joins, complete referenced book coverage, and expected counts. An independent audit compared every raw command count to the generated coverage, checked all 44 raw book hashes, checked 459 media/model/movie/subtitle file sizes and hashes, and verified unique passage IDs in every reader section. The character verifier passed all model references and expression mappings. Results are saved in `.cache/gfl2-glass-island/verification.json`.

The generic media verifier currently stops at its event-specific unresolved-background allowlist because it accepts only 地图. The two glass-island limitations above remain explicit in the manifest. No generic verifier success is claimed.
