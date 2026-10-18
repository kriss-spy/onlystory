import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { compileBaScenes } from './ba-scenes.mjs';
import { compileStory } from './ba-story.mjs';
import {
  TextureAtlas,
  AtlasAttachmentLoader,
  SkeletonBinary,
} from '@esotericsoftware/spine-webgl';

test('authored main-story timeline remains a declared barrier with its exact source path', () => {
  // Official group 13280 row 2; retain its native Unity scene identity.
  const path = 'ScCutScene/ScCutScene_13000_01';
  const source = {
    GroupId: 77,
    content: [
      {
        GroupId: 77,
        ScriptKr: `#timelineNS;${path}`,
        TextJp: '',
        SelectionGroup: 0,
      },
    ],
  };
  const chapter = compileStory(source, { DataList: [] });
  const node = chapter.nodes.find((node) => node.source?.row === 0);
  assert.ok(node.scene.autoAdvance);
  assert.equal(node.text.ja, '');
  const assets = { version: 1, region: 'JP', characters: {} };
  assert.throws(
    () => compileBaScenes(source, chapter, assets),
    /Missing BA cutscene capability declaration/,
  );
  const reason =
    'The original native Unity 3D scene requires an unavailable renderer.';
  const program = compileBaScenes(source, chapter, {
    ...assets,
    cutscenes: { [path]: { supported: false, reason } },
  });
  assert.deepEqual(program.warnings, [
    { type: 'unsupported-cutscene', row: 0, path, reason },
  ]);
  assert.equal(program.steps[0].rows[0].ScriptKr, source.content[0].ScriptKr);
});

test('keeps leading, middle and trailing branch commands on the selected path', () => {
  const row = (ScriptKr, TextJp = '', SelectionGroup = 0) => ({
    GroupId: 77,
    ScriptKr,
    TextJp,
    SelectionGroup,
  });
  const source = {
    GroupId: 77,
    content: [
      row('[s1] A\n[s2] B', '[s1] A\n[s2] B'),
      row('#wait;10', '', 1),
      row('#na;A', 'A', 1),
      row('#wait;20', '', 1),
      row('#na;AA', 'AA', 1),
      row('#wait;30', '', 1),
      row('#wait;40', '', 2),
      row('#na;B', 'B', 2),
      row('#wait;50', '', 2),
      row('#wait;60'),
      row('#na;join', 'join'),
      // Numbered response labels are local to the immediately following blocks.
      row('[s1] C\n[s2] D', '[s1] C\n[s2] D'),
      row('#na;C', 'C', 1),
      row('#na;D', 'D', 2),
      row('#na;end', 'end'),
    ],
  };
  const chapter = compileStory(source, { DataList: [] });
  const program = compileBaScenes(source, chapter, {
    version: 1,
    region: 'JP',
    characters: {},
  });
  const byId = new Map(program.steps.map((step) => [step.id, step]));
  assert.deepEqual(
    byId.get('77:2').rows.map((r) => r.row),
    [1, 2],
  );
  assert.deepEqual(
    byId.get('77:4').rows.map((r) => r.row),
    [3, 4],
  );
  assert.deepEqual(
    byId.get('77:4').afterRows.map((r) => r.row),
    [5],
  );
  assert.deepEqual(
    byId.get('77:7').rows.map((r) => r.row),
    [6, 7],
  );
  assert.deepEqual(
    byId.get('77:7').afterRows.map((r) => r.row),
    [8],
  );
  assert.deepEqual(
    byId.get('77:10').rows.map((r) => r.row),
    [9, 10],
  );
  assert.equal(chapter.nodes.find((node) => node.id === '77:4').next, '77:10');
  assert.equal(chapter.nodes.find((node) => node.id === '77:7').next, '77:10');
  assert.deepEqual(
    chapter.nodes
      .find((node) => node.id === '77:11')
      .choices.map((choice) => choice.next),
    ['77:12', '77:13'],
  );
  const play = (ids) =>
    ids
      .flatMap((id) => [
        ...byId.get(id).rows,
        ...(byId.get(id).afterRows ?? []),
      ])
      .map((r) => r.row);
  assert.deepEqual(
    play(['77:0', '77:2', '77:4', '77:10']),
    [0, 1, 2, 3, 4, 5, 9, 10],
  );
  assert.deepEqual(play(['77:0', '77:7', '77:10']), [0, 6, 7, 8, 9, 10]);
});

