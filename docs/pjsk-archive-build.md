# Building the available CN archive

Use original CN availability evidence to choose episodes. The planned manifest also contains future metadata; an empty original CN directory is excluded explicitly rather than replaced with another language.

Run from the repository root, in this order:

```powershell
node scripts/pjsk-all-events-acquire.mjs
node scripts/pjsk-available-corpus.mjs
node scripts/pjsk-prefetch-models.mjs --manifest .cache/pjsk/all-events-validation/available-corpus.json --report all-events-models-report.json --workers 4
node scripts/pjsk-prefetch-voice-listings.mjs --manifest .cache/pjsk/all-events-validation/available-corpus.json --workers 8
node scripts/pjsk-prefetch.mjs --manifest .cache/pjsk/all-events-validation/available-corpus.json --report all-events-nonvoice-report.json --workers 6 --max-rps 8 --skip-voices
node scripts/install-pjsk-corpus.mjs --manifest docs/pjsk-all-events.json --availability-report .cache/pjsk/all-events-validation/availability.json --report .cache/pjsk/all-events-validation --offline --resume
```

Check every staging report before offline publication. Required model assets must have no model failures. Nonvoice staging must have no failed or missing URLs. Model fallback probes may return 404 while a verified original owner supplies the required asset. The publisher resolves cache misses locally in offline mode, avoiding repeated network probes for absent candidate filenames.

Nonvoice staging includes original backgrounds, music, sound effects, all discovered effect textures, movie directory listings and the exact movie filenames those listings identify. Native opening movie paths retain their separate convention. Dialogue voices are omitted by `--skip-voices`; pinned original directory listings establish their exact filenames, sizes and MD5 values. The backend fetches and verifies a voice clip on its first request. Offline playback requires the episode download to finish first.

Staging descriptors retain source URLs, byte counts and SHA-256 hashes under `.cache/pjsk/prefetch/`. Repeating these commands reuses verified bytes. Reviewed motion-owner fallbacks and optional missing editor-label files are documented in [pjsk-model-overrides.json](pjsk-model-overrides.json). Native source records, model geometry and texture files remain preserved.

After publication, build the app and run the archive checks and native effect checks against the frozen server. The largest cast regression checks every passage of the 37-costume episode. See [pjsk-pipeline.md](pjsk-pipeline.md) for renderer limitations and audio fidelity boundaries.

The installer and archive verifier share the input manifest in
`scripts/pjsk-installation-provenance.mjs`. Its version 2 fingerprint names and
hashes the transformation modules, including the extracted
`pjsk-scenario-core.mjs`, and the three reviewed media-resolution JSON files.
Per-package source identities and acquired-media hashes remain separate checks.

After a compiler refactor, revalidate retained publications with the actual
offline installer before refreshing their attestation:

```powershell
node scripts/revalidate-pjsk-installation.mjs --scope events --update
```

This command re-decodes each retained original scenario, runs the current full
media installer offline into an isolated catalog and source-index directory,
and requires byte-identical catalog, program and reader-text outputs for every
installed episode in the selected scope. It reuses content-addressed media only
after the installer verifies their original hashes. Any mismatch stops the run
before publication attestations change. It does not acquire newer regional
sources or replace unavailable episodes.

The [revalidation record](pjsk-installer-revalidation.json) lists current compiler
inputs and every checked source/output hash. Original installation reports are
preserved under `installation-history/` with their original SHA-256, timestamps
and compiler identities. Updated reports retain `publishedImplementationHash`
and record the later revalidation separately. Omitting `--update` performs the
same checks without changing publication attestations.

An existing isolated run can be checked again with
`--staged-installation .cache/pjsk/revalidate-<run>`. This still authenticates and
re-decodes every retained scenario, recompiles every program and reader text,
checks the staged installer report, verifies every present media hash, and
requires the complete staged catalog to match its historical publication.
Deferred voices retain their pinned original descriptors. The evidence records
this mode separately from a new full offline installation.

The main-story legacy catalogs predate the explicit `memory` state used by the
current compiler. Their historical installation attestation remains unchanged;
current download recipes already pin the refreshed programs. Recreate missing
maintainer prepared files without changing those recipes or catalogs:

```powershell
node scripts/restore-pjsk-prepared.mjs
```

This command authenticates all 125 retained main-story scenarios, decodes and
compiles them with reviewed media resolutions, and requires the resulting
program and text hashes to match both the current recipe and download catalog.
Only absent prepared files are written. The
[restoration record](pjsk-prepared-restoration.json) records every checked source,
recipe and output identity. This maintenance repair does not refresh the
historical main-story installation attestation or alter application artifacts.
The 2026-10-20 full offline attempt completed all 1,498 event installations, then
stopped before the first main installation because the retained media-installer
cache lacks the `mmj_01_00` voice-directory listing. No new full main-media
installation is claimed by this verification. The separate main restoration
checks authenticate scenarios and reproduce the currently pinned recipe outputs.
