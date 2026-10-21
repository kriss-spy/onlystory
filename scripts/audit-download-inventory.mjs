import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { chromium } from '@playwright/test';
import { localPort } from './local-environment.mjs';

// Run against npm run dev. This audits the current catalog and its local library,
// not public upstream availability or successful offline playback.
const base = process.env.ONLYSTORY_AUDIT_URL || `http://127.0.0.1:${localPort}`;
const output = path.resolve('.cache/other-game-download-audit');
await fs.mkdir(output, { recursive: true });
const startedAt = new Date().toISOString();
// Reuse HEAD connections. Tens of thousands of short-lived sockets can exhaust
// Windows' ephemeral ports and produce false file failures during a full audit.
const agents = {
  'http:': new http.Agent({ keepAlive: true, maxSockets: 12 }),
  'https:': new https.Agent({ keepAlive: true, maxSockets: 12 }),
};
function head(url) {
  const target = new URL(url, base);
  const client = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(
      target,
      { method: 'HEAD', agent: agents[target.protocol] },
      (response) => {
        response.once('error', reject);
        response.once('end', () => {
          const contentType = response.headers['content-type'] || '';
          resolve({
            status: response.statusCode,
            bytes: Number(response.headers['content-length']) || 0,
            contentType,
            readable:
              response.statusCode >= 200 &&
              response.statusCode < 300 &&
              !contentType.includes('text/html'),
          });
        });
        response.resume();
      },
    );
    request.once('error', reject);
    request.setTimeout(30000, () =>
      request.destroy(new Error('HEAD timed out')),
    );
    request.end();
  });
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let catalog;
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(base + '/library');
  catalog = await page.evaluate(async () => {
    const { catalogSource, catalogMode } =
      await import('/src/catalog-source.ts');
    const { hasOnlineSource } = await import('/src/downloads/providers.ts');
    return ['ba', 'gfl1', 'gfl2'].flatMap((game) =>
      catalogSource(game, catalogMode(new URLSearchParams())).map(
        (episode) => ({
          id: episode.id,
          game,
          title: episode.title,
          availability: episode.availability,
          standaloneSource: hasOnlineSource(episode),
          content: episode.content,
          assets: episode.assets,
        }),
      ),
    );
  });
} finally {
  await browser.close();
}
await fs.writeFile(path.join(output, 'catalog.json'), JSON.stringify(catalog));
console.log(`Catalog: ${catalog.length} stories`);

async function pool(values, concurrency, run) {
  let index = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (index < values.length) await run(values[index++]);
    }),
  );
}
const scenes = new Map();
const sceneUrls = [
  ...new Set(catalog.map((e) => e.content?.sceneUrl).filter(Boolean)),
];
await pool(sceneUrls, 8, async (url) => {
  try {
    const response = await fetch(new URL(url, base), {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('json'))
      throw Error(
        `HTTP ${response.status}: ${response.headers.get('content-type')}`,
      );
    const program = await response.json();
    const files = program.files ?? program.assets?.files;
    scenes.set(url, {
      id: program.id,
      steps: program.steps?.length,
      files: Array.isArray(files) ? files.map((f) => f.url) : [],
      version: program.version,
    });
  } catch (error) {
    scenes.set(url, { error: String(error), files: [] });
  }
});
const results = new Map();
for (const episode of catalog) {
  episode.files = [
    ...new Set([
      ...episode.assets,
      ...(scenes.get(episode.content?.sceneUrl)?.files ?? []),
    ]),
  ];
  for (const url of episode.files) results.set(url, null);
}
console.log(
  `Scene inventories: ${sceneUrls.length}; unique declared files: ${results.size}`,
);
let completed = 0;
await pool([...results.keys()], 12, async (url) => {
  let result;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      result = await head(url);
      if (result.readable) break;
    } catch (error) {
      result = { readable: false, error: String(error) };
    }
  }
  results.set(url, result);
  if (++completed % 1000 === 0)
    console.log(`Checked ${completed}/${results.size} local files`);
});
for (const agent of Object.values(agents)) agent.destroy();
const stories = catalog.map((episode) => {
  const scene = scenes.get(episode.content?.sceneUrl);
  return {
    id: episode.id,
    game: episode.game,
    title: episode.title,
    availability: episode.availability,
    standaloneSource: episode.standaloneSource,
    files: episode.files.length,
    missing: episode.files.filter((url) => !results.get(url)?.readable),
    ...(scene?.error ? { sceneError: scene.error } : {}),
    ...(scene &&
    !scene.error &&
    (scene.id !== episode.id ||
      scene.version !== 1 ||
      scene.steps !== episode.content.count)
      ? { sceneMismatch: scene }
      : {}),
  };
});
const games = Object.fromEntries(
  ['ba', 'gfl1', 'gfl2'].map((game) => {
    const episodes = stories.filter((e) => e.game === game);
    const files = new Set(
      catalog.filter((e) => e.game === game).flatMap((e) => e.files),
    );
    return [
      game,
      {
        stories: episodes.length,
        available: episodes.filter((e) => e.availability === 'available')
          .length,
        incomplete: episodes.filter((e) => e.availability === 'incomplete')
          .length,
        standaloneSources: episodes.filter((e) => e.standaloneSource).length,
        uniqueDeclaredFiles: files.size,
        reachableDeclaredFiles: [...files].filter(
          (url) => results.get(url)?.readable,
        ).length,
        storiesWithMissingDeclaredFiles: episodes.filter(
          (e) => e.missing.length || e.sceneError || e.sceneMismatch,
        ).length,
      },
    ];
  }),
);
const report = {
  startedAt,
  checkedAt: new Date().toISOString(),
  base,
  games,
  method:
    'Every current non-preview game story; chapter asset lists plus all scene-program file inventories; HTTP HEAD for every deduplicated declared file, rejecting HTML fallbacks. Source support uses the production hasOnlineSource predicate.',
  limits: [
    'Local development library only. Does not establish public upstream access.',
    'HEAD checks do not verify complete response bodies or offline playback.',
    'Existing unresolved assets absent from declared inventories require the per-game provenance audit.',
  ],
  stories,
  files: Object.fromEntries(results),
};
await fs.writeFile(
  path.join(output, 'local-inventory.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify({ checkedAt: report.checkedAt, games }, null, 2));
