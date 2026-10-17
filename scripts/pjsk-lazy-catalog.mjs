import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pjskLibraryRoot } from './local-environment.mjs';

// Migrate existing installed chapters without changing their passage or media IDs.
let migrated = 0;
for (const name of await readdir('src/generated')) {
  if (!/^pjsk-.*\.json$/.test(name)) continue;
  const path = resolve('src/generated', name);
  const episode = JSON.parse(await readFile(path, 'utf8'));
  if (!episode.nodes?.length || episode.content) continue;
  const bytes = Buffer.from(
    JSON.stringify({
      format: 'pjsk-text-v1',
      id: episode.id,
      nodes: episode.nodes,
      assets: episode.assets.filter((url) =>
        url.startsWith('/private/pjsk/assets/'),
      ),
    }),
  );
  const hash = createHash('sha256').update(bytes).digest('hex');
  const url = `/private/pjsk/assets/${hash}.json`;
  await writeFile(resolve(pjskLibraryRoot, '.' + url), bytes);
  episode.content = {
    format: 'pjsk-text-v1',
    url,
    count: episode.nodes.length,
  };
  episode.entryNodeId = episode.nodes[0].id;
  episode.nodes = [];
  episode.assets = [url, '/vendor/live2dcubismcore.min.js'];
  await writeFile(path, JSON.stringify(episode, null, 2) + '\n');
  migrated++;
}
console.log(JSON.stringify({ migrated }));
