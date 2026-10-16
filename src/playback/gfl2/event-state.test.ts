import { describe, expect, it } from 'vitest';
import { buildTimeline, buildPathTimeline } from './event-state';
import type { EventProgram, SceneStep } from './event-types';
import type { Command } from './types';

function command(name: string, args: string[] = [], sourceRow = 1): Command {
  return {
    Command: name,
    ...Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`Arg${i + 1}`, args[i] || '']),
    ),
    WaitType: '',
    sourceRow,
  } as Command;
}
function program(...commands: Command[][]): EventProgram {
  return {
    version: 1,
    id: 'test',
    steps: commands.map((commands, index) => ({
      id: `book:${index}`,
      script: 'book',
      reset: index === 0,
      commands,
    })),
    backgrounds: {
      room: { url: '/room.webp' },
      flash: { color: '#ffffff' },
      cover: { color: '#000000' },
    },
    characters: Object.fromEntries(
      ['Gaia', 'Celia'].map((name) => [
        name,
        {
          kind: 'live2d',
          files: [],
          variants: {
            Idle: {
              url: '/actor.model3.json',
              sourceScale: 0.29,
              sourceX: 0,
              sourceY: 251,
              maskHeight: 0.15,
            },
            Happy: {
              url: '/actor.model3.json',
              sourceScale: 0.29,
              sourceX: 0,
              sourceY: 251,
              maskHeight: 0.15,
            },
          },
        },
      ]),
    ),
    layers: {
      BgDefault: { type: 'Bg', x: 0, y: 0, order: 5 },
      BgFrontForChange: { type: 'Bg', x: 40, y: 20, order: 40 },
      中: { type: 'Character', x: 0, y: -300, order: 190 },
      左: { type: 'Character', x: -300, y: -300, order: 190 },
      右: { type: 'Character', x: 300, y: -300, order: 190 },
      黑屏: { type: 'Sprite', x: 0, y: 0, order: 210 },
    },
    audio: {
      music: { url: '/music.ogg' },
      storm: { url: '/storm.ogg', loop: true },
      impact: { url: '/impact.ogg' },
    },
    files: [],
    unresolved: [],
  };
}

