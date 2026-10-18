import fs from 'node:fs/promises';
import path from 'node:path';
import { compileStory, baScriptCommandSupported } from './ba-story.mjs';

import { compileBaSceneSteps } from './ba-scenes.mjs';

const definitions = JSON.parse(
  await fs.readFile(process.argv[2] ?? 'scripts/ba-library.json', 'utf8'),
);
const report = {
  chapters: definitions.length,
  rows: 0,
  compiled: 0,
  aligned: 0,
  reachable: 0,
  failures: [],
  commands: {},
  actorEffects: {},
  emotions: {},
  backgroundEffects: {},
  transitions: {},
  unsupported: {},
};
const count = (collection, key, example) => {
  if (!collection[key]) collection[key] = { count: 0, example };
  collection[key].count++;
};
for (const definition of definitions) {
  const folder = `public/private/ba-jp/${definition.group}`;
  const source = JSON.parse(
    await fs.readFile(
      definition.sourceFile ?? path.join(folder, 'source.json'),
      'utf8',
    ),
  );
  const names = JSON.parse(
    await fs.readFile(
      definition.charactersFile ?? path.join(folder, 'characters.json'),
      'utf8',
    ),
  );
  report.rows += source.content.length;
  try {
    const chapter = compileStory(source, names);
    report.compiled++;
    const byId = new Map(chapter.nodes.map((node) => [node.id, node]));
    const reached = new Set();
    const pending = [chapter.entryNodeId];
    while (pending.length) {
      const id = pending.pop();
      if (reached.has(id)) continue;
      const node = byId.get(id);
      if (!node) throw new Error(`Broken BA graph target ${id}`);
      reached.add(id);
      pending.push(
        ...(node.kind === 'choice'
          ? node.choices.map((choice) => choice.next)
          : node.next
            ? [node.next]
            : []),
      );
    }
    if (reached.size !== chapter.nodes.length)
      throw new Error(`Unreachable BA passages in ${definition.group}`);
    report.reachable++;
    compileBaSceneSteps(source, chapter);
    report.aligned++;
  } catch (error) {
    report.failures.push({ group: definition.group, error: error.message });
  }
  for (const [row, data] of source.content.entries()) {
    const example = { group: definition.group, row };
    if (data.BGEffect) count(report.backgroundEffects, data.BGEffect, example);
    if (data.Transition) count(report.transitions, data.Transition, example);
    for (const line of data.ScriptKr.split('\n')
      .map((line) => line.trim())
      .filter(Boolean)) {
      const [command, action, value] = line.split(';');
      if (!command.startsWith('#')) continue;
      const key = /^#[1-5]$/.test(command) ? `#actor;${action}` : command;
      count(report.commands, key, { ...example, line });
      if (!baScriptCommandSupported(command, action))
        count(report.unsupported, key, { ...example, line });
      if (/^#[1-5]$/.test(command) && action === 'fx')
        count(report.actorEffects, value, example);
      if (/^#[1-5]$/.test(command) && action === 'em')
        count(report.emotions, value, example);
    }
  }
}
const output = process.argv[3] ?? '.cache/ba-runtime-compatibility.json';
await fs.writeFile(output, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    chapters: report.chapters,
    rows: report.rows,
    compiled: report.compiled,
    aligned: report.aligned,
    reachable: report.reachable,
    failures: report.failures.length,
    unsupported: Object.keys(report.unsupported),
    output,
  }),
);
