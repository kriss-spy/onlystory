import { expect, test } from 'vitest';
import { combatPieces } from './combat-effects';

test('combat cues use finite native art and emitter lifetime ranges', () => {
  const shot = combatPieces('Shot_Center');
  expect(shot).toHaveLength(1);
  expect(shot[0].texture).toBe('FX_TEX_Hit_01');
  expect(shot[0].duration).toBe(150);
  expect(Math.max(...combatPieces('nkultra').map((p) => p.duration))).toBe(850);
  expect(Math.max(...combatPieces('nkultrabreak').map((p) => p.duration))).toBe(
    600,
  );
  expect(combatPieces('unmapped')).toEqual([]);
});
