import { describe, expect, it } from 'vitest';
import { regs, run } from '../helpers';

describe('register load and add', () => {
  it('6XNN loads a constant', () => {
    expect(regs(run([0x6ab7]))[0xa]).toBe(0xb7);
  });

  it('7XNN adds without touching VF and wraps at 8 bits', () => {
    const r = regs(run([0x6ffe, 0x61ff, 0x7102, 0x7f01]));
    expect(r[1]).toBe(1);
    expect(r[0xf]).toBe(0xff); // 0xFE + 1, no carry flag written
  });

  it('8XY0 copies VY into VX', () => {
    const r = regs(run([0x6233, 0x8120]));
    expect(r[1]).toBe(0x33);
    expect(r[2]).toBe(0x33);
  });
});
