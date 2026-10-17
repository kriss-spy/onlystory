import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  catalogEntries,
  decodeScenario,
  masterUrl,
  sha256,
} from './pjsk-scenario.mjs';
import { createSourceCache, importPjsk } from './pjsk-import.mjs';
import { compilePjskEpisode, collectPjskCostumes } from './pjsk-program.mjs';

function fixture() {
  return {
    ScenarioId: 'sample',
    FirstBackground: 'room',
    FirstBgm: 'bgm00000',
    FirstLayout: [],
    AppearCharacters: [{ Character2dId: 1, CostumeType: 'costume' }],
    Snippets: [
      { Action: 6, ReferenceIndex: 0, Delay: 0.25, ProgressBehavior: 0 },
      { Action: 1, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 1 },
      { Action: 4, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 0 },
    ],
    TalkData: [
      {
        Body: 'Line\nTwo',
        WindowDisplayName: 'Speaker',
        Voices: [{ VoiceId: 'voice', Volume: 0.5 }],
        Motions: [{ MotionName: 'talk', FacialName: 'smile' }],
        RequirePlaySound: 1,
        SoundReferenceIdx: 0,
      },
    ],
    LayoutData: [
      {
        Type: 0,
        Character2dId: 1,
        CostumeType: '',
        MotionName: 'wave',
        FacialName: 'happy',
      },
    ],
    SpecialEffectData: [
      { EffectType: 24, StringVal: 'Opening', StringValSub: 'opening_voice' },
    ],
    SoundData: [{ PlayMode: 0, Bgm: 'music', Se: 'se00001' }],
    NeedBundleNames: ['scenario/background/room'],
  };
}
const master = [
  {
    unit: 'idol',
    chapters: [
      {
        chapterNo: 1,
        assetbundleName: 'bundle',
        episodes: [
          { id: 1, episodeNo: 1, title: 'Opening', scenarioId: 'sample' },
        ],
      },
    ],
  },
];

test('preserves native timing, narration, voices, inline sound, motion and raw source', () => {
  const source = fixture();
  const result = decodeScenario(source, 'sample');
  assert.deepEqual(
    result.timeline.map((item) => item.snippet),
    source.Snippets,
  );
  assert.deepEqual(result.source, source);
  assert.equal(result.transcript[0].kind, 'fullscreen');
  assert.equal(result.transcript[0].voices[0].VoiceId, 'opening_voice');
  assert.equal(result.transcript[1].text, 'Line\nTwo');
  assert.ok(result.dependencies.some((item) => item.reference === 'wave'));
  assert.ok(result.dependencies.some((item) => item.reference === 'music'));
  assert.ok(!result.dependencies.some((item) => item.reference === 'bgm00000'));
  assert.ok(
    result.dependencies.every((item) =>
      ['unverified', 'unresolved'].includes(item.status),
    ),
  );
  assert.equal(result.playbackReady, false);
});

test('rejects broken references, wrong scenario identity and invalid timing', () => {
  for (const mutate of [
    (s) => {
      s.Snippets[1].ReferenceIndex = 9;
    },
    (s) => {
      s.Snippets[1].Delay = -1;
    },
    (s) => {
      s.Snippets[1].ProgressBehavior = 2;
    },
    (s) => {
      s.TalkData[0].SoundReferenceIdx = 9;
    },
    (s) => {
      s.ScenarioId = 'wrong';
    },
  ]) {
    const source = fixture();
    mutate(source);
    assert.throws(() => decodeScenario(source, 'sample'));
  }
});

test('retains malformed source voice IDs as unresolved instead of guessing a repair', () => {
  const source = fixture();
  source.TalkData[0].Voices[0].VoiceId = 'voice_id ';
  const result = decodeScenario(source, 'sample');
  const voice = result.dependencies.find(
    (item) => item.reference === 'voice_id ',
  );
  assert.equal(voice.status, 'unresolved');
  assert.equal(voice.candidatePath, null);
  assert.ok(
    result.issues.some((item) => item.code === 'invalid-media-reference'),
  );
  assert.equal(result.transcript[1].voices[0].VoiceId, 'voice_id ');
});

