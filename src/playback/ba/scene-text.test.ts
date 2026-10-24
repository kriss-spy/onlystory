import { expect, it } from 'vitest';
import { defaultPreferences } from '../../model';
import { applyBaRow, initialBaState } from './state';
import { baSceneText } from './scene-text';
import type { BaRow } from './types';

it('substitutes literal names after caption markup and adjusts authored pause offsets', () => {
  const row: BaRow = {
    row: 193,
    ScriptKr: '#st;[-1200,0];serial;70;caption',
    TextJp: '担当者：[USERNAME][wa:500]先生 [USERNAME]',
    BGName: 0,
    BGMId: 0,
    Sound: '',
    Transition: 0,
    BGEffect: 0,
  };
  const state = applyBaRow(initialBaState(), row);
  state.title = '[USERNAME]の物語';
  state.place = '[USERNAME]の部屋';
  const name = '名😀$&[b]#n';
  const rendered = baSceneText(state, {
    ...defaultPreferences,
    playerName: name,
  });
  expect(rendered.captions[0].text).toBe(`担当者：${name}先生 ${name}`);
  expect(rendered.captions[0].pauses).toEqual([
    { offset: Array.from(`担当者：${name}`).length, delay: 500 },
  ]);
  expect(rendered.title).toBe(`${name}の物語`);
  expect(rendered.place).toBe(`${name}の部屋`);
  expect(state.captions[0].text).toContain('[USERNAME]');
  expect(row.TextJp).toContain('[wa:500]');
});

it('uses the same localized defaults as BA dialogue for blank and default names', () => {
  const state = { ...initialBaState(), title: '[USERNAME]' };
  for (const playerName of ['', '   ', defaultPreferences.playerName]) {
    for (const textLocale of ['ja', 'en', 'zh-CN'] as const) {
      expect(
        baSceneText(state, { ...defaultPreferences, playerName, textLocale })
          .title,
      ).toBe(textLocale === 'en' ? 'Sensei' : 'プレイヤー');
    }
  }
});
