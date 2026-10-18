import { describe, expect, it } from 'vitest';
import metadata from './main-background-effects.json';
import {
  mainAtmosphereBehindCharacters,
  mainAtmospherePlan,
} from './main-atmosphere';

describe('official main-story atmosphere composition', () => {
  it('uses native prefab layer scope for flash and scroll effects', () => {
    expect(mainAtmosphereBehindCharacters('BG_Flash')).toBe(true);
    expect(mainAtmosphereBehindCharacters('BG_ScrollB_1.0')).toBe(true);
    expect(mainAtmosphereBehindCharacters('BG_Snow_L')).toBe(false);
    expect(mainAtmosphereBehindCharacters('BG_SnowStorm_Sound')).toBe(false);
    expect(mainAtmosphereBehindCharacters('BG_Film_Grain_BG')).toBe(true);
  });
  it('keeps background-only grayscale separate from actors', () => {
    expect(mainAtmospherePlan(3538076526)).toMatchObject({
      names: ['Shader_Gray_BG'],
      backgroundFilter: 'grayscale(1)',
      characterFilter: '',
    });
    expect(mainAtmospherePlan(356899549)).toMatchObject({
      names: ['Shader_Gray'],
      backgroundFilter: 'grayscale(1)',
      characterFilter: 'grayscale(1)',
    });
  });

  it('retains both authored layers and their distinct filter scopes', () => {
    const plan = mainAtmospherePlan(3580094783)!;
    expect(plan.names).toEqual(['BG_Filter_Flashback_BG', 'Shader_Gray']);
    expect(plan.backgroundFilter).toContain('grayscale(1)');
    expect(plan.backgroundFilter).toContain('sepia(.18)');
    expect(plan.characterFilter).toBe('grayscale(1)');
    expect(mainAtmospherePlan(2609792832)!.names).toEqual([
      'Shader_Gray_BG',
      'BG_Dust_L',
    ]);
  });

  it('distinguishes persistent atmosphere from finite source effects', () => {
    expect(mainAtmospherePlan(786952175)!.finite).toBe(true);
    expect(mainAtmospherePlan(1924060894)!.finite).toBe(true);
    expect(mainAtmospherePlan(2313116516)!.finite).toBe(true);
    expect(mainAtmospherePlan(2675527592)!.finite).toBe(false);
  });

  it('does not disguise missing official metadata as dust', () => {
    expect(mainAtmospherePlan(0)).toEqual({
      names: [],
      backgroundFilter: '',
      characterFilter: '',
      finite: false,
    });
    for (const id of [3158805047, 819177196, 4089754957])
      expect(mainAtmospherePlan(id)).toBeNull();
  });

  it('covers all 66 main-story IDs present in the official metadata', () => {
    expect(Object.keys(metadata)).toHaveLength(66);
    for (const [id, row] of Object.entries(metadata))
      expect(mainAtmospherePlan(Number(id))!.names).toEqual(
        [row.Effect, row.Effect2].filter(Boolean),
      );
  });
});
