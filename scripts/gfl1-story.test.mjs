import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { compileScript } from './gfl1-story.mjs';

const extracted = {
  backgrounds: {
    8: { name: 'Control room', url: '/private/gfl1/images/control.webp' },
    9: { name: 'black', color: '#000000' },
  },
  portraits: {
    Kalina: [
      { url: '/private/gfl1/images/kalina0.webp' },
      { url: '/private/gfl1/images/kalina1.webp' },
    ],
    Helian: [{ url: '/private/gfl1/images/helian.webp' }],
  },
  audio: { Room: '/private/gfl1/audio/room.ogg' },
};

test('Valhalla drink outcomes keep both native responses reachable and rejoin once', () => {
  const source = [
    '()||:Choose.<va11><perfect>21<good>5,6',
    '()||<分支>1</分支>:Preferred.',
    '()||<分支>2</分支>:Alternative.',
    '()||:Together again.',
  ].join('\n');
  const program = compileScript('VA11_test', source, extracted);
  assert.equal(program.complete, true);
  const menu = program.nodes[0];
  assert.equal(menu.kind, 'choice');
  assert.deepEqual(
    menu.choices.map((c) => c.next),
    ['VA11_test:2', 'VA11_test:3'],
  );
  assert.equal(program.nodes[1].next, 'VA11_test:4');
  assert.equal(program.nodes[2].next, 'VA11_test:4');
  assert.equal(menu.text.en, 'Choose.');
  assert.equal(program.sourceRows[0].raw, source.split('\n')[0]);
  assert.deepEqual(
    program.audit.find((a) => a.kind === 'approximate-drink-selection').good,
    ['5', '6'],
  );
});

test('Valhalla requests without an alternative have one serve action and malformed requests block', () => {
  const program = compileScript(
    'bar',
    '()||:Serve.<va11><perfect>1\n()||<分支>1</分支>:Thanks.\n()||:After.',
    extracted,
  );
  assert.equal(program.complete, true);
  assert.equal(program.nodes[0].choices.length, 1);
  for (const tag of [
    '<va11><perfect>999',
    '<perfect>1',
    '<va11><perfect>1<good>x',
  ]) {
    assert.equal(
      compileScript('bad', '()||:Serve.' + tag, extracted).complete,
      false,
    );
  }
});

test('collaboration text effects remain audited without leaking commands into dialogue', () => {
  const program = compileScript(
    'division',
    '()||<BIN>9</BIN>:Snow.<下雪></下雪>\n()||:Clear.<火焰销毁></火焰销毁>',
    extracted,
  );
  assert.equal(program.complete, true);
  assert.equal(program.nodes[0].text.en, 'Snow.');
  assert.equal(program.nodes[1].text.en, 'Clear.');
  assert.ok(
    program.audit.some(
      (a) => a.kind === 'approximate-visual-effect' && a.command === '下雪',
    ),
  );
  assert.deepEqual(program.frames['division:1'].effects, ['snow']);
  assert.equal(program.frames['division:2'].effects, undefined);
  assert.equal(
    compileScript('future', '()||:Unknown.<未来效果>', extracted).complete,
    false,
  );
});

test('legacy main-story visual cues preserve all dialogue with explicit unavailable-effect provenance', () => {
  for (const command of ['拉伸', '平移', '打海猫2', '开火']) {
    const program = compileScript(
      'legacy',
      `()||<${command}>:Before.\n()||:After.`,
      extracted,
    );
    assert.equal(program.complete, true);
    assert.equal(program.nodes.at(-2).text.en, 'After.');
    assert.deepEqual(program.frames['legacy:1'].nativeEffects, [
      { code: command },
    ]);
    assert.ok(
      program.audit.some(
        (entry) =>
          entry.kind === 'unavailable-native-effect' && entry.code === command,
      ),
    );
  }
});

