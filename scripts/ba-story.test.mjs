import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileStory } from './ba-story.mjs';
import { scriptNameHash } from './ba-script-name.mjs';

const row = (ScriptKr, TextJp = '', SelectionGroup = 0) => ({
  GroupId: 11000,
  ScriptKr,
  TextJp,
  SelectionGroup,
});
const source = () => ({
  GroupId: 11000,
  content: [
    row('#wait;500'),
    row('#na;start', '開始'),
    row('[s1] A\n[s2] B', '[s1] はい\n[s2] いいえ'),
    row('3;린;01;A', 'A', 1),
    row('3;린;01;B', 'B', 2),
    row('#na;join', '合流'),
  ],
});
const names = { DataList: [{ NameKR: '린', NameJP: 'リン' }] };
test('resolves official script aliases by their hashed identifier without borrowing a duplicate name', () => {
  assert.equal(scriptNameHash(''), 0x02cc5d05);
  assert.equal(scriptNameHash('a'), 0x550d7456);
  const characters = {
    DataList: [
      {
        CharacterName: scriptNameHash('이즈나 무소속'),
        NameKR: '이즈나',
        NameJP: 'イズナ',
      },
      {
        CharacterName: scriptNameHash('other'),
        NameKR: '이즈나',
        NameJP: 'different alias',
      },
    ],
  };
  const chapter = compileStory(
    {
      GroupId: 11000,
      content: [row('3;이즈나 무소속;01;hello', 'こんにちは')],
    },
    characters,
  );
  assert.equal(chapter.nodes[0].speaker, 'イズナ');
});
test('keeps the official nested reply shape and command-only branches distinct', () => {
  const chapter = compileStory(
    {
      GroupId: 11000,
      content: [
        row('[s1] yes\n[s2] no', '[s1] はい\n[s2] いいえ'),
        row('#na;A', 'A', 1),
        row('#na;B', 'B', 2),
        row('[s3] joking', '[s3] 冗談だよ', 2),
        row('#na;C', 'C', 3),
        row('#na;join', 'join'),
        row('[s1] next\n[s2] other', '[s1] 次\n[s2] 他'),
        row('#wait;100', '', 1),
        row('#wait;100', '', 2),
        row('#na;end', 'end'),
      ],
    },
    names,
  );
  const byId = new Map(chapter.nodes.map((node) => [node.id, node]));
  assert.equal(byId.get('11000:1').next, '11000:5');
  assert.equal(byId.get('11000:2').next, '11000:3');
  assert.equal(byId.get('11000:3').choices[0].next, '11000:4');
  assert.equal(byId.get('11000:4').next, '11000:5');
  for (const index of [7, 8]) {
    assert.equal(byId.get(`11000:${index}`).scene.autoAdvance, true);
    assert.equal(byId.get(`11000:${index}`).next, '11000:9');
  }
  assert.equal(chapter.coverage.commandRows, 2);
});
test('retains an empty-text event movie cue as a playable passage', () => {
  const chapter = compileStory(
    { GroupId: 11000, content: [row('#video;10000')] },
    names,
  );
  assert.equal(chapter.nodes[0].kind, 'video');
  assert.equal(chapter.nodes[0].id, '11000:0');
  assert.equal(chapter.nodes[0].next, '11000:end');
});
test('retains a remote nested reply without playing its sibling response block', () => {
  const chapter = compileStory(
    {
      GroupId: 11000,
      content: [
        row('[s3] A\n[s4] B', '[s3] A\n[s4] B'),
        row('#na;A', 'A', 3),
        row('[s5] C', '[s5] C', 3),
        row('#na;B', 'B', 4),
        row('#all;hide', '', 4),
        row('#all;hide', '', 5),
        row('#na;join', 'join'),
      ],
    },
    names,
  );
  const byId = new Map(chapter.nodes.map((node) => [node.id, node]));
  assert.equal(byId.get('11000:2').choices[0].next, '11000:5');
  assert.equal(byId.get('11000:3').next, '11000:6');
  assert.equal(byId.get('11000:5').next, '11000:6');
});
test('preserves touch gates, alternate movie cues and deliberate blank Japanese typing cells', () => {
  const chapter = compileStory(
    {
      GroupId: 11000,
      content: [
        row('#st;[-1000,445];instant;90;우', ' '),
        row('#fx;AronaTouch;0;0\n#touch;-361;203;300;300'),
        row('#videons2;11001', '#videons2;11001'),
        row('#NA;린;hello', 'こんにちは'),
      ],
    },
    names,
  );
  assert.equal(chapter.rows[0].kind, 'command');
  assert.equal(chapter.nodes[0].id, '11000:1');
  assert.equal(chapter.nodes[0].scene.autoAdvance, true);
  assert.equal(chapter.nodes[1].kind, 'video');
  assert.equal(chapter.nodes[2].speaker, 'リン');
});
test('uses event group identity and retains title cards and intermediate actor positions', () => {
  const data = {
    GroupId: 10038005,
    content: [
      {
        ...row('#title;프롤로그;축제를 준비합시다!', 'プロローグ;祭りの準備'),
        GroupId: 10038005,
      },
      { ...row('3;린;01;A\n#3;m2\n#2;m4', 'A'), GroupId: 10038005 },
    ],
  };
  const chapter = compileStory(data, names);
  assert.equal(chapter.id, 'ba-jp-10038005');
  assert.equal(chapter.entryNodeId, '10038005:0');
  assert.equal(chapter.retainedCommands['#title'], 1);
  assert.equal(chapter.retainedCommands['#actor;m2'], 1);
  assert.equal(chapter.retainedCommands['#actor;m4'], 1);
});
test('retains source-row accounting and routes each response to the join', () => {
  const story = compileStory(source(), names);
  assert.deepEqual(story.coverage, {
    sourceRows: 6,
    textRows: 4,
    choices: 1,
    commandRows: 1,
  });
  assert.equal(story.rows.length, 6);
  assert.equal(story.rows[0].kind, 'command');
  assert.deepEqual(
    story.nodes[1].choices.map((c) => c.next),
    ['11000:3', '11000:4'],
  );
  assert.equal(story.nodes[2].next, '11000:5');
  assert.equal(story.nodes[3].next, '11000:5');
  assert.equal(story.nodes[2].speaker, 'リン');
  assert.equal(story.nodes.at(-1).kind, 'end');
});
test('preserves single response prompts as clickable choices without inventing branches', () => {
  for (const tag of ['s', 'ns']) {
    const data = {
      GroupId: 11000,
      content: [row(`[${tag}] A`, `[${tag}] A`), row('#na;join', '合流')],
    };
    const story = compileStory(data, names);
    assert.equal(story.nodes[0].kind, 'choice');
    assert.equal(story.nodes[0].choices[0].next, '11000:1');
    assert.equal(story.nodes[0].choices[0].label.ja, 'A');
  }
});
test('rejects missing translations, unknown flow, unknown speakers and orphan groups', () => {
  for (const [change, message] of [
    [
      (s) => {
        s.content[3].TextJp = '';
      },
      /untranslated/,
    ],
    [
      (s) => {
        s.content[1].ScriptKr = '#jump;50';
      },
      /control flow/,
    ],
    [
      (s) => {
        s.content[3].ScriptKr = '3;unknown;01;A';
      },
      /unresolved speaker/,
    ],
    [
      (s) => {
        s.content[5].SelectionGroup = 9;
      },
      /branch|orphan/,
    ],
    [
      (s) => {
        s.content[3].SelectionGroup = 0;
      },
      /missing response/,
    ],
    [
      (s) => {
        s.content[1].TextJp = '';
      },
      /untranslated dialogue/,
    ],
    [
      (s) => {
        s.content[0].ScriptKr = '#newFlow;50';
      },
      /unsupported command/,
    ],
    [
      (s) => {
        s.content[0].ScriptKr = '#3;unknownAction';
      },
      /unsupported command/,
    ],
  ]) {
    const data = source();
    change(data);
    assert.throws(() => compileStory(data, names), message);
  }
});
