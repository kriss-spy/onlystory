import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tableRows, record } from './gfl2-tables.mjs';
import { hash, writeChanged } from './gfl2-event.mjs';

// Read only the installed Chinese localization and event/catalog metadata.
// This establishes configured identities, not extraction or release status.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const tables = resolve(
  process.env.ONLYSTORY_GFL2_TABLES ||
    resolve(
      process.env.GF2_GAME_ROOT || 'D:/Program Files/GF2Exilium',
      'GF2 Game/GF2_Exilium_Data/LocalCache/Data/Table',
    ),
);
const sources = {};
const load = (name) => {
  const path = resolve(tables, `${name}.bytes`);
  if (!existsSync(path)) throw Error(`Missing installed table: ${name}`);
  const bytes = readFileSync(path);
  sources[name] = { file: `${name}.bytes`, sha256: hash(bytes) };
  return [...tableRows(bytes)];
};
const language = new Map(
  load('LangPackageTableCnData').map((row) => [
    row[1],
    row[2]?.toString('utf8'),
  ]),
);
const text = (value) =>
  language.get(Buffer.isBuffer(value) ? record(value)[1] : value);
const configs = load('ActivityConfigData');
const chapters = load('ChapterData');
const archive = load('ChapterAvgCsData');
const entrances = load('ActivityEntranceData');
const groups = new Map();
for (const config of configs.sort((a, b) => a[1] - b[1])) {
  const title = text(config[2]);
  if (!title) throw Error(`Missing event localization for ${config[1]}`);
  if (!groups.has(title)) groups.set(title, []);
  groups.get(title).push(config[1]);
}
const events = [...groups].map(([configTitle, configIds], index) => {
  const title =
    configTitle === '苦涩荆棘与矢车菊' ? '方糖特调沙龙' : configTitle;
  const chapterName =
    configTitle === '异乡乐徽'
      ? '于灰败的羽翼中'
      : configTitle === '玻璃岛的驻行者'
        ? '驻行者'
        : configTitle;
  const matches = (name) =>
    name === chapterName || name?.startsWith(chapterName + '·');
  const matchedChapters = chapters.filter((row) => matches(text(row[3])));
  return {
    number: index + 1,
    title,
    configTitle,
    configIds,
    entranceIds: entrances
      .filter((row) => text(row[5]) === title || text(row[5]) === configTitle)
      .map((row) => row[1])
      .sort((a, b) => a - b),
    chapterTitles: [
      ...new Set(
        matchedChapters.sort((a, b) => a[1] - b[1]).map((row) => text(row[3])),
      ),
    ],
    chapterIds: matchedChapters.map((row) => row[1]),
    archiveRecords: archive
      .filter((row) => matches(text(row[4])))
      .map((row) => ({
        id: row[1],
        title: text(row[4]),
        rawArchiveType: row[7],
      })),
  };
});
writeChanged(resolve(root, 'docs/gfl2-cn-event-catalog.json'), {
  asOf: '2026-10-16',
  scope:
    'CN named theme/story event identities, grouped across parts and repeated configurations; not every login, shop, combat or web campaign.',
  configuredRows: configs.length,
  uniqueEventNames: events.length,
  ordering: 'First configuration ID order, not a verified release timeline.',
  cautions: [
    'A table record is not proof that an event or chapter has opened on the server.',
    'Original event branding and later rewritten archive stories are recorded together for lookup, not claimed to contain identical text.',
    'Chapter titles and archive categories do not imply that every original event version remains installed or recoverable.',
    'ActivityListData timestamps are not used as verified release dates; at least one differs from official announcements.',
  ],
  sources,
  events,
});
console.log(
  `${configs.length} configured rows, ${events.length} distinct event names. Saved docs/gfl2-cn-event-catalog.json.`,
);
