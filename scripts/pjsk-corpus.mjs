import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { importPjsk, writeJson } from './pjsk-import.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({
  options: {
    manifest: {
      type: 'string',
      default: resolve(root, 'docs/pjsk-validation-corpus.json'),
    },
    offline: { type: 'boolean' },
    concurrency: { type: 'string', default: '4' },
    report: {
      type: 'string',
      default: resolve(root, '.cache/pjsk/validation'),
    },
  },
});
const manifest = JSON.parse(await readFile(values.manifest, 'utf8'));
const outputDir = resolve(root, '.cache/pjsk/packages');
const cacheDir = resolve(root, '.cache/pjsk/http');
const validationDir = resolve(values.report);
const concurrency = Number(values.concurrency);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
  throw new Error('Concurrency must be between 1 and 8.');
const tasks = manifest.events.flatMap((event) =>
  event.episodes.map((episode) => ({ ...episode, eventId: event.eventId })),
);
await mkdir(validationDir, { recursive: true });
// Prime the shared master snapshot once before concurrent episode downloads.
await importPjsk({
  region: manifest.textRegion,
  kind: 'event',
  cacheDir,
  outputDir,
  list: true,
  offline: values.offline,
});
const records = [];
const numbers = (rows, key) =>
  [
    ...new Set(
      rows.map((row) => row[key]).filter((value) => value !== undefined),
    ),
  ].sort((a, b) => a - b);
async function acquire(task) {
  try {
    const result = await importPjsk({
      region: manifest.textRegion,
      kind: 'event',
      scenario: task.scenarioId,
      cacheDir,
      outputDir,
      offline: values.offline,
      identityBinding: task.identityBinding,
    });
    const pkg = JSON.parse(await readFile(result.outputPath, 'utf8'));
    if (pkg.entry.id !== task.id || pkg.entry.path !== task.path)
      throw new Error('Manifest/source metadata identity mismatch.');
    const s = pkg.scenario.source;
    return {
      ...task,
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
              (v) => v !== undefined,
            ),
          ),
        ].sort((a, b) => a - b),
        firstLayoutMode: s.FirstCharacterLayoutMode,
        layoutModes: s.ScenarioSnippetCharacterLayoutModes,
        soundModes: numbers(s.SoundData, 'PlayMode'),
        multiVoice: s.TalkData.flatMap((r, i) =>
          r.Voices?.length > 1
            ? [{ index: i, voices: r.Voices, body: r.Body }]
            : [],
        ),
        inlineEffects: s.TalkData.flatMap((r, i) =>
          r.RequirePlayEffect
            ? [
                {
                  index: i,
                  reference: r.EffectReferenceIdx,
                  effect: s.SpecialEffectData[r.EffectReferenceIdx],
                },
              ]
            : [],
        ),
        inlineSound: s.TalkData.flatMap((r, i) =>
          r.RequirePlaySound ? [{ index: i, sound: r.SoundReferenceIdx }] : [],
        ),
        voiceIds: s.TalkData.flatMap((r, i) =>
          (r.Voices ?? []).map((v) => ({ index: i, ...v })),
        ),
      },
    };
  } catch (error) {
    return { ...task, status: 'failed', error: error.message };
  }
}
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (tasks.length) {
      const task = tasks.shift();
      const record = await acquire(task);
      records.push(record);
      console.log(
        `${records.length}/${manifest.expectedEpisodeCount} ${task.scenarioId} ${record.status}${record.error ? `: ${record.error}` : ''}`,
      );
      await writeJson(
        resolve(validationDir, `${task.scenarioId}.json`),
        record,
      );
    }
  }),
);
records.sort(
  (a, b) => Number(a.eventId) - Number(b.eventId) || a.episodeNo - b.episodeNo,
);
const report = {
  milestone: manifest.milestone,
  acquired: records.filter((r) => r.status === 'acquired').length,
  failed: records.filter((r) => r.status === 'failed').length,
  episodes: records,
};
report.inventory = Object.fromEntries(
  ['actions', 'effects', 'layoutTypes', 'sides', 'soundModes'].map((key) => [
    key,
    [
      ...new Set(records.flatMap((record) => record.inventory?.[key] ?? [])),
    ].sort((a, b) => a - b),
  ]),
);
await writeJson(resolve(validationDir, 'acquisition.json'), report);
console.log(
  JSON.stringify({ acquired: report.acquired, failed: report.failed }),
);
if (report.failed) process.exitCode = 1;
