import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { compileScript } from './gfl1-story.mjs';

const extracted = {
  backgrounds: {
    9: { name: 'Black', color: '#000000' },
    448: {
      name: 'Avernus platform',
      url: '/private/gfl1/images/platform.webp',
    },
    890: { name: 'William', url: '/private/gfl1/images/william-scene.webp' },
  },
  portraits: {},
  audio: {},
  sfx: {
    AVG_Pistol: '/private/gfl1/audio/pistol.ogg',
    AVG_Tinnitus: '/private/gfl1/audio/tinnitus.ogg',
    AVG_tinnitus_0: '/private/gfl1/audio/tinnitus-final.ogg',
  },
};
const shoot = (manual = '1') =>
  `<ShootPanel>%%shootingCount=1%%picturename=NPC_William_live2d_2_New_Live2D%%path=AVGPicPrefabs%%bgnum=890%%manualCount=${manual}%%waitMotion=-110%%shootMotion=201%%gunShootMotion=203%%gunWaitMotion=-110%%audio=AVG_Pistol-0.2,AVG_Pistol-0.6,AVG_Pistol-1,AVG_Tinnitus-1%%tween=11-0.1,11-0.4,11-0.7,12-1.55</ShootPanel>`;

test('native password gate preserves code, leading zeros, error messages and source dialogue', () => {
  const source =
    "()||<hide_dialogue><InputBox>%%code=UGUIPrefabs/AVG/InputBox%%password=0000%%errormsg=1'密码错误;2'请重新输入%%</InputBox>:Please enter the code.\n()||:The door opens.";
  const result = compileScript('password', source, extracted);
  assert.equal(result.complete, true);
  const gate = result.nodes[0];
  assert.equal(gate.kind, 'choice');
  assert.equal(gate.text.en, 'Please enter the code.');
  assert.deepEqual(gate.choices, [
    {
      id: 'unlock',
      label: { en: 'Unlock', 'zh-CN': 'Unlock' },
      next: 'password:2',
    },
  ]);
  assert.deepEqual(result.frames['password:1'].interaction, {
    kind: 'password',
    password: '0000',
    errorMessages: ['密码错误', '请重新输入'],
    answerId: 'unlock',
    prefab: 'UGUIPrefabs/AVG/InputBox',
  });
  assert.equal(result.sourceRows[0].raw, source.split('\n')[0]);
  assert.equal(result.frames['password:end'].interaction, undefined);
});

test('native shooting gate retains target identity, one-shot gate and exact audio/motion timelines', () => {
  const result = compileScript(
    'shoot',
    `()||<hide_dialogue>${shoot('1,,')}:\n()||:After the shot.`,
    extracted,
  );
  assert.equal(result.complete, true);
  assert.equal(result.nodes[0].kind, 'choice');
  assert.equal(result.nodes[0].choices[0].id, 'fire');
  assert.equal(result.nodes[0].choices[0].next, 'shoot:2');
  const interaction = result.frames['shoot:1'].interaction;
  assert.equal(interaction.kind, 'shoot');
  assert.equal(interaction.count, 1);
  assert.equal(interaction.manualCount, 1);
  assert.equal(interaction.portraitName, 'NPC_William_live2d_2_New_Live2D');
  assert.equal(interaction.portraitPath, 'AVGPicPrefabs');
  assert.deepEqual(interaction.background, extracted.backgrounds[890]);
  assert.deepEqual(
    interaction.audio.map(({ cue, delay }) => [cue, delay]),
    [
      ['AVG_Pistol', 0.2],
      ['AVG_Pistol', 0.6],
      ['AVG_Pistol', 1],
      ['AVG_Tinnitus', 1],
    ],
  );
  assert.ok(
    interaction.audio.every((audio) => audio.url === extracted.sfx[audio.cue]),
  );
  assert.deepEqual(interaction.motions, {
    wait: -110,
    shoot: 201,
    gunShoot: 203,
    gunWait: -110,
  });
  assert.deepEqual(interaction.tweens, [
    { code: 11, delay: 0.1 },
    { code: 11, delay: 0.4 },
    { code: 11, delay: 0.7 },
    { code: 12, delay: 1.55 },
  ]);
  assert.ok(
    result.audit.some((entry) => entry.kind === 'approximate-native-shooting'),
  );
  assert.ok(
    result.audit.some(
      (entry) => entry.repair === 'shooting-manual-count-trailing-commas',
    ),
  );
  assert.ok(result.nodes.every((node) => node.kind !== 'video'));
});

test('shooting references absent from installed media stay explicit rather than becoming demo audio', () => {
  const result = compileScript('missing', `()||${shoot()}:`, {
    ...extracted,
    backgrounds: {},
    sfx: {},
  });
  assert.equal(
    result.frames['missing:1'].interaction.background.name,
    'Missing background 890',
  );
  assert.ok(
    result.frames['missing:1'].interaction.audio.every(
      (audio) => audio.url === undefined,
    ),
  );
  assert.ok(
    result.audit.some(
      (entry) => entry.kind === 'missing-background' && entry.bin === '890',
    ),
  );
  assert.deepEqual(
    result.audit
      .filter((entry) => entry.kind === 'missing-sound')
      .map((entry) => entry.cue)
      .sort(),
    ['AVG_Pistol', 'AVG_Tinnitus'],
  );
});

