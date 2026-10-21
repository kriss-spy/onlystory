# Onlystory

Shared visual-novel reader for Girls' Frontline 1/2, Project SEKAI and Blue Archive.

## Where to look

- Vocabulary (event, story, passage): `GLOSSARY.md`.
- Design and pipeline notes: `docs/`.
- Changing any reader, catalog or management UI: read `docs/UI-ANTI-PATTERNS.md` first.
- Blue Archive import, catalog art and school labels: `docs/blue-archive-pipeline.md`.

## Development

Delegate clearly independent work to subagents, such as separate game audits, and consolidate their evidence in the parent task.

Always keep the live development server running in psmux during development so changes can be reviewed in the browser. Use `psmux.exe -L codex` and reuse the `onlystory-dev` session after inspecting its pane output. Run `npm run dev` from this repository; Vite also serves the local library backend. Verify the server responds and leave it running when finished. Share the local URL and `psmux -L codex attach -t onlystory-dev`. Use this live server for routine review; build Windows executables when requested or needed to verify packaging.

## Checks

Run `npm run check` before committing (format, unit tests, import tests, type-check/build). The `.githooks/pre-commit` hook runs it automatically and `scripts/setup-hooks.mjs` enables it on `npm ci`. `npm run verify` adds the browser suite, which needs Chrome.

Derive catalog-spec counts from `scripts/ba-library.json` or `src/ba-catalog.json`; `scripts/check-spec-literals.mjs` (part of `check`) rejects hardcoded collection counts in `tests/ba-*.spec.ts`.
