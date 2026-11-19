import { describe, expect, it } from 'vitest';
import { KEY_TO_HEX, keyToHex } from '../../src/ui/keymap';

describe('keymap', () => {
  it('maps the 16 keys per the steering layout', () => {
    const layout = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];
    // CHIP-8 keypad rows: 1 2 3 C / 4 5 6 D / 7 8 9 E / A 0 B F
    const hexRows = [0x1, 0x2, 0x3, 0xc, 0x4, 0x5, 0x6, 0xd, 0x7, 0x8, 0x9, 0xe, 0xa, 0x0, 0xb, 0xf];
    layout.forEach((k, idx) => expect(keyToHex(k)).toBe(hexRows[idx]));
  });

  it('covers every hex value exactly once', () => {
    expect(Object.values(KEY_TO_HEX).sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, n) => n));
  });

  it('is case-insensitive', () => {
    expect(keyToHex('Q')).toBe(0x4);
    expect(keyToHex('V')).toBe(0xf);
  });

  it('returns null for unmapped keys and inherited property names', () => {
    for (const k of ['p', 'Enter', ' ', '', '5', 'constructor', '__proto__']) expect(keyToHex(k)).toBeNull();
  });
});
