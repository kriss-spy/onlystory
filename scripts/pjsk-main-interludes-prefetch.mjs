import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createSourceCache, writeJson } from './pjsk-import.mjs';
import { sha256 } from './pjsk-scenario.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = resolve(root, '.cache/pjsk/prefetch');
await mkdir(directory, { recursive: true });
const source = createSourceCache(resolve(root, '.cache/pjsk/http'));
const base =
  'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-cn-diff/main/';
const tables = await Promise.all(
  ['episodeMusicVideoCostumes', 'musicVocals', 'musics'].map(async (name) => {
    const record = await source(base + name + '.json');
    return { name, record, rows: JSON.parse(record.bytes) };
  }),
);
const costumes = tables.find(
  (t) => t.name === 'episodeMusicVideoCostumes',
).rows;
const vocals = tables.find((t) => t.name === 'musicVocals').rows;
const musics = tables.find((t) => t.name === 'musics').rows;
const performances = costumes.map((c) => {
  const vocal = vocals.find((v) => v.id === c.musicVocalId),
    music = musics.find((m) => m.id === vocal.musicId);
  return {
    id: c.id,
    musicVocalId: c.musicVocalId,
    musicId: music.id,
    title: music.title,
    localizedTitle: music.infos[0]?.title,
    assetbundleName: vocal.assetbundleName,
    character3dIds: [1, 2, 3, 4, 5].map((i) => c['character3dId' + i]),
    sourceUrl: `https://storage.sekai.best/sekai-jp-assets/music/long/${vocal.assetbundleName}/${vocal.assetbundleName}.mp3`,
  };
});
const openings = [
  'idol',
  'light_sound',
  'school_refusal',
  'street',
  'theme_park',
].map((unit) => ({
  id: unit + '_opening',
  sourceUrl: `https://storage.sekai.best/sekai-jp-assets/movie/${unit}_opening/${unit}.mp4`,
}));
const jobs = [...performances, ...openings],
  failures = [];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (jobs.length) {
      const item = jobs.shift();
      try {
        const metadataPath = resolve(
          directory,
          sha256(item.sourceUrl) + '.json',
        );
        let prior;
        try {
          prior = JSON.parse(await readFile(metadataPath, 'utf8'));
          const b = await readFile(prior.path);
          if (sha256(b) !== prior.sha256 || b.length !== prior.bytes)
            prior = null;
        } catch {
          prior = null;
        }
        if (prior) {
          item.evidence = prior;
          console.log(`Cached ${item.id}`);
          continue;
        }
        for (let attempt = 0; attempt < 3; attempt++)
          try {
            const r = await fetch(item.sourceUrl, {
              signal: AbortSignal.timeout(60000),
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = Buffer.from(await r.arrayBuffer());
            if (
              !data.length ||
              /text\/html|xml/.test(r.headers.get('content-type') ?? '')
            )
              throw new Error('Invalid media response');
            const digest = sha256(data),
              path = resolve(directory, digest + '.bin'),
              temporary = path + '.' + randomUUID() + '.tmp';
            await writeFile(temporary, data);
            await rename(temporary, path);
            item.evidence = {
              sourceUrl: item.sourceUrl,
              sha256: digest,
              bytes: data.length,
              path,
            };
            await writeJson(metadataPath, item.evidence);
            console.log(`Staged ${item.id} ${data.length} bytes`);
            break;
          } catch (error) {
            if (attempt === 2) throw error;
          }
      } catch (error) {
        failures.push({ id: item.id, error: error.message });
        console.log(`Failed ${item.id}: ${error.message}`);
      }
    }
  }),
);
await writeJson(
  resolve(root, '.cache/pjsk/main-validation/performance-evidence.json'),
  {
    sourceTables: tables.map(({ name, record }) => ({
      name,
      url: record.url,
      sha256: record.sha256,
      bytes: record.bytes.length,
    })),
    performances,
    openings,
    limitations: [
      'FX37 invokes a native 3D music video with the configured cast. Original vocal audio is staged, but the native 3D performance is not reproduced.',
    ],
    failures,
  },
);
if (failures.length) process.exitCode = 1;
