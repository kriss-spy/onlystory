# General UI polish plan

Status: UI pass and browser verification complete. Multilingual alias dictionaries and additional source-language libraries remain separate data work. Updated 2026-10-19.

Cross-game interface improvements that apply to the shared reader, catalog and management UI rather than a single game's pipeline. Follow the applicable rules in [UI-ANTI-PATTERNS.md](UI-ANTI-PATTERNS.md) when implementing. Game-specific import boundaries stay documented in each game's pipeline notes.

## New

### Theme per game

Let the user pick a visual theme per game (for example Blue Archive's palette for its catalog and reader) in addition to the existing global Light/Dark/System appearance. The per-game theme affects accents and chrome styling only; the global appearance choice still controls light/dark. Persist locally like other preferences and apply consistently across dialogs, popovers and loading states.

### Simpler reader settings

Reduce the reader settings surface to the options that matter during reading. Move infrequent options out of the reading panel. This overlaps with the general-settings fix below: game-independent preferences move to general settings, leaving only reading-context controls (auto advance, text speed, layout) in the reader panel.

### Multi-language event search

Event search should accept queries in any supported language while titles display in the catalog's chosen language — for example, display Japanese titles but match English search terms (and vice versa). Search across localized title aliases per game rather than only the displayed title. Applies to the catalog search field in `src/pages/Catalog.tsx` and the event lists in `src/pages/Event.tsx`.

### Multi-language hot switch in supported games

Add an in-reader language switch for games whose library provides multiple text languages, switching text (and voice where available) without leaving the scene. Example: switch between JP and EN in Blue Archive once an EN library exists; the current BA library is JP-only. Games without a second language keep the switch hidden rather than disabled.

### Simpler homepage without body-page scroll

Make the catalog homepage a fixed-viewport layout: filter bar and search stay put, only the collection list scrolls (the `catalog-scroll` container in `src/pages/Catalog.tsx`), and the page body itself does not scroll. Follow the UI anti-pattern rules on distinguishing scrolling content from persistent controls.

### More event layouts

Offer additional event-list layouts alongside the current one: a text-only table (dense, sortable) and a two-column card grid. Layout choice persists per user and applies to the catalog and event pages.

## Fix

### Branch-aware story progress bar

For stories with choices, the reader's seek/progress bar currently only spans the content before the first choice, so it cannot reach the rest of the story. Extend the bar to cover the whole story: mark choice points on the bar, and block seeking or dragging past an unanswered choice until a decision is made. Once a choice is answered, the reachable range extends through the selected branch, and previously made decisions keep their positions. This matches the existing branch-aware rule from the reader design: the available range follows the chosen branch and cannot pass an unanswered choice.

### Broken progress bar in /manage

The download progress bar on the manage page does not reflect actual progress. It currently uses an indeterminate `<progress max={1}>` with no value in `src/pages/Manage.tsx`. Drive it from real per-episode transfer progress so it advances, completes, and handles retry/cancel states correctly.

### General settings that work for every game

Replace the legacy reader settings with general settings that apply across games: language settings, voice settings and protagonist/player name scoped per game where the source supports it. The current single global player name, protagonist version, text language and voice language in `src/components/Settings.tsx` are reader-scoped and partly GFL2-specific. General settings cover:

- Text and voice language, per game where multiple languages exist.
- Player/protagonist name and protagonist version, per game (GFL2 male/female variants stay GFL2-scoped).
- Voice behavior (wait-for-voice, volume) as global defaults with per-game overrides where the game has voice tracks.

Persist alongside existing preferences and keep the JSON export/import format backward compatible.

## Implementation decisions and acceptance criteria

These details were missing from the original proposal. Routine layout and styling decisions can be implemented and verified without interrupting the user for intermediate feedback.

### Scope and defaults

- Keep existing routes, saved passages, bookmarks, chapter ordering and original source titles. Default to the existing list layout and neutral Onlystory palette.
- Persist layout and per-game overrides inside the version 1 preferences object. Old backups inherit the existing global values; absent overrides continue to follow global defaults. Validate and bound imported values. Resetting one game's overrides preserves other games, saves and downloads.
- Keep Light/Dark/System global. A game's selected palette changes accent and control colors throughout its catalog, reader and portaled panels. Other games and the library keep their own selected or default palette. Do not recolor original artwork.
- Start reader settings on Reading. General settings contains appearance, scoped language/player/audio preferences, library configuration and backup tools. The library settings entry opens general settings directly.

### Progress behavior

- The seek bar includes the reachable chosen route and an estimated locked continuation beyond the next unanswered choice. Use the longest continuation without repeated visits for the estimate, rather than presenting the truncated pre-choice section as the entire story. The estimate may change when a shorter route is selected.
- Clamp pointer and keyboard seeking at unanswered choices and unsupported-source barriers. Mark reachable choice positions, pause auto/fast-forward on seek, and hold the route scale fixed throughout a drag. Keep answered choices when seeking back within the current reading session. Reload restores only the answers represented by the saved path.
- Actual history retains repeated visits, including quiz retries. Never silently select an answer, bypass a source barrier or fabricate a branch to fill the bar.
- Download progress measures completed dependency files plus the known fraction of the active file, alongside actual transferred/cached bytes. Show indeterminate preparation until the inventory exists. Newly discovered scene dependencies can increase the file total. Never present the bytes received so far as the final episode size.
- Failed and canceled jobs retain valid cached files and offer retry; completion requires the full selected dependency set. Navigating away must preserve running jobs.

### Layout and navigation

- List remains the default. Table is a compact text view with title, release and reading-progress sorting for collections. Cards use two columns on desktop and one at widths of 760 pixels or less. Event story layouts preserve source chapter and branch ordering.
- Keep filters and search outside the collection scroll container. At 320-pixel width and short windows, controls remain reachable without body scrolling or horizontal overflow. Only the results scroll.
- Search and filters stay in the URL. Returning from an event restores the prior query and list position. Store scroll positions independently per layout.
- Keep large catalogs virtualized in every layout, including two cards per virtual row. Layout and viewport changes remeasure virtual rows. Search provides a direct way to locate an item.

### Language data boundaries

- Search accepts normalized original titles and supplied localized aliases. Normalize Unicode width, case, accents and whitespace. Catalog display keeps the original source title.
- `Episode.titleAliases` and `Episode.collectionAliases` are optional source-metadata fields. Cross-language matching for an arbitrary title requires verified aliases from the importer. The current imports do not contain a complete multilingual title dictionary; adding that dictionary remains a separate data task. Do not generate guessed translations.
- Offer an in-reader text-language selector only when that installed episode declares multiple text locales. Switching preserves passage, choices and bookmarks and pauses automatic playback. Single-language episodes have no switch.
- An EN Blue Archive library and aligned cross-region passage identities are prerequisites for JP/EN switching in real BA stories. This UI work does not acquire or claim that content.
- Scope GFL2 protagonist variants to GFL2. Show voice-language selection for GFL2 movies and global defaults; current BA and PJSK voices remain their original Japanese, and GFL1 has no alternative voice library.

### Verification and completion

- Run `npm run check` and focused Playwright suites covering the shared reader, bookmarks, catalogs, settings and downloads.
- Check 320, 760 and desktop widths, plus a short viewport; test Light, Dark and System, keyboard focus/escape, dialog return focus, accessible labels, touch seeking and reduced motion.
- Check empty search results, missing content, failed/retried/canceled downloads, reload persistence, old backup migration and independent settings across games.
- Inspect desktop/mobile screenshots and verify large-catalog scrolling and navigation. Record executed checks and remaining data limitations here before marking the work complete.

## Verification record, 2026-10-19

Implemented the locked branch-aware seek scale and choice markers, measured file download progress, scoped preferences and playback/download consumers, game palettes, compact reader settings, sortable collection tables, responsive card layouts, source-alias search support and conditional text-language switching. Source-title alias dictionaries and additional text libraries remain the data prerequisites described above.

- Final `npm run check` passes: formatting, data-derived catalog-spec checks, 87 unit tests, 123 import/host tests, TypeScript and the production build. Five source-dependent import checks skip in this checkout. The existing large-bundle warning remains.
- All 745 browser cases have passing results across the full sweep and fresh retry. The final full sweep passed 738 cases. Six cases timed out while the computer was suspended, with recorded durations of 25 minutes or nine hours. One opening-scene assertion used a five-second deadline for an authored two-second delay followed by a two-second fade. After correcting that deadline, `npm run test:browser -- --last-failed` passed all seven cases on a fresh server. The opening case also passed four consecutive focused repetitions. The full `npm run verify` invocation recorded those seven failures; the subsequent retry and remaining verification commands exited successfully.
- All six `npm run test:pwa` cases pass, including installation metadata, offline reopening, cached media ranges and aliases, update restart/persistence, failed setup retry and incomplete-update recovery. The final check, browser retry and PWA command chain exited successfully.
- Browser coverage includes all local BA collections, the complete GFL1 source inventory, GFL2 cast/CG/rendering/audio probes and original section endpoints, PJSK event/main-story archives and movies, real offline downloads, shared reader controls, and all UI-polish cases. Text endpoint checks run in text mode; dedicated scene suites retain native rendering coverage. No browser tests were skipped.
- The UI checks cover desktop/760/320-pixel and short windows, virtual card rows, persistent layouts, empty results, palette and scoped-name persistence, focus return, locked choices, text switching without moving the passage, hiding unsupported language switches, and file progress/cancel/retry across navigation. Desktop card, mobile catalog and dark-settings screenshots were inspected during the UI pass.
- The browser server now serves an immutable optimized build in `browser-test` mode with synthetic stress catalogs enabled only for that mode and development. Direct renderer/audio probes use an isolated Vite server with explicit Pixi dependency prebundling. Loading the development config had merged its watcher object over `watch: null`, producing more than 41,000 open handles; the isolated config has zero watched directories and stayed around 370 handles through the full run. Service workers use a separate production suite.
- Corrected stale featured-library, settings-tab, filter and virtual-catalog assumptions; BA movie checks follow actual source branches and available movies. Download tests filter the installed library to the selected game/chapter before transferring real media. Reader navigation waits for DOM readiness and asserts the required reader state rather than waiting for unrelated assets.
- Logs are in `.cache/verification-complete.log` and `.cache/verification-final-retry.log`. Focused readiness evidence is in `.cache/isolated-server-check.log` and `.cache/opening-final-repeat.log`; screenshots and traces remain under `.cache/ui-polish-final`, `.cache/ui-polish-focused` and the Playwright output directories.

Concurrent PWA and asset-research work in the shared checkout was preserved. Its PWA behavior was included in verification. No commit was created.
