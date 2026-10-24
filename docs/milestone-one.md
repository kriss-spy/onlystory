# First UI milestone

Implemented locally on 2026-10-15. The app now has real navigation, persistent reading state and original media. The common UI remains reviewable before real game integration.

Update: the normal library now presents the real GFL2 opening from the sibling prototype. Fictional cases described below remain in `/lab` and explicit fixture catalogs. See [gfl2-preview.md](gfl2-preview.md) for the current review target. The table below records the original UI milestone's sample coverage, not a claim that real character rendering has been implemented.

Further update: the [complete GFL2 event text](gfl2-full-text.md) is now the normal library target. The twelve-line opening remains a separate presentation preview. Earlier sample/UI coverage below is retained as design history.

## Screens and navigation

| Route                                   | Purpose                                             |
| --------------------------------------- | --------------------------------------------------- |
| `/library`                              | Continue reading and choose a collection            |
| `/games/:game`                          | Search episodes, choose category and order          |
| `/read/:game/:episode?line=…&choices=…` | Stable passage plus the answers needed to reach it  |
| `/bookmarks`                            | Find saved passages                                 |
| `/manage`                               | Select, download, cancel, retry and remove episodes |
| `/lab`                                  | Cross-game and failure fixtures                     |

Settings, history, commands, chapters and checkpoints use modal panels and preserve the reading URL. Ordinary links support new tabs, reload and browser Back/Forward. Catalog filters live in the URL; catalog scroll restores during the session.

Passage changes replace the current browser history entry. Previous/History navigate the story path, while browser Back returns to the previous page. Hundreds of passages do not create hundreds of browser history entries.

## Reader decisions implemented for review

| Interaction        | Behavior                                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advance            | Reveal unfinished text first, then advance. Choices require an answer. Unknown control flow blocks progression.                                                                                                                                 |
| Auto               | After text and optional voice, wait the configured delay. At choices, show a spinner on option 1, then choose it; manual answers override. Pause for movies, unsupported flow, special interactions and panels. Missing voice cannot block.     |
| Fast-forward       | Toggle with the button or F. Rapidly advance all dialogue, including unread passages, and continue into the next section. Stop at choices, movies, unsupported scenes, the final end or a manual pause.                                         |
| Seek               | Click or drag the progress bar, or focus it and use arrow/Home/End keys. Restore the selected passage and branch, stop playback, and retain the position in the URL and autosave. Unanswered choices and archive gaps limit the available path. |
| Previous / History | Immediately restore the chosen frame and truncate the later active path. Retain previously read passage IDs. Another answer creates a new active path.                                                                                          |
| Bookmark           | Store the passage with branch context, separate from mutable autosave. Collection removal has Undo.                                                                                                                                             |
| Checkpoint         | Save a separate snapshot named with its current speaker/text excerpt. Restore or remove it in Save points.                                                                                                                                      |
| Movie              | Native play/pause/seek/captions. Persist position on pause and restore on reload. Enable Next after completion; provide explicit Skip this movie.                                                                                               |
| Hide controls      | Hide chrome/dialogue and leave a recovery icon. The first reading command restores the UI without advancing.                                                                                                                                    |
| Language           | English and Chinese sample text share passage IDs. Voice language is independent. Changing text language preserves the branch.                                                                                                                  |
| Resume             | Save per episode locally. Passage URLs include answers. Unavailable/changed saved paths show an error without silently choosing another path.                                                                                                   |

Progress uses the reachable passage path in the current section. A selected branch determines its length; an unanswered choice or unsupported scene is the furthest available position. Seeking does not mark skipped passages as read. Dragging retains the same branch and scale for the entire gesture, even while moving back across its choice.

## Cross-game checks

| Target       | Sample coverage                                            | Requires real content                                                   |
| ------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| GFL2         | Narration/dialogue/system windows; video boundary; choices | Command timing, cameras, 3D boundaries and asset mapping                |
| PJSK         | Concurrent animated stand-ins and voiced dialogue          | Live2D, expression/motion references and overlapping event tracks/waits |
| Blue Archive | Choices, rain, expressions and background changes          | Spine, scene effects, transitions and source branching scripts          |
| GFL1         | Archive gap, blocked skipping and available transcript     | Real story order, incidental dialogue and archive coverage              |

Each uses the same commands and app shell, with a different accent. All stories and artwork are original fixtures. These checks establish UI behavior, not extraction or game fidelity.

## Availability and deployment

Downloads fetch media, check responses and cache the results. Cancellation aborts the current fetch; retry reuses completed shared files. The UI reports bytes received and an indeterminate indicator because the total size is unknown in advance. Jobs continue across app navigation and end with the tab. Failed transfers never mark an episode installed.

Removal keeps progress/bookmarks and provides Undo for the entire selection. Shared cached media remain, as disclosed in the UI. Installation flags describe this device and are not restored from backups. Cache eviction and disk-space management are later work.

The **Private server preview** preference and expired/disconnected fixtures do not connect to a server. Reconnect preview clears the fixture. A real server needs authentication, session recovery, media/range responses and a sync-conflict policy. Standalone mode needs a desktop host and filesystem storage. Both should retain the same reader UI and commands.

## UI requirements applied

- Shared theme tokens cover pages, panels, controls, errors and tooltips. Light/Dark/System persists without an account.
- Familiar actions are icon-only. Choices, commands and context-dependent recovery retain text.
- Dialogue is selectable DOM text. Native selection, copy, Find, links and file selection remain available.
- Search covers catalogs, chapters, history, bookmarks, downloads and commands. Large catalogs use virtualization.
- Narrow screens put chapters in a drawer and playback on its own row. At 320px, Save points stays available through command search.
- Radix panels handle focus, Escape dismissal and focus return.
- Scene loading/failure stays inside the stage. Voice failure leaves text usable. Unknown scripts and unavailable episodes explain their restrictions.
- Reduced motion stops decorative animation. Fonts and media are local.

## Verification boundaries

The original UI milestone passed six model tests and nine Chrome browser workflows. The real GFL2 follow-up expands this to twelve browser workflows; see [gfl2-preview.md](gfl2-preview.md). Build and formatting checks passed. Playwright uses an isolated headless Chrome profile; screenshots were also inspected locally.

Tests cover the branch model and backup validation; browser routes, new tabs and Back/Forward; history/checkpoint restoration; video seeking/resume/completion; auto/fast-forward boundaries; missing media; download abort/failure/retry/cache/Undo; theme persistence; data portability; command search and focus return; catalog search/scroll restoration; and fixed viewports at 320×700 and 1024×600.

Development route `/games/gfl2?stress=10000` exercises a 10,000-row catalog with a bounded DOM and deep search. Its entries open representative sample episodes.

Visual review covers the library, scene reader, small-screen toolbar, reading desk and overlays in both themes. This does not establish screen-reader conformance or Safari/Firefox compatibility. Production fallback routes, desktop file workflows, offline app launch and upgrades need checks once their hosts exist.

Review the common UI with the user before widening scope. Then test real GFL2 data and a PJSK or BA sample to decide the player/package boundaries. Preserve source commands, original timing and unsupported commands during conversion. Do not treat the fixture graph as the final cross-game format.