test('an absent native background retains its name and audit without serializing a null asset URL', () => {
  const program = compileScript(
    'missing',
    '()||<BIN>252</BIN>:Original dialogue.',
    {
      ...extracted,
      backgrounds: { 252: { name: 'TEAPARTYNIGHT', url: null } },
    },
  );
  assert.equal(program.complete, true);
  assert.deepEqual(program.frames['missing:1'].background, {
    name: 'TEAPARTYNIGHT',
  });
  assert.ok(
    program.audit.some(
      (entry) => entry.kind === 'missing-background' && entry.bin === '252',
    ),
  );
});

test('native gameplay terrain sits underneath the White shade and terminal blackout persists at the end', () => {
  const input = {
    ...extracted,
    backgrounds: {
      ...extracted.backgrounds,
      10: {
        name: 'White',
        url: '/private/gfl1/images/shade.webp',
        color: '#ffffff',
      },
    },
    gameplayBackgrounds: {
      map: { name: 'Chapter1_Y', url: '/private/gfl1/images/map.webp' },
    },
  };
  const map = compileScript(
    'map',
    'Kalina(0)||<BIN>8</BIN>:Before.\nKalina(0)||<BIN>10</BIN>:On the map.\nKalina(1)||:Still on the map.',
    input,
  );
  assert.equal(
    map.frames['map:2'].contextBackground?.url,
    '/private/gfl1/images/map.webp',
  );
  assert.equal(
    map.frames['map:3'].contextBackground?.url,
    '/private/gfl1/images/map.webp',
  );
  assert.equal(
    map.frames['map:2'].background.url,
    '/private/gfl1/images/shade.webp',
  );
  const final = compileScript(
    'final',
    'Kalina(0)||<BIN>8</BIN><黑屏1>:Last dialogue.\n()||<黑点2><BIN>10</BIN>:',
    input,
  );
  assert.equal(
    final.frames['final:2'].contextBackground.url,
    '/private/gfl1/images/control.webp',
  );
  assert.equal(final.frames['final:2'].blackout.color, '#000000');
  assert.equal(final.frames['final:end'].blackout.duration, 0);
  assert.equal(final.frames['final:1'].blackout, undefined);
  const revealed = compileScript(
    'revealed',
    'Kalina(0)||<BIN>8</BIN><黑点1><黑点2>:Still visible.\n()||<黑点2><BIN>10</BIN>:',
    input,
  );
  assert.equal(revealed.frames['revealed:2'].blackout, undefined);
});
test('source rows, expression arrays, plus breaks and state survive a history seek', () => {
  const result = compileScript(
    '1-1-1',
    '\uFEFF()||<BIN>8</BIN><BGM>Room</BGM>:At base.\r\nKalina(1)<Speaker>Kalina</Speaker>;Helian(0)<通讯框>||:Hello:+Commander.\r\nKalina(0)<Speaker>Kalina</Speaker>||:Ready?\r\n()||<BGM>BGM_Empty</BGM><BIN>9</BIN>:Finished.',
    extracted,
  );
  assert.equal(result.complete, true);
  assert.equal(result.nodes.length, 5);
  assert.equal(result.nodes[1].text.en, 'Hello:\nCommander.');
  assert.equal(result.nodes[1].source.row, 2);
  assert.equal(
    result.frames['1-1-1:2'].background.url,
    '/private/gfl1/images/control.webp',
  );
  assert.equal(
    result.frames['1-1-1:2'].actors[0].url,
    '/private/gfl1/images/kalina1.webp',
  );
  assert.equal(result.frames['1-1-1:2'].actors[1].communication, true);
  assert.equal(result.frames['1-1-1:2'].bgm, '/private/gfl1/audio/room.ogg');
  assert.equal(result.nodes[3].bgm, undefined);
  assert.equal(result.nodes[4].kind, 'end');
  assert.equal(result.nodes[3].kind, 'text');
  assert.equal(result.nodes[3].next, '1-1-1:end');
});
test('unknown control flow stops instead of flattening branches into story order', () => {
  const result = compileScript(
    'branch',
    '()||:Before.\n()||<Choice>1</Choice>:Select.\n()||:Unchosen branch.',
    extracted,
  );
  assert.equal(result.complete, false);
  assert.deepEqual(
    result.nodes.map((n) => n.kind),
    ['text', 'unsupported'],
  );
  assert.equal(result.audit[0].commands[0], 'Choice');
  assert.ok(!result.nodes.some((n) => n.kind === 'end'));
});
test('empty expression labels draw no guessed portrait and missing assets stay explicit', () => {
  const result = compileScript(
    'test',
    'Unknown()<Speaker>Name</Speaker>||:No portrait.\nMissing(3)||<BIN>999</BIN><BGM>Absent</BGM>:Missing.',
    extracted,
  );
  assert.deepEqual(result.frames['test:1'].actors, []);
  assert.deepEqual(
    result.audit.map((a) => a.kind).sort(),
    ['missing-background', 'missing-bgm', 'missing-portrait'].sort(),
  );
});
test('malformed source stops and records the original row', () => {
  const result = compileScript(
    'bad',
    'A row without the required delimiters',
    extracted,
  );
  assert.equal(result.complete, false);
  assert.equal(result.nodes[0].kind, 'unsupported');
  assert.equal(result.audit[0].raw, 'A row without the required delimiters');
});

