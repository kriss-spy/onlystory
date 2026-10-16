# 金翅雀与橄榄枝: full text reader

The normal reader now also plays the event's recovered backgrounds, Live2D
characters and audio. See [scene playback](gfl2-scenes.md). Text only remains
available in Layout settings; this page records the earlier text milestone.

The normal GFL2 catalog now has all 24 recovered event sections, containing 4,443 Text rows from A33001–A33030. Start at `/read/gfl2/gfl2-event-3478101`. The final section is `/read/gfl2/gfl2-event-3478601`.

## Reading behavior

Each original Text row is a passage. Mouse/touch, keyboard, auto reading, fast-forward, history, bookmarks and checkpoints use the common reader. Completing a section exposes Next section; the same advance action continues to it. Completing 祈盼明天 shows the whole-event reading completion state.

Fast-forward toggles with its button or F and advances every 80 ms, including unread text, until toggled off, paused or reaching the final end. It continues across section boundaries and reveals text instantly while active. Seeking by clicking or dragging the progress bar stops playback and restores the selected passage, URL and autosave. The bar also accepts arrow/Home/End keys and touch dragging. In branching stories, the available range follows the chosen branch and cannot pass an unanswered choice or archive gap.

Text mode uses a centered text layout with scrollable long passages and a fixed toolbar. It does not show fictional scenery, placeholder characters or unrelated music. The header identifies text mode, including on narrow screens. Story information explains the presentation limits and links to retained source commands for the section.

Settings provide original male/female text variants and a player name. The import contains 45 passages with differing text or speaker variants. Thirty-three speaker labels and five text passages use the original `{}` name placeholder; the default substitution is 指挥官. Unnamed/masked speakers remain unnamed/masked. These substitutions do not alter the retained source text. Chinese stays Chinese when the global English preference is selected.

Chapters load individually. The library bundle contains section metadata and stable entry IDs; the reader fetches the selected chapter. Direct URLs, reload, new tabs, bookmarks and returning to the catalog retain the current passage. Downloading a section caches its readable text and retained commands. Cached chapters work offline in an already loaded app; offline application launch still needs a desktop host or an offline shell.

The older opening scene preview stays at its original route, with separate saves and bookmarks. It is linked from `/lab` and is excluded from the normal 24-section catalog. Its media download remains at `/manage?previews=1`.

## Import and preservation

`scripts/gfl2-event.mjs` reads the recovered `event_index.json`, thirty exported `.book.json` files, and the installed `LangPackageTableCnData.bytes` / `AvgContentData.bytes` tables. `gfl2-tables.mjs` reads the same bounded table layout previously used by the prototype's `table_probe.py`.

Ordering uses the recovered index's `raw_order_field4`, then `script_labels_field2`, then strictly increasing original grid rows. Numeric content IDs are references, not the sort key. The importer joins each text and numeric speaker reference to its original localization entries. Commented/empty rows are excluded. All thirty scripts must be present exactly once, and each must end with EndScenario. Missing text, unresolved numeric speakers, multiple grids, ambiguous order and unfamiliar control flow fail the import.

The catalog-field meanings are inherited from the earlier recovered index. Internal command-row order and all text joins are verified against the exports; no comparison with the running game's event graph is claimed.

The private output includes:

- An ignored generated metadata manifest with section counts and versioned chapter URLs.
- One readable JSON file per section, with original text, alternate text, speaker labels, message-window categories and source IDs.
- One command archive per section, retaining all 14,007 active source commands, arguments and source row numbers across the event.
- A provenance ledger with SHA-256 hashes for the index, localization/content tables and all thirty source book exports.

Original extracted files are read without modification. Output is local under `public/private/gfl2-event`; generated metadata is under `src/generated`. The build carries this private content with it. No publication is performed.

The importer runs during npm setup and before dev/build. Defaults match the existing sibling prototype and local game install. `ONLYSTORY_GFL2_PROTOTYPE`, `ONLYSTORY_GFL2_TABLES`, and `GF2_GAME_ROOT` override their respective input locations. If full source inputs are unavailable, a prior generated import is retained. The opening-only preview remains available where only its original inputs exist.

## Presentation boundaries

This milestone completes readable event text. It does not execute the event's character, background, camera, effects, voice, BGM or timing commands. Text-size/color markup is stripped for the shared reader's typography; raw markup remains in the downloaded source data. The source message-window categories are represented semantically, without reproducing Unity window prefabs.

Character and media restoration can now use the retained commands without rebuilding text/order/speaker joins. The common `text-only` renderer and lazy chapter loading do not depend on GFL2 staging commands. The opening's native command player remains a separate adapter.

## Verification

At the text milestone, the local run passed 9 unit tests, 4 importer tests and 29 Chrome browser tests, plus the production build and formatting checks. Real-content checks ran with the complete local sources present. Light/dark desktop views, the information panel, mouse/touch seeking and long Chinese text at 320×700 were inspected visually. Current scene checks are documented in [scene playback](gfl2-scenes.md).

Importer tests check bounded table parsing, localization/speaker joins, variant preservation, original row order and rejection of unknown flow. The local audit accounts for 24 sections, 30 source books, 4,443 unique passages and 14,007 retained commands, checks book hashes, and compares the first twelve lines/speakers with the previously verified opening.

Browser checks open every section at its first and last source passage. They exercise the continuation beyond the old twelve-line boundary, next-section navigation, bookmark/checkpoint restoration, reload/new tabs, original text variants, literal player-name substitution, chapter loading failure/retry, offline downloaded text and a long Chinese passage at 320×700. Existing scene, audio, movie, choice and general UI checks remain in the suite.

Playback regressions check continuous fast-forward with the old read-only preference already saved, manual stopping, continuation into the next section, seeking to pause playback, final/choice/movie boundaries, mouse and touch dragging, keyboard seeking, reload, branch preservation during a drag and archive gaps. The native opening preview also checks restored backgrounds after seeking and audio cleanup after rapid playback.

This is not a full accessibility or multi-browser audit. Runtime scene fidelity, original sound timing and cross-device sync remain unverified because they are outside text mode.
