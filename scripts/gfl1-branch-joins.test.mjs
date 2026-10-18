import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { compileScript } from './gfl1-story.mjs';

function pathFor(program, answer) {
  const path = [];
  let node = program.nodes[0];
  while (node) {
    assert.ok(
      !path.some((entry) => entry.id === node.id),
      'finite branch path',
    );
    path.push(node);
    node = program.nodes.find(
      (candidate) =>
        candidate.id ===
        (node.choices?.find((choice) => choice.id === answer)?.next ??
          node.next),
    );
  }
  return path;
}

function answersPath(program, answers) {
  const path = [];
  let node = program.nodes[0];
  let choiceIndex = 0;
  while (node) {
    assert.ok(path.length < 2000, 'bounded explicit answer sequence');
    path.push(node);
    const answer = node.choices ? answers[choiceIndex++] : undefined;
    const target = node.choices
      ? node.choices.find((choice) => choice.id === answer)?.next
      : node.next;
    if (node.choices) assert.ok(target, `valid answer for ${node.id}`);
    node = program.nodes.find((candidate) => candidate.id === target);
  }
  return path;
}

test('exploration visits each native option once in either order before common continuation', () => {
  const program = compileScript(
    'explore',
    '()||:Inspect.<t>Left<t>Right\n()||<分支>1</分支>:Left room.\n()||<分支>2</分支>:Right room.\n()||:Inspection complete.',
    { backgrounds: {}, portraits: {}, audio: {} },
  );
  assert.equal(program.complete, true);
  for (const answers of [
    ['1', '2'],
    ['2', '1'],
  ]) {
    const path = answersPath(program, answers);
    const menus = path.filter((node) => node.kind === 'choice');
    assert.equal(menus.length, 2);
    assert.deepEqual(
      menus[1].choices.map((choice) => choice.id),
      [answers[1]],
    );
    assert.equal(path.filter((node) => node.source?.row === 2).length, 1);
    assert.equal(path.filter((node) => node.source?.row === 3).length, 1);
    assert.equal(path.at(-2).source.row, 4);
    assert.equal(path.at(-1).kind, 'end');
  }
});

test('quiz wrong answers retry with exact saved IDs and correct answer alone reaches the report', () => {
  const extracted = {
    backgrounds: {
      1: { name: 'question', color: '#111111' },
      2: { name: 'feedback', color: '#222222' },
      3: { name: 'report', color: '#333333' },
    },
    portraits: {},
    audio: {},
  };
  const program = compileScript(
    'quiz',
    '()||<true>2</true><BIN>1</BIN>:Question?<r>Wrong<r>Right\n()||<分支>1</分支><BIN>2</BIN>:Incorrect.\n()||<分支>2</分支><BIN>3</BIN>:Unlocked report.\n()||:Finished.',
    extracted,
  );
  assert.equal(program.complete, true);
  const path = answersPath(program, ['1', '1', '2']);
  assert.deepEqual(
    path.filter((node) => node.kind === 'choice').map((node) => node.id),
    ['quiz:1', 'quiz:1:retry', 'quiz:1:retry'],
  );
  assert.equal(path.filter((node) => node.source?.row === 2).length, 2);
  assert.equal(path.filter((node) => node.source?.row === 3).length, 1);
  assert.equal(path.at(-1).kind, 'end');
});

test('branch joins preserve path state and rejoin once persistent state converges', () => {
  const extracted = {
    backgrounds: {
      1: { name: 'one', color: '#111111' },
      2: { name: 'two', color: '#222222' },
      3: { name: 'common', color: '#333333' },
    },
    portraits: {},
    audio: { A: '/private/gfl1/audio/a.ogg', B: '/private/gfl1/audio/b.ogg' },
  };
  const program = compileScript(
    'join',
    [
      '()||:Choose.<c>A<c>B',
      '()||<分支>1</分支><BIN>1</BIN><BGM>A</BGM>:A',
      '()||<分支>2</分支><BIN>2</BIN><BGM>B</BGM>:B',
      '()||:Join.',
      '()||<黑屏1>:',
      '()||<BIN>3</BIN><BGM>BGM_Empty</BGM>:Converged.',
    ].join('\n'),
    extracted,
  );
  assert.equal(program.complete, true);
  const a = pathFor(program, '1');
  const b = pathFor(program, '2');
  const aJoin = a.find((node) => node.source?.row === 4);
  const bJoin = b.find((node) => node.source?.row === 4);
  assert.notEqual(aJoin.id, bJoin.id);
  assert.equal(program.frames[aJoin.id].bgm, extracted.audio.A);
  assert.equal(program.frames[bJoin.id].bgm, extracted.audio.B);
  assert.equal(program.frames[aJoin.id].background.name, 'one');
  assert.equal(program.frames[bJoin.id].background.name, 'two');
  assert.equal(
    a.find((node) => node.source?.row === 6).id,
    b.find((node) => node.source?.row === 6).id,
  );
  assert.equal(program.sourceRows.length, 6);
});