test('map communication retains illustrated context without replacing ordinary white scenes', () => {
  const input = {
    ...extracted,
    backgrounds: {
      ...extracted.backgrounds,
      10: { name: 'White', color: '#ffffff' },
    },
    communication: {
      frameUrl: '/private/gfl1/images/frame.webp',
      markerUrl: '/private/gfl1/images/marker.webp',
    },
  };
  const result = compileScript(
    'call',
    '()||<BIN>8</BIN>:At base.\nKalina(1)<通讯框>||<BIN>10</BIN>:Calling.\n()||:White scene.',
    input,
  );
  assert.equal(result.frames['call:2'].background.color, '#ffffff');
  assert.equal(
    result.frames['call:2'].contextBackground.url,
    extracted.backgrounds[8].url,
  );
  assert.equal(result.frames['call:3'].contextBackground, undefined);
  assert.deepEqual(result.communication, input.communication);
});

test('sound effects are onset events, not persistent snapshots or end-card replays', () => {
  const result = compileScript(
    'sound',
    '()||<SE1>Gunfight</SE1>:Fight.\n()||:After.',
    { ...extracted, sfx: { Gunfight: '/private/gfl1/audio/Gunfight.ogg' } },
  );
  assert.deepEqual(result.frames['sound:1'].sounds, [
    {
      channel: 'SE1',
      cue: 'Gunfight',
      url: '/private/gfl1/audio/Gunfight.ogg',
      action: 'play',
    },
  ]);
  assert.equal(result.frames['sound:2'].sounds, undefined);
  assert.deepEqual(result.frames['sound:end'].sounds, []);
  assert.ok(!result.audit.some((entry) => entry.kind === 'missing-sound'));
});

test('interleaved numbered branch rows follow the selected answer and rejoin common text', () => {
  const result = compileScript(
    'branch',
    [
      '()||:Question?<c>First<c>Second',
      '()||<分支>1</分支>:A1',
      '()||<分支>2</分支>:B1',
      '()||<分支>1</分支>:A2',
      '()||<分支>2</分支>:B2',
      '()||:Together.',
    ].join('\n'),
    extracted,
  );
  assert.equal(result.complete, true);
  assert.equal(result.nodes[0].kind, 'choice');
  assert.deepEqual(
    result.nodes[0].choices.map((choice) => choice.next),
    ['branch:2', 'branch:3'],
  );
  assert.equal(result.nodes[1].next, 'branch:4');
  assert.equal(result.nodes[2].next, 'branch:5');
  assert.equal(result.nodes[3].next, 'branch:6');
  assert.equal(result.nodes[4].next, 'branch:6');
  assert.equal(result.nodes[0].next, undefined);
});

test('choices without numbered responses converge immediately and missing paths skip other options', () => {
  const result = compileScript(
    'converge',
    [
      '()||:Question?<c>One<c>Two',
      '()||:Common answer.',
      '()||:Again?<c>One<c>Two',
      '()||<分支>2</分支>:Only answer two.',
      '()||:Common ending.',
    ].join('\n'),
    extracted,
  );
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.nodes[0].choices.map((choice) => choice.next),
    ['converge:2', 'converge:2'],
  );
  assert.deepEqual(
    result.nodes[2].choices.map((choice) => choice.next),
    ['converge:5', 'converge:4'],
  );
});

