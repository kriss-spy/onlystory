# General reader design study

The implemented game → event → story navigation and side-story branches are
described in [event-navigation.md](event-navigation.md).

Status: the initial proposals below are retained as design history. A runnable UI milestone now implements the scene-first direction and reading-desk alternative. See [milestone-one.md](milestone-one.md) for current behavior, verification and integration boundaries. Updated 2026-10-15.

## Direction and constraints

Design the general UI alongside feature behavior before building the first complete game integration. GFL2 supplies a useful later validation case, but must not determine the app's navigation model, save semantics or scene format alone.

The reader supports Blue Archive, GFL1, GFL2 and PJSK. It should have a consistent interface, with game identity expressed through themes and scene content. Standalone desktop and server/browser modes share the reading experience. Acquiring/importing assets is distinct from normal reading; the reading device does not require a game installation.

The first design pass should explore screen structure and reader interactions. Exact branding, game artwork, final typography and shell technology remain open. Layout studies use fictional sample dialogue, not extracted game content.

Apply [UI-ANTI-PATTERNS.md](C:/Users/krisspy/Projects/onlystory/docs/UI-ANTI-PATTERNS.md) to each design revision. It is the project's design baseline. Include useful functionality and efficient navigation; compactness should remove redundant chrome rather than remove capabilities.

## Main screens and transitions

| Screen | User task | Feature decisions it exposes |
| --- | --- | --- |
| Library | Resume reading or select a game | Multiple reading positions, local/server library identity, availability, spoiler-safe previews |
| Game and story catalog | Pick a story, event or episode | Story order versus release order, read status, localization, missing content, chapter dependencies |
| Reader | Read and experience the scene | Text/scene balance, advance/reveal, auto, fast-forward, choices, movies, audio, hiding UI |
| Chapters and history | Find an earlier passage or change episode | Replay versus preview, branch state, search scope, spoilers, what happens to the current position |
| Settings | Adjust reading and presentation | App-wide versus per-game preferences, text/voice languages, audio channels, reduced motion, themes |
| Library management | Make content available and manage storage | Selected episodes/languages, download size, importing packages, removing assets while preserving progress |

The library and catalog can be separate views within one shell. Chapters, history and settings are candidates for reader drawers so the user keeps their place. Their final form depends on layout exploration.

## Two initial reader layouts to compare

**Scene first.** The scene dominates the window, with dialogue over the lower part and a compact control strip. Chapters/history appear temporarily. This favors immersion and large visual scenes; the tradeoff is text covering artwork and less persistent navigation.

**Reading desk.** A collapsible chapter rail sits beside a scene with dialogue below it. Its width is adjustable in settings. Navigation can remain visible and dialogue has its own surface. This favors long reading sessions and frequent navigation; the tradeoff is a smaller scene. Narrow screens use a chapter drawer. The same chapter button controls the panel in either case, avoiding a redundant second chapter entry point.

These are alternative starting designs. They are not yet a promise to ship two modes. A continuous-text view is also a candidate feature; its handling of choices, timed text and media needs a separate design before being treated as equivalent to scene playback.

## Revision against the anti-patterns guide

Scene first remains the initial visible design in the comparison. The revised study also retains Reading desk so the user can assess the same controls with persistent chapter navigation.

