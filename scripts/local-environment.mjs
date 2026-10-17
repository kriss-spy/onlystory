import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const configPath = resolve(root, '.codex/worktree.local.json');
const config = existsSync(configPath)
  ? JSON.parse(readFileSync(configPath, 'utf8'))
  : {};

export const libraryRoot = resolve(
  process.env.ONLYSTORY_LIBRARY ||
    config.libraryRoot ||
    resolve(root, 'public'),
);
export const localPort = Number(process.env.PORT || config.port || 4173);
export const pjskLibraryRoot = resolve(
  process.env.ONLYSTORY_PJSK_LIBRARY ||
    config.pjskLibraryRoot ||
    resolve(root, '.cache/pjsk/library'),
);
if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535)
  throw new Error('Onlystory needs a valid PORT between 1 and 65535.');
