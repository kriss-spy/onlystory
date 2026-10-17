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