test('branch snapshots inherit from their own predecessor rather than another option', () => {
  const result = compileScript(
    'state',
    [
      '()||<BIN>8</BIN>:Choose<c>A<c>B',
      '()||<分支>1</分支><BIN>9</BIN>:Black A.',
      '()||<分支>2</分支>:Control room B.',
      '()||<BIN>8</BIN>:Common room.',
    ].join('\n'),
    extracted,
  );
  assert.equal(result.complete, true);
  assert.equal(result.frames['state:2'].background.name, 'black');
  assert.equal(result.frames['state:3'].background.name, 'Control room');
  assert.equal(result.frames['state:4'].background.name, 'Control room');
});

test('persistent branch joins retain their states while orphan or invalid branches fail closed', () => {
  const divergent = compileScript(
    'badjoin',
    [
      '()||<BIN>8</BIN>:Choose<c>A<c>B',
      '()||<分支>1</分支><BIN>9</BIN>:Black A.',
      '()||<分支>2</分支>:Control room B.',
      '()||:Ambiguous background.',
    ].join('\n'),
    extracted,
  );
  assert.equal(divergent.complete, true);
  assert.ok(
    divergent.audit.some((entry) => entry.kind === 'branch-state-variant'),
  );
  for (const text of [
    '()||<分支>1</分支>:Orphan.',
    '()||:Pick<c>Only\n()||<分支>2</分支>:Invalid.',
  ]) {
    const result = compileScript('invalid', text, extracted);
    assert.equal(result.complete, false);
    assert.ok(
      result.audit.some((entry) => entry.kind === 'unsupported-branch'),
    );
  }
});

test('source ordered repeated commands replace state and retain each sound play and stop', () => {
  const result = compileScript(
    'ordered',
    '()||<BIN>9</BIN><BIN>8</BIN><BGM>Room</BGM><BGM>BGM_Empty</BGM><SE1>Gunfight</SE1><SE2>Gunfight</SE2><SE1>Empty</SE1><SE1>Gunfight</SE1>:Hi.',
    { ...extracted, sfx: { Gunfight: '/private/gfl1/audio/Gunfight.ogg' } },
  );
  const frame = result.frames['ordered:1'];
  assert.equal(frame.background.name, 'Control room');
  assert.equal(frame.bgm, undefined);
  assert.deepEqual(
    frame.commands.map((command) => command.name),
    ['BIN', 'BIN', 'BGM', 'BGM', 'SE1', 'SE2', 'SE1', 'SE1'],
  );
  assert.deepEqual(
    frame.sounds.map(({ channel, action }) => [channel, action]),
    [
      ['SE1', 'play'],
      ['SE2', 'play'],
      ['SE1', 'stop'],
      ['SE1', 'play'],
    ],
  );
});

test('only verified looping effects persist in seek snapshots and explicit stops clear them', () => {
  const result = compileScript(
    'loop',
    [
      '()||<SE1>Ambient</SE1>:Loop.',
      '()||:Continues.',
      '()||<SE1>Gunfight</SE1>:Replacement.',
      '()||<SE1>Ambient</SE1><SE2>Ambient</SE2>:Both channels.',
      '()||<SE1>SE_Empty</SE1>:Stop one.',
    ].join('\n'),
    {
      ...extracted,
      sfx: {
        Ambient: '/private/gfl1/audio/ambient.ogg',
        Gunfight: '/private/gfl1/audio/Gunfight.ogg',
      },
      audioProvenance: [
        { kind: 'sfx', cue: 'Ambient', loop: { start: 0, end: 44100 } },
      ],
    },
  );
  assert.equal(result.frames['loop:1'].sounds[0].loop, true);
  assert.equal(result.frames['loop:2'].activeSounds[0].cue, 'Ambient');
  assert.deepEqual(result.frames['loop:3'].activeSounds, []);
  assert.equal(result.frames['loop:4'].activeSounds.length, 2);
  assert.deepEqual(
    result.frames['loop:5'].activeSounds.map((sound) => sound.channel),
    ['SE2'],
  );
  assert.deepEqual(result.frames['loop:end'].activeSounds, []);
});

