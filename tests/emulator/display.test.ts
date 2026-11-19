import { describe, expect, it } from 'vitest';
import { litPixels, regs, run } from '../helpers';

describe('DXYN', () => {
  it('draws using the font glyph for 0 (authored glyph, 3 wide)', () => {
    const m = run([0x6000, 0xf029, 0x6101, 0x6202, 0xd125]);
    // glyph 0 rows: E0 A0 A0 A0 E0, placed at x=1,y=2
    expect(litPixels(m)).toEqual([
      '1,2', '2,2', '3,2',
      '1,3', '3,3',
      '1,4', '3,4',
      '1,5', '3,5',
      '1,6', '2,6', '3,6',
    ]);
    expect(regs(m)[0xf]).toBe(0);
  });

  it('XORs and sets VF on collision, clears on redraw', () => {
    const m = run([0xa050, 0xd015, 0xd015, 0xd015], {}, 4);
    // first draw lights, second erases (VF=1), third lights again (VF=0)
    expect(litPixels(m).length).toBeGreaterThan(0);
    expect(regs(m)[0xf]).toBe(0);
    const m2 = run([0xa050, 0xd015, 0xd015], {}, 3);
    expect(litPixels(m2)).toEqual([]);
    expect(regs(m2)[0xf]).toBe(1);
  });

  it('wraps the start coordinate', () => {
    const m = run([0xa050, 0x6046, 0x6122, 0xd015]); // x=70 -> 6, y=34 -> 2
    expect(litPixels(m)[0]).toBe('6,2');
  });

  it('N = 0 draws nothing and clears VF', () => {
    const m = run([0x6f01, 0xa050, 0xd010]);
    expect(litPixels(m)).toEqual([]);
    expect(regs(m)[0xf]).toBe(0);
  });

  it('wraps pixels at the edges when spriteWrap is on', () => {
    const m = run([0xa050, 0x603e, 0x611e, 0xd015]); // x=62, y=30; glyph 0 is 3 wide, 5 tall
    const lit = litPixels(m);
    expect(lit).toContain('0,30'); // column 64 wrapped to 0
    expect(lit).toContain('62,0'); // row 32 wrapped to row 0
  });

  it('clips pixels at the edges when spriteWrap is off', () => {
    const m = run([0xa050, 0x603e, 0x611e, 0xd015], { quirks: { spriteWrap: false } });
    const lit = litPixels(m);
    expect(lit.every((p) => Number(p.split(',')[0]) >= 62)).toBe(true);
    expect(lit.every((p) => Number(p.split(',')[1]) <= 31)).toBe(true);
    expect(lit).toContain('62,30');
    expect(lit).not.toContain('0,30');
  });

  it('getDisplay returns 2048 entries of 0 or 1', () => {
    const d = run([0xa050, 0xd015]).getDisplay();
    expect(d.length).toBe(2048);
    expect(d.every((p) => p === 0 || p === 1)).toBe(true);
  });
});
