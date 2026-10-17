import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { importPjsk, writeJson, createSourceCache } from './pjsk-import.mjs';
import { masterUrl } from './pjsk-scenario.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({ options: { offline: { type: 'boolean' } } });
const cacheDir = resolve(root, '.cache/pjsk/http'),
  outputDir = resolve(root, '.cache/pjsk/packages');
const validationDir = resolve(root, '.cache/pjsk/main-validation');
await mkdir(validationDir, { recursive: true });
const catalog = await importPjsk({
  region: 'cn',
  kind: 'unit',
  cacheDir,
  outputDir,
  offline: values.offline,
  list: true,
});
const master = await createSourceCache(cacheDir, { offline: values.offline })(
  masterUrl('cn', 'unit'),
);
const names = {
  idol: 'MORE MORE JUMP!',
  light_sound: 'Leo/need',
  piapro: 'VIRTUAL SINGER',
  school_refusal: '25时，在Nightcord。',
  street: 'Vivid BAD SQUAD',
  theme_park: 'Wonderlands×Showtime',
};
const groups = Object.entries(names).map(([collection, name]) => ({
  collection,
  name,
  episodes: catalog.entries
    .filter((e) => e.collection === collection)
    .sort((a, b) => a.chapterNo - b.chapterNo || a.episodeNo - b.episodeNo),
}));
if (groups.flatMap((g) => g.episodes).length !== catalog.entries.length)
  throw new Error('Unit master contains an unclassified group.');
const manifest = {
  schemaVersion: 1,
  kind: 'unit',
  milestone: 'pjsk-all-main-stories-v1',
  textRegion: 'cn',
  mediaRegion: 'jp',
  metadataEvidence: {
    url: master.url,
    sha256: master.sha256,
    bytes: master.bytes.length,
  },
  expectedGroupCount: groups.length,
  expectedEpisodeCount: catalog.entries.length,
  groups,
  // Keep the corpus runner's collection envelope shared with event corpora.
  events: groups.map((group) => ({
    eventId: group.collection,
    expectedEpisodeCount: group.episodes.length,
    episodes: group.episodes,
  })),
};
await writeJson(resolve(root, 'docs/pjsk-main-corpus.json'), manifest);
console.log(
  JSON.stringify({
    episodes: manifest.expectedEpisodeCount,
    groups: groups.map((g) => ({
      collection: g.collection,
      count: g.episodes.length,
      chapters: [...new Set(g.episodes.map((e) => e.chapterNo))],
    })),
  }),
);
const queue = groups.flatMap((g) => g.episodes),
  records = [];
const numbers = (rows, key) =>
  [...new Set(rows.map((r) => r[key]).filter((x) => x !== undefined))].sort(
    (a, b) => a - b,
  );
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const entry = queue.shift();
      let record;
      try {
        const result = await importPjsk({
          region: 'cn',
          kind: 'unit',
          scenario: entry.scenarioId,
          cacheDir,
          outputDir,
          offline: values.offline,
        });
        const pkg = JSON.parse(await readFile(result.outputPath, 'utf8'));
        if (pkg.entry.id !== entry.id || pkg.entry.path !== entry.path)
          throw new Error('Unit manifest/source identity mismatch');
        const s = pkg.scenario.source;
        record = {
          ...entry,
          status: 'acquired',
          outputPath: result.outputPath,
          coverage: result.coverage,
          issues: result.issues,
          inventory: {
            actions: numbers(s.Snippets, 'Action'),
            effects: numbers(s.SpecialEffectData, 'EffectType'),
            layoutTypes: numbers(s.LayoutData, 'Type'),
            sides: [
              ...new Set(
                s.LayoutData.flatMap((r) => [r.SideFrom, r.SideTo]).filter(
                  (x) => x !== undefined,
                ),
              ),
            ].sort((a, b) => a - b),
            firstLayoutMode: s.FirstCharacterLayoutMode,
            layoutModes: s.ScenarioSnippetCharacterLayoutModes,
            soundModes: numbers(s.SoundData, 'PlayMode'),
            multiVoice: s.TalkData.flatMap((r, i) =>
              r.Voices?.length > 1 ? [{ index: i, voices: r.Voices }] : [],
            ),
            inlineEffects: s.TalkData.flatMap((r, i) =>
              r.RequirePlayEffect
                ? [
                    {
                      index: i,
                      effect: s.SpecialEffectData[r.EffectReferenceIdx],
                    },
                  ]
                : [],
            ),
            inlineSound: s.TalkData.flatMap((r, i) =>
              r.RequirePlaySound
                ? [{ index: i, sound: s.SoundData[r.SoundReferenceIdx] }]
                : [],
            ),
            voiceOddities: s.TalkData.flatMap((r, i) =>
              (r.Voices ?? [])
                .filter((v) => v.VoiceId !== v.VoiceId.trim())
                .map((v) => ({ index: i, ...v })),
            ),
          },
        };
      } catch (error) {
        record = { ...entry, status: 'failed', error: error.message };
      }
      const completed = records.push(record);
      await writeJson(
        resolve(validationDir, entry.scenarioId + '.json'),
        record,
      );
      console.log(
        `${completed}/${catalog.entries.length} ${entry.scenarioId} ${record.status}${record.error ? ': ' + record.error : ''}`,
      );
    }
  }),
);
records.sort(
  (a, b) =>
    a.collection.localeCompare(b.collection) ||
    a.chapterNo - b.chapterNo ||
    a.episodeNo - b.episodeNo,
);
const report = {
  milestone: manifest.milestone,
  acquired: records.filter((r) => r.status === 'acquired').length,
  failed: records.filter((r) => r.status === 'failed').length,
  episodes: records,
  inventory: Object.fromEntries(
    ['actions', 'effects', 'layoutTypes', 'sides', 'soundModes'].map((key) => [
      key,
      [...new Set(records.flatMap((r) => r.inventory?.[key] ?? []))].sort(
        (a, b) => a - b,
      ),
    ]),
  ),
};
await writeJson(resolve(validationDir, 'acquisition.json'), report);
console.log(
  JSON.stringify({
    acquired: report.acquired,
    failed: report.failed,
    inventory: report.inventory,
  }),
);
if (report.failed) process.exitCode = 1;