const manifest = '.cache/gfl1-expanded/extracted.json';
test(
  'every native hotspot subset exposes only its remaining choices with original geometry',
  { skip: !existsSync(manifest) },
  () => {
    const extracted = JSON.parse(readFileSync(manifest, 'utf8'));
    let checked = 0;
    for (const [script, source] of Object.entries(extracted.scripts).filter(
      ([script, source]) =>
        script.startsWith('-58-') && source.includes('<cg>'),
    )) {
      const program = compileScript(script, source, extracted);
      const sourceSpots = program.audit.find(
        (entry) => entry.kind === 'native-exploration-flow',
      )?.sourceSpots;
      assert.ok(sourceSpots.length >= 3);
      for (const node of program.nodes) {
        const interaction = program.frames[node.id]?.interaction;
        if (interaction?.kind !== 'exploration' || !interaction.spots.length)
          continue;
        assert.deepEqual(
          interaction.spots.map((spot) => spot.id),
          node.choices.map((option) => option.id),
        );
        for (const spot of interaction.spots)
          assert.deepEqual(
            spot,
            sourceSpots.find((source) => source.id === spot.id),
          );
        checked++;
      }
    }
    assert.ok(checked > 50);
  },
);
for (const [script, joinRow, options] of [
  ['-54-D-1', 220, ['1', '2', '3']],
  ['-54-D-2', 66, ['1', '2']],
]) {
  test(
    `native ${script} keeps each choice's persistent state at its common continuation`,
    { skip: !existsSync(manifest) },
    () => {
      const extracted = JSON.parse(readFileSync(manifest, 'utf8'));
      const program = compileScript(
        script,
        extracted.scripts[script],
        extracted,
      );
      assert.equal(program.complete, true);
      assert.ok(
        !program.audit.some((entry) => entry.kind === 'ambiguous-branch-state'),
      );
      for (const option of options) {
        const path = pathFor(program, option);
        const index = path.findIndex((node) => node.source?.row === joinRow);
        assert.ok(index > 0);
        const previous = program.frames[path[index - 1].id];
        const joined = program.frames[path[index].id];
        assert.equal(joined.bgm, previous.bgm);
        assert.deepEqual(joined.background, previous.background);
        assert.equal(path.at(-1).kind, 'end');
        // History/bookmarks restore the precise ID, never a default branch frame.
        assert.equal(
          program.nodes.find((node) => node.id === path[index].id),
          path[index],
        );
      }
    },
  );
}

test(
  'native sensitive-site exploration preserves password gates inside the selected room',
  { skip: !existsSync(manifest) },
  () => {
    const extracted = JSON.parse(readFileSync(manifest, 'utf8'));
    const program = compileScript(
      '-58-S1-2',
      extracted.scripts['-58-S1-2'],
      extracted,
    );
    assert.equal(program.complete, true);
    const path = answersPath(program, ['2', '1', 'unlock', '3']);
    const gate = path.find((node) => node.source?.row === 16);
    assert.equal(gate.kind, 'choice');
    assert.equal(
      program.nodes.find((node) => node.id === gate.choices[0].next).source.row,
      17,
    );
    assert.equal(path.filter((node) => node.source?.row === 60).length, 1);
    assert.equal(path.at(-1).kind, 'end');
  },
);

test(
  'native unnumbered dialogue inside exploration stays shared across each selected path',
  { skip: !existsSync(manifest) },
  () => {
    const extracted = JSON.parse(readFileSync(manifest, 'utf8'));
    const program = compileScript(
      '-58-S4-1',
      extracted.scripts['-58-S4-1'],
      extracted,
    );
    assert.equal(program.complete, true);
    const path = answersPath(program, ['3', '1', '2']);
    assert.equal(path.filter((node) => node.source?.row === 14).length, 3);
    assert.equal(path.filter((node) => node.source?.row === 18).length, 1);
    assert.ok(
      program.audit.some(
        (entry) =>
          entry.kind === 'native-shared-exploration-row' && entry.row === 14,
      ),
    );
    assert.equal(path.at(-1).kind, 'end');
  },
);
