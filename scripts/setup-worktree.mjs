import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const common = execFileSync(
  'git',
  ['rev-parse', '--path-format=absolute', '--git-common-dir'],
  { cwd: root, encoding: 'utf8' },
).trim();
const source = realpathSync(process.env.ONLYSTORY_SOURCE || dirname(common));
const libraryRoot = realpathSync(
  process.env.ONLYSTORY_LIBRARY || resolve(source, 'public'),
);
const sourceGenerated = resolve(source, 'src/generated');
if (
  !existsSync(sourceGenerated) ||
  !existsSync(resolve(libraryRoot, 'private'))
)
  throw new Error(
    'Restore src/generated and public/private in the main checkout before setting up a worktree. ONLYSTORY_SOURCE and ONLYSTORY_LIBRARY can override their locations.',
  );

const generated = resolve(root, 'src/generated');
if (root !== source) {
  // Never overwrite generated imports that an agent has already changed.
  cpSync(sourceGenerated, generated, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });
  const media = resolve(root, 'public/private');
  let existing;
  try {
    existing = lstatSync(media);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!existing) {
    mkdirSync(dirname(media), { recursive: true });
    symlinkSync(
      resolve(libraryRoot, 'private'),
      media,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  } else if (
    realpathSync(media) !== realpathSync(resolve(libraryRoot, 'private'))
  ) {
    throw new Error(
      `Refusing to replace the existing media directory at ${media}.`,
    );
  }
}

const configPath = resolve(root, '.codex/worktree.local.json');
const previousConfig = existsSync(configPath)
  ? JSON.parse(readFileSync(configPath, 'utf8'))
  : {};
const localPjskLibrary = resolve(root, '.cache/pjsk/library');
const pjskLibraryRoot = resolve(
  process.env.ONLYSTORY_PJSK_LIBRARY ||
    previousConfig.pjskLibraryRoot ||
    (existsSync(localPjskLibrary)
      ? localPjskLibrary
      : resolve(source, '.cache/pjsk/library')),
);
let port = root === source ? 4173 : undefined;
if (existsSync(configPath))
  port = JSON.parse(readFileSync(configPath, 'utf8')).port;
if (!port) {
  // Different worktree paths start on different ports. Probe before choosing.
  const first =
    4200 + (createHash('sha256').update(root).digest().readUInt16BE(0) % 10000);
  for (let offset = 0; offset < 100; offset++) {
    const candidate = first + offset;
    const available = await new Promise((done) => {
      const server = createServer();
      server.once('error', () => done(false));
      server.listen(candidate, '127.0.0.1', () =>
        server.close(() => done(true)),
      );
    });
    if (available) {
      port = candidate;
      break;
    }
  }
  if (!port) throw new Error('Could not find a free worktree server port.');
}
mkdirSync(dirname(configPath), { recursive: true });
writeFileSync(
  configPath,
  JSON.stringify({ source, libraryRoot, pjskLibraryRoot, port }, null, 2) +
    '\n',
);

console.log(`Shared media: ${libraryRoot}`);
console.log(`Local server: http://127.0.0.1:${port}`);
console.log(
  'Generated imports are local copies. Importer caches are not copied.',
);
const install =
  process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm ci --no-audit --no-fund'], {
        cwd: root,
        stdio: 'inherit',
      })
    : spawnSync('npm', ['ci', '--no-audit', '--no-fund'], {
        cwd: root,
        stdio: 'inherit',
      });
if (install.error) throw install.error;
if (install.status !== 0) process.exit(install.status ?? 1);
