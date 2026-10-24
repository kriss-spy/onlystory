import { expect, it } from 'vitest';
import { sceneMarkers } from './scene-markers';
import type { Episode } from './model';
import type { BaProgram, BaRow } from './playback/ba/types';
import carrot from '../public/private/ba-jp/41085/scenes.json';

const episode = (steps: BaProgram['steps'], nodes: Episode['nodes'] = []) =>
  ({
    nodes,
    renderer: { id: 'ba-scene', payload: { steps } },
  }) as Episode;
const step = (id: string, ScriptKr: string) => ({
  id,
  rows: [{ ScriptKr } as BaRow],
});

it('marks the real bath montage once and leaves its ordinary dialogue unmarked', () => {
  const markers = sceneMarkers(episode((carrot as unknown as BaProgram).steps));
  expect([...markers]).toEqual([['41085:206', 'Camera sequence']]);
});
it('recognizes explicit camera, movie and cutscene commands without marking routine effects', () => {
  expect([
    ...sceneMarkers(
      episode([
        step('pan', '#ZMLT;move;10,20;1300;3500\n#zmc;move;20,30;1300;3500'),
        step('instant', '#zmc;instant;10,20;1300\n#zmc;move;10,20;1300;10'),
        step('ordinary', '#wait;500\n#bgshake\n#3;em;[반응]'),
        step('movie', '#VIDEONS2;movie'),
        step('timeline', '#timelineNS;native'),
      ]),
    ),
  ]).toEqual([
    ['pan', 'Camera sequence'],
    ['movie', 'Movie'],
    ['timeline', 'Cutscene'],
  ]);
});
it('marks shared movie nodes and keeps unplayed branch-tail commands off the owner passage', () => {
  const tail = {
    ...step('branch', '#all;hide'),
    afterRows: step('tail', '#zmc;move;0,0;1300;3500').rows,
  };
  expect([
    ...sceneMarkers(
      episode(
        [tail],
        [{ id: 'video', kind: 'video' } as Episode['nodes'][number]],
      ),
    ),
  ]).toEqual([['video', 'Movie']]);
});
