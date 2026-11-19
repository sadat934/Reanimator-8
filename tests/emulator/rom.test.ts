import { describe, expect, it } from 'vitest';
import { Chip8, FONT, TEST_ROM } from '../../src/emulator';
import { litPixels } from '../helpers';

/** Presses and releases a key with a few frames between each event. */
function tap(m: Chip8, key: number): void {
  m.runFrame();
  m.pressKey(key);
  m.runFrame();
  m.releaseKey(key);
  m.runFrame();
  m.runFrame();
}

/** Expected lit pixels for a font glyph drawn at (x, y), from the font table. */
function glyph(key: number, x: number, y: number): string[] {
  const out: string[] = [];
  for (let row = 0; row < 5; row++) {
    const bits = FONT[key * 5 + row] as number;
    for (let col = 0; col < 8; col++) if (bits & (0x80 >> col)) out.push(`${x + col},${y + row}`);
  }
  return out.sort(byRowThenColumn);
}

function byRowThenColumn(a: string, b: string): number {
  const [ax = 0, ay = 0] = a.split(',').map(Number);
  const [bx = 0, by = 0] = b.split(',').map(Number);
  return ay - by || ax - bx;
}

const fresh = (): Chip8 => {
  const m = new Chip8();
  m.loadRom(TEST_ROM);
  return m;
};

describe('authored test ROM', () => {
  it('fits in program memory and starts with a CLS', () => {
    expect(TEST_ROM.length).toBe(28);
    expect([TEST_ROM[0], TEST_ROM[1]]).toEqual([0x00, 0xe0]);
  });

  it('draws glyph 0 at (0,12) before any key', () => {
    const m = fresh();
    m.runFrame();
    expect(litPixels(m)).toEqual(
      ['0,12', '1,12', '2,12', '0,13', '2,13', '0,14', '2,14', '0,15', '2,15', '0,16', '1,16', '2,16'],
    );
    expect(m.getStatus()).toMatchObject({ crashed: false, waitingForKey: true });
  });

  it('key 5 then key A: exact pixels, glyph moves right by 6', () => {
    const m = fresh();
    tap(m, 0x5);
    expect(litPixels(m)).toEqual([
      '0,12', '1,12', '2,12',
      '0,13',
      '0,14', '1,14', '2,14',
      '2,15',
      '0,16', '1,16', '2,16',
    ]);
    tap(m, 0xa);
    // key A glyph rows: E0 A0 E0 A0 A0 at x = 6
    expect(litPixels(m)).toEqual([
      '6,12', '7,12', '8,12',
      '6,13', '8,13',
      '6,14', '7,14', '8,14',
      '6,15', '8,15',
      '6,16', '8,16',
    ]);
  });

  it('key 0, F, 3: third glyph at x = 12, matches the font table', () => {
    const m = fresh();
    tap(m, 0x0);
    expect(litPixels(m)).toEqual(glyph(0, 0, 12));
    tap(m, 0xf);
    expect(litPixels(m)).toEqual(glyph(0xf, 6, 12));
    tap(m, 0x3);
    expect(litPixels(m)).toEqual(glyph(3, 12, 12));
  });

  it('wraps back to x = 0 after ten keys and never crashes', () => {
    const m = fresh();
    for (let k = 0; k < 10; k++) tap(m, k);
    expect(litPixels(m)).toEqual(glyph(9, 54, 12));
    tap(m, 0x7);
    expect(litPixels(m)).toEqual(glyph(7, 0, 12));
    expect(m.getStatus().crashed).toBe(false);
  });

  it('the display does not change while a key is held and not yet released', () => {
    const m = fresh();
    m.runFrame();
    const before = m.getDisplay();
    m.pressKey(4);
    m.runFrame();
    m.runFrame();
    expect(m.getDisplay()).toEqual(before);
  });
});