test('retains unknown commands and flags interaction and unknown effect semantics', () => {
  const source = fixture();
  source.Snippets.push(
    ...[99, 3, 5, 6].map((Action) => ({
      Action,
      ReferenceIndex: 0,
      Delay: 0,
      ProgressBehavior: 0,
      futureData: 'retained',
    })),
  );
  source.SpecialEffectData[0].EffectType = 99;
  const result = decodeScenario(source, 'sample');
  assert.ok(result.issues.some((issue) => issue.code === 'unknown-action'));
  assert.ok(result.issues.some((issue) => issue.code === 'unknown-effect'));
  assert.equal(
    result.issues.filter((issue) => issue.code === 'interaction-required')
      .length,
    2,
  );
  assert.equal(result.timeline.at(-1).snippet.futureData, 'retained');
});

test('uses metadata bundle paths for units and events, validates IDs and regions', () => {
  assert.equal(
    catalogEntries(master, 'cn', 'unit')[0].path,
    'scenario/unitstory/bundle/sample.asset',
  );
  const events = [
    {
      eventId: 10,
      assetbundleName: 'event_10',
      eventStoryEpisodes: master[0].chapters[0].episodes,
    },
  ];
  assert.equal(
    catalogEntries(events, 'jp', 'event')[0].path,
    'event_story/event_10/scenario/sample.asset',
  );
  assert.match(masterUrl('jp', 'unit'), /sekai-master-db-diff\/main/);
  assert.throws(() => masterUrl('xx', 'unit'));
  const invalid = structuredClone(master);
  invalid[0].chapters[0].episodes[0].scenarioId = '../outside';
  assert.throws(() => catalogEntries(invalid, 'cn', 'unit'));
  invalid[0].chapters[0].episodes[0].scenarioId = 'sample';
  invalid[0].chapters[0].episodes[0].id = '../outside';
  assert.throws(() => catalogEntries(invalid, 'cn', 'unit'));
});