test('actor positions, scale, night, memory and sparks remain explicit on seek frames', () => {
  const result = compileScript(
    'visual',
    [
      'Kalina(1)<Position>0,50</Position><position>0,250</position><Grey><Shake>||<Night><回忆><火花><边框>2</边框>:Memory.',
      'Kalina(0)||:Memory continues without row-local night or position.',
      '()||<关闭蒙版><火花关闭>:Clear.',
    ].join('\n'),
    extracted,
  );
  const first = result.frames['visual:1'];
  assert.deepEqual(
    [first.actors[0].x, first.actors[0].y, first.actors[0].scale],
    [0, 250, 1],
  );
  assert.equal(first.actors[0].grey, true);
  assert.equal(first.actors[0].shake, true);
  assert.equal(first.night, true);
  assert.equal(first.mask, 'memory');
  assert.equal(first.sparks, true);
  assert.equal(first.border, 2);
  assert.equal(result.frames['visual:2'].mask, 'memory');
  assert.equal(result.frames['visual:2'].sparks, true);
  assert.equal(result.frames['visual:2'].night, false);
  assert.equal(result.frames['visual:2'].actors[0].y, 0);
  assert.equal(result.frames['visual:3'].mask, undefined);
  assert.equal(result.frames['visual:3'].sparks, false);
});

test('flash montages resolve nested CG and grouped portrait dependencies and retain timings', () => {
  const result = compileScript(
    'montage',
    '()||<闪屏><duration>5</duration><rate>10</rate><delay>2</delay><Pic>[Kalina(0)&Helian(0)],[Kalina(1)]</Pic><CG>8,9</CG></闪屏>:Montage.',
    extracted,
  );
  assert.deepEqual(result.frames['montage:1'].flash.backgrounds, [
    extracted.backgrounds[8],
    extracted.backgrounds[9],
  ]);
  assert.deepEqual(
    result.frames['montage:1'].flash.portraits.map((actors) =>
      actors.map((actor) => actor.name),
    ),
    [['Kalina', 'Helian'], ['Kalina']],
  );
  assert.deepEqual(
    [
      result.frames['montage:1'].flash.duration,
      result.frames['montage:1'].flash.rate,
      result.frames['montage:1'].flash.delay,
    ],
    [5, 10, 2],
  );
  assert.ok(result.audit.some((entry) => entry.kind === 'approximate-flash'));
});

test('formatted dialogue and option labels remain readable with styling retained and audited', () => {
  const result = compileScript(
    'format',
    '()||:<color=#00CCFF>Call <size=55>now</size>.</color>+Then wait.<c><color=#FFFF00>Yes</color><c>No',
    extracted,
  );
  assert.equal(result.nodes[0].text.en, 'Call now.\nThen wait.');
  assert.equal(result.nodes[0].choices[0].label.en, 'Yes');
  assert.ok(
    result.frames['format:1'].textRuns.some(
      (run) => run.text === 'now' && run.color === '#00CCFF' && run.size === 55,
    ),
  );
  assert.ok(
    result.audit.some((entry) => entry.kind === 'approximate-text-style'),
  );
});

test('source accounting retains blank-line offsets and rows after an unsupported command', () => {
  const result = compileScript(
    'source',
    '\n()||:Before.\n\n()||<Unknown>:Blocked.\n()||:Archived after.',
    extracted,
  );
  assert.deepEqual(
    result.sourceRows.map((row) => row.row),
    [2, 4, 5],
  );
  assert.equal(result.sourceRows.at(-1).raw, '()||:Archived after.');
  assert.deepEqual(
    result.nodes.map((node) => node.id),
    ['source:2', 'source:4'],
  );
  assert.equal(result.nodes[0].next, 'source:4');
});

