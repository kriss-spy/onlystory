# UI/UX Anti-Patterns and Design Rules

> Reusable requirements for AI coding agents building or modifying desktop, web, and mobile interfaces.
>
> **Status:** Personal design preferences. Apply as defaults, not as a substitute for explicit project requirements, accessibility, security, or technical feasibility.

## How to use this document

1. Read this file before planning or implementing user-facing changes.
2. For each change, identify applicable rules. Do not blindly apply irrelevant rules (for example, virtualization to a five-item list).
3. Preserve existing conventions unless they conflict with a stated requirement or a serious usability issue.
4. If a trade-off is unavoidable, prioritize correctness, accessibility, security, user control, and the actual workflow; document the trade-off.
5. Test relevant acceptance criteria before declaring UI work complete. Do not claim tests that were not run.
6. When introducing new screens, components, or features, audit their theme, navigation, loading, error, and keyboard behavior as well as the main happy path.

**Rule strength:** `MUST` = strong default; `SHOULD` = preference conditional on context; `AVOID` = anti-pattern requiring a good reason. This document does not require a feature to be implemented when it is unrelated to the product.

---

## 1. Themes and design-system consistency

### Avoid
- Shipping an app used regularly with no dark mode.
- Implementing dark mode only on selected pages while leaving dialogs, menus, embedded views, or newly added screens light.
- Saving theme preference only to an account or requiring login to retain it.
- Automatically changing themes by time of day without user choice.
- Introducing unstyled/native-looking controls that clash with an otherwise styled interface (for example, an unthemed selector).
- Adding new features with typography, spacing, colors, and component styles inconsistent with the rest of the application.

### Rules
- **MUST** support coherent light and dark themes for applicable regular-use applications.
- **MUST** apply theme tokens consistently to all reachable surfaces, including dialogs, popovers, menus, form inputs, loading states, and new features.
- **MUST** persist the theme preference locally without account sign-in. Offer account sync only as an addition.
- **SHOULD** support system theme following and a manual override: Light / Dark / System.
- **MUST NOT** override the user’s choice based solely on clock time.
- **SHOULD** prefer shared design tokens and existing components over one-off visual implementations.

**Verify:** Set Dark, restart or reload without signing in, and inspect representative screens, overlays, inputs, and newly added UI; theme must remain consistent.

## 2. Visual language, controls, and platform fit

### Avoid
- Abstract, fashionable, or ambiguous icons when recognizable conventional icons exist.
- Overloading complex views with permanently visible explanatory labels or helper text for every button.
- Styling that feels alien to the target platform without a functional reason.
- Recreating standard platform controls badly.

### Rules
- **SHOULD** use recognizable iconography consistent with platform conventions.
- **SHOULD** use compact icon buttons for familiar actions, with helpful hover/focus tooltips and accessible names.
- **MUST** label genuinely ambiguous actions rather than relying on guesswork; icons are not inherently more usable than text.
- **SHOULD** keep explanatory copy contextual or on demand, instead of permanently occupying working space.
- **MUST** support keyboard focus and touch-accessible alternatives to hover-only explanations.

**Verify:** A new user can infer common actions; ambiguous controls have visible clarification or accessible labels, and keyboard users can discover tooltips/help.

## 3. Spatial efficiency and adaptive workspaces

### Avoid
- Large empty margins in information-heavy views.
- Requiring scrolling to reach essential controls because the layout wastes available screen space.
- Designing desktop interfaces as enlarged phone layouts.
- Making panels immovable and fixed-width when the workflow benefits from adjustable space.
- Separating information that users need side by side for comparison or editing.

### Rules
- **SHOULD** balance density and whitespace: efficient but not cramped.
- **MUST** distinguish content that naturally scrolls from critical controls that ought to remain accessible.
- **SHOULD** provide collapsible/resizable sidebars, and movable/dockable panels in complex workspaces when useful.
- **SHOULD** expose simultaneous views for comparison or editing where that is core to the task.
- **MUST** account for desktop-sized viewports rather than assuming mobile-first layout is sufficient.

