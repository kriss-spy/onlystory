import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const pins = {
  jp: '22fc10d36c34c1e148f9776fe47b4fd81064ce48',
  en: '3b076ae97bf688e25e804713f470378e56aed549',
  cn: '4ddc66b18ad8c776ca066e30d32b7276cd1d2022',
};
const locales = { jp: 'ja', en: 'en', cn: 'zh-CN' };
const sources = [];
const entries = new Map();
for (const [region, revision] of Object.entries(pins)) {
  const repository =
    region === 'jp' ? 'sekai-master-db-diff' : `sekai-master-db-${region}-diff`;
  const tables = {};
  for (const name of ['unitStories', 'eventStories', 'events']) {
    const url = `https://raw.githubusercontent.com/Sekai-World/${repository}/${revision}/${name}.json`;
    const path = `.cache/localized-titles/${region}/${revision}/${name}.json`;
    let bytes;
    try {
      bytes = await fs.readFile(path);
    } catch {
      if (process.argv.includes('--offline'))
        throw Error(`Missing pinned source ${path}`);
      const response = await fetch(url);
      if (!response.ok) throw Error(`${response.status} ${url}`);
      bytes = Buffer.from(await response.arrayBuffer());
      await fs.mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
      await fs.writeFile(path, bytes);
    }
    sources.push({
      region,
      table: name,
      revision,
      url,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    tables[name] = JSON.parse(bytes);
  }
  const locale = locales[region];
  function add(kind, episode, collection, identity) {
    const key = `${kind}:${episode.id}`;
    const entry = entries.get(key) ?? {
      scenario: episode.scenarioId,
      identity,
      titleLocales: {},
      collectionLocales: {},
    };
    if (entry.scenario !== episode.scenarioId || entry.identity !== identity)
      throw Error(`Cross-region title identity mismatch at ${key}`);
    if (episode.title?.trim()) entry.titleLocales[locale] = episode.title;
    if (collection?.trim()) entry.collectionLocales[locale] = collection;
    entries.set(key, entry);
  }
  for (const unit of tables.unitStories)
    for (const chapter of unit.chapters)
      for (const episode of chapter.episodes)
        add(
          'unit',
          episode,
          chapter.title,
          `${unit.unit}:${chapter.id}:${episode.episodeNo}`,
        );
  for (const story of tables.eventStories) {
    const event = tables.events.find((event) => event.id === story.eventId);
    if (!event || event.assetbundleName !== story.assetbundleName)
      throw Error(`Event title identity mismatch ${region}:${story.eventId}`);
    for (const episode of story.eventStoryEpisodes)
      add(
        'event',
        episode,
        event.name,
        `${story.eventId}:${story.assetbundleName}:${episode.episodeNo}`,
      );
  }
}
const catalog = JSON.parse(
  await fs.readFile('src/downloads/pjsk-catalog.json', 'utf8'),
);
const titles = {};
const coverage = {};
for (const { episode } of catalog) {
  const key = episode.id.replace(/^pjsk-cn-/, '').replace(/-(\d+)$/, ':$1');
  const entry = entries.get(key);
  if (!entry || !episode.entryNodeId.startsWith(`${entry.scenario}:`))
    throw Error(
      `Imported chapter does not match title metadata: ${episode.id}`,
    );
  titles[episode.id] = {
    titleLocales: entry.titleLocales,
    collectionLocales: { ...entry.collectionLocales, 'zh-CN': episode.story },
  };
  for (const locale of Object.keys(entry.titleLocales))
    coverage[locale] = (coverage[locale] ?? 0) + 1;
}
await fs.writeFile(
  'src/pjsk-localized-titles.json',
  JSON.stringify(titles, null, 2) + '\n',
);
await fs.writeFile(
  'docs/localized-title-sources.json',
  JSON.stringify(
    {
      generatedOn: '2026-10-19',
      basis:
        'Regional game-master extracts preserved by Sekai-World; titles only, no claim of translated dialogue',
      alignment:
        'Matching story kind, episode ID, scenario ID, chapter/event bundle identity and episode number',
      chapters: catalog.length,
      coverage,
      sources,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ chapters: catalog.length, coverage }));
