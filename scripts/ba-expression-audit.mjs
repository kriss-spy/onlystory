// Lists event rows whose authored expression is absent from the packaged
// skeleton and has no declared gap yet. Mirrors the check in ba-scenes.mjs,
// including the expression banks added by enrichBaExpressions.
//
// Usage: node scripts/ba-expression-audit.mjs 10005005,10005010,...
import fs from 'node:fs/promises';
import { resolveBaExpression } from '../src/playback/ba/expressions.ts';
import { canonicalBaScriptLine } from '../src/playback/ba/script.ts';
import { applyBaSourceCorrections } from '../src/playback/ba/source-corrections.ts';
import { enrichBaExpressions } from './ba-expressions.mjs';
import expressionGaps from '../src/playback/ba/expression-gaps.json' with { type: 'json' };

const groups = (process.argv[2] ?? '').split(',').filter(Boolean).map(Number);
const out = [];
for (const group of groups) {
  let assets;
  let source;
  try {
    assets = JSON.parse(
      await fs.readFile(`public/private/ba-jp/${group}/assets.json`, 'utf8'),
    );
  } catch {
    out.push({ group, missingAssets: true });
    continue;
  }
  await enrichBaExpressions(assets);
  source = applyBaSourceCorrections(
    JSON.parse(
      await fs.readFile(`public/private/ba-jp/${group}/source.json`, 'utf8'),
    ),
  );
  for (const [index, row] of source.content.entries()) {
    for (const raw of row.ScriptKr.split('\n')) {
      const [command, action, value] = canonicalBaScriptLine(raw)
        .trim()
        .split(';');
      if (!/^[1-5]$/.test(command)) continue;
      const character = assets.characters?.[action];
      if (!character?.expressionNames || character.invisible) continue;
      const resolution = resolveBaExpression(value, character.expressionNames);
      if (
        resolution.mode === 'hold' &&
        !expressionGaps.some(
          (gap) =>
            gap.group === group &&
            gap.row === index &&
            gap.model === character.model &&
            gap.face === value,
        )
      )
        out.push({ group, row: index, model: character.model, face: value });
    }
  }
}
console.log(JSON.stringify(out));
