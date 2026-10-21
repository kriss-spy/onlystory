import { readFileSync, writeFileSync } from 'node:fs';

// ScenarioModeDBSchema FrontScenarioGroupId / BackScenarioGroupId are retained
// by ba-main-source.py in each definition's mainStory metadata.
const definitions = JSON.parse(readFileSync('scripts/ba-library.json', 'utf8'));
const modes = new Map();
for (const definition of definitions) {
  const metadata = definition.mainStory;
  if (!metadata) continue;
  for (const id of metadata.modeIds) {
    const key = `${definition.collectionId}:${id}`;
    const phases = modes.get(key) ?? { front: [], back: [] };
    phases[metadata.phase].push(definition.group);
    modes.set(key, phases);
  }
}
const pairs = [
  ...new Set(
    [...modes.values()]
      .filter(({ front, back }) => front.length && back.length)
      .map(({ front, back }) => `${front.at(-1)}:${back[0]}`),
  ),
].sort(
  (a, b) =>
    Number(a.split(':')[0]) - Number(b.split(':')[0]) ||
    Number(a.split(':')[1]) - Number(b.split(':')[1]),
);
const boundaries = pairs.map((pair) => {
  const [before, after] = pair.split(':');
  return { before: `ba-jp-${before}`, after: `ba-jp-${after}` };
});
writeFileSync(
  'src/battle-boundaries.json',
  JSON.stringify(boundaries, null, 2) + '\n',
);
console.log(`Recorded ${boundaries.length} official BA front/back boundaries.`);