| Applicable rules | Design change |
| --- | --- |
| 1, 13, 17: coherent themes and local preferences | Light/Dark/System appearance in settings, shared tokens for all screens and overlays, remembered appearance, text size, panel width and reading options. No account requirement or clock-based theme changes. |
| 2, 3, 4: compact, discoverable controls | One compact title/context header and one reading toolbar. Familiar actions use icon-only buttons, including Auto, Fast-forward, Retry and Show controls. Accessible names and focus/hover tooltips retain action names and shortcuts. Keep visible wording for story choices, searchable command names and context-dependent actions such as continuing past an unavailable movie. Remove repeated explanatory labels and oversized game cards. |
| 3, 12: adaptive workspace | The chapter panel can collapse; its width is adjustable with a native range control. On narrow screens it becomes a drawer. Primary reading controls remain in the compact toolbar. Catalog results scroll within their own region while search stays available. |
| 5: keyboard operation | Arrow keys advance/return, A toggles auto, F fast-forwards, H opens history, B bookmarks, C toggles chapters, U hides controls, comma opens settings. Commands and shortcuts are searchable through Ctrl/Cmd+K. Preserve normal text-selection, copy, browser Find and text-input behavior. |
| 6, 7: navigation and search | Search chapters, episode history and the story catalog. Filter the catalog by game, preserve search context on return, and keep per-story position/bookmarks. Specify stable real application routes before integration. |
| 8, 16: loading and errors | A scene-only loading state and a missing-background state leave readable dialogue and unrelated controls available. Missing background has Retry; movie/audio controls disclose that media is absent in the study. No fake successful asset loading or audio playback. |
| 9, 10, 11: user control and platform behavior | Selectable DOM dialogue; no mandatory onboarding or account prompts. Bookmark toggles are reversible. Ordinary content remains available to browser copy/find operations. Native inputs are themed consistently. |
| 16: focus and disabled states | Drawers/palette receive focus, contain Tab traversal, dismiss with Escape and return focus to the invoking command. A pending choice receives focus, and advancing/fast-forwarding cannot bypass it. Unavailable media controls are disabled with context. |

### Navigation requirements for the actual app

Use stable routes such as `/library`, `/games/:game/stories/:story` and `/read/:game/:episode?line=:lineId`. Branch context may need a separate stable reference. The exact route model remains a feature-design decision.

Implement direct entry, reload, browser Back/Forward and normal modified-click/new-tab behavior. Returning from reading should restore the catalog's query, game filter, selection and scroll position. Opening settings/history must not silently change the story route or erase the current position. Keep normal anchors for navigation rather than making every destination a button.

The inline design study has local sample navigation; it is not a deployed web application with routable story content. Its sample anchor targets do not establish working deep links. Verify real URL behavior in the application shell before game integration.

### Scope and verification limits

This revision exercises the interface with 24 fictional catalog entries and a five-passage scene. Large-list virtualization is unnecessary for that sample. The actual catalog should be tested with 1,000–10,000 representative episodes before choosing its rendering approach; search and direct jump remain required regardless of virtualization.

Theme and preference storage in the study use conversation state and local storage where the preview allows it. The actual desktop/server clients must persist these preferences locally across ordinary reloads and upgrades. No real game import/download, account flow, cross-device sync, full movie playback, OS file-dialog workflow or application-upgrade migration is implemented by this study. Those acceptance checks remain pending. Interface-level verification results are recorded below after browser checks.

### Browser verification, 2026-10-15

Checked the rendered design in Chrome using keyboard input, sample navigation, DOM assertions and screenshots:

- Light and dark appearance applied to the reader, chapter panel, settings and native controls. A dark preference, passage position and bookmark survived a full preview reload without signing in; changing to Light also persisted through the later reload.
- Settings received focus. Shift+Tab/Tab wrapped at the dialog boundaries, and Escape restored focus to the settings command. A choice received focus, disabled Next/Fast-forward and accepted keyboard selection.
- Bookmark and history shortcuts worked. Episode-history search and the Ctrl+K palette's fuzzy command search returned the expected results.
- Catalog title search found all four matching game entries. Returning from a story restored the search query. A later scroll-restoration check preserved an offset of 420px.
- Changing chapters and returning restored the sample's previous passage and bookmark. The chapter panel collapsed and its native width control changed its measured width to 280px.
- Desktop views and a 320px content width had no horizontal overflow. At 320px, every toolbar button measured at least 44px by 44px. Both layout alternatives were visually inspected, including Reading desk in Light appearance.

The preview host automatically sizes its iframe to content. This does not verify the final application's behavior in a short fixed-height window. Validate that layout, actual browser Find/copy workflows, screen-reader announcements, production deep links/new-tab/Back/Forward, real loading failures, real media playback and upgrade migration in the application shell. The Loading and Missing background options are available as design states; their display code was reviewed rather than tested against a live asset service. No full accessibility or large-archive performance audit is claimed.

