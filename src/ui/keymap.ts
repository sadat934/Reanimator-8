// Pure keyboard map (no DOM). CHIP-8 keypad layout on the left, keyboard keys on the right:
//   1 2 3 C  ->  1 2 3 4
//   4 5 6 D  ->  Q W E R
//   7 8 9 E  ->  A S D F
//   A 0 B F  ->  Z X C V

export const KEY_TO_HEX: Readonly<Record<string, number>> = {
  '1': 0x1, '2': 0x2, '3': 0x3, '4': 0xc,
  q: 0x4, w: 0x5, e: 0x6, r: 0xd,
  a: 0x7, s: 0x8, d: 0x9, f: 0xe,
  z: 0xa, x: 0x0, c: 0xb, v: 0xf,
};

/** Maps a KeyboardEvent.key value to a CHIP-8 key 0..15, or null if unmapped. */
export function keyToHex(key: string): number | null {
  const value = Object.hasOwn(KEY_TO_HEX, key.toLowerCase()) ? KEY_TO_HEX[key.toLowerCase()] : undefined;
  return value ?? null;
}
