import { createHash } from 'node:crypto';
export * from './pjsk-scenario-core.mjs';
export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
