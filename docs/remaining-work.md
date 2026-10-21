# Completion checklist

Reconciled against the shared checkout on 2026-10-20. This checklist restores the
original requirements in `ui-polish-plan.md` and `storage-optimization-plan.md`.
Existing uncommitted work is retained. No commit or public deployment is requested.

## Language and reading

- [x] Acquire and pin real BA English dialogue. Match source identities and choices
      conservatively; expose English only where the whole chapter aligns.
- [x] Package aligned text in downloadable recipes and verify JP/EN switching,
      passage/choice/bookmark persistence, resume and cold offline reading.
- [x] Add verified localized collection and chapter titles. Display the selected
      language and search all supplied languages, retaining originals for missing
      translations. Existing normalized aliases alone do not satisfy this.
- [x] Gate unavailable GFL chapters on a fresh static installation before fetching
      private prepared content. Downloader pending must stay an honest state.
- [x] Preserve existing per-game themes/settings, reader controls, virtual
      list/table/card layouts, fixed catalog viewport and branch-aware seeking.
- [x] Preserve the toolbar's select, queue and progress-circle download interaction.

## Storage

- [x] Shared content-addressed objects, lossless atlas conversion, bounded streaming
      transfers and selected movie audio dependencies already exist.
- [x] Desktop packaging and external app-data source/conversion caches already
      exist. Their old pending checklist entries are stale.
- [x] Reclaim only unreachable cached media after the Undo retention window.
- [x] Migrate large byte-identical legacy cache entries without the 16 MiB skip.
- [x] Show incremental download estimates before transfer.
- [x] Coordinate transfers between windows.
- [x] Share movie picture streams with selectable audio and verify synchronized
      playback, seeking, switching and offline behavior. The disk experiment alone
      does not complete this requirement.

## Verification and release

- [x] Update the three stale BA browser download tests while retaining resume checks.
- [x] Convert a representative actual BA movie in the browser.
- [x] Run final `npm run check`, relevant browser suites and PWA workflows.
- [x] Rebuild the web archive and Windows portable/NSIS packages from the final
      source; verify recipe inclusion, packaged playback and checksums.
- [x] Exercise NSIS installation locally and record the result.
- [x] Replace outdated deployment, README and standalone verification scope.
- [x] Verify the final development server responds and leave it running.

The [final release record](standalone-verification.json) binds the three artifact
checksums to the executed checks. The original browser sweep and focused reruns
provide passing evidence for all 756 unique cases; this is combined coverage,
not one clean full-suite invocation. All 17 production PWA cases passed, followed
by seven checks against the final CSS and a stronger rendered-English offline
check. The final installer passed isolated installation, four original BA imports,
cold offline completion and uninstall. Packaged PJSK and the portable launcher
also passed. The detailed records retain earlier failures and build boundaries.

Public HTTPS hosting and host-specific SPA/service-worker behavior require a
selected host and deployment instruction. Prepare the artifacts locally without
publishing them. JP-only chapters, source gaps, Unity cutscene barriers and PJSK
presentation limits must remain explicit in the final evidence.