**Verify:** Test narrow and wide windows; critical controls remain reachable, and useful workspace area is not consumed by avoidable chrome.

## 4. Toolbars, menus, and discoverability

### Avoid
- Duplicating the same function in multiple prominent UI locations without justification.
- Filling a complicated view with verbose buttons and permanently visible helper copy.
- Hiding frequently used actions several menu levels deep.
- Large, unsearchable menus with many commands.
- Treating a clean appearance as a reason to remove useful functionality.

### Rules
- **SHOULD** allow a visible, well-organized toolbar even when it contains many actions; do not force minimalism.
- **MUST** make frequent actions quickly accessible.
- **SHOULD** move infrequent actions into relevant menus, context menus, or command palettes.
- **SHOULD** offer right-click context menus for objects that have contextual operations.
- **SHOULD** add menu search when action counts or nesting make browsing inefficient.
- **MUST** use meaningful icons/tooltips and avoid redundant entry points with no distinct workflow value.

**Verify:** Frequent actions can be found quickly; long action menus are searchable; the same operation is not pointlessly repeated throughout the UI.

## 5. Keyboard-first and power-user operation

### Avoid
- Requiring mouse interaction for common commands in complex desktop apps.
- Repetitive single-item operations when bulk actions are practical.
- Forcing users to memorize undocumented shortcuts.
- Making automation impossible when scripting or integration is a natural product capability.

### Rules
- **SHOULD** provide a command palette for complex apps, with fuzzy search across commands and relevant navigation/settings.
- **SHOULD** expose shortcuts for frequent commands; make them discoverable and preferably customizable.
- **SHOULD** support multi-selection and bulk actions for suitable collections.
- **SHOULD** provide undo/redo for reversible operations rather than interrupting with needless confirmation.
- **SHOULD** expose appropriate APIs, CLI commands, scripting, or other automation surfaces where the product supports automation.
- **SHOULD** make functional operations accessible to coding agents using the same supported interfaces, without creating a separate brittle GUI-only path.

**Verify:** Core repeated workflows can be done efficiently by keyboard or bulk operation; agent/API access is documented where available.

## 6. Navigation, direct URLs, and state

### Avoid
- Unnecessary intermediate screens and navigation detours.
- Frequent unexplained navigation rearrangements.
- SPAs that show distinct content while retaining a single generic URL.
- Important content that can only be reached by navigating from the homepage.
- Deep links that fail on reload, in a new tab, or with browser back/forward.

### Rules
- **MUST** give each distinct addressable content page a stable direct URL on web applications, including SPAs.
- **MUST** ensure copied URLs, refresh, new-tab opening, browser Back, and Forward work as expected.
- **SHOULD** preserve navigation and selection context when returning from a detail page.
- **SHOULD** retain predictable information architecture unless a change has a concrete benefit.
- **SHOULD** avoid unnecessary navigation depth.

**Verify:** Copy a content-page URL, open it directly in a new tab, reload, use Back/Forward, and confirm the same intended content appears (subject to normal authorization).

## 7. Large collections: search, scrolling, and direct jump

### Avoid
- Designing an interface capable of holding thousands of items but offering no search.
- Requiring manual traversal through many pages to locate a specific item.
- Using Next/Previous page buttons as the only reasonable way to browse a very large collection.
- Losing list position when viewing an item and returning.
- Rendering enormous DOM lists when this degrades performance.

### Rules
- **MUST** offer search for large or potentially large collections where locating a known item is an expected task.
- **SHOULD** support appropriate filtering and sorting.
- **SHOULD** prefer **virtualized continuous scrolling with explicit position/jump controls** for very large browseable collections when technically appropriate.
- **SHOULD** provide ways to jump directly to an item, index, search result, or meaningful position; do not treat infinite scrolling alone as sufficient navigation.
- **SHOULD** show position or progress through a collection when useful.
- **SHOULD** preserve scroll position and selection on return.
- **MAY** use pagination when stable page boundaries, precise page navigation, server constraints, or accessibility make it superior; pagination is not categorically forbidden.
- **MUST NOT** mistake virtualization for a navigation feature: it is a rendering optimization and does not replace search or jump controls.

