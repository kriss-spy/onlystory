import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Transformation code and the reviewed media-resolution rules it consumes.
// Source packages and acquired media have their own per-file identities.
export const pjskInstallationInputs = Object.freeze([
  'scripts/pjsk-media.mjs',
  'scripts/pjsk-program.mjs',
  'scripts/pjsk-scenario.mjs',
  'scripts/pjsk-scenario-core.mjs',
  'scripts/pjsk-import.mjs',
  'scripts/pjsk-voice-listing.mjs',
  'scripts/pjsk-voice-bindings.mjs',
  'scripts/pjsk-model-overrides.mjs',
  'docs/pjsk-model-overrides.json',
  'docs/pjsk-video-backgrounds.json',
  'docs/pjsk-voice-bindings.json',
]);

export function pjskInstallationFingerprint(directory = root) {
  const implementationInputs = pjskInstallationInputs.map((path) => {
    const bytes = readFileSync(resolve(directory, path));
    return { path, bytes: bytes.length, sha256: digest(bytes) };
  });
  return {
    implementationFingerprintVersion: 2,
    implementationHash: digest(JSON.stringify(implementationInputs)),
    implementationInputs,
  };
}
