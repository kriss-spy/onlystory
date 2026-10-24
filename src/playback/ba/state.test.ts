import { expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import type { BaProgram, BaRow } from './types';
import { applyBaRow, initialBaState, rowDelay } from './state';

const fixture = (path: string): BaProgram | undefined =>
  existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
const program = fixture('public/private/ba-jp/11000/scenes.json');
const carrot = fixture('public/private/ba-jp/41085/scenes.json');
const rows = program?.steps.flatMap((step) => step.rows) ?? [];
const baseRow: BaRow = {
  row: 0,
  ScriptKr: '',
  TextJp: '',
  BGName: 0,
  BGMId: 0,
  Sound: '',
  Transition: 0,
  BGEffect: 0,
};
it.skipIf(!carrot)(
  'ends the Operation Carrot close-up montage before the bath dialogue',
  () => {
    const montage = (carrot as unknown as BaProgram).steps.find(
      (step) => step.id === '41085:206',
    )!;
    let state = initialBaState();
    for (const row of montage.rows) {
      state = applyBaRow(state, row);
      if (row.row === 199)
        expect(state.zoom).toEqual({ x: -316, y: -111, size: 1300 });
      if (row.row === 203)
        expect(state.zoom).toEqual({ x: 250, y: 333, size: 1300 });
      if (row.row >= 204) expect(state.zoom).toEqual(initialBaState().zoom);
    }
  },
);
it('retains camera framing during waits but resets effect-free rows and new backgrounds', () => {
  const row = {
    ...baseRow,
    BGName: 123,
    BGEffect: 0,
    ScriptKr: '#ZMC;instant;250,333;1300',
  };
  const zoomed = applyBaRow(initialBaState(), row);
  const wait = applyBaRow(zoomed, { ...row, BGName: 0, ScriptKr: '#wait;500' });
  expect(wait.zoom).toEqual(zoomed.zoom);
  expect(
    applyBaRow(wait, { ...row, BGName: 0, ScriptKr: '#na;dialogue' }).zoom,
  ).toEqual(initialBaState().zoom);
  expect(
    applyBaRow(wait, { ...row, BGName: 456, ScriptKr: '#wait;500' }).zoom,
  ).toEqual(initialBaState().zoom);
  expect(zoomed.zoom).toEqual({ x: 250, y: 333, size: 1300 });
});
it('starts without a prologue-specific background before an event supplies its first cue', () => {
  expect(initialBaState().background).toBe(0);
  expect(
    applyBaRow(initialBaState(), { ...baseRow, BGName: 123 }).background,
  ).toBe(123);
});
it('renders event title cards and moves characters into the two intermediate slots', () => {
  const row = {
    ...baseRow,
    ScriptKr: '#title;프롤로그;축제를 준비합시다!',
    TextJp: 'プロローグ;祭りの準備',
  };
  const title = applyBaRow(initialBaState(), row);
  expect(title.title).toBe('プロローグ\n祭りの準備');
  let actors = applyBaRow(title, { ...row, ScriptKr: '3;린;01;hello\n#3;m2' });
  expect(actors.title).toBe('');
  expect(actors.actors['린'].position).toBe(2);
  actors = applyBaRow(actors, { ...row, ScriptKr: '#2;m4' });
  expect(actors.actors['린'].position).toBe(4);
});
it('restores event silhouettes, communication filters, falls, popup and ending cues', () => {
  const row = {
    ...baseRow,
    ScriptKr: '3;린;01;hello\n#3;black\n#3;sig',
    PopupFileName: 'popup22',
  };
  const actor = applyBaRow(initialBaState(), row);
  expect(actor.actors['린'].silhouette).toBe(true);
  expect(actor.actors['린'].signal).toBe(true);
  expect(actor.popup).toBe('popup22');
  const fall = applyBaRow(actor, {
    ...row,
    ScriptKr: '#3;falldownL',
    PopupFileName: '',
  });
  expect(fall.actors['린'].visible).toBe(false);
  expect(fall.actors['린'].action).toBe('falldownL');
  expect(fall.actors['린'].signal).toBe(false);
  expect(fall.popup).toBe('');
  expect(rowDelay({ ...row, ScriptKr: '#3;jump' })).toBe(600);
  expect(
    applyBaRow(fall, { ...row, ScriptKr: '#continued', TextJp: '' }).title,
  ).toBe('つづく');
  expect(
    applyBaRow(fall, { ...row, ScriptKr: '#Ending;event', TextJp: 'イベント' })
      .title,
  ).toBe('イベント');
});
it.skipIf(!program)(
  'accounts for every presentation row including montage, captions and waits',
  () => {
    expect(rows.map((r) => r.row)).toEqual(
      Array.from({ length: 229 }, (_, i) => i),
    );
    let state = initialBaState();
    for (const row of rows.filter((r) => r.row <= 6))
      state = applyBaRow(state, row);
    expect(state.captions).toHaveLength(2);
    expect(state.captions[0].color).toBe('#ff6666');
    expect(rowDelay(rows[1])).toBe(2000);
    state = applyBaRow(state, rows[8]);
    expect(state.captions).toHaveLength(0);
  },
);
it('preserves distinct screen-text anchors for prose and positioned labels', () => {
  const anchors = ['#st', '#stm', '#str'].map(
    (command) =>
      applyBaRow(initialBaState(), {
        ...baseRow,
        ScriptKr: `${command};[0,100];instant;64;caption`,
        TextJp: 'caption',
      }).captions[0].alignment,
  );
  expect(anchors).toEqual(['left', 'center', 'right']);
});
it.skipIf(!program)(
  'restores authored background effects from the prologue',
  () => {
    let state = initialBaState();
    for (const row of rows.filter((r) => r.row <= 207))
      state = applyBaRow(state, row);
    expect(state.effect).toBe(1377724294);
    expect(applyBaRow(state, rows[208]).effect).toBe(3134544579);
    expect(applyBaRow(state, rows[209]).effect).toBe(0);
  },
);
it('restores characters, movement and audio without sharing mutable state', () => {
  const raw: BaRow = {
    ...baseRow,
    BGName: 0,
    BGMId: 9,
    ScriptKr: '3;린;01;test\n#3;m1\n#3;greeting',
  };
  const first = applyBaRow(initialBaState(), raw);
  const second = applyBaRow(first, { ...raw, BGMId: 0, ScriptKr: '#1;hide' });
  expect(first.actors['린'].visible).toBe(true);
  expect(second.actors['린'].visible).toBe(false);
  expect(first.actors['린'].position).toBe(1);
  expect(second.music).toBe(9);
});