**Verify:** With 1,000–10,000 representative items, locate a known item quickly, jump to a distant item, scroll fluidly, open it, and return to the previous location.

## 8. Asynchronous tasks, progress, and non-blocking UI

### Avoid
- Displaying a whole-app spinner for an operation affecting only one region.
- Locking unrelated views while a task runs.
- Holding long-running work in a modal when it can safely continue in the background.
- Showing an indefinite spinner when meaningful progress or status is available.
- Losing track of ongoing operations when switching views.

### Rules
- **MUST** confine loading and blocking states to the smallest area necessary for correctness.
- **SHOULD** run independent long-running work in the background while keeping unaffected functions available.
- **SHOULD** surface clear progress, task status, and cancellation controls where technically feasible.
- **SHOULD** allow users to leave the working view and return to task status if the underlying task can safely outlive that view.
- **MAY** block affected controls, navigation, or the app when data integrity, security, or the operation's dependencies genuinely require it.
- **MUST** make completed, failed, and canceled states understandable.

**Verify:** Start a long task and try unrelated operations. Only genuinely dependent functions should become unavailable; check status and failure recovery.

## 9. Workflow friction and interruptions

### Avoid
- Mandatory onboarding for functions users can understand and use immediately.
- Repeated requests to rate the app or enable notifications.
- Defaults that cannot be changed despite different legitimate workflows.
- Confirmation dialogs for safely reversible actions.

### Rules
- **SHOULD** let users begin work without unnecessary onboarding.
- **MUST NOT** use engagement pop-ups that interrupt the task flow without a clear user benefit.
- **SHOULD** select sensible defaults and expose meaningful customization.
- **SHOULD** use immediate actions with Undo for reversible changes; retain confirmations for high-impact, irreversible, or risky operations.

**Verify:** Ordinary workflows proceed without unsolicited interruption, and reversible operations have an appropriate recovery mechanism.

## 10. Text, content, and browser accessibility

### Avoid
- Replacing ordinary text with text embedded in images or canvas without good reason.
- Disabling copying, selecting, or searching user-visible text.
- Building content pages that browser Find or search engines cannot discover when they reasonably should.

### Rules
- **MUST** use selectable semantic text for ordinary textual content whenever possible.
- **MUST NOT** block standard select/copy/browser-find actions without a legitimate functional, security, or legal reason.
- **SHOULD** render public content in an indexable and accessible way, including in SPAs where appropriate.
- **SHOULD** keep descriptive text available alongside images, rather than requiring users to extract text from a graphic.

**Verify:** Select/copy ordinary text, use browser Find, and check semantic content is available to assistive technologies.

## 11. Browser and operating-system integration

### Avoid
- Hijacking external links into a proprietary app or restricted WebView without user choice.
- Blocking ordinary links or showing unnecessary warnings for normal destinations.
- Replacing native share sheets with a narrow set of promotional sharing targets.
- Reimplementing file pickers, dropdowns, scrollbars, and input controls worse than their native/platform equivalents.
- Breaking OS-level input methods, accessibility features, or established keyboard conventions.

### Rules
- **MUST** preserve normal link behaviors, including copying links and opening in new tabs/windows where supported.
- **SHOULD** use system-native file dialogs, clipboard, sharing, input methods, and accessibility integration.
- **SHOULD** favor mature native/browser primitives where bespoke controls add no material value.
- **MUST NOT** intercept standard browser/OS interactions without a clear functional need.
- **SHOULD** offer a choice when opening external content in an app versus the browser.

**Verify:** Test new-tab, copy-link, sharing, clipboard, system input, keyboard navigation, and accessibility workflows on supported platforms.

## 12. Desktop/mobile parity

