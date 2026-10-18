import { expect, it } from 'vitest';
import { resolveBaExpression } from './expressions';
import { applyBaRow, initialBaState } from './state';
import type { BaAssets, BaRow } from './types';

it('keeps NPC idle/setup poses and resolves authored expression names without case sensitivity', () => {
  expect(resolveBaExpression(undefined, ['Idle_01', '01'])).toEqual({
    mode: 'unchanged',
    animation: '',
  });
  expect(resolveBaExpression('00', ['Idle_01'])).toEqual({
    mode: 'neutral',
    animation: '',
  });
  expect(resolveBaExpression('01', ['Idle_01'])).toEqual({
    mode: 'neutral',
    animation: '',
  });
  expect(resolveBaExpression('01', ['00'])).toEqual({
    mode: 'neutral',
    animation: '00',
  });
  expect(resolveBaExpression('s2_05', ['Idle_01', 'S2_05'])).toEqual({
    mode: 'animation',
    animation: 'S2_05',
  });
  expect(resolveBaExpression('61', ['Idle_01', '01', '02'])).toEqual({
    mode: 'hold',
    animation: '',
  });
});
it('reconstructs a missing face cue from the preceding actor expression when seeking', () => {
  const assets = {
    characters: { izuna: { expressionNames: ['Idle_01', '01', '03'] } },
  } as unknown as BaAssets;
  const row = {
    row: 0,
    BGName: 0,
    BGMId: 0,
    BGEffect: 0,
    ScriptKr: '3;izuna;03;hello',
    TextJp: 'hello',
  } as BaRow;
  let state = applyBaRow(initialBaState(), row, assets);
  state = applyBaRow(state, { ...row, ScriptKr: '3;izuna;01;hello' }, assets);
  state = applyBaRow(state, { ...row, ScriptKr: '3;izuna;61;hello' }, assets);
  expect(state.actors.izuna.face).toBe('01');
  expect(state.actors.izuna.requestedFace).toBe('61');
  state = applyBaRow(state, { ...row, ScriptKr: '5;izuna' }, assets);
  expect(state.actors.izuna.face).toBe('01');
  expect(state.actors.izuna.position).toBe(5);
});
