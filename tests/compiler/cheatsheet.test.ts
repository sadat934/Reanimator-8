import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile';

// Each snippet is a statement block from .kiro/steering/octo-cheatsheet.md, placed after the
// data labels the snippet needs. The test keeps the cheat sheet from teaching syntax that fails.
const PRELUDE = ': ball\n  0b01100000\n  0b11110000\n  0b11110000\n  0b01100000\n: some-label\n  0xFF\n: my-label\n  return\n: my-routine\n  return\n';

const snippets: Record<string, string> = {
  assignment: `
:alias px v3
:const SPEED 2
: main
  v0 := 5
  v0 := v1
  v0 += 1
  v0 += v1
  v0 -= v1
  v0 =- v1
  v0 |= v1
  v0 &= v1
  v0 ^= v1
  v0 >>= v1
  v0 <<= v1
  v0 := random 0xFF
  px := SPEED
`,
  memory: `
: main
  i := some-label
  i := hex v0
  i += v0
  save v2
  load v2
  bcd v0
`,
  drawing: `
: main
  clear
  i := ball
  sprite v0 v1 4
  if vf == 1 then v2 := 1
`,
  conditions: `
: main
  if v0 == 5 then v1 := 1
  if v0 != v1 then v2 += 1
  if v0 > 3 then v2 := 2
  if v0 == 0 begin
    v1 := 1
  else
    v1 := 2
  end
`,
  loops: `
: main
  loop
    v0 += 1
    while v0 != 10
  again
  loop
    if v0 == 9 then return
  again
`,
  keys: `
: main
  v0 := 4
  if v0 key then v1 += 1
  if v0 -key then v1 -= 1
  v0 := key
`,
  timers: `
: wait-tick
  v0 := 1
  delay := v0
  loop
    v0 := delay
    while v0 != 0
  again
  return
: main
  v0 := 60
  delay := v0
  v0 := delay
  buzzer := v0
  wait-tick
`,
  calls: `
: main
  my-routine
  jump my-label
  jump0 my-label
`,
};

describe('octo cheat sheet snippets', () => {
  for (const [name, body] of Object.entries(snippets)) {
    it(`${name} compiles`, () => {
      // Statements first so execution starts at main's code; data labels go after.
      const result = compile(body + PRELUDE);
      if (!result.ok) throw new Error(result.errors.map((e) => `line ${e.line}: ${e.message}`).join('; '));
      expect(result.rom.length).toBeGreaterThan(0);
    });
  }
});