### Avoid
- Intentionally crippling the desktop website to drive mobile-app installation.
- Requiring a mobile app for basic operations that can reasonably function in a web browser.
- Treating mobile UI as simply a shrunken desktop interface.

### Rules
- **SHOULD** preserve core functional parity across supported desktop web and mobile clients.
- **SHOULD** adapt interaction patterns to mouse/keyboard versus touch without removing essential capabilities for commercial pressure.
- **SHOULD** provide full desktop-class interaction where appropriate instead of stretched phone layouts.

**Verify:** Compare essential workflows on supported desktop and mobile surfaces and identify any unexplained restrictions.

## 13. Authentication and local persistence

### Avoid
- Mandatory account creation for local-only functionality.
- QR-only login requiring a second device when reasonable alternatives exist.
- Unexplained session expiry or repeated forced login.
- Requiring a phone number without a product/security justification.
- Locking basic product functionality into a proprietary ecosystem.

### Rules
- **SHOULD** allow guest/local use when cloud identity is unnecessary.
- **SHOULD** offer conventional sign-in alternatives such as password, passkey, or suitable SSO where applicable.
- **SHOULD** preserve legitimate sessions appropriately and explain reauthentication when required.
- **MUST** persist local UI preferences without account login.
- **SHOULD** minimize identity and phone-number requirements.
- **MUST NOT** weaken necessary security merely to avoid authentication friction.

**Verify:** Test local functionality offline/signed out; test session persistence and clear explanations when reauthentication is required.

## 14. User autonomy, transparency, and data portability

### Avoid
- Unnecessary blocking of third-party URLs or protocols.
- Hidden, unexplained content visibility changes where transparency is feasible.
- Forcing algorithmic recommendations as the only way to view content.
- Making users' own data difficult to export.

### Rules
- **SHOULD** let users choose sorting and recommendations where relevant, including chronological views when suitable.
- **SHOULD** give clear reasons for content restrictions and visibility decisions, subject to legitimate abuse-prevention concerns.
- **SHOULD** permit data export in useful formats.
- **MUST NOT** impose unrelated platform restrictions as a substitute for usable product design.

**Verify:** Users can find visibility/filtering controls and relevant export options without hidden navigation traps.

## 15. Advertising, monetization, and attention

### Avoid
- Startup splash ads, interruptive ads in content flows, and ads that unexpectedly open other apps.
- Ad placements that mimic essential navigation or controls.
- Prioritizing unrelated sharing/promotional destinations over user-intended actions.
- Promotional notifications designed solely to draw users back.
- Short-video or engagement feeds inserted into unrelated utility workflows.
- Showing ads to paying users when their purchased plan promises ad-free use.
- Deliberate anti-adblock interference, including blocking core functionality solely to compel ad display.

### Rules
- **MUST** honor exactly what a paid plan promises, especially ad-free entitlements.
- **MUST NOT** use deceptive or unexpectedly disruptive ad interactions.
- **SHOULD** keep core app functions independent of optional advertising infrastructure where feasible.
- **SHOULD** let users disable promotional notifications and content.
- **SHOULD** respect user-side content filtering and not deliberately sabotage ad blockers.
- **DO NOT ASSUME** all ads in free products are prohibited: nonintrusive free-tier advertising is a contextual business decision, not an established blanket rejection.

**Verify:** Test paid entitlements and behavior when ad resources are unavailable or blocked; ensure ordinary tasks remain usable where technically feasible.

## 16. Framework selection, performance, and implementation quality

### Avoid
- Choosing obscure or poorly maintained frameworks for novelty alone.
- Using an established framework but ignoring its conventions and building an inconsistent, fragile interface.
- Reimplementing mature platform components with worse behavior.
- Slow, resource-heavy UI caused by unnecessary visual effects or inefficient rendering.
- Neglecting empty, loading, error, and disabled states.

