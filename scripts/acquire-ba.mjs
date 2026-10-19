import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const tool = path.join(root, '.cache/ba-downloader');
const revision = 'ac4598977abb46cf11574446fe799aed59842b3a';
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status})`);
}
await fs.mkdir(path.join(root, '.cache'), { recursive: true });
try {
  await fs.access(path.join(tool, '.git'));
} catch {
  run('git', [
    'clone',
    'https://github.com/ZM-Kimu/Blue-Archive-Asset-Downloader',
    tool,
  ]);
  run('git', ['-C', tool, 'checkout', revision]);
}
const head = spawnSync('git', ['-C', tool, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
});
if (head.stdout?.trim() !== revision)
  throw new Error(
    `Expected downloader ${revision}. Use a separate cache for another revision.`,
  );
// Keep package-source configuration inside this workspace.
await fs.writeFile(
  path.join(root, '.cache/NuGet.Config'),
  '<configuration><packageSources><add key="nuget.org" value="https://api.nuget.org/v3/index.json" /></packageSources></configuration>',
);
run('uv', ['sync', '--project', tool, '--extra', 'unitypy']);
const groupArg =
  process.argv.find((a) => a.startsWith('--groups=')) ??
  `--groups=${JSON.parse(
    await fs.readFile(new URL('./ba-library.json', import.meta.url), 'utf8'),
  )
    .map((d) => d.group)
    .join(',')}`;
run(process.execPath, ['scripts/import-ba.mjs', '--prepare', '--groups=11000']);
const metadataRoot = path.join(root, '.cache/ba-reference');
await fs.mkdir(metadataRoot, { recursive: true });
const metadata = [];
for (const name of [
  'ScenarioBGNameExcelTable',
  'BGMExcelTable',
  'ScenarioTransitionExcelTable',
]) {
  const url = `https://raw.githubusercontent.com/ba-archive/blue-archive/4ddc9ee241f6028d724346acda190155dc98aaf6/apps/blue-archive-story-editor/src/assets/excel/${name}.json`;
  const destination = path.join(metadataRoot, `${name}.json`);
  let bytes;
  try {
    bytes = await fs.readFile(destination);
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Metadata ${response.status}: ${url}`);
    bytes = Buffer.from(await response.arrayBuffer());
    JSON.parse(bytes.toString());
    await fs.writeFile(destination, bytes);
  }
  metadata.push({ name, url });
}
await fs.writeFile(
  path.join(metadataRoot, 'sources.json'),
  JSON.stringify(metadata),
);
// Resolve the official catalog before exporting database-backed event sources.
run('uv', [
  'run',
  '--project',
  tool,
  'python',
  '-X',
  'utf8',
  'scripts/ba-acquire.py',
  '--groups=11000',
  '--plan-only',
]);
const selectedGroups = new Set(groupArg.slice(9).split(',').map(Number));
const definitions = JSON.parse(
  await fs.readFile(new URL('./ba-library.json', import.meta.url), 'utf8'),
);
const events = [
  ...new Set(
    definitions
      .filter(
        (d) =>
          selectedGroups.has(d.group) && d.category === 'Event' && d.sourceFile,
      )
      .map((d) => Number(d.collectionId.replace('ba-jp-event-', ''))),
  ),
];
if (events.length)
  run('uv', [
    'run',
    '--project',
    tool,
    'python',
    '-X',
    'utf8',
    'scripts/ba-event-source.py',
    `--events=${events.join(',')}`,
  ]);
if (
  definitions.some(
    (d) =>
      selectedGroups.has(d.group) &&
      d.category === 'Main story' &&
      d.sourceFile,
  )
)
  run('uv', [
    'run',
    '--project',
    tool,
    'python',
    '-X',
    'utf8',
    'scripts/ba-main-source.py',
  ]);
if (
  definitions.some(
    (d) =>
      selectedGroups.has(d.group) &&
      d.category === 'Group story' &&
      d.sourceFile,
  )
)
  run('uv', [
    'run',
    '--project',
    tool,
    'python',
    '-X',
    'utf8',
    'scripts/ba-group-source.py',
    '--merge-library',
  ]);
run(process.execPath, ['scripts/import-ba.mjs', '--prepare', groupArg]);
run('uv', [
  'run',
  '--project',
  tool,
  'python',
  '-X',
  'utf8',
  'scripts/ba-acquire.py',
  groupArg,
]);
run('uv', [
  'run',
  '--project',
  tool,
  'python',
  '-X',
  'utf8',
  'scripts/ba-assets.py',
  groupArg,
]);
if (
  definitions.some(
    (d) =>
      selectedGroups.has(d.group) &&
      d.category === 'Group story' &&
      d.sourceFile,
  )
)
  run('uv', [
    'run',
    '--project',
    tool,
    'python',
    '-X',
    'utf8',
    'scripts/ba-group-catalog.py',
  ]);
if (
  definitions.some(
    (d) => selectedGroups.has(d.group) && d.category === 'Group story',
  )
)
  run(process.execPath, [
    'node_modules/prettier/bin/prettier.cjs',
    '--write',
    'src/ba-catalog.json',
    'src/cover-art.json',
  ]);
if (events.length)
  run('uv', [
    'run',
    '--project',
    tool,
    'python',
    '-X',
    'utf8',
    'scripts/ba-event-catalog.py',
  ]);
if (events.length)
  run('uv', [
    'run',
    '--project',
    tool,
    'python',
    '-X',
    'utf8',
    'scripts/ba-catalog-art.py',
  ]);
if (events.length)
  run(process.execPath, [
    'node_modules/prettier/bin/prettier.cjs',
    '--write',
    'src/ba-catalog.json',
    'src/cover-art.json',
  ]);
run('uv', [
  'run',
  '--project',
  tool,
  'python',
  '-X',
  'utf8',
  'scripts/ba_character_textures.py',
  '--apply',
]);
run(process.execPath, ['scripts/import-ba.mjs', groupArg]);