const corpusPath = new URL('../.cache/gfl1/extracted.json', import.meta.url);
const corpus = existsSync(corpusPath)
  ? JSON.parse(readFileSync(corpusPath, 'utf8'))
  : null;
const eventScripts = Object.keys(corpus?.scripts ?? {}).filter((script) =>
  script.startsWith('-'),
);

function assertClosedGraph(result, label) {
  const byId = new Map(result.nodes.map((node) => [node.id, node]));
  const visited = new Set();
  function visit(id) {
    assert.ok(byId.has(id), `${label}: broken link ${id}`);
    if (visited.has(id)) return;
    visited.add(id);
    const node = byId.get(id);
    for (const next of node.choices?.map((choice) => choice.next) ??
      (node.next ? [node.next] : []))
      visit(next);
    assert.ok(!/<[^>]*>/.test(node.text.en), `${id}: raw formatting`);
  }
  visit(result.nodes[0].id);
  assert.equal(visited.size, result.nodes.length, `${label}: unreachable rows`);
  if (!result.complete) {
    assert.equal(result.nodes.at(-1).kind, 'unsupported', label);
    assert.ok(!result.nodes.some((node) => node.kind === 'end'), label);
    assert.equal(result.nodes.at(-1).next, undefined, label);
  }
}

test('expanded transforms preserve native scales, invisible flags, lighting and gradient fields', () => {
  const result = compileScript(
    'actors',
    [
      'Kalina(1)<Speaker>Kalina</Speaker><Scale>1.4</Scale><GradientShow>2</GradientShow><Delay>0.5</Delay>;Helian(0)<同时置暗>||:Together.',
      'Kalina#隐身(0)<Speaker>Kalina</Speaker>;Helian(0)<同时点亮>||:Invisible narrator.',
      'Kalina(0)<GradientHide>3</GradientHide>||:Goodbye.',
    ].join('\n'),
    extracted,
  );
  assert.equal(result.complete, true);
  assert.equal(result.frames['actors:1'].actors[0].scale, 1.4);
  assert.equal(result.frames['actors:1'].actors[0].delay, 0.5);
  assert.deepEqual(result.frames['actors:1'].actors[0].fade, {
    kind: 'in',
    duration: 2,
  });
  assert.ok(
    result.frames['actors:1'].actors.every(
      (actor) => actor.opacity === 0.55 && !actor.active,
    ),
  );
  assert.equal(result.frames['actors:2'].actors[0].name, 'Kalina');
  assert.equal(
    result.frames['actors:2'].actors[0].url,
    extracted.portraits.Kalina[0].url,
  );
  assert.equal(result.frames['actors:2'].actors[0].opacity, 0);
  assert.equal(result.frames['actors:2'].actors[1].opacity, 1);
  assert.deepEqual(result.frames['actors:3'].actors[0].fade, {
    kind: 'out',
    duration: 3,
  });
});

test('native movement and controlled shake parameters persist as finite seek snapshots', () => {
  const result = compileScript(
    'motion',
    [
      '()||<bg_move>%%pivot_x=0.43%%pivot_y=0.57%%scale=1.2%%duration=2%%</bg_move><controll_shake>%%type_id=2%%duration=4%%delay=0.1%%range=8</controll_shake>:Moving.',
      '()||:Same camera position.',
      '()||<bg_move>%%pivot_x=0.5%%pivot_y=0.5%%scale=1%%duration=0%%</bg_move>:Reset camera.',
    ].join('\n'),
    extracted,
  );
  assert.equal(result.complete, true);
  assert.deepEqual(result.frames['motion:1'].backgroundMove, {
    pivotX: 0.43,
    pivotY: 0.57,
    scale: 1.2,
    duration: 2,
  });
  assert.deepEqual(
    result.frames['motion:2'].backgroundMove,
    result.frames['motion:1'].backgroundMove,
  );
  assert.deepEqual(result.frames['motion:1'].controlledShake, {
    typeId: 2,
    duration: 4,
    delay: 0.1,
    range: 8,
  });
  assert.equal(result.frames['motion:1'].shake, true);
  assert.equal(result.frames['motion:2'].controlledShake, undefined);
  assert.equal(result.frames['motion:3'].backgroundMove.scale, 1);
});

