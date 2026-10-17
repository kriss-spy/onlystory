import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { sha256 } from './pjsk-scenario.mjs';
import { writeJson } from './pjsk-import.mjs';
import { pjskLibraryRoot } from './local-environment.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({
  options: {
    offline: { type: 'boolean' },
    publish: { type: 'boolean' },
    manifest: {
      type: 'string',
      default: resolve(root, 'docs/pjsk-validation-corpus.json'),
    },
  },
});
const directory = resolve(root, '.cache/pjsk/artwork');
await mkdir(directory, { recursive: true });
await mkdir(resolve(pjskLibraryRoot, 'private/pjsk/assets'), {
  recursive: true,
});
const manifestPath = resolve(directory, 'manifest.json');
let previous = {};
try {
  previous = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const corpus = JSON.parse(await readFile(resolve(values.manifest), 'utf8'));
const main = JSON.parse(
  await readFile(resolve(root, 'docs/pjsk-main-corpus.json'), 'utf8'),
);
const viewerCommit = '163bb49e2fca0998461a1718ea1dba4e098cac59';
const manifest = { schemaVersion: 1, events: {}, groups: {}, mainCovers: {} };
async function fetchBytes(url) {
  if (values.offline) throw new Error('Artwork not cached: ' + url);
  for (let i = 0; i < 3; i++)
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) {
        const e = new Error(`HTTP ${r.status} ${url}`);
        e.status = r.status;
        throw e;
      }
      const data = Buffer.from(await r.arrayBuffer());
      return data;
    } catch (error) {
      if (error.status === 404 || i === 2) throw error;
    }
}
async function acquire(section, key, urls, description) {
  const prior = previous[section]?.[key];
  if (prior && urls.includes(prior.source)) {
    try {
      const data = await readFile(resolve(pjskLibraryRoot, '.' + prior.url));
      if (data.length === prior.bytes && sha256(data) === prior.sha256) {
        manifest[section][key] = prior;
        return;
      }
    } catch {}
  }
  let data, source;
  for (const [i, url] of urls.entries())
    try {
      data = await fetchBytes(url);
      source = url;
      break;
    } catch (error) {
      if (error.status !== 404 || i === urls.length - 1) throw error;
    }
  if (data.subarray(1, 4).toString() !== 'PNG')
    throw new Error('Artwork must be a real PNG: ' + source);
  const width = data.readUInt32BE(16),
    height = data.readUInt32BE(20),
    digest = sha256(data);
  const url = `/private/pjsk/assets/${digest}.png`,
    path = resolve(pjskLibraryRoot, '.' + url),
    temporary = path + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, data);
  await rename(temporary, path);
  manifest[section][key] = {
    url,
    width,
    height,
    position: 'center',
    source,
    sha256: digest,
    bytes: data.length,
    description,
  };
  console.log(`${section}/${key} ${width}x${height} ${data.length} bytes`);
}
const jobs = [];
for (const event of corpus.events) {
  const path = `event_story/${event.bundle}/screen_image/banner_event_story.png`;
  jobs.push(() =>
    acquire(
      'events',
      `pjsk-cn-event-${event.eventId}`,
      [
        `https://storage.sekai.best/sekai-cn-assets/${path}`,
        `https://storage.sekai.best/sekai-jp-assets/${path}`,
      ],
      'Original event story banner with title and character art',
    ),
  );
}
for (const group of main.groups) {
  jobs.push(() =>
    acquire(
      'groups',
      group.collection,
      [
        `https://raw.githubusercontent.com/Sekai-World/sekai-viewer/${viewerCommit}/public/images/cn/logos_outline/logo_${group.collection}.png`,
      ],
      'Original CN group logo, pinned viewer asset',
    ),
  );
  const bundle = group.episodes[0].path.split('/')[2];
  const path = `story/chapter_image/chapter1/${bundle}.png`;
  jobs.push(() =>
    acquire(
      'mainCovers',
      group.collection,
      [
        `https://storage.sekai.best/sekai-cn-assets/${path}`,
        `https://storage.sekai.best/sekai-jp-assets/${path}`,
      ],
      'Original unit main-story chapter artwork',
    ),
  );
}
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (jobs.length) await jobs.shift()();
  }),
);
for (const section of ['events', 'groups', 'mainCovers'])
  manifest[section] = Object.fromEntries(
    Object.entries(manifest[section]).sort(([a], [b]) => a.localeCompare(b)),
  );
await writeJson(manifestPath, manifest);
await writeJson(
  resolve(pjskLibraryRoot, 'private/pjsk/artwork.json'),
  manifest,
);
if (values.publish) {
  const path = resolve(root, 'src/cover-art.json');
  const registry = JSON.parse(await readFile(path, 'utf8'));
  registry.groups ??= {};
  for (const [id, cover] of Object.entries(manifest.events))
    registry.events[`pjsk:${id}`] = cover;
  for (const [group, cover] of Object.entries(manifest.mainCovers))
    registry.events[`pjsk:pjsk-cn-${group}-main`] = cover;
  for (const [group, logo] of Object.entries(manifest.groups))
    registry.groups[`pjsk:${group}`] = logo;
  await writeJson(path, registry);
}
console.log(
  JSON.stringify({
    events: Object.keys(manifest.events).length,
    groups: Object.keys(manifest.groups).length,
    mainCovers: Object.keys(manifest.mainCovers).length,
  }),
);