async function workspace(t) {
  const root = await mkdtemp(resolve(tmpdir(), 'onlystory-pjsk-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    cacheDir: resolve(root, 'cache'),
    outputDir: resolve(root, 'packages'),
    scenario: 'sample',
  };
}

test('playback compiler partitions all native commands and restores hidden characters', () => {
  const source = fixture();
  source.TalkData[0].RequirePlaySound = 0;
  source.FirstLayout = [
    { Character2dId: 1, CostumeType: 'costume', PositionSide: 4, OffsetX: 0 },
  ];
  source.LayoutData.push({
    Type: 3,
    Character2dId: 1,
    SideTo: 3,
    CostumeType: '',
    MotionName: '',
    FacialName: '',
  });
  source.Snippets.push({
    Action: 2,
    ReferenceIndex: 1,
    Delay: 0,
    ProgressBehavior: 1,
  });
  source.Snippets.push({
    Action: 4,
    ReferenceIndex: 0,
    Delay: 0,
    ProgressBehavior: 0,
  });
  const scenario = decodeScenario(source, 'sample');
  const program = compilePjskEpisode(
    {
      entry: { id: 'episode', title: 'Title', region: 'cn' },
      scenario,
      report: { sources: [{ sha256: 'hash' }] },
    },
    { models: { costume: {} } },
  );
  assert.deepEqual(
    program.steps.flatMap((step) =>
      step.commands.map((command) => command.index),
    ),
    [0, 1, 2, 3, 4],
  );
  assert.equal(program.steps.at(-1).kind, 'end');
  assert.equal(program.steps.at(-1).after.characters['1'].visible, false);
  assert.equal(program.steps[0].before.characters['1'].visible, true);
  assert.equal(program.steps[0].commands[0].delay, 0.25);
  assert.equal(program.sourceCommands, source.Snippets.length);
});

test('playback compiler rejects recognized but unimplemented source effects', () => {
  const source = fixture();
  source.SpecialEffectData[0].EffectType = 17;
  const scenario = decodeScenario(source, 'sample');
  assert.deepEqual(scenario.issues, []);
  assert.throws(
    () => compilePjskEpisode({ entry: {}, scenario }, { models: {} }),
    /Unimplemented PJSK effect 17/,
  );
});

test('playback installation rejects overlapping dialogue voices until supported', () => {
  const source = fixture();
  source.TalkData[0].Voices.push({ VoiceId: 'second_voice', Volume: 1 });
  const scenario = decodeScenario(source, 'sample');
  assert.throws(
    () => compilePjskEpisode({ entry: {}, scenario }, { models: {} }),
    /overlapping dialogue voices/,
  );
});

test('compiler retains inline effect and sound records in their native dialogue command', () => {
  const source = fixture();
  source.LayoutData = [];
  source.Snippets = [source.Snippets[1]];
  source.TalkData[0].RequirePlayEffect = 1;
  source.TalkData[0].EffectReferenceIdx = 0;
  source.SpecialEffectData[0] = { EffectType: 13, Duration: 0.5 };
  const program = compilePjskEpisode(
    {
      entry: { id: 'episode' },
      scenario: decodeScenario(source, 'sample'),
      report: { sources: [{ sha256: 'hash' }] },
    },
    { models: {} },
  );
  const command = program.steps[0].commands[0];
  assert.equal(command.action, 1);
  assert.deepEqual(command.effects, source.SpecialEffectData);
  assert.deepEqual(command.sounds, source.SoundData);
  assert.equal(program.steps[0].after.ambient, 'evening');
  assert.equal(program.steps[0].after.music, 'music');
  assert.equal(program.sourceCommands, 1);
});

test('compiler preserves three-model layout, bottom entrances and depth-only changes', () => {
  const source = fixture();
  source.FirstCharacterLayoutMode = 3;
  source.TalkData[0].RequirePlaySound = 0;
  source.FirstLayout = [
    { Character2dId: 1, CostumeType: 'costume', PositionSide: 3 },
  ];
  source.LayoutData = [
    {
      Type: 2,
      Character2dId: 1,
      CostumeType: '',
      SideFrom: 9,
      SideTo: 3,
      SideToOffsetX: 192,
      DepthType: 0,
    },
    { Type: 6, Character2dId: 1, CostumeType: '', DepthType: 2 },
  ];
  source.Snippets = [
    { Action: 2, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 0 },
    { Action: 2, ReferenceIndex: 1, Delay: 0, ProgressBehavior: 0 },
    { Action: 1, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 1 },
  ];
  const program = compilePjskEpisode(
    {
      entry: { id: 'episode' },
      scenario: decodeScenario(source, 'sample'),
      report: { sources: [{ sha256: 'hash' }] },
    },
    { models: { costume: {} } },
  );
  assert.equal(program.steps[0].before.layoutMode, 3);
  assert.equal(program.steps[0].commands[0].state.characters['1'].fromY, 735);
  assert.equal(program.steps[0].after.characters['1'].x, 448);
  assert.equal(program.steps[0].after.characters['1'].y, 15);
  assert.equal(program.steps[0].after.characters['1'].depth, 2);
});

test('compiler exposes choice and movie boundaries and restores persistent effects and sound', () => {
  const source = fixture();
  source.SpecialEffectData = [
    { EffectType: 23, StringVal: 'First / Second', Duration: 0 },
    { EffectType: 42, StringVal: '150, -75', Duration: 1 },
    { EffectType: 43, StringVal: '1.25', Duration: 1 },
    { EffectType: 44, StringVal: 'true', Duration: 0 },
    { EffectType: 22, StringVal: 'hologram', IntVal: 1, Duration: 0 },
    { EffectType: 15, StringVal: 'rain_07', Duration: 0 },
    { EffectType: 34, StringVal: '', Duration: 1 },
    { EffectType: 19, StringVal: 'original_movie', Duration: 0 },
  ];
  source.SoundData = [
    { PlayMode: 2, Se: 'se00001', Volume: 0.5 },
    { PlayMode: 4, Bgm: '', Volume: 0.25 },
    { PlayMode: 3, Se: 'se00001', Volume: 1 },
  ];
  source.Snippets = [
    ...source.SpecialEffectData.map((_, ReferenceIndex) => ({
      Action: 6,
      ReferenceIndex,
      Delay: 0,
      ProgressBehavior: 0,
    })),
    ...source.SoundData.map((_, ReferenceIndex) => ({
      Action: 7,
      ReferenceIndex,
      Delay: 0,
      ProgressBehavior: 0,
    })),
    { Action: 1, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 1 },
  ];
  source.TalkData[0].RequirePlaySound = 0;
  const scenario = decodeScenario(source, 'sample');
  const program = compilePjskEpisode(
    {
      entry: { id: 'episode' },
      scenario,
      report: { sources: [{ sha256: 'hash' }] },
    },
    { models: {} },
  );
  assert.equal(program.steps[0].kind, 'choice');
  assert.deepEqual(program.steps[0].choices, ['First', 'Second']);
  assert.equal(program.steps[1].kind, 'video');
  assert.equal(program.steps[1].movie, 'original_movie');
  assert.deepEqual(program.steps[1].after.camera, {
    x: 100,
    y: -50,
    zoom: 1.25,
  });
  assert.equal(program.steps[1].after.blur, true);
  assert.equal(program.steps[1].after.characterShaders['1'], 'hologram');
  assert.deepEqual(program.steps[1].after.scenarioEffects, ['rain_07']);
  assert.deepEqual(program.steps[1].after.curtain, {
    color: 'black',
    alpha: 1,
    wipe: 'top',
  });
  const commands = program.steps[2].commands;
  assert.deepEqual(commands[0].state.loopingSounds, { se00001: 0.5 });
  assert.equal(commands[1].state.musicVolume, 0.25);
  assert.deepEqual(commands[2].state.loopingSounds, {});
  assert.equal(
    program.steps.flatMap((step) => step.commands).length,
    source.Snippets.length,
  );
});

test('native performances require original audio and remain explicit continuation boundaries', () => {
  const source = fixture();
  source.TalkData[0].RequirePlaySound = 0;
  source.SpecialEffectData = [
    { EffectType: 37, StringVal: '', StringValSub: '', IntVal: 2, Duration: 0 },
  ];
  source.Snippets = [
    { Action: 6, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 1 },
    { Action: 1, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 1 },
  ];
  const pkg = {
    entry: { id: 'episode' },
    scenario: decodeScenario(source, 'sample'),
    report: { sources: [{ sha256: 'hash' }] },
  };
  assert.deepEqual(pkg.scenario.issues, []);
  assert.throws(
    () => compilePjskEpisode(pkg, { models: {} }),
    /Missing original song/,
  );
  const program = compilePjskEpisode(pkg, {
    models: {},
    performances: { 2: { url: '/song.mp3' } },
  });
  assert.equal(program.steps[0].kind, 'video');
  assert.equal(program.steps[0].performance, 2);
  assert.equal(program.steps[0].commands[0].record.IntVal, 2);
  assert.equal(program.steps.at(-1).kind, 'end');
});

test('native BGM block requests preserve full-score identity and explicit block state', () => {
  const source = fixture();
  source.FirstBgm = 'bgm90003';
  source.TalkData[0].RequirePlaySound = 0;
  source.SoundData = [
    { PlayMode: 6, Bgm: 'bgm90003', BgmBlockIndex: 0, Volume: 1 },
    { PlayMode: 6, Bgm: '', BgmBlockIndex: 6, Volume: 1 },
  ];
  source.Snippets = [
    { Action: 7, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 0 },
    { Action: 1, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 1 },
    { Action: 7, ReferenceIndex: 1, Delay: 0, ProgressBehavior: 0 },
    { Action: 1, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 1 },
  ];
  const program = compilePjskEpisode(
    {
      entry: { id: 'episode' },
      scenario: decodeScenario(source, 'sample'),
      report: { sources: [{ sha256: 'hash' }] },
    },
    { models: {} },
  );
  assert.equal(program.steps[0].after.music, 'bgm90003');
  assert.equal(program.steps[0].after.bgmBlockIndex, 0);
  assert.equal(program.steps[1].after.music, 'bgm90003');
  assert.equal(program.steps[1].after.bgmBlockIndex, 6);
  assert.deepEqual(program.steps[1].commands[0].record, source.SoundData[1]);
});

test('main-story legend lights persist until their native stop command', () => {
  const source = fixture();
  source.SpecialEffectData = [
    { EffectType: 15, StringVal: 'light_up_legend_02', Duration: 0 },
    { EffectType: 16, StringVal: 'light_up_legend_02', Duration: 0 },
  ];
  source.Snippets = [
    { Action: 6, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 0 },
    { Action: 1, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 1 },
    { Action: 6, ReferenceIndex: 1, Delay: 0, ProgressBehavior: 0 },
  ];
  const program = compilePjskEpisode(
    {
      entry: { id: 'episode' },
      scenario: decodeScenario(source, 'sample'),
      report: { sources: [{ sha256: 'hash' }] },
    },
    { models: {} },
  );
  assert.deepEqual(program.steps[0].after.scenarioEffects, [
    'light_up_legend_02',
  ]);
  assert.deepEqual(program.steps.at(-1).after.scenarioEffects, []);
  assert.equal(
    program.steps[0].commands[0].record,
    source.SpecialEffectData[0],
  );
  assert.equal(
    program.steps.at(-1).commands[0].record,
    source.SpecialEffectData[1],
  );
});

test('native motion commands retain current costume and route tracks only to that costume', () => {
  const source = fixture();
  source.TalkData[0].RequirePlaySound = 0;
  source.TalkData[0].Motions = [{ Character2dId: 1, MotionName: 'first-talk' }];
  source.AppearCharacters.push({ Character2dId: 1, CostumeType: 'second' });
  source.LayoutData = [
    { Type: 2, Character2dId: 1, CostumeType: 'costume', MotionName: 'first' },
    {
      Type: 0,
      Character2dId: 1,
      CostumeType: '\\',
      MotionName: 'current-motion',
    },
    {
      Type: 2,
      Character2dId: 1,
      CostumeType: 'second',
      MotionName: 'second-only',
    },
  ];
  source.Snippets = [0, 1, 2].flatMap((ReferenceIndex) => [
    { Action: 4, ReferenceIndex, Delay: 0, ProgressBehavior: 0 },
    { Action: 1, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 1 },
  ]);
  const required = collectPjskCostumes(source);
  assert.deepEqual([...required.keys()], ['costume', 'second']);
  assert.deepEqual(
    [...required.get('costume').motions],
    ['first', 'first-talk', 'current-motion'],
  );
  assert.deepEqual(
    [...required.get('second').motions],
    ['second-only', 'first-talk'],
  );
  const pkg = {
    entry: {},
    scenario: decodeScenario(source, 'sample'),
    report: { sources: [{ sha256: 'hash' }] },
  };
  const media = { models: { costume: {}, second: {} } };
  const program = compilePjskEpisode(pkg, media);
  assert.equal(program.steps[1].after.characters['1'].costume, 'costume');
  assert.equal(program.steps[1].commands[0].record.CostumeType, '\\');
  source.Snippets = source.Snippets.slice(2);
  assert.throws(
    () =>
      compilePjskEpisode(
        { ...pkg, scenario: decodeScenario(source, 'sample') },
        media,
      ),
    /Missing costume/,
  );
});

test('archive effect snapshots preserve memory, monitor and horizontal wipe commands', () => {
  const source = fixture();
  source.TalkData[0].RequirePlaySound = 0;
  source.SpecialEffectData = [26, 27, 28, 29, 30, 31, 32].map((EffectType) => ({
    EffectType,
    Duration: 0.2,
  }));
  source.SpecialEffectData.push({
    EffectType: 22,
    IntVal: 1,
    StringVal: 'monitor',
  });
  source.Snippets = source.SpecialEffectData.flatMap((_, ReferenceIndex) => [
    { Action: 6, ReferenceIndex, Delay: 0, ProgressBehavior: 0 },
    { Action: 1, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 1 },
  ]);
  const scenario = decodeScenario(source, 'sample');
  scenario.issues = [];
  const program = compilePjskEpisode(
    {
      entry: { scenarioId: 'canonical' },
      scenario,
      report: { sources: [{ sha256: 'hash' }] },
    },
    { models: {} },
  );
  assert.equal(program.scenarioId, 'canonical');
  assert.equal(program.steps[0].id, 'canonical:1');
  assert.equal(source.ScenarioId, 'sample');
  assert.equal(program.steps[0].commands[0].record.EffectType, 26);
  assert.equal(program.steps[1].after.memory, true);
  assert.equal(program.steps[2].after.memory, false);
  assert.deepEqual(
    program.steps.slice(3, 7).map((s) => s.after.curtain),
    [
      { color: 'black', alpha: 0, wipe: 'right' },
      { color: 'black', alpha: 1, wipe: 'left' },
      { color: 'black', alpha: 0, wipe: 'left' },
      { color: 'black', alpha: 1, wipe: 'right' },
    ],
  );
  assert.equal(program.steps[7].after.characterShaders['1'], 'monitor');
});

test('adaptive BGM requests preserve raw control without muting the full score', () => {
  const source = fixture();
  source.TalkData[0].RequirePlaySound = 0;
  source.FirstBgm = 'bgm90001';
  source.SoundData = [
    { PlayMode: 5, Bgm: 'bgm90001', Volume: 0, Duration: 0.5 },
  ];
  source.Snippets = [
    { Action: 7, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 0 },
    { Action: 1, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 1 },
  ];
  const program = compilePjskEpisode(
    {
      entry: {},
      scenario: decodeScenario(source, 'sample'),
      report: { sources: [{ sha256: 'hash' }] },
    },
    { models: {} },
  );
  assert.equal(program.steps[0].after.music, 'bgm90001');
  assert.equal(program.steps[0].after.musicVolume, 1);
  assert.deepEqual(program.steps[0].after.bgmControl, {
    mode: 5,
    bgm: 'bgm90001',
    volume: 0,
    duration: 0.5,
  });
  assert.deepEqual(program.steps[0].commands[0].record, source.SoundData[0]);
});

test('unknown named overlays require original media and stop at the native removal', () => {
  const source = fixture();
  source.TalkData[0].RequirePlaySound = 0;
  source.SpecialEffectData = [15, 16].map((EffectType) => ({
    EffectType,
    StringVal: 'original_overlay',
  }));
  source.Snippets = [
    { Action: 6, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 0 },
    { Action: 1, ReferenceIndex: 0, Delay: 0, ProgressBehavior: 1 },
    { Action: 6, ReferenceIndex: 1, Delay: 0, ProgressBehavior: 0 },
  ];
  const pkg = {
    entry: {},
    scenario: decodeScenario(source, 'sample'),
    report: { sources: [{ sha256: 'hash' }] },
  };
  assert.throws(
    () => compilePjskEpisode(pkg, { models: {} }),
    /Unimplemented scenario overlay/,
  );
  const program = compilePjskEpisode(pkg, {
    models: {},
    effectAssets: {
      original_overlay: { kind: 'image', textures: ['/original.webp'] },
    },
  });
  assert.deepEqual(program.steps[0].after.scenarioEffects, [
    'original_overlay',
  ]);
  assert.deepEqual(program.steps.at(-1).after.scenarioEffects, []);
});

test('online import and offline replay produce identical packages and verify checksums', async (t) => {
  const options = await workspace(t);
  let calls = 0;
  const fetcher = async (url) => {
    calls++;
    return new Response(
      JSON.stringify(url.endsWith('unitStories.json') ? master : fixture()),
    );
  };
  const online = await importPjsk({ ...options, fetcher });
  const first = await readFile(online.outputPath, 'utf8');
  assert.equal(calls, 2);
  await importPjsk({
    ...options,
    offline: true,
    fetcher: () => {
      throw new Error('Unexpected network');
    },
  });
  assert.equal(await readFile(online.outputPath, 'utf8'), first);
  const output = JSON.parse(first);
  assert.equal(sha256(output.rawScenario), output.report.sources[1].sha256);
  const sourceFile = resolve(
    options.outputDir,
    output.report.sources[1].cacheFile,
  );
  await writeFile(sourceFile, '{}');
  await assert.rejects(
    importPjsk({ ...options, offline: true }),
    /checksum mismatch/,
  );
  assert.equal(await readFile(online.outputPath, 'utf8'), first);
  await importPjsk({ ...options, refresh: true, fetcher });
  assert.equal(calls, 4);
});

test('explicit source identity binding verifies CN and JP provenance without changing raw source', async (t) => {
  const options = await workspace(t);
  const source = fixture();
  source.ScenarioId = 'original';
  const bytes = JSON.stringify(source);
  const sourceUrl =
    'https://storage.sekai.best/sekai-cn-assets/scenario/unitstory/bundle/sample.asset';
  const referenceUrl = sourceUrl.replace('sekai-cn-assets', 'sekai-jp-assets');
  const binding = {
    scenarioId: 'sample',
    sourceScenarioId: 'original',
    sourceUrl,
    sourceSha256: sha256(bytes),
    referenceUrl,
    referenceSha256: sha256(bytes),
    voiceIdsSha256: sha256(JSON.stringify(['voice'])),
  };
  const fetcher = async (url) =>
    new Response(
      url.endsWith('unitStories.json') ? JSON.stringify(master) : bytes,
    );
  await assert.rejects(
    importPjsk({ ...options, fetcher }),
    /Scenario ID mismatch/,
  );
  const imported = await importPjsk({
    ...options,
    fetcher,
    identityBinding: binding,
  });
  const pkg = JSON.parse(await readFile(imported.outputPath, 'utf8'));
  assert.equal(pkg.entry.scenarioId, 'sample');
  assert.equal(pkg.scenario.scenarioId, 'sample');
  assert.equal(pkg.scenario.source.ScenarioId, 'original');
  assert.equal(pkg.rawScenario, bytes);
  assert.deepEqual(pkg.report.sourceIdentity, binding);
  assert.equal(pkg.report.sources.length, 3);
  const playable = { ...pkg, scenario: { ...pkg.scenario, issues: [] } };
  // The last record is the JP identity evidence, not the native CN source.
  playable.report = {
    ...pkg.report,
    sourceIdentity: { ...binding, sourceSha256: 'cn-source-hash' },
    sources: [
      ...pkg.report.sources.slice(0, -1),
      { sha256: 'jp-reference-hash' },
    ],
  };
  assert.equal(
    compilePjskEpisode(playable, { models: { costume: {} } }).sourceHash,
    'cn-source-hash',
  );
  await assert.rejects(
    importPjsk({
      ...options,
      offline: true,
      identityBinding: { ...binding, voiceIdsSha256: '0'.repeat(64) },
    }),
    /Source identity evidence mismatch/,
  );
  await assert.rejects(
    importPjsk({
      ...options,
      offline: true,
      identityBinding: { ...binding, sourceSha256: '0'.repeat(64) },
    }),
    /Invalid source identity binding/,
  );
});

test('404 and malformed JSON fail without publishing; no region fallback', async (t) => {
  const options = await workspace(t);
  let calls = 0;
  await assert.rejects(
    importPjsk({
      ...options,
      fetcher: async () => {
        calls++;
        return new Response('missing', { status: 404 });
      },
    }),
    /HTTP 404/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    importPjsk({
      ...options,
      fetcher: async () => new Response('<html>error</html>'),
    }),
    SyntaxError,
  );
  await assert.rejects(readdir(options.outputDir), { code: 'ENOENT' });
  await assert.rejects(importPjsk({ ...options, offline: true }), /not cached/);
  assert.throws(() =>
    createSourceCache(options.cacheDir, { offline: true, refresh: true }),
  );
});

test('invalid scenario does not overwrite an existing successful package', async (t) => {
  const options = await workspace(t);
  let scenario = fixture();
  const fetcher = async (url) =>
    new Response(
      JSON.stringify(url.endsWith('unitStories.json') ? master : scenario),
    );
  const result = await importPjsk({ ...options, fetcher });
  const before = await readFile(result.outputPath, 'utf8');
  scenario = fixture();
  scenario.Snippets[1].ReferenceIndex = 100;
  await assert.rejects(
    importPjsk({ ...options, refresh: true, fetcher }),
    /Invalid TalkData reference/,
  );
  assert.equal(await readFile(result.outputPath, 'utf8'), before);
});