test('native prefabs and named credits remain explicit unavailable effects without invented videos', () => {
  const result = compileScript(
    'native',
    [
      '()||<narrator><common_effect>%%code=NoiseVideo%%wait=1%%</common_effect>:A report.',
      '()||<hide_dialogue><名单2>2021Summer_Credit</名单2>:',
    ].join('\n'),
    extracted,
  );
  assert.equal(result.complete, true);
  assert.equal(result.frames['native:1'].narrator, true);
  assert.deepEqual(result.frames['native:1'].nativeEffects, [
    { code: 'NoiseVideo', wait: true },
  ]);
  assert.equal(result.frames['native:2'].hideDialogue, true);
  assert.ok(result.nodes.every((node) => node.kind !== 'video'));
  assert.ok(
    result.audit.some(
      (entry) =>
        entry.kind === 'unavailable-native-effect' &&
        entry.code === 'NoiseVideo',
    ),
  );
  assert.ok(
    result.audit.some(
      (entry) =>
        entry.kind === 'unavailable-native-credits' &&
        entry.reference === '2021Summer_Credit',
    ),
  );
});

test('Stop_AVG_loop emits a stop rather than requesting an audio file', () => {
  const result = compileScript(
    'stop',
    '()||<SE1>Stop_AVG_loop</SE1>:Stopped.',
    extracted,
  );
  assert.equal(result.complete, true);
  assert.deepEqual(result.frames['stop:1'].sounds, [
    { channel: 'SE1', action: 'stop', cue: 'Stop_AVG_loop' },
  ]);
  assert.ok(!result.audit.some((entry) => entry.kind === 'missing-sound'));
});

test('BGM_PAUSE silences music until a new cue and retains an explicit pause approximation audit', () => {
  const result = compileScript(
    'pause',
    [
      '()||<BGM>Room</BGM>:Playing.',
      '()||<BGM>BGM_PAUSE</BGM>:Paused.',
      '()||:Still paused.',
      '()||<BGM>Room</BGM>:New music cue.',
    ].join('\n'),
    extracted,
  );
  assert.equal(result.complete, true);
  assert.equal(result.frames['pause:1'].bgm, extracted.audio.Room);
  assert.equal(result.frames['pause:2'].bgm, undefined);
  assert.equal(result.frames['pause:3'].bgm, undefined);
  assert.equal(result.nodes[1].bgm, undefined);
  assert.equal(result.nodes[2].bgm, undefined);
  assert.equal(result.frames['pause:4'].bgm, extracted.audio.Room);
  assert.ok(
    result.audit.some(
      (entry) => entry.row === 2 && entry.kind === 'approximate-audio-pause',
    ),
  );
  assert.ok(!result.audit.some((entry) => entry.kind === 'missing-bgm'));
});

test('known source defects are repaired with original row evidence and unknown malformed rows remain blocked', () => {
  const fullwidth = compileScript(
    'format',
    '()||<BIN>9</BIN><黑屏1>：',
    extracted,
  );
  assert.equal(fullwidth.complete, true);
  assert.equal(
    fullwidth.audit.find((entry) => entry.kind === 'source-format-repair')
      .repair,
    'fullwidth-metadata-delimiter',
  );
  const shake = compileScript(
    'shake',
    '()||<controll_shake>%%type_id=2%%duration=5%%delay=0.1%%range=10/controll_shake>:Moving.',
    extracted,
  );
  assert.equal(shake.complete, true);
  assert.equal(shake.frames['shake:1'].controlledShake.range, 10);
  assert.ok(shake.sourceRows[0].raw.includes('range=10/controll_shake>'));
  const rows = Array.from(
    { length: 10 },
    () => 'Kalina(0)<Speaker>Kalina</Speaker>||:Before.',
  );
  rows.push('They got stuck with a pack of liars instead.');
  const continuation = compileScript('-74-S-4', rows.join('\n'), extracted);
  assert.equal(continuation.complete, true);
  assert.equal(continuation.nodes[10].speaker, 'Kalina');
  assert.equal(continuation.nodes[10].source.row, 11);
  assert.equal(continuation.nodes[10].text.en, rows[10]);
  assert.ok(
    continuation.audit.some(
      (entry) => entry.repair === 'same-speaker-continuation',
    ),
  );
});

