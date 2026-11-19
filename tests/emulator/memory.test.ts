import { describe, expect, it } from 'vitest';
import { FONT, FONT_START } from '../../src/emulator';
import { regs, run } from '../helpers';

describe('index and memory opcodes', () => {
  it('ANNN sets I', () => {
    expect(run([0xa123]).inspect().i).toBe(0x123);
  });

  it('FX1E adds VX to I without a flag', () => {
    const m = run([0xa100, 0x6010, 0x6f07, 0xf01e]);
    expect(m.inspect().i).toBe(0x110);
    expect(regs(m)[0xf]).toBe(7);
  });

  it('FX29 points I at the font glyph', () => {
    const m = run([0x600a, 0xf029]);
    expect(m.inspect().i).toBe(FONT_START + 10 * 5);
    expect(m.inspect().memory[FONT_START + 50]).toBe(FONT[50]);
  });

  it('FX33 stores BCD', () => {
    const m = run([0x609c, 0xa300, 0xf033]); // 156
    expect(Array.from(m.inspect().memory.slice(0x300, 0x303))).toEqual([1, 5, 6]);
  });

  it('FX55 stores V0..VX and increments I by X+1 by default', () => {
    const m = run([0x6011, 0x6122, 0x6233, 0xa300, 0xf155]);
    const mem = m.inspect().memory;
    expect([mem[0x300], mem[0x301], mem[0x302]]).toEqual([0x11, 0x22, 0]);
    expect(m.inspect().i).toBe(0x302);
  });

  it('FX55 leaves I alone when loadStoreIncrementsI is off', () => {
    const m = run([0xa300, 0xf255], { quirks: { loadStoreIncrementsI: false } });
    expect(m.inspect().i).toBe(0x300);
  });

  it('FX65 loads V0..VX and increments I', () => {
    const m = run([0x6011, 0x6122, 0xa300, 0xf155, 0x6000, 0x6100, 0xa300, 0xf165]);
    expect(regs(m).slice(0, 2)).toEqual([0x11, 0x22]);
    expect(m.inspect().i).toBe(0x302);
  });

  it('FX65 leaves I alone when loadStoreIncrementsI is off', () => {
    const m = run([0xa300, 0xf165], { quirks: { loadStoreIncrementsI: false } });
    expect(m.inspect().i).toBe(0x300);
  });

  it('FX with an unknown low byte is an unknown opcode', () => {
    expect(run([0xf1ff]).getStatus().reason?.kind).toBe('unknown-opcode');
  });

  it('the font is installed at 0x050 (80 bytes)', () => {
    const mem = run([0x1200]).inspect().memory;
    expect(FONT.length).toBe(80);
    expect(Array.from(mem.slice(FONT_START, FONT_START + 80))).toEqual(Array.from(FONT));
  });
});
