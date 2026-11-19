import { describe, expect, it } from 'vitest';
import { Chip8, DEFAULT_QUIRKS } from '../../src/emulator';
import { compile } from '../../src/compiler/compile';
import { litPixels } from '../helpers';

/**
 * These tests compile real Octo source with the vendored compiler and run it on our
 * emulator with the default quirks. Each one fails if the matching default drifts away
 * from what Octo's own emulator does (Octo defaults: every quirk option off).
 */

function boot(source: string): Chip8 {
  const r = compile(source);
  if (!r.ok) throw new Error(`compile failed: ${JSON.stringify(r.errors)}`);
  const m = new Chip8();
  m.loadRom(r.rom);
  return m;
}

function frames(m: Chip8, n = 3): Chip8 {
  for (let f = 0; f < n; f++) m.runFrame();
  return m;
}

const regs = (m: Chip8) => Array.from(m.inspect().v);

describe('emulator quirks match Octo defaults', () => {
  it('default quirk set is the Octo default set', () => {
    expect(DEFAULT_QUIRKS).toEqual({
      shiftUsesVy: true,
      loadStoreIncrementsI: true,
      jumpUsesVx: false,
      logicResetsVf: false,
      spriteWrap: true,
      waitKeyOnRelease: true,
      flagWrittenLast: true,
    });
  });

  it('shift reads VY: v0 >>= v1 gives V0 = V1 >> 1', () => {
    const v = regs(frames(boot(': main\n v1 := 5\n v0 >>= v1\n loop again\n')));
    expect(v[0]).toBe(2);
    expect(v[0xf]).toBe(1);
  });

  it('shift left reads VY and sets VF to the bit shifted out', () => {
    const v = regs(frames(boot(': main\n v1 := 0x81\n v0 <<= v1\n loop again\n')));
    expect(v[0]).toBe(0x02);
    expect(v[0xf]).toBe(1);
  });

  it('load increments I by X + 1', () => {
    const v = regs(frames(boot(': main\n i := data\n load v0\n load v0\n loop again\n: data\n 7 9\n')));
    expect(v[0]).toBe(9);
  });

  it('save increments I by X + 1', () => {
    // The second save must land at data2 (I advanced by 2), so loading from data2 gives back 1 and 2.
    const src2 = ': main\n i := data\n v0 := 1\n v1 := 2\n save v1\n v0 := 5\n v1 := 6\n save v1\n i := data2\n load v1\n loop again\n: data\n 0 0\n: data2\n 0 0\n';
    const w = regs(frames(boot(src2)));
    expect([w[0], w[1]]).toEqual([5, 6]);
  });

  it('jump0 adds V0', () => {
    const src = ': main\n v0 := 4\n jump0 t\n: t\n v1 := 1\n jump done\n v1 := 2\n jump done\n: done\n loop again\n';
    expect(regs(frames(boot(src)))[1]).toBe(2);
  });

  it('logic ops leave VF alone', () => {
    const v = regs(frames(boot(': main\n vf := 1\n v0 := 1\n v1 := 2\n v0 |= v1\n v0 &= v1\n v0 ^= v1\n loop again\n')));
    expect(v[0xf]).toBe(1);
  });

  it('VF is written after the result when X is VF', () => {
    const v = regs(frames(boot(': main\n vf := 255\n v1 := 1\n vf += v1\n loop again\n')));
    expect(v[0xf]).toBe(1);
  });

  it('sprites wrap at the right edge', () => {
    const m = frames(boot(': main\n i := bar\n v0 := 62\n v1 := 0\n sprite v0 v1 1\n loop again\n: bar\n 0xFF\n'));
    expect(litPixels(m)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0', '5,0', '62,0', '63,0']);
  });

  it('key waits for a release and stores the released key', () => {
    const m = boot(': main\n v0 := key\n v1 := 7\n loop again\n');
    frames(m);
    m.pressKey(5);
    frames(m);
    expect(regs(m)[1]).toBe(0);
    m.releaseKey(5);
    frames(m);
    expect(regs(m)[0]).toBe(5);
    expect(regs(m)[1]).toBe(7);
  });
});