test('unsupported interaction and invalid values produce closed blocking graphs through preceding choices', () => {
  for (const command of [
    '<InputBox>code</InputBox>',
    '<ShootPanel>native</ShootPanel>',
    '<t>repeat',
    '<r>quiz',
    '<cg>0,0',
  ]) {
    const result = compileScript(
      'blocked',
      `()||:Pick<c>A<c>B\n()||<分支>1</分支>:A\n()||<分支>2</分支>:B\n()||${command}:Blocked.\n()||:Must remain archived.`,
      extracted,
    );
    assert.equal(result.complete, false, command);
    assertClosedGraph(result, command);
    assert.equal(result.sourceRows.length, 5);
  }
  for (const source of [
    'Kalina(0)<Scale>NaN</Scale>||:Invalid.\n()||:After.',
    '()||<bg_move>%%scale=2%%</bg_move>:Invalid.\n()||:After.',
    '()||<controll_shake>%%range=Infinity%%</controll_shake>:Invalid.\n()||:After.',
  ]) {
    const result = compileScript('invalid', source, extracted);
    assert.equal(result.complete, false);
    assertClosedGraph(result, 'invalid numeric value');
    assert.equal(result.sourceRows.length, 2);
  }
});

test(
  'installed event corpus preserves every row and complete or blocking graphs remain valid',
  { skip: eventScripts.length === 0 },
  () => {
    const files = eventScripts.map((script) => script + '.txt');
    for (const file of files) {
      const source = corpus.scripts[file.slice(0, -4)];
      const result = compileScript(file.slice(0, -4), source, corpus);
      assert.equal(
        result.sourceRows.length,
        source
          .replace(/^\uFEFF/, '')
          .split(/\r?\n/)
          .filter((line) => line.trim()).length,
        file,
      );
      if (result.complete)
        assert.deepEqual(
          [
            ...new Set(
              result.nodes.flatMap((node) =>
                node.source ? [node.source.row] : [],
              ),
            ),
          ].sort((a, b) => a - b),
          result.sourceRows.map((row) => row.row),
          file,
        );
      assertClosedGraph(result, file);
    }
  },
);

const registryPath = new URL(
  '../.cache/gfl1/collections-expanded.json',
  import.meta.url,
);
test(
  'expanded native replay selection compiles to closed graphs without losing source rows',
  { skip: !existsSync(registryPath) },
  () => {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    const scripts =
      registry.selection.sourceAssets ?? registry.selection.scripts;
    let checked = 0;
    for (const script of scripts) {
      const bytes = readFileSync(
        new URL(`../.cache/gfl1/scripts/${script}.txt`, import.meta.url),
      );
      let source;
      try {
        source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        // This one native asset is recorded as a source-encoding gap by the
        // extractor. A lossy UTF-8 replacement would invent readable dialogue.
        assert.equal(
          script,
          '-71-15-EXT',
          'Unexpected undecodable source asset',
        );
        continue;
      }
      const result = compileScript(script, source, corpus ?? extracted);
      assert.equal(
        result.sourceRows.length,
        source
          .replace(/^\uFEFF/, '')
          .split(/\r?\n/)
          .filter((line) => line.trim()).length,
        script,
      );
      if (result.complete)
        assert.deepEqual(
          [
            ...new Set(
              result.nodes.flatMap((node) =>
                node.source ? [node.source.row] : [],
              ),
            ),
          ].sort((a, b) => a - b),
          result.sourceRows.map((row) => row.row),
          script,
        );
      else
        assert.ok(
          result.audit.some((entry) =>
            /unsupported|ambiguous/.test(entry.kind),
          ),
          `${script}: unreported compiler blocker`,
        );
      assertClosedGraph(result, script);
      checked++;
    }
    assert.ok(checked > 0);
  },
);
