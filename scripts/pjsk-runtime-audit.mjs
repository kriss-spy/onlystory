import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  collectPjskCostumes,
  compilePjskEpisode,
  supportedPjskEffects,
} from './pjsk-program.mjs';
import { writeJson } from './pjsk-import.mjs';
import { sha256 } from './pjsk-scenario.mjs';

const { values } = parseArgs({
  options: { manifest: { type: 'string' }, report: { type: 'string' } },
});
const manifestPath = resolve(values.manifest ?? 'docs/pjsk-all-events.json');
const reportPath = resolve(
  values.report ?? '.cache/pjsk/all-events-validation/runtime-audit.json',
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const episodes = (manifest.groups ?? manifest.events).flatMap(
  (group) => group.episodes,
);
const features = {};
const missingPackages = [];
const sourceIssues = [];
const compilerFailures = [];
const costumes = new Set();
const requiredCostumes = new Set();
const episodeModelCounts = [];
let acquiredEpisodes = 0,
  compiledEpisodes = 0,
  commands = 0;

function count(kind, value, episode, index, record) {
  const key = String(value);
  const group = (features[kind] ??= {});
  const feature = (group[key] ??= {
    count: 0,
    episodeIds: new Set(),
    examples: [],
  });
  feature.count++;
  feature.episodeIds.add(episode.id);
  if (feature.examples.length < 3)
    feature.examples.push({
      episodeId: episode.id,
      scenarioId: episode.scenarioId,
      index,
      record,
    });
}

for (const episode of episodes) {
  let pkg;
  try {
    pkg = JSON.parse(
      await readFile(
        resolve(
          '.cache/pjsk/packages',
          `${episode.id}-${episode.scenarioId}.json`,
        ),
        'utf8',
      ),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    missingPackages.push(episode.id);
    continue;
  }
  acquiredEpisodes++;
  commands += pkg.scenario.timeline.length;
  const source = pkg.scenario.source;
  count(
    'initialLayoutModes',
    source.FirstCharacterLayoutMode ?? 0,
    episode,
    'initial',
    source.FirstLayout,
  );
  for (const dep of pkg.scenario.dependencies)
    if (dep.kind === 'live2d-costume' && dep.reference)
      costumes.add(dep.reference);
  sourceIssues.push(
    ...pkg.scenario.issues.map((issue) => ({
      episodeId: episode.id,
      scenarioId: episode.scenarioId,
      ...issue,
    })),
  );
  function effect(record, index) {
    count('effects', record.EffectType, episode, index, record);
    if (!supportedPjskEffects.has(record.EffectType))
      count('unsupportedEffects', record.EffectType, episode, index, record);
    if ([15, 16].includes(record.EffectType))
      count('scenarioOverlays', record.StringVal, episode, index, record);
    if (record.EffectType === 22)
      count('characterShaders', record.StringVal, episode, index, record);
    if (record.EffectType === 19)
      count('movies', record.StringVal, episode, index, record);
    if (record.EffectType === 37)
      count('performances', record.IntVal, episode, index, record);
  }
  function sound(record, index) {
    count('soundModes', record.PlayMode, episode, index, record);
    if (record.PlayMode === 6)
      count('bgmBlocks', record.BgmBlockIndex, episode, index, record);
  }
  for (const { snippet, record, index } of pkg.scenario.timeline) {
    count('actions', snippet.Action, episode, index, record);
    if ([2, 4].includes(snippet.Action)) {
      count('layoutTypes', record.Type, episode, index, record);
      count('layoutPositions', record.SideFrom, episode, index, record);
      count('layoutPositions', record.SideTo, episode, index, record);
    }
    if (snippet.Action === 8)
      count('layoutModes', record.CharacterLayoutMode, episode, index, record);
    if (snippet.Action === 6) effect(record, index);
    if (snippet.Action === 7) sound(record, index);
    if (snippet.Action === 1) {
      count('voiceCounts', record.Voices.length, episode, index, record);
      if (record.RequirePlayEffect) {
        count(
          'inlineEffects',
          source.SpecialEffectData[record.EffectReferenceIdx].EffectType,
          episode,
          index,
          record,
        );
        effect(source.SpecialEffectData[record.EffectReferenceIdx], index);
      }
      if (record.RequirePlaySound) {
        count(
          'inlineSounds',
          source.SoundData[record.SoundReferenceIdx].PlayMode,
          episode,
          index,
          record,
        );
        sound(source.SoundData[record.SoundReferenceIdx], index);
      }
    }
  }
  // A compiler-only probe cannot establish media availability. Keep all original
  // source issues above and supply placeholder media solely to expose renderer
  // semantics that would otherwise hide behind an earlier acquisition issue.
  const used = collectPjskCostumes(source);
  for (const costume of used.keys()) requiredCostumes.add(costume);
  episodeModelCounts.push({
    episodeId: episode.id,
    scenarioId: episode.scenarioId,
    models: used.size,
  });
  const models = Object.fromEntries(
    [...used.keys()].map((costume) => [costume, {}]),
  );
  const performances = Object.fromEntries(
    source.SpecialEffectData.filter((record) => record.EffectType === 37).map(
      (record) => [record.IntVal, { url: 'audit-only-placeholder' }],
    ),
  );
  const effectAssets = Object.fromEntries(
    source.SpecialEffectData.filter((record) => record.EffectType === 15).map(
      (record) => [
        record.StringVal,
        { textures: ['audit-only-placeholder'], kind: 'image' },
      ],
    ),
  );
  try {
    const program = compilePjskEpisode(
      { ...pkg, scenario: { ...pkg.scenario, issues: [] } },
      { models, performances, effectAssets },
    );
    if (
      program.scenarioId !== episode.scenarioId ||
      program.sourceHash !== sha256(pkg.rawScenario)
    )
      throw new Error('Canonical identity or original CN source hash mismatch');
    compiledEpisodes++;
  } catch (error) {
    compilerFailures.push({
      episodeId: episode.id,
      scenarioId: episode.scenarioId,
      error: error.message,
    });
  }
}

for (const group of Object.values(features))
  for (const feature of Object.values(group)) {
    feature.episodeCount = feature.episodeIds.size;
    feature.episodeIds = [...feature.episodeIds];
  }
const failureGroups = {};
for (const failure of compilerFailures) {
  const group = (failureGroups[failure.error] ??= { count: 0, episodeIds: [] });
  group.count++;
  group.episodeIds.push(failure.episodeId);
}
const report = {
  manifestPath,
  expectedEpisodes: episodes.length,
  acquiredEpisodes,
  acquisitionComplete: missingPackages.length === 0,
  missingPackages,
  commands,
  costumeCount: costumes.size,
  costumes: [...costumes].sort(),
  requiredCostumeCount: requiredCostumes.size,
  requiredCostumes: [...requiredCostumes].sort(),
  largestModelEpisodes: episodeModelCounts
    .sort((a, b) => b.models - a.models)
    .slice(0, 10),
  compilerProbe: {
    usesPlaceholderMedia: true,
    compiledEpisodes,
    failureCount: compilerFailures.length,
    failureGroups,
    compilerFailures,
  },
  sourceIssues,
  features,
};
await mkdir(resolve(reportPath, '..'), { recursive: true });
await writeJson(reportPath, report);
console.log(
  JSON.stringify({
    acquiredEpisodes,
    expectedEpisodes: episodes.length,
    commands,
    costumes: costumes.size,
    compiledEpisodes,
    sourceIssueCount: sourceIssues.length,
    failureGroups,
  }),
);
