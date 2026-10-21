import { expect, it } from 'vitest';
import { baEmotionSounds } from './emotion-sounds';
import { applyBaRow, initialBaState } from './state';
import type { BaRow } from './types';

const row = (ScriptKr: string) =>
  ({
    row: 0,
    ScriptKr,
    TextJp: '',
    BGName: 0,
    BGMId: 0,
    BGEffect: 0,
    Sound: '',
    Transition: 0,
  }) satisfies BaRow;

it('plays the question cue when an authored bubble is shown, without requiring row.Sound', () => {
  const state = applyBaRow(initialBaState(), row('3;yuuka;02\n#3;em;[?]'));
  expect(baEmotionSounds(state)).toEqual(['SFX_Emoticon_Motion_Question']);
  expect(
    baEmotionSounds(applyBaRow(state, row('3;yuuka;02;dialogue'))),
  ).toEqual([]);
  expect(
    baEmotionSounds(applyBaRow(state, row('#all;hide\n#3;em;[?]'))),
  ).toEqual([]);
});

it('distinguishes surprise audio from exclamation despite their shared sprite', () => {
  const sounds = (emotion: string) =>
    baEmotionSounds(
      applyBaRow(initialBaState(), row(`3;yuuka;02\n#3;em;${emotion}`)),
    );
  expect(sounds('[?!]')).toEqual(['SFX_Emoticon_Motion_Surprise']);
  expect(sounds('[!]')).toEqual(['SFX_Emoticon_Motion_Exclaim']);
  expect(sounds('[...]')).toEqual(['SFX_Emoticon_Motion_Dot']);
  expect(sounds('unknown')).toEqual([]);
});
