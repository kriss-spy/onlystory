# Blue Archive story pipeline

Open `/games/ba` or `/read/ba/ba-jp-11000`. Prologue script 11000 has Japanese text, original backgrounds/CGs, six animated Spine characters and expressions, 118 Japanese voice clips, four looping music tracks and 14 sound effects. All seven response prompts preserve their real branches. Reader saves, seeking, bookmarks and downloads use the common reader.

## Reproduce

Install Git, uv, .NET 10 SDK and ffmpeg, then run:

```powershell
npm ci
npm run acquire:ba
npm run test:ba-import
npm test
npm run build
npx playwright test tests/ba*.spec.ts --workers=1
```

The acquisition command uses the preserved JP catalog and verifies its downloads. A completely empty-cache bootstrap has not been rerun as a single command. The downloader automatically resolves missing source dependencies for APK inspection; Cpp2IL schema generation is unnecessary for this targeted media package.

`acquire:ba` provisions [Blue Archive Asset Downloader](https://github.com/ZM-Kimu/Blue-Archive-Asset-Downloader) at revision `ac4598977abb46cf11574446fe799aed59842b3a`, resolves the JP Android catalog, and resolves only the media and bundles referenced by the selected chapter definitions in `scripts/ba-library.json`. Pass `--groups=11000` to acquire just the prologue. Catalog resolution may download the game APK and build the downloader's runtime inspector. It keeps NuGet configuration inside `.cache`, without changing user settings. No account credentials are needed.

The current cached catalog identifies game version `1.73.459696`. Repeated runs retain this catalog and verify cached downloads against its byte sizes and CRC32. To deliberately acquire a newer catalog, first preserve the current `.cache/ba-jp-assets` and `.cache/ba-jp-catalog.json`, then move them aside. Packaging stops on missing resources or unsupported script commands. A future catalog may need adapter changes.

`scripts/ba-assets.py` runs in the downloader's UnityPy environment. It extracts referenced Spine 4.2 skeletons, atlas pages, original emoji sprites, effect textures and WAV sound effects, and copies referenced backgrounds and Ogg music/voices. Two voice references use split files in this JP build; ffmpeg concatenates the ordered parts. The resulting `assets.json` records source URLs, CRCs, sizes, SHA-256 hashes and metadata-table hashes. Every packaged file enters the episode download inventory. Raw packs remain in the ignored cache.

The independently written renderer uses `@esotericsoftware/spine-webgl` 4.2.120. Its license accompanies both the public vendor directory and the packaged media. See [the runtime license](../public/vendor/spine/LICENSE). Game media retains its original ownership; source-code licensing does not grant game-asset rights.

## Script provenance and coverage

The Japanese script and character-name table come from BA Archive revision `4ddc9ee241f6028d724346acda190155dc98aaf6`. Background, BGM and transition tables use the same pinned source. This community script snapshot does not establish latest JP-server coverage. Asset provenance identifies the acquired JP build separately.

`import:ba` alone imports the script and uses visual assets when present. Without an asset manifest it prepares a labeled text-only episode. It caches source JSON under `.cache/ba-source/<revision>`, writes chapter/source/provenance under `public/private/ba-jp/11000`, and updates `src/generated/ba-stories.json`. Generated stories and game media are ignored by Git. Prepare them before building a fresh workspace.

All 229 source rows remain intact: 136 text passages, seven choice prompts and 86 command-only rows, plus a synthetic completion node. Scene steps account for every row exactly once. Five prompts have a single clickable response; two numbered prompts branch and rejoin without entering sibling responses. IDs use the group and zero-based row, such as `11000:190`. Japanese text is the actual reading language; English/Chinese fallback fields do not translate it. `[USERNAME]` defaults to `プレイヤー`.

The compiler rejects unknown commands/actions, unsupported flow and background effects, missing media, untranslated dialogue, unresolved speakers, orphan responses and broken scene alignment. Import tests additionally parse every original skeleton, verify referenced face animations and check every packaged byte against its manifest hash.

## Playback and verification

The BA player handles scene fades/crossfades, source waits, camera movement, character entrances/exits, highlighting, expressions, blinking, greetings, movement, emotions, communication portraits, screen captions and location text. Command-only rows run before their next readable passage. Finish scene skips waits; seeking reconstructs only the selected branch and cancels obsolete scene/audio work. BGM honors source volume and loop points. Voice uses the shared voice controls; music and sound effects have independent volume controls. Browser autoplay restrictions expose an audio-enable button.

Browser checks exercise animated characters, real voice decoding/progression, active music, source captions, branches, transient shot effects, original textures, missing-texture recovery and downloaded visual/audio playback with BA requests blocked. Text-reader checks cover choices, completion, bookmarks, progress, reload, fast-forward and 320 by 700 layout. A scene failure offers retry or a working text fallback.

Unity particle simulation, hologram shaders and movement easing are approximated in browser code using original art. They have not been matched frame by frame against game footage. The entire small prologue model/background set loads before the scene begins, about 2.5 seconds in the measured warm local run; slower devices can take longer. Offline verification covers cached story/media in the loaded application, not installation of the application shell for a cold offline launch.

## Event stories

The catalog includes all 57 standard JP event collections in pinned build `1.73.459696`: 978 chapters, 132,712 source rows and 73,101 Japanese text rows, dated 2021-02-25 through 2026-09-23. It selects every event whose season row is displayed and whose scenario groups are complete in this build, and excludes five non-standard collections with no standalone scenario set of their own — the rhythm minigame `807`, the shortcut collection `70000`, the seasonal meetups `80000`/`80001` and the hidden, non-displayed season `811` — plus `50822`, the main-story re-release alias that republishes `822` under the same name and groups. Titles, chapter order and dates come from the acquired database.

The chapters share 3,616 media files (1,679,831,077 bytes) rather than copying them per chapter. The package holds original backgrounds, CGs, animated Spine characters and expressions, music, sound effects and opening movies converted to H.264/AAC. These event rows contain no regular dialogue voice references.

`scripts/ba-event-source.py` downloads the official `ExcelDB.db`, checks its SHA-256, and decodes the required tables with the committed version-specific schema snapshot. The database hash is `0ceb1d1a0f118febb172c1a6e45d4cc7711b1fc4bb8718df035cf99a7825f159`. A separate fresh source workspace reproduced the original exports byte for byte. That check used the preserved catalog; it does not prove a completely empty-cache catalog bootstrap. A new game version requires a verified schema update.

The asset planner checks sizes and official CRCs before extraction. Packaging stages shared files and rejects path/content collisions. Import verifies the chapter graph and scene coverage, original skeletons, expression compatibility, and every packaged file hash. Nested choices, command-only responses, title cards, popups, horizontal wipes and opening movies use their original source commands. Browser checks cover representative events, real branches, movies and cached offline playback.

NPC models without face banks use their original idle/setup pose. Expression names resolve case-insensitively, including Cherino's `S2_XX` animations. Some authored cues request faces, emoji labels or actor effects absent from the shipped package; each is registered in `src/playback/ba/expression-gaps.json`, `emotion-gaps.json` or `source-gaps.json`, and playback keeps the preceding expression or omits only the unresolved cue with a diagnostic warning. `scripts/ba-expression-audit.mjs` enumerates the face cues a group selection needs declared, so a new event batch can be repaired in one pass instead of one failure at a time. Undeclared expression, emotion or effect references still fail import.

Love, shining, sand, focus-line and firework effects use browser animation with original textures where available. Their motion and BGOff treatment have not been matched frame by frame against game footage. `scripts/ba-catalog-art.py` discovers the newest official event-content packs from the catalog and exports the original title logo and lobby background for every imported event collection, plus the school emblems used by catalog filtering. Events that reuse another event's lobby art, or an interactive event with no lobby image, follow the official `MainBgImagePath` (or its shop fallback); the resolved source path is recorded per image.

UnderFire uses a transparent nine-frame smoke sheet, three ground-impact shapes and a streak from the pinned community renderer asset mapping. Their CDN source URLs and SHA-256 hashes are recorded separately in asset provenance; these five reference textures are not covered by the official catalog CRCs. Browser playback places short, staggered bursts at floor level and clears them on completion or seeking. Existing black-background additive textures convert brightness into alpha before composition.

The UnderFire cue also triggers `UI_FX_BG_UnderFire`, a 2.152-second clip recovered from the CRC-verified official prologue audio bundle. It is predecoded before playback, uses the sound-effects volume bus, and is suppressed during seeking/fast-forward. Finishing the scene stops the effect audio without restarting BGM.

The BA catalog supports school filtering, combined with story category and title search. School badges describe featured institutions, not every speaker: main-story collections are curated from their official volume/chapter setting, the earliest event collections are hand-curated, and later event collections are derived by `scripts/ba-event-catalog.py` from the official character-bonus (pickup) roster, keeping the schools that supply at least 20% of it. Boss-raid style events with no pickup roster carry no school. Associations and supporting roster rows are recorded in `src/ba-catalog.json`. Catalog covers layer the original JP event title logo over its lobby background for every imported event collection; school emblems use the official school-icon textures. `scripts/ba-catalog-art.py` discovers the official event-content packs, verifies their catalog size/CRC and exports the banners, backgrounds and emblems (57 covers, 57 backgrounds and 13 emblems). Per-image sources, hashes and dimensions are preserved in `public/private/ba-jp/catalog/art.json`; `--verify-only` checks the local exports without network access. The main acquisition wrapper includes the catalog-label and catalog-art steps for event imports.

## Main-story import

The pinned official database exposes 480 eligible Main/Prologue modes, covering 613 distinct scenario groups in 26 collections. The importer adds 612 groups while preserving the original voiced 11000 prologue. Together with the 68 Club group stories and the 978 event chapters, the library contains 1,659 segments. Both main-story parts, Part 1 volumes 1–6 and Final, and Part 2 volumes 0–2 are included. The latest exposure time in this snapshot is 2026-08-19; this is completeness for the pinned build, not a claim about the live JP server.

`scripts/ba-main-source.py` verifies the same official database hash, uses the committed `ba-jp-main-schema-1.73.json`, and resolves volume, chapter and episode titles from official localization keys. It retains front and back scenario groups in source order and retains a full main-story selection of 103,357 rows, including 55,323 Japanese text rows. Two hidden legacy modes are excluded because their groups are already represented by the visible prologue modes. Empty exposure dates remain empty. Coverage and per-group provenance are stored under `.cache/ba-main-source`; source bytes are preserved alongside each chapter. A fresh source workspace reproduced the exports byte for byte.

Main-story media includes animated Spine backgrounds and separate movie soundtracks, converted to browser-compatible H.264/AAC. Original mask prefab aliases select the verified native `Mask_01` skin. Shared decoded-media reuse avoids extracting the same model or sound for hundreds of chapters. Publication checks shared URL/content collisions and normalizes case-sensitive paths for Linux hosting.

Arona and Plana fingertip interactions wait for the authored touch region. Source caption modes, markup, wait markers and next-episode cards are retained. A small, explicit source-corrections registry repairs verified speaker/delimiter typos in memory; the downloaded JSON remains unchanged. Missing authored expressions retain the preceding face only for individually registered source cues, with diagnostics.

Seven `#timelineNS` cues in five segments reference native Unity 3D scenes, with custom shaders, cameras, particle systems and animated meshes. The browser does not execute those scenes. Each cue is retained as a visible unavailable barrier with a Continue story button; normal advance and Finish scene cannot silently skip it. The asset manifest records the verified original bundle/member references. This is a readable main-story import with declared presentation limits, not a complete Unity cutscene player.

`src/playback/ba/source-gaps.json` holds 78 scoped gaps across the main-story, group and event imports: 58 missing Japanese text cells, 9 absent character aliases, 5 background IDs, 3 background-effect IDs, 2 sound keys and 1 actor effect. Exact group/row/field/value entries permit only these known gaps: keep the authored row and omit the unresolved cue, then display a notice. New unknown references still fail import. Native combat, weather, flash, grain, scrolling and eyelid effects use browser compositions with original art and recorded native layer placement; shader geometry and emitter timing are approximations. Some native background-effect AudioSource clip references remain unresolved.

`ba-main-library.test.mjs` checks every main chapter's graph, exact source-row accounting, packaged hashes, original skeletons, animation/skin references, declared gaps and cutscene barriers. Browser checks cover representative scenes across all 26 collections, numeric movie cues, fingertip interactions, timeline acknowledgement, and dialogue wait markers. Offline checks cover cached media in the loaded application; a cold offline application-shell install remains outside this verification.

## Club group stories

The pinned official database exposes all 68 visible, open Club group-story modes across 27 club volumes. Each mode owns one front scenario group in this build. The collection retains 9,310 source rows, including 5,957 Japanese text rows and 44 selection-group rows. These group stories contain no regular dialogue voices, movies or timeline scenes in the pinned package, so the reader uses original backgrounds, Spine characters, music where authored, sound effects and browser-composed effects.

`scripts/ba-group-source.py` verifies the same official database hash and committed 1.73 schema as the main-story import. It resolves titles from `Sub_Volume_Title_{volume}`, `Sub_Chapter_Title_{volume}_{chapter}` and `Sub_Episode_Title_{volume}_{chapter}_{episode}`, writes exported sources under `.cache/ba-group-source`, and merges 68 definitions into `scripts/ba-library.json` with `--merge-library`. `ba-group-library.test.mjs` checks every group-story graph, exact source-row accounting, packaged hashes, original skeletons and expression references.

`scripts/ba-group-catalog.py` uses the official `EmblemDBSchema` `GroupStory` category to assign each of the 27 club collections to its featured school and writes the school badges used by catalog filtering. Each collection cover uses a distinct representative original story background from its packaged media. Run `npm run catalog:ba-groups` to republish the label and cover metadata after a group-story import.

Two scoped source gaps and two expression gaps are declared rather than invented: group `2901` row 162 has no authored Japanese text, group `2404` row 157 references an absent off-screen character alias, group `2502` row 53 requests a face absent from the shipped skeleton, and group `3401` row 122 requests another absent face. The reader keeps the preceding expression for each missing face and continues the surrounding story.
