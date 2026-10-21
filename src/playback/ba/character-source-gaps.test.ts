import { it, expect } from 'vitest';
import { applyBaRow, initialBaState } from './state';
import { baSourceGaps } from './source-gaps';
import knownGaps from './source-gaps.json';
import type { BaAssets, BaRow } from './types';

for (const gap of knownGaps.filter((gap) => gap.field === 'Character')) {
  it(`omits only the declared missing actor cue at ${gap.group}:${gap.row}`, () => {
    const row: BaRow = {
      GroupId: gap.group,
      row: gap.row,
      ScriptKr: `3;${gap.value};00\n#3;black\n5;present;01`,
      TextJp: 'Preserved dialogue',
      BGName: 0,
      BGMId: 0,
      BGEffect: 0,
      Sound: '',
      Transition: 0,
    };
    const assets = {
      characters: {},
      sourceGaps: baSourceGaps(gap.group),
    } as BaAssets;
    const state = applyBaRow(initialBaState(), row, assets);
    expect(state.actors[gap.value]).toBeUndefined();
    expect(state.actors.present).toMatchObject({ visible: true, face: '01' });
    expect(
      applyBaRow(initialBaState(), { ...row, row: row.row + 1000 }, assets)
        .actors[gap.value],
    ).toBeDefined();
    expect(
      applyBaRow(initialBaState(), { ...row, GroupId: 0 }, assets).actors[
        gap.value
      ],
    ).toBeDefined();
    expect(
      applyBaRow(initialBaState(), row, { ...assets, sourceGaps: [] }).actors[
        gap.value
      ],
    ).toBeDefined();
  });
}
