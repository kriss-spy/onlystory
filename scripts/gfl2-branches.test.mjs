import test from 'node:test';
import assert from 'node:assert/strict';
import { compileBranches } from './gfl2-branches.mjs';
import { sceneSteps } from './gfl2-scenes.mjs';

const content = new Map(
  [1, 2, 3, 4].map((id) => [
    id,
    { text: `line ${id}`, textFemale: `female ${id}`, textId: id },
  ]),
);
const rows = [
  ['Bg', 'room'],
  ['Text', '', '1'],
  ['**A1,A2'],
  ['**A1,A2 Begin'],
  ['Selection', '**A1', '2'],
  ['Selection', '**A2', '3'],
  ['**A1'],
  ['Bg', 'wrong'],
  ['Text', '', '2'],
  ['Jump', '**A1,A2'],
  ['**A2'],
  ['Bg', 'right'],
  ['Text', '', '3'],
  ['EndScenario'],
  ['**A3'],
  ['Text', '', '4'],
  ['Jump', '**A1'],
];
const commands = rows.map(([Command, Arg1 = '', Text = ''], i) => ({
  Command,
  Arg1,
  Text,
  sourceRow: i + 1,
}));
test('choices retain loops, graph exits, and out-of-line source blocks', () => {
  // The last source block is reachable through the second choice.
  const source = structuredClone(commands);
  source[5].Arg1 = '**A3';
  source[16].Arg1 = '**A2';
  const result = compileBranches(source, 'A1', content);
  assert.equal(result.commandCounts.Text, 4);
  assert.equal(
    result.passages.find((p) => p.kind === 'choice').choices.length,
    2,
  );
  assert.equal(result.passages.find((p) => p.id === 'A1:9').next, 'A1:5');
  assert.deepEqual(result.flow.exits, ['A1:13']);
  assert.deepEqual(
    sceneSteps([result]).map((s) => s.id),
    result.passages.map((p) => p.id),
  );
  assert.equal(
    sceneSteps([result]).find((s) => s.id === 'A1:9').incoming['A1:5'][0].Arg1,
    'wrong',
  );
});
test('missing labels and unreachable source text fail rather than flattening branches', () => {
  assert.throws(() => compileBranches(commands, 'A1', content), /unreachable/);
  const source = structuredClone(commands);
  source[9].Arg1 = '**ABSENT';
  assert.throws(
    () => compileBranches(source, 'A1', content),
    /missing jump label/,
  );
});