const root = new URL('../public/private/ba-jp/11000/', import.meta.url);
const read = async (name) =>
  JSON.parse(await fs.readFile(new URL(name, root), 'utf8'));
test('requires packaged emotion art and rejects unknown visual effects before publishing', () => {
  const source = { content: [{ ScriptKr: '#3;em;[땀]' }] };
  const chapter = {
    id: 'ba-jp-event',
    nodes: [{ id: 'event:0', source: { row: 0 } }],
  };
  const assets = {
    version: 1,
    region: 'JP',
    characters: {},
    emotions: {
      Emoji_Sweat_1: '/sweat.png',
      Emoji_Sweat_2: '/sweat-small.png',
    },
  };
  assert.equal(compileBaScenes(source, chapter, assets).steps.length, 1);
  assert.throws(
    () => compileBaScenes(source, chapter, { ...assets, emotions: {} }),
    /Missing BA emotion/,
  );
  source.content[0].ScriptKr = '#3;em;[unknown]';
  assert.throws(
    () => compileBaScenes(source, chapter, assets),
    /Unsupported BA emotion/,
  );
  source.content[0].ScriptKr = '#3;fx;{unknown}';
  assert.throws(
    () => compileBaScenes(source, chapter, assets),
    /Unsupported BA actor effect/,
  );
  source.content[0] = { ScriptKr: '', PopupFileName: 'popup' };
  assert.throws(
    () => compileBaScenes(source, chapter, assets),
    /Missing BA popup/,
  );
  source.content[0] = { ScriptKr: '', Transition: 1 };
  assert.throws(
    () =>
      compileBaScenes(source, chapter, {
        ...assets,
        transitions: { 1: { TransitionIn: '1', TransitionOut: 'fade' } },
      }),
    /Unsupported BA TransitionIn/,
  );
});
let available = true;
try {
  await fs.access(new URL('assets.json', root));
} catch {
  available = false;
}
test(
  'real prologue accounts for every source row and validates every packaged byte',
  { skip: !available },
  async () => {
    const [source, names, assets] = await Promise.all(
      ['source.json', 'characters.json', 'assets.json'].map(read),
    );
    const chapter = compileStory(source, names);
    const program = compileBaScenes(source, chapter, assets);
    assert.deepEqual(
      program.steps.flatMap((s) => s.rows.map((r) => r.row)),
      source.content.map((_, i) => i),
    );
    assert.equal(Object.keys(assets.voices).length, 118);
    assert.equal(Object.keys(assets.characters).length, 6);
    for (const file of assets.files) {
      const bytes = await fs.readFile(
        new URL('../public' + file.url, import.meta.url),
      );
      assert.equal(bytes.length, file.bytes, file.url);
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        file.sha256,
        file.url,
      );
    }
    for (const [name, asset] of Object.entries(assets.characters)) {
      const atlas = new TextureAtlas(
        await fs.readFile(
          new URL('../public' + asset.atlas, import.meta.url),
          'utf8',
        ),
      );
      const skeleton = new SkeletonBinary(
        new AtlasAttachmentLoader(atlas),
      ).readSkeletonData(
        await fs.readFile(
          new URL('../public' + asset.skeleton, import.meta.url),
        ),
      );
      assert.ok(skeleton.findAnimation('Idle_01'), name);
      for (const row of source.content)
        for (const line of row.ScriptKr.split('\n')) {
          const parts = line.split(';');
          if (
            /^[1-5]$/.test(parts[0]) &&
            parts[1] === name &&
            /^\d\d$/.test(parts[2])
          )
            assert.ok(skeleton.findAnimation(parts[2]), `${name}: ${parts[2]}`);
        }
    }
    const missing = structuredClone(assets);
    delete missing.backgrounds[source.content.find((r) => r.BGName).BGName];
    assert.throws(
      () => compileBaScenes(source, chapter, missing),
      /Missing BA BGName/,
    );
    const unknown = structuredClone(source);
    unknown.content[0].BGEffect = 123;
    assert.throws(
      () => compileBaScenes(unknown, chapter, assets),
      /Unsupported BA background effect/,
    );
  },
);
