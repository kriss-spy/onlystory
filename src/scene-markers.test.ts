import { expect, it } from 'vitest';
import { sceneMarkers } from './scene-markers';
import type { Episode } from './model';
import type { BaProgram, BaRow } from './playback/ba/types';
import carrot from '../public/private/ba-jp/41085/scenes.json';
import prologue from '../public/private/ba-jp/10000005/scenes.json';
import opening from '../public/private/ba-jp/11000/scenes.json';
import openingChapter from '../public/private/ba-jp/11000/chapter.json';
import fight from '../public/private/ba-jp/13290/scenes.json';
import fightChapter from '../public/private/ba-jp/13290/chapter.json';

const episode = (
  steps: BaProgram['steps'],
  nodes: Episode['nodes'] = [],
  assets: Partial<BaProgram['assets']> = {},
) =>
  ({
    nodes,
    renderer: {
      id: 'ba-scene',
      payload: { steps, assets: { backgrounds: {}, ...assets } },
    },
  }) as Episode;
const step = (id: string, ScriptKr: string, BGName = 0) => ({
  id,
  rows: [{ ScriptKr, BGName } as BaRow],
});

it('groups the bath montage and its alternate CG into one sequence', () => {
  expect([
    ...sceneMarkers(
      episode((carrot as unknown as BaProgram).steps, [], carrot.assets),
    ),
  ]).toEqual([['41085:206', 'CG scene']]);
});
it('marks only the movie and CG in the real festival prologue', () => {
  expect([
    ...sceneMarkers(
      episode((prologue as unknown as BaProgram).steps, [], prologue.assets),
    ),
  ]).toEqual([
    ['10000005:56', 'Movie'],
    ['10000005:143', 'CG scene'],
  ]);
});
it('ignores camera moves, transitions, ordinary animated backgrounds and standalone timelines', () => {
  expect([
    ...sceneMarkers(
      episode(
        [
          step('pan', '#ZMLT;move;10,20;1300;3500\n#zmc;move;20,30;1300;3500'),
          step('instant', '#zmc;instant;10,20;1300\n#zmc;move;10,20;1300;10'),
          step('ordinary', '#wait;500\n#bgshake'),
          step('movie', '#VIDEONS2;movie'),
          step('timeline', '#timelineNS;native'),
          {
            id: 'background',
            rows: [{ BGName: 1, Transition: 12, ScriptKr: '' } as BaRow],
          },
        ],
        [],
        {
          backgrounds: {
            1: {
              name: 'LobbyHoshino',
              renderer: 'spine',
              skeleton: '',
              atlas: '',
              pages: [],
              animation: 'idle',
            },
          },
        },
      ),
    ),
  ]).toEqual([['movie', 'Movie']]);
});
it('groups static and animated illustrations without requiring camera movement', () => {
  expect([
    ...sceneMarkers(
      episode(
        [
          step('static', '', 1),
          step('dialogue', '#wait;500'),
          step('animated', '', 2),
        ],
        [],
        {
          backgrounds: {
            1: { name: 'BG_CS_Example.jpg', url: '/cg.jpg' },
            2: {
              name: 'SC11000_01',
              renderer: 'spine',
              skeleton: '',
              atlas: '',
              pages: [],
              animation: 'idle',
            },
          },
        },
      ),
    ),
  ]).toEqual([['static', 'CG scene']]);
});
it('marks shared movie nodes and keeps unplayed branch-tail commands off the owner passage', () => {
  const tail = {
    ...step('branch', '#all;hide'),
    afterRows: step('tail', '#video;10000').rows,
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

it('groups the main prologue montage and later office CG as two sequences', () => {
  expect([
    ...sceneMarkers(
      episode(
        (opening as unknown as BaProgram).steps,
        openingChapter.nodes as Episode['nodes'],
        opening.assets,
      ),
    ),
  ]).toEqual([
    ['11000:4', 'CG scene'],
    ['11000:110', 'CG scene'],
  ]);
});
it('keeps the reported fight together through its dialogue interlude and marks its movie separately', () => {
  expect([
    ...sceneMarkers(
      episode(
        (fight as unknown as BaProgram).steps,
        fightChapter.nodes as Episode['nodes'],
        (fight as unknown as BaProgram).assets,
      ),
    ),
  ]).toEqual([
    ['13290:51', 'CG scene'],
    ['13290:116', 'Movie'],
  ]);
});
const groupingAssets = {
  backgrounds: {
    1: { name: 'BG_CS_A.jpg', url: '/a.jpg' },
    2: { name: 'BG_CS_B.jpg', url: '/b.jpg' },
    3: { name: 'BG_Black.jpg', url: '/black.jpg' },
    4: { name: 'BG_Office.jpg', url: '/office.jpg' },
  },
};
it('keeps image variants, black frames and scenery flashes inside their montage', () => {
  const montage = {
    id: 'montage',
    rows: [
      step('flash', '', 4).rows[0],
      step('black', '', 3).rows[0],
      step('cg', '', 2).rows[0],
    ],
  };
  expect([
    ...sceneMarkers(
      episode(
        [
          step('start', '', 1),
          step('variant', '', 2),
          step('black', '', 3),
          montage,
        ],
        [],
        groupingAssets,
      ),
    ),
  ]).toEqual([['start', 'CG scene']]);
});
it('starts a new CG group after ordinary dialogue, explicit location changes, or a movie', () => {
  expect([
    ...sceneMarkers(
      episode(
        [
          step('start', '', 1),
          step('dialogue', '', 4),
          step('return', '', 2),
          step('place', '#place;another place', 1),
          step('movie', '#video;10000'),
          step('after-movie', '', 2),
        ],
        [],
        groupingAssets,
      ),
    ),
  ]).toEqual([
    ['start', 'CG scene'],
    ['return', 'CG scene'],
    ['place', 'CG scene'],
    ['movie', 'Movie'],
    ['after-movie', 'CG scene'],
  ]);
});
it('groups each choice route independently and preserves the CG after their shared dialogue', () => {
  const nodes = [
    {
      id: 'choice',
      kind: 'choice',
      choices: [
        { id: 'a', next: 'left' },
        { id: 'b', next: 'right' },
      ],
    },
    { id: 'left', kind: 'text', next: 'join' },
    { id: 'right', kind: 'text', next: 'join' },
    { id: 'join', kind: 'text', next: 'later' },
    { id: 'later', kind: 'text' },
  ] as Episode['nodes'];
  expect([
    ...sceneMarkers(
      episode(
        [
          step('choice', ''),
          step('left', '', 1),
          step('right', '', 2),
          step('join', '', 4),
          step('later', '', 1),
        ],
        nodes,
        groupingAssets,
      ),
    ),
  ]).toEqual([
    ['left', 'CG scene'],
    ['right', 'CG scene'],
    ['later', 'CG scene'],
  ]);
});

it('groups a shared CG according to the selected route while previewing both routes before the choice', () => {
  const nodes = [
    {
      id: 'choice',
      kind: 'choice',
      choices: [
        { id: 'a', next: 'left' },
        { id: 'b', next: 'right' },
      ],
    },
    { id: 'left', kind: 'text', next: 'join' },
    { id: 'right', kind: 'text', next: 'join' },
    { id: 'join', kind: 'text' },
  ] as Episode['nodes'];
  const story = episode(
    [
      step('choice', ''),
      step('left', '', 1),
      step('right', '', 4),
      step('join', '', 2),
    ],
    nodes,
    groupingAssets,
  );
  expect([...sceneMarkers(story)]).toEqual([
    ['left', 'CG scene'],
    ['join', 'CG scene'],
  ]);
  expect([...sceneMarkers(story, { choice: 'a' })]).toEqual([
    ['left', 'CG scene'],
  ]);
  expect([...sceneMarkers(story, { choice: 'b' })]).toEqual([
    ['join', 'CG scene'],
  ]);
});
