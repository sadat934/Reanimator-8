// Test ROM authored for this project (hand assembly, one opcode per line).
//
// Behaviour: draws glyph "0" at (0,12) on start. Then it waits for a key press and
// release (FX0A, default quirk), clears the screen, and draws that key's glyph at
// column VA. VA advances by 6 after each key and wraps to 0 after reaching 60.
// The font glyphs are 3 pixels wide and 5 tall, drawn with DXYN, N = 5.

const OPS: readonly number[] = [
  0x00e0, // 200  CLS
  0x6a00, // 202  VA = 0        x position
  0x6b0c, // 204  VB = 12       y position
  0xf029, // 206  I = font(V0)  V0 is 0 here, so glyph "0"
  0xdab5, // 208  draw 5 rows at (VA, VB)
  0xf20a, // 20A  V2 = key      wait for press and release
  0xf229, // 20C  I = font(V2)
  0x00e0, // 20E  CLS
  0xdab5, // 210  draw 5 rows at (VA, VB)
  0x7a06, // 212  VA += 6
  0x3a3c, // 214  skip next if VA == 60
  0x120a, // 216  jump 20A
  0x6a00, // 218  VA = 0
  0x120a, // 21A  jump 20A
];

export const TEST_ROM: Uint8Array = Uint8Array.from(
  OPS.flatMap((op) => [(op >> 8) & 0xff, op & 0xff]),
);