test('shooting presentation uses native models and background without changing subsequent source snapshots', () => {
  const native = {
    target: {
      modelUrl: '/private/gfl1/live2d/target/model3.json',
      motions: { 201: { group: 'Combo', index: 0 } },
    },
    gun: {
      modelUrl: '/private/gfl1/live2d/gun/model3.json',
      motions: { 203: { group: 'Combo', index: 2 } },
    },
    provenance: { internal: 'source records remain in extraction report' },
    assets: [
      '/private/gfl1/live2d/target/model.moc3',
      '/private/gfl1/live2d/gun/texture.png',
    ],
  };
  const result = compileScript(
    'models',
    `()||<BIN>9</BIN>:Before.\n()||${shoot()}:\n()||:After.`,
    { ...extracted, shooting: { NPC_William_live2d_2_New_Live2D: native } },
  );
  assert.equal(result.complete, true);
  assert.deepEqual(result.frames['models:2'].interaction.models, {
    target: native.target,
    gun: native.gun,
    assets: native.assets,
  });
  assert.deepEqual(
    result.frames['models:2'].background,
    extracted.backgrounds[890],
  );
  assert.deepEqual(result.frames['models:2'].actors, []);
  assert.deepEqual(
    result.frames['models:3'].background,
    extracted.backgrounds[9],
  );
});

test('malformed and mixed interactive grammar blocks at the exact source row', () => {
  for (const source of [
    '()||<InputBox>%%password=0000%%:Missing closing tag.',
    '()||<InputBox>%%code=InputBox%%</InputBox>:Missing password.',
    '()||<ShootPanel>%%shootingCount=NaN%%</ShootPanel>:',
    '()||<true>5</true>:Question<r>A<r>B',
    '()||:Question<t>A<r>B',
    '()||<t></t><branchstyle>UnknownLayout</branchstyle>:Inspect<cg>0,0',
    '()||<t></t><branchstyle>BranchLabel</branchstyle>:Inspect<cg>NaN,0',
  ]) {
    const result = compileScript('invalid', source, extracted);
    assert.equal(result.complete, false, source);
    assert.equal(result.nodes[0].kind, 'unsupported', source);
    assert.ok(
      result.audit.some((entry) => entry.kind === 'unsupported-interaction'),
      source,
    );
    assert.equal(result.sourceRows[0].raw, source);
  }
});

const sourcePath = (script) =>
  new URL(`../.cache/gfl1/scripts/${script}.txt`, import.meta.url);
test(
  'installed interactive source payloads preserve quiz keys, hotspot geometry and shooting gates',
  { skip: !existsSync(sourcePath('-58-S1-1')) },
  () => {
    const hotspots = compileScript(
      '-58-S1-1',
      readFileSync(sourcePath('-58-S1-1'), 'utf8'),
      extracted,
    );
    const spatial = hotspots.frames['-58-S1-1:15'].interaction;
    assert.equal(spatial.kind, 'exploration');
    assert.equal(
      spatial.tips,
      'Click the magnifying glass to perform Sensitive Intel Extraction',
    );
    assert.deepEqual(spatial.spots, [
      { id: '1', x: -300, y: 300 },
      { id: '2', x: 300, y: 0 },
      { id: '3', x: 480, y: -150 },
      { id: '4', x: -480, y: -120 },
    ]);
    const textual = compileScript(
      '-58-S1-2',
      readFileSync(sourcePath('-58-S1-2'), 'utf8'),
      extracted,
    );
    assert.equal(textual.frames['-58-S1-2:9'].interaction.kind, 'exploration');
    assert.deepEqual(textual.frames['-58-S1-2:9'].interaction.spots, []);
    assert.equal(textual.frames['-58-S1-2:16'].interaction.password, '0000');
    const quiz = compileScript(
      '-68-S-1',
      readFileSync(sourcePath('-68-S-1'), 'utf8'),
      extracted,
    );
    assert.deepEqual(quiz.frames['-68-S-1:4'].interaction, {
      kind: 'quiz',
      correctAnswerId: '3',
    });
    const shooting = compileScript(
      '-77-A-44',
      readFileSync(sourcePath('-77-A-44'), 'utf8'),
      extracted,
    );
    assert.deepEqual(
      [41, 53, 69].map(
        (row) => shooting.frames[`-77-A-44:${row}`].interaction.count,
      ),
      [1, 1, 1],
    );
    assert.equal(
      shooting.frames['-77-A-44:69'].interaction.audio.at(-1).cue,
      'AVG_tinnitus_0',
    );
  },
);
