# Onlystory

Shared visual-novel reader for Girls' Frontline 1/2, Project SEKAI and Blue Archive.

## Where to look

- Vocabulary (event, story, passage): `GLOSSARY.md`.
- Design and pipeline notes: `docs/`.
- Changing any reader, catalog or management UI: read `docs/UI-ANTI-PATTERNS.md` first.
- Blue Archive import, catalog art and school labels: `docs/blue-archive-pipeline.md`.

## Checks

Run `npm run check` before committing (format, unit tests, import tests, type-check/build). The `.githooks/pre-commit` hook runs it automatically and `scripts/setup-hooks.mjs` enables it on `npm ci`. `npm run verify` adds the browser suite, which needs Chrome.

Derive catalog-spec counts from `scripts/ba-library.json` or `src/ba-catalog.json`; `scripts/check-spec-literals.mjs` (part of `check`) rejects hardcoded collection counts in `tests/ba-*.spec.ts`.