The relevant use of internally scrolling catalog results and settings/history drawers is intentional. They keep critical reading controls and search available while letting content that naturally exceeds the available space scroll, consistent with rules 3 and 7. No irreversible actions or long-running import tasks are introduced in this study.

## Reader behavior to resolve with the UI

| Interaction | Proposed behavior to evaluate | Question to resolve |
| --- | --- | --- |
| Advance | First action reveals unfinished text; next proceeds when the scene allows | Which waits can the user interrupt, and how is a required wait indicated? |
| Auto | Advances after text/voice conditions are satisfied; pauses at choices | Does the user choose voice completion, reading delay or both? |
| Fast-forward | Shortens presentation while preserving state; stops at choices and unsupported control flow | Hold versus toggle, read-only versus all, and how to treat movies/unread material |
| Previous / history jump | Restores the chosen passage with its scene and branch context | Does opening history pause playback? Is selecting a line a preview or an immediate replay? |
| Bookmark | Stores a stable passage reference plus enough branch context to return | How are bookmarks distinguished from saves and automatic progress? |
| Choices | Uses consistent accessible controls over or alongside the scene | Can users revisit alternate answers, and how are branches represented in history? |
| Movie | Uses the scene region with subtitles and media controls | How does movie seeking interact with story history, auto and progress? |
| Save/resume | Restores a stable story location and relevant scene state | Where may saves occur, and how should changed content versions or offline sync conflicts appear? |
| Hide UI | Temporarily clears reading chrome while keeping a recoverable way back | Which tap/key restores UI without also advancing the story? |

Do not turn every possibility into a permanent button. First identify the frequent actions and their keyboard/touch equivalents, then place occasional actions in contextual menus or drawers. Distinguish a proposed interface from behavior already supported by an imported episode.

## Check the design against all games

| Case | UI/feature pressure to test |
| --- | --- |
| BA character dialogue, effects and choices | Dialogue must remain legible without obscuring important content; choices need stable focus and placement across themes |
| PJSK Live2D, concurrent motion and voiced dialogue | The UI must handle animation continuing during dialogue, overlapping actions and waits without assuming each line resets the scene |
| GFL2 message-window changes, movies and 3D boundaries | Preserve narration/system-message distinctions within the chosen common text design; clearly separate movie controls from story controls |
| GFL1 incidental dialogue and incomplete archives | Story order and missing passages need a visible representation; absence must not look like a successful end of an episode |
| Text-only or missing visual/audio asset | Keep readable text available where meaningful, disclose the missing media, and avoid a silent blank scene |
| Different text and voice languages | Long localized lines and missing voice variants must fit the same controls without assuming equal regional coverage |
| Large desktop and narrow browser | Preserve useful scene proportions, readable dialogue and accessible controls; decide whether narrow portrait mode favors scene or text |

These are design scenarios derived from the feasibility research. This pass does not establish full rendering support for them. Before freezing the player contract, walk representative scripts/media through the selected layout and document where it fails.

## Standalone and server experience

The reader's controls should not depend on deployment mode. Differences belong primarily in the library and content-availability flows.

- Standalone opens an on-disk library without manual server setup and can read installed content offline.
- Server/browser mode presents a connected library with account/session state and server-stored progress.
- Content can be available locally, available from the server, downloading, incomplete or unavailable. Define the required actions in the catalog before designing a storage dashboard.
- Removing downloaded content should preserve reading history and bookmarks unless the user explicitly chooses otherwise.
- Disconnected reading and later progress sync are separate from basic online server operation. Their conflict behavior remains open.

## Review before game integration

Explore the main screens, compare the reader layouts and settle the high-frequency actions. Then walk through a choice, a movie, a history jump, missing media, a language change and an offline library case. Record decisions and unresolved tradeoffs here.

Only after that review should implementation define the stable navigation state, reader command contract, save representation and package metadata. Use GFL2 first to test those decisions against real data, then validate PJSK or BA before growing the implementation around one game.
