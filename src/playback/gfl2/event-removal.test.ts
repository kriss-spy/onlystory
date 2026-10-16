import { expect, it } from 'vitest';
import { buildTimeline } from './event-state';
import type { EventProgram } from './event-types';
import type { Command } from './types';

const command = (
  Command: string,
  Arg1: string,
  rest: Partial<Command> = {},
): Command => ({
  Command,
  Arg1,
  Arg2: '',
  Arg3: '',
  Arg4: '',
  Arg5: '',
  Arg6: '',
  Arg7: '',
  Arg8: '',
  WaitType: '',
  sourceRow: 1,
  ...rest,
});
const program = (steps: Command[][]): EventProgram => ({
  version: 1,
  id: 'removal',
  backgrounds: {},
  characters: { actor: { kind: 'live2d', files: [], variants: {} } },
  layers: { center: { type: 'Character', x: 0, y: 0, order: 1 } },
  audio: {},
  files: [],
  unresolved: [],
  steps: steps.map((commands, index) => ({
    id: `line-${index}`,
    script: 'regression',
    reset: index === 0,
    commands,
  })),
});

it('a repeated character command cannot resurrect an actor during a delayed off in the same passage', () => {
  const draw = command('Character', 'actor', { Arg3: 'center' });
  const off = command('CharacterOff', 'actor', { Arg6: '.4', Arg7: '.4' });
  const states = buildTimeline(program([[draw], [off, draw], [], [draw]]));
  expect(states[1].layers).toHaveLength(0);
  expect(states[2].layers).toHaveLength(0);
  expect(states[3].layers.map((layer) => layer.id)).toEqual(['actor']);
  expect(states[1].removals).toEqual([{ id: 'actor', fade: 0.4, delay: 0.4 }]);
});

it('an off with no delay allows a fresh draw, while ordinary repeated draws preserve their offset', () => {
  const draw = command('Character', 'actor', {
    Arg3: 'center',
    Arg4: '140',
    Arg5: '-50',
  });
  const again = command('Character', 'actor', { Arg3: 'center' });
  const states = buildTimeline(
    program([
      [draw],
      [again],
      [command('CharacterOff', 'actor', { Arg7: '0' }), again],
    ]),
  );
  expect(states[1].layers[0]).toMatchObject({ x: 140, y: -50 });
  expect(states[2].layers).toHaveLength(1);
});

it('repeated dialogue character commands preserve shadow overrides and holograms can be cleared', () => {
  const draw = command('Character', 'actor', { Arg3: 'center' });
  const input = program([
    [
      draw,
      command('SetShaderFloat', 'actor', { Arg2: '_MaskHeight', Arg4: '1' }),
      command('AddEffect', 'actor', {
        Arg2: 'SenCharEff_Plot_CommunStart_holo_02',
      }),
    ],
    [draw],
    [command('AddEffect', 'actor')],
  ]);
  input.characters.actor.variants.Idle = {
    url: '/model.json',
    sourceScale: 1,
    sourceX: 0,
    sourceY: 0,
    maskHeight: 0.15,
  };
  const states = buildTimeline(input);
  expect(states[1].layers[0].maskHeight).toBe(1);
  expect(states[1].layers[0].effect).toBe(
    'SenCharEff_Plot_CommunStart_holo_02',
  );
  expect(states[1].warnings).toEqual([]);
  expect(states[2].layers[0].effect).toBeUndefined();
});