describe('GFL2 source scene timeline', () => {
  it('replays only the chosen scene edges, including repeated choice visits', () => {
    const source = program([], [], [], []);
    source.steps[0].entryCommands = [command('Bg', ['room', '', 'BgDefault'])];
    source.steps[0].incoming = { 'book:2': [] };
    source.steps[1].incoming = {
      'book:0': [command('Bg', ['flash', '', 'BgDefault'])],
    };
    source.steps[2].incoming = { 'book:1': [] };
    source.steps[3].incoming = {
      'book:0': [command('Bg', ['cover', '', 'BgDefault'])],
    };
    const result = buildPathTimeline(source, [
      'book:0',
      'book:1',
      'book:2',
      'book:0',
      'book:3',
    ]);
    expect(result[0].layers.map((l) => l.asset)).toEqual(['flash']);
    expect(result[3].layers.map((l) => l.asset)).toEqual(['cover']);
    expect(() => buildPathTimeline(source, ['book:0', 'book:2'])).toThrow(
      'Missing scene edge',
    );
  });
  it('keeps separately addressed background pieces when later commands shade their composite', () => {
    const source = program([
      command('Bg', ['room', '', 'BgDefault']),
      command('Bg', ['flash', '', 'BgDefault']),
      command('SetShaderFloat', ['room', '_DarkRampMask', '', '1']),
      command('SetShaderFloat', ['flash', '_DarkRampMask', '', '0']),
    ]);
    const [state] = buildTimeline(source);
    expect(state.layers.map((l) => l.id)).toEqual(['room', 'flash']);
    expect(state.warnings).toEqual([]);
  });

  it('redraws a background on its destination layer after a delayed removal', () => {
    const source = program(
      [command('Bg', ['room', '', 'BgDefault'])],
      [
        command('ChangeLayer', ['room', '', 'BgFrontForChange']),
        command('BgOff', ['room', '', '', '', '', '1', '1']),
        command('Bg', ['room', '', 'BgDefault']),
      ],
    );
    expect(buildTimeline(source)[1].layers.map((l) => [l.id, l.layer])).toEqual(
      [['room', 'BgDefault']],
    );
  });
  it('changes layer order for existing and later objects, including moves, and restores defaults at a book reset', () => {
    const source = program(
      [
        command('Character', ['Gaia', '', '中']),
        command('LayerSortingOrder', ['中', '30']),
      ],
      [command('Character', ['Celia', '', '中'])],
      [
        command('LayerSortingOrder', ['左', '28']),
        command('ChangeLayer', ['Celia', 'KeepLocal', '左']),
      ],
      [command('Character', ['Gaia', '', '中'])],
    );
    source.steps[3].reset = true;
    const states = buildTimeline(source);
    expect(states[0].layers[0].order).toBe(30);
    expect(states[1].layers[0]).toMatchObject({ id: 'Celia', order: 30 });
    expect(states[2].layers[0]).toMatchObject({ layer: '左', order: 28 });
    expect(states[3].layers[0].order).toBe(190);
    expect(source.layers.中.order).toBe(190);
  });

  it('keeps labeled volume changes on current players only, preserves boosted gains and independent group volumes', () => {
    const change = command(
      'ChangeSoundVolume',
      ['Bgm', '1.5', 'music', '', '', '.5', '.2'],
      70,
    );
    const states = buildTimeline(
      program(
        [
          command('Bgm', ['music', '', '.4']),
          command('Se', ['storm', 'true']),
          change,
        ],
        [command('ChangeSoundVolume', ['All', '.6'])],
        [command('Bgm', ['music'])],
      ),
    );
    expect(states[0].music?.volume).toEqual(change);
    expect(states[0].music?.command.Arg3).toBe('.4');
    expect(states[0].audioVolumes).toEqual([change]);
    expect(states[0].ambience[0].volume).toBeUndefined();
    expect(states[1].audioVolumes).toEqual([]);
    expect(states[1].music?.volume?.Arg2).toBe('1.5');
    expect(Object.keys(states[1].soundVolumes!)).toEqual([
      'Bgm',
      'Ambience',
      'Se',
      'Voice',
    ]);
    expect(states[2].music?.volume).toBeUndefined();
    expect(states[2].soundVolumes?.Bgm.Arg2).toBe('.6');
  });

  it('reports unrecovered Unity character prefabs and animation controllers without substituting unrelated portraits', () => {
    const states = buildTimeline(
      program([
        command('CustomCharacter', [
          'BG_None_Hotelmonitoring_Day_01',
          '',
          '中',
        ]),
        command('SetTrigger', ['地图', 'Open_map', '0']),
        command('PlayCharAnim', ['黑闪电战斗', 'below_ON']),
        command('AutoPlay', ['True']),
      ]),
    );
    expect(states[0].layers).toEqual([]);
    expect(states[0].warnings).toHaveLength(3);
    expect(states[0].warnings.join(' ')).toContain(
      'BG_None_Hotelmonitoring_Day_01',
    );
    expect(states[0].warnings.join(' ')).toContain('Open_map');
    expect(states[0].warnings.join(' ')).toContain('below_ON');
  });

  it('moves an existing actor, replaces a slot, and removes by label or layer without changing other actors', () => {
    const states = buildTimeline(
      program(
        [
          command('Character', ['Gaia', 'Idle,0', '中']),
          command('Character', ['Celia', 'Idle,0', '右']),
        ],
        [command('Character', ['Gaia', 'Happy,0', '左'])],
        [command('Character', ['Gaia', 'Idle,0', '右'])],
        [command('CharacterOff', ['右'])],
      ),
    );
    expect(states[0].layers.map((actor) => [actor.id, actor.layer])).toEqual([
      ['Gaia', '中'],
      ['Celia', '右'],
    ]);
    expect(states[1].layers.map((actor) => [actor.id, actor.layer])).toEqual([
      ['Gaia', '左'],
      ['Celia', '右'],
    ]);
    expect(states[2].layers.map((actor) => [actor.id, actor.layer])).toEqual([
      ['Gaia', '右'],
    ]);
    expect(states[3].layers).toEqual([]);
    expect(states[0].layers[0].pattern).toEqual([{ name: 'Idle', at: 0 }]);
  });

  it('keeps pose times absolute, applies delay, settles old schedules and retains repeated-pose source rows', () => {
    const states = buildTimeline(
      program(
        [
          command(
            'Character',
            ['Gaia', 'Idle,0|Happy,0.5', '中', '', '', '.4', '1'],
            45,
          ),
        ],
        [],
        [command('Character', ['Gaia', 'Happy,0', '中'], 59)],
      ),
    );
    expect(states[0].layers[0].pattern).toEqual([
      { name: 'Idle', at: 1 },
      { name: 'Happy', at: 1.5 },
    ]);
    expect(states[0].layers[0].fade).toBe(0.4);
    expect(states[1].layers[0].pattern).toEqual([{ name: 'Happy', at: 0 }]);
    expect(states[2].layers[0].sourceRow).toBe(59);
    expect(states[0].layers[0].sourceRow).toBe(45);
  });

  it('changes background layers preserving global position and resolves sprite instance resources', () => {
    const states = buildTimeline(
      program(
        [
          command('Bg', ['room', '', 'BgDefault']),
          command('ChangeLayer', [
            'room',
            '',
            'BgFrontForChange',
            '',
            '',
            '0',
            '0',
          ]),
          command('Bg', ['flash', '', 'BgDefault']),
          command('Sprite', [
            'cover-instance',
            'cover',
            '黑屏',
            '0',
            '0',
            '.8',
            '0',
          ]),
        ],
        [command('BgOff', ['room']), command('SpriteOff', ['cover-instance'])],
      ),
    );
    expect(states[0].layers.find((layer) => layer.id === 'room')).toMatchObject(
      { layer: 'BgFrontForChange', x: -40, y: -20, order: 40 },
    );
    expect(
      states[0].layers.find((layer) => layer.id === 'cover-instance'),
    ).toMatchObject({ kind: 'sprite', asset: 'cover', fade: 0.8, order: 210 });
    expect(states[1].layers.map((layer) => layer.id)).toEqual(['flash']);
  });

  it('persists BGM and loop beds while one-shots belong to only the current step', () => {
    const states = buildTimeline(
      program(
        [
          command('Bgm', ['music']),
          command('Se', ['storm', 'True']),
          command('Se', ['impact', 'False']),
        ],
        [],
        [command('StopSe', ['storm']), command('StopBgm')],
      ),
    );
    expect(states[0].shots.map((cue) => cue.label)).toEqual(['impact']);
    expect(states[1].shots).toEqual([]);
    expect(states[1].music?.label).toBe('music');
    expect(states[1].ambience.map((cue) => cue.label)).toEqual(['storm']);
    expect(states[2]).toMatchObject({ music: null, ambience: [], shots: [] });
    expect(states[0].ambience).toHaveLength(1);
  });

  it('retains exact audio stop envelopes only at the stop boundary', () => {
    const stopMusic = command('StopBgm', ['', '', '', '', '', '2', '.8'], 43);
    const stopStorm = command(
      'StopSe',
      ['storm', '', '', '', '', '.7', '.2'],
      44,
    );
    const source = program(
      [command('Bgm', ['music']), command('Se', ['storm', 'true'])],
      [stopMusic, stopStorm],
      [],
    );
    const states = buildTimeline(source);
    expect(states[0].audioStops).toEqual([]);
    expect(states[1].audioStops).toEqual([stopMusic, stopStorm]);
    expect(states[1].audioStops?.[0]).not.toBe(stopMusic);
    expect(states[1]).toMatchObject({ music: null, ambience: [] });
    expect(states[2].audioStops).toEqual([]);
    expect(states[1].audioStops?.[0]).toMatchObject({
      Arg6: '2',
      Arg7: '.8',
      sourceRow: 43,
    });
  });

  it('evaluates only arithmetic parameters and resolves dynamic zoom references including the original NaN reset', () => {
    const states = buildTimeline(
      program(
        [
          command('Param', ['needSize=(3.6/3.2)']),
          command('Param', ['needX=(100*0/(-1/needSize+1))']),
          command('Param', ['needY=(100*0/(-1/needSize+1))']),
          command('ZoomCamera', [
            'SpriteCamera',
            '&needSize',
            '&needX',
            '&needY',
            'EaseInOutQuart',
            '.5',
            '.4',
          ]),
        ],
        [
          command('Param', ['needSize=(3.6/3.6)']),
          command('Param', ['needX=(100*0/(-1/needSize+1))']),
          command('Param', ['needY=(100*0/(-1/needSize+1))']),
          command('ZoomCamera', [
            'SpriteCamera',
            '&needSize',
            '&needX',
            '&needY',
            'Linear',
            '0',
          ]),
        ],
        [
          command('Param', ['bad=globalThis.compromised=true']),
          command('ZoomCamera', ['SpriteCamera', '&missing']),
        ],
      ),
    );
    expect(states[0].zoom).toEqual({
      scale: 1.125,
      x: 0,
      y: 0,
      duration: 0.5,
      delay: 0.4,
    });
    expect(states[1].zoom).toMatchObject({ scale: 1, x: 0, y: 0 });
    expect(states[1].params.needX).toBeNaN();
    expect(states[2].params).not.toHaveProperty('bad');
    expect(states[2].warnings).toHaveLength(2);
    expect(states[2].zoom.scale).toBe(1);
  });

  it('retains persistent move, scale and alpha without making transient punch displacement permanent', () => {
    const states = buildTimeline(
      program(
        [
          command('Character', ['Gaia', 'Idle,0', '左']),
          command('Tween', [
            'Gaia',
            'MoveTo',
            'time=.5 x=100 y=0 islocal=true start=.4',
            'Linear',
            '',
            '',
            '99',
          ]),
          command('Tween', ['Gaia', 'ScaleTo', 'time=.5 x=1.2 y=1.3']),
          command('Tween', ['Gaia', 'ColorTo', 'time=0 alpha=0.5']),
          command('Tween', [
            'Gaia',
            'PunchPosition',
            'time=1 x=15 y=0 start=.4',
            '',
            'loop=1',
          ]),
        ],
        [],
        [command('Tween', ['Gaia', 'MoveTo', 'time=0 x=0 y=0'])],
      ),
    );
    expect(states[0].layers[0]).toMatchObject({
      x: 100,
      y: 0,
      scaleX: 1.2,
      scaleY: 1.3,
      alpha: 0.5,
      tween: { type: 'PunchPosition', args: { x: 15, start: 0.4 }, loop: 1 },
    });
    expect(states[1].layers[0]).toMatchObject({
      x: 100,
      scaleX: 1.2,
      alpha: 0.5,
    });
    expect(states[1].layers[0].tween).toBeUndefined();
    expect(states[2].layers[0]).toMatchObject({ x: 300, y: 300 });
  });

  it('stops endless loops explicitly, tracks shader values separately, and reports original unsupported effects', () => {
    const states = buildTimeline(
      program(
        [
          command('Bg', ['room']),
          command('Tween', [
            'room',
            'ShakePosition',
            'time=1 x=1 y=0',
            '',
            'loop=0',
          ]),
          command('SetShaderFloat', ['room', '_DarkRampMask', '0', '.9']),
          command('SetShaderFloat', ['room', '_Radius', '0', '.2']),
          command('SetShaderColor', [
            'AllBgLayers',
            '_Color',
            '#ffffff',
            '#f1d7b7',
          ]),
          command('Particle', ['sparks', '', 'EffectLayer']),
        ],
        [
          command('TweenOff', ['room']),
          command('Character', ['Gaia', 'Idle,0', '中']),
          command('AddEffect', ['Gaia', 'hologram']),
        ],
      ),
    );
    expect(states[0].layers[0]).toMatchObject({
      darkness: 0.9,
      color: '#f1d7b7',
      shaders: { _DarkRampMask: 0.9, _Radius: 0.2 },
      tween: { loop: 0 },
    });
    expect(states[1].layers[0].tween).toBeUndefined();
    expect(states[1].layers.find((layer) => layer.id === 'Gaia')).toMatchObject(
      { color: '#ffffff', effect: 'hologram' },
    );
    expect(states[0].layers.find((layer) => layer.id === 'sparks')?.kind).toBe(
      'particle',
    );
    expect(states[0].warnings.join(' ')).toContain('original effect renderer');
    expect(states[1].warnings.join(' ')).toContain('hologram');
  });

  it('does not mutate source commands or earlier snapshots, and clears scene and sound at source-book reset', () => {
    const source = program(
      [command('Bg', ['room']), command('Bgm', ['music'])],
      [command('BgOff')],
      [],
    );
    source.steps[1].exit = [command('Se', ['storm', 'true'])];
    source.steps[2].reset = true;
    const original = structuredClone(source);
    const states = buildTimeline(source);
    expect(source).toEqual(original);
    expect(states[0].layers).toHaveLength(1);
    expect(states[1].ambience).toEqual([]);
    expect(states[2]).toMatchObject({
      layers: [],
      music: null,
      ambience: [],
      zoom: { scale: 1 },
    });
  });
});