### Rules
- **SHOULD** prefer mature, maintained frameworks unless an alternative has demonstrated project-specific benefits.
- **MUST** judge implementation choices primarily by output quality, maintainability, compatibility, and performance—not popularity alone.
- **SHOULD** reuse established UI primitives and design-system components.
- **MUST** handle loading, empty, error, and disabled states consistently.
- **SHOULD** optimize responsiveness and resource consumption in actual supported workflows.
- **MUST** verify relevant behavior across supported platforms.

**Verify:** Audit component consistency, error/empty/loading states, representative performance, and target-platform interactions.

## 17. Customization and durable preferences

### Avoid
- Losing preferences after updates.
- Rigid complex workspaces with no ability to hide irrelevant navigation or reposition useful panels.
- Hardcoded default sort orders and views when user choice would materially help.

### Rules
- **SHOULD** allow customizable keyboard shortcuts, where technically feasible.
- **SHOULD** allow hiding unused features/navigation entries.
- **SHOULD** let users select default views and sort orders in collection-oriented apps.
- **SHOULD** support flexible/dockable panels in workspace-style software.
- **MUST** preserve persisted preferences across ordinary upgrades and sessions unless migration explicitly requires a change.

**Verify:** Customize the interface, restart/reload, and upgrade through a representative migration path; settings remain intact.

---

## Trade-offs and unresolved preferences

Do **not** infer a hard rule in these areas:

- **When information exceeds the viewport:** No universal preference between scrolling, sticky controls, and independently scrolling/resizable panels. Choose for the specific workflow.
- **How advanced features are exposed:** Toolbar visibility is welcomed (even with many actions), but there is no blanket preference between always-visible controls, command search, and advanced menus. Support efficient access without duplicates.
- **Framework category:** No fixed preference for native versus cross-platform. Favor product quality and justified trade-offs.
- **Minimalism versus functionality:** Do not sacrifice useful capability for visual minimalism, but do not assume every advanced command belongs permanently on screen.
- **Deviating from OS conventions:** Platform-fit is valued; deviations require a clear usability reason.
- **Asynchronous work:** Whether a task can run in the background depends on whether it affects other views. Never make false promises of independence or cancellation.
- **Advertising in free apps:** No absolute ban; paid-plan promises and user control are the clearer requirements.

## Pre-merge UI review checklist

Use only the checks applicable to the change.

- [ ] The new UI matches the existing design system in light and dark themes.
- [ ] Theme choice persists locally and does not unexpectedly change.
- [ ] Controls have recognizable icons, appropriate tooltips, and accessible labels.
- [ ] The layout uses available space sensibly at intended viewport sizes.
- [ ] Essential controls are not needlessly buried behind scrolling or nested navigation.
- [ ] Frequent actions are accessible; redundant UI entries are avoided.
- [ ] Keyboard shortcuts, focus handling, and contextual actions work where appropriate.
- [ ] Long menus/large collections provide search and suitable navigation controls.
- [ ] Large lists are performant; if virtualized, they still support direct navigation and state restoration.
- [ ] Distinct web content pages have direct URLs that survive reload and new-tab opening.
- [ ] Background work does not unnecessarily block unrelated views.
- [ ] Long tasks show accurate status, errors, and cancellation where supported.
- [ ] Ordinary content remains selectable, copyable, and browser-searchable.
- [ ] Standard browser, OS, sharing, file-picker, and input behavior is respected.
- [ ] Mobile/desktop differences have functional justifications.
- [ ] Authentication is no more restrictive than necessary for the operation.
- [ ] User preferences and state survive ordinary reloads and updates.
- [ ] Paid advertising promises are honored; core functionality does not unnecessarily depend on ads.
- [ ] New features include meaningful empty, loading, disabled, and error states.
- [ ] Any intentionally violated rule is explained in the implementation notes.

## Suggested instruction for `AGENTS.md`

```md
## UI implementation requirements

Before designing, implementing, or modifying user-facing UI, read
`UI-ANTI-PATTERNS.md`.

Treat the applicable MUST/SHOULD rules as design constraints. Do not apply
irrelevant rules mechanically. Audit changed UI against the document's
pre-merge checklist and disclose any intentional exceptions or unverified
criteria in your final report.
```
