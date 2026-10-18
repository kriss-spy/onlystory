import { describe, expect, it } from 'vitest';
import { baTouchRegion } from './touch';

describe('BA interactive fingertip scenes', () => {
  it('mirrors the authored Arona and Plana regions around the stage center', () => {
    const arona = baTouchRegion('#fx;AronaTouch;0;0\n#touch;-361;203;300;300')!;
    const plana = baTouchRegion('#touch;361;203;300;300')!;
    expect(arona.left + plana.left).toBeCloseTo(100);
    expect(arona.top).toBeCloseTo(37.9704);
    expect(arona.width).toBeCloseTo(10);
    expect(arona.height).toBeCloseTo(17.7778);
    expect(baTouchRegion('#wait;1500')).toBeNull();
  });
  it('aligns with the fingertip marker in the original 1600 by 1124 Arona CG', () => {
    const region = baTouchRegion(
      '#touch;-361;203;300;300',
      { width: 1600, height: 1124 },
      { width: 1600, height: 1124 },
    )!;
    // The native fingertip marker is centered around (618, 458).
    expect(Math.abs(region.left * 16 - 618)).toBeLessThan(15);
    expect(Math.abs(region.top * 11.24 - 458)).toBeLessThan(15);
  });
  it('rejects malformed interactive regions', () => {
    expect(() => baTouchRegion('#touch;0;0;no;300')).toThrow();
  });
});
