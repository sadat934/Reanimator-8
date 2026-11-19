import { describe, expect, it } from 'vitest';
import { regs, run } from '../helpers';

const randoms = (seed: number, mask: number, count: number): number[] => {
  const ops = Array.from({ length: count }, (_, k) => 0xc000 | (k << 8) | mask);
  return regs(run(ops, { seed })).slice(0, count);
};

describe('CXNN random', () => {
  it('is reproducible for the same seed', () => {
    expect(randoms(7, 0xff, 8)).toEqual(randoms(7, 0xff, 8));
  });

  it('differs between seeds', () => {
    expect(randoms(7, 0xff, 8)).not.toEqual(randoms(8, 0xff, 8));
  });

  it('applies the mask', () => {
    for (const v of randoms(3, 0x0f, 8)) expect(v & 0xf0).toBe(0);
    expect(randoms(3, 0x00, 4)).toEqual([0, 0, 0, 0]);
  });

  it('produces varied values and accepts seed 0', () => {
    expect(new Set(randoms(0, 0xff, 12)).size).toBeGreaterThan(6);
  });
});
