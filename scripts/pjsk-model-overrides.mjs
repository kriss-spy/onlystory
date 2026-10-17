import { readFileSync } from 'node:fs';

// Reviewed original-owner fallbacks, with pinned rig/track evidence in the document.
const evidence = JSON.parse(
  readFileSync(
    new URL('../docs/pjsk-model-overrides.json', import.meta.url),
    'utf8',
  ),
);
export const reviewedMotionOwners = Object.freeze(
  Object.fromEntries(
    Object.entries(evidence.overrides).map(([costume, entry]) => [
      costume,
      Object.freeze({
        bases: Object.freeze(entry.bases),
        reason: entry.reason,
        ...(entry.limitation ? { limitation: entry.limitation } : {}),
      }),
    ]),
  ),
);

export const reviewedAbsentModelMetadata = Object.freeze(
  evidence.absentModelMetadata,
);