const recoveredBooks = import.meta.glob<string>(
  '../../../../onlystory-gfl2/event_books/A330*.book.json',
  { query: '?raw', import: 'default', eager: true },
);
it.runIf(Object.keys(recoveredBooks).length === 30)(
  'compiles every real event book and preserves the opening dynamic zoom and character scene',
  () => {
    type Row = {
      rowIndex: number;
      strings: string[];
      isEmpty: number;
      isCommentOut: number;
    };
    const steps: SceneStep[] = [];
    for (const [path, contents] of Object.entries(recoveredBooks).sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      const filename = path.split('/').at(-1)!;
      const book = JSON.parse(contents);
      const grid = book.importGridList[0];
      const entities = new Map<number, string[]>(
        (grid.entityIndexTbl || []).map((index: number, i: number) => [
          index,
          grid.entityDataList[i].originalStrings,
        ]),
      );
      let pending: Command[] = [];
      let first = true;
      for (const row of (grid.rows as Row[]).slice(1)) {
        if (row.isEmpty || row.isCommentOut) continue;
        const strings = entities.get(row.rowIndex) || row.strings;
        const record = {
          ...Object.fromEntries(
            grid.rows[0].strings.map((key: string, i: number) => [
              key,
              strings[i] || '',
            ]),
          ),
          sourceRow: row.rowIndex,
        } as Command;
        pending.push(record);
        if (record.Command !== 'Text') continue;
        steps.push({
          id: `${filename.slice(0, 6)}:${row.rowIndex}`,
          script: filename.slice(0, 6),
          reset: first,
          commands: pending,
        });
        first = false;
        pending = [];
      }
      if (pending.length) steps.at(-1)!.exit = pending;
    }
    const source = program();
    source.steps = steps;
    const states = buildTimeline(source);
    expect(states).toHaveLength(4443);
    expect(
      states[steps.findIndex((step) => step.id === 'A33001:72')].zoom.scale,
    ).toBe(1.125);
    const firstGaia = states.find((state) =>
      state.layers.some((layer) => layer.id === '盖娅'),
    )!;
    expect(firstGaia.layers.find((layer) => layer.id === '盖娅')).toMatchObject(
      { layer: '中', x: 0, y: 0, pattern: [{ name: 'Idle', at: 1 }] },
    );
  },
);
