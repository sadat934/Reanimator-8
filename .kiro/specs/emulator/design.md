# Design: `emulator` (spec 1 of 6)

## Overview

The emulator is a single class, `Chip8`, in `src/emulator/chip8.ts`, with no DOM or Node dependencies. It owns all machine state in preallocated typed arrays. `step()` fetches one 16-bit opcode, decodes it by its high nibble, and runs a small handler. `runFrame()` runs `cyclesPerFrame` steps and ticks both timers once. A failing instruction never throws to the caller. It sets a `crash` record, and later `step()` and `runFrame()` calls become no-ops. A thin browser layer (`src/ui/`) maps keys, drives `runFrame()` from `requestAnimationFrame`, and paints a plain canvas.

**Stack (locked on approval):** TypeScript (strict, ES2022, ESM), Vite for dev and build, Vitest for tests, no runtime dependencies, plain DOM and 2D canvas. Node 18+.

## File layout

```
package.json  tsconfig.json  vite.config.ts  index.html  .env.example  THIRD_PARTY.md
src/main.ts                       # minimal: boot renderer with test ROM
src/emulator/chip8.ts             # Chip8 class + quirks comment at top
src/emulator/types.ts             # Quirks, Chip8Config, Chip8Status, CrashReason, constants
src/emulator/font.ts              # 80-byte font authored here
src/emulator/rng.ts               # seeded PRNG (mulberry32-style, own implementation)
src/emulator/index.ts             # public re-exports
src/emulator/testRom.ts           # exports TEST_ROM: Uint8Array (commented hand-assembly)
src/ui/keymap.ts                  # pure: KEY_TO_HEX map, keyToHex(event.key)
src/ui/renderer.ts                # canvas painting + rAF loop + key listeners
examples/README.md                # keeps examples/ present for the hook (games arrive in spec 2+)
.kiro/hooks/run-headless-tests.kiro.hook
docs/BUILD_LOG.md
tests/emulator/*.test.ts          # one file per opcode group, plus api, crash, determinism, rom
tests/ui/keymap.test.ts
tests/helpers.ts                  # op(...) assembler helper: builds ROM bytes from opcode numbers
```

Vitest uses the default Node environment (no DOM). Tests live under `tests/` and `vitest.config` is folded into `vite.config.ts` (`test.include: ['tests/**/*.test.ts']`).

## Public API types (`types.ts`)

```ts
export type Quirks = {
  shiftUsesVy: boolean;        // 8XY6/8XYE: VX = VY >> 1 (true) or VX >>= 1 (false)
  loadStoreIncrementsI: boolean; // FX55/FX65: I += X + 1 afterwards
  jumpUsesVx: boolean;         // BNNN: false => PC = NNN + V0; true => BXNN uses VX
  logicResetsVf: boolean;      // 8XY1/2/3 set VF = 0
  spriteWrap: boolean;         // true: wrap pixels at edges; false: clip
  waitKeyOnRelease: boolean;   // FX0A completes when the key is released
  flagWrittenLast: boolean;    // VF result overrides arithmetic result when X == 0xF
};

export type Chip8Config = {
  cyclesPerFrame: number;      // integer 1..1000, default 12
  quirks: Partial<Quirks>;     // merged over DEFAULT_QUIRKS
  seed: number;                // uint32 PRNG seed for CXNN, default 1
};

export type CrashReason =
  | { kind: 'unknown-opcode'; opcode: number; pc: number }
  | { kind: 'stack-overflow'; pc: number }
  | { kind: 'stack-underflow'; pc: number }
  | { kind: 'out-of-bounds-memory'; pc: number; address: number; opcode: number };

export type Chip8Status = {
  crashed: boolean;
  reason: CrashReason | null;
  pc: number; cycles: number; frames: number;
  delayTimer: number; soundTimer: number;
  waitingForKey: boolean;
};

export const MEMORY_SIZE = 4096, PROGRAM_START = 0x200, FONT_START = 0x050,
  MAX_ROM_SIZE = 3584, DISPLAY_WIDTH = 64, DISPLAY_HEIGHT = 32, STACK_DEPTH = 16;
```

```ts
class Chip8 {
  constructor(config?: Partial<Chip8Config>);
  loadRom(bytes: Uint8Array): void;   // validates, resets, installs font, copies ROM
  reset(): void;                      // same as reloading the current ROM; keeps config
  step(): void;                       // one instruction (no timer tick)
  runFrame(): void;                   // cyclesPerFrame steps, then one timer tick
  pressKey(k: number): void;          // 0..15
  releaseKey(k: number): void;
  getDisplay(): Uint8Array;           // 2048 entries (0|1), row-major, a copy
  getStatus(): Chip8Status;           // fresh object each call
}
```

Reasons: `getStatus().reason` is a structured object (not just a string). A helper `describeCrash(reason): string` in `types.ts` produces the human text for the UI and later for the LLM repair report.

## Key decisions

**Dispatch.** `step()` reads `opcode = mem[pc] << 8 | mem[pc+1]`, advances `pc` by 2, then `switch (opcode >> 12)`. Group `0`, `8`, `E`, `F` use a second switch. Alternatives (a 64k lookup table, an opcode-object table) were rejected: the switch is the simplest and fastest to read, and allocation-free.

**Crash mechanism.** Handlers call `this.fail(reason)`, which stores the record and returns. `step()` returns right after a failed handler. To satisfy R20, `step()` saves `pc` before the fetch and restores it on crash. Validation always precedes mutation, so a crashed instruction has no partial effect (R18).

**Bounds rules.**
- Fetch: crash if `pc > 4094`. Address in the reason is `pc`. Fetching from `0..0x1FF` is allowed (the font lives there).
- `DXYN`: crash if `I + N > 4096`. `FX55/FX65`: crash if `I + X >= 4096`. `FX33`: crash if `I + 2 >= 4096`.
- `FX1E`: `I = (I + VX) & 0xFFFF`, no crash. A later memory access using a large `I` crashes. `I` is kept as a 16-bit value. `ANNN` is 12-bit so `I` only exceeds 4095 through `FX1E`.
- `FX29`: `I = FONT_START + (VX & 0xF) * 5`.

**Stack.** Array of 16 numbers plus `sp`. `2NNN` crashes when `sp === 16`. `00EE` crashes when `sp === 0`.

**Timers and the frame.** `runFrame()` loops `cyclesPerFrame` times, breaking out if crashed. If the machine is waiting for a key (FX0A), it still ticks timers (the CPU is stalled, not time). The timer tick happens after the cycles. The tick is skipped on a crashed machine.

**FX0A.** Implemented as a stall: the handler sets `waitingKey = true` with the target register and rewinds `pc -= 2`. Each later `step()` re-executes FX0A. With `waitKeyOnRelease` true, it records a pressed key and completes when that key is released, storing the key in VX. This keeps `step()` deterministic and needs no extra state machine beyond `waitKeyLatched: number` (-1 when none). Waiting steps still count as cycles.

**DXYN.** Start coordinates are `VX % 64`, `VY % 32` (always wrapped). For each row and bit, the pixel position is `x0 + col`, `y0 + row`. With `spriteWrap` false, pixels with `x >= 64` or `y >= 32` are dropped. With it true they use modulo. XOR into the display; if a lit pixel turns off, VF = 1. VF is written after drawing (it is set to 0 first). `N = 0` draws nothing and sets VF = 0 (no SUPER-CHIP 16x16).

**Random.** `CXNN`: `VX = rng.nextByte() & NN`. The PRNG is a small own implementation seeded from `config.seed`, reseeded on `loadRom`, so runs are reproducible.

**Arithmetic and VF.** For `8XY4/5/7`, `8XY6/E`: compute the result and flag first, then write. With `flagWrittenLast` true the flag is written after the result, so when X is 0xF the flag wins. Subtract flag is "not borrow" (VF = 1 when VX >= VY for 8XY5, VY >= VX for 8XY7).

**Renderer.** `renderer.ts` exports `startRenderer({ canvas, statusEl, rom })`. A fixed-step accumulator turns `requestAnimationFrame` timestamps into whole 60 Hz frames (capped at 5 per tick to avoid spiral after tab suspension). Painting: `ImageData` of 64x32 written to an offscreen-sized canvas, canvas CSS scaled with `image-rendering: pixelated` (canvas is 64x32 internal, displayed at 10x). Colors: lit `#33ff66`, off `#001a08`. The status line updates at most once per frame, and shows the crash text from `describeCrash`.

**Keyboard.** `keymap.ts` holds `KEY_TO_HEX: Record<string, number>` for `1 2 3 4 q w e r a s d f z x c v`, and `keyToHex(key: string): number | null` (lowercases). Listeners: `keydown` ignores `event.repeat`, ignores events with ctrl/meta/alt modifiers, calls `preventDefault` only for mapped keys. `blur` releases all 16 keys. Pressed state is not duplicated in the UI; the renderer just forwards to the machine.

## Opcode-group breakdown

| Group | Opcodes | Notes / test file |
|---|---|---|
| System / flow | `00E0, 00EE, 1NNN, 2NNN, BNNN` | `flow.test.ts`; `0NNN` (SYS) is unknown-opcode |
| Skips | `3XNN, 4XNN, 5XY0, 9XY0, EX9E, EXA1` | `skips.test.ts`; `5XY0`/`9XY0` with low nibble != 0 is unknown-opcode |
| Load / add | `6XNN, 7XNN, 8XY0` | `registers.test.ts`; `7XNN` wraps at 8 bits, no flag |
| ALU | `8XY1..8XY7, 8XYE` | `alu.test.ts`; flags and quirks |
| Index / memory | `ANNN, FX1E, FX29, FX33, FX55, FX65` | `memory.test.ts` |
| Random | `CXNN` | `random.test.ts`; seeded reproducibility, mask |
| Display | `DXYN` | `display.test.ts`; XOR, collision, wrap vs clip, start coord wrap |
| Timers / keys | `FX07, FX15, FX18, FX0A` | `timers-keys.test.ts` |
| Other | crash reasons, API validation, determinism | `crash.test.ts`, `api.test.ts`, `determinism.test.ts` |
| ROM | the authored test ROM | `rom.test.ts` |
| UI | key map | `tests/ui/keymap.test.ts` |

## Quirk set (CLOSED in spec 2)

**Closed in spec 2 (`compiler-and-harness`).** The vendored Octo (John Earnest, MIT, commit `76f816c`) was read and each row was checked against Octo's own emulator (`js/emulator.js`) with all of its quirk options off, which is Octo's default. All seven values already matched, so no default changed. Octo's shift option off means VX = VY shifted, load/store option off means I += X + 1, jump option off means V0 is added, logic option off leaves VF alone, clip option off wraps sprite pixels, `FX0A` completes on key release, and `writeCarry` writes VF after VX. `tests/compiler/octo-quirks.test.ts` compiles Octo programs and runs them here to pin each row. Differences that are not quirks: Octo's call stack holds 12 entries (ours 16), and Octo draws a 16x16 SUPER-CHIP sprite for N = 0 (ours draws nothing), so the `compile()` wrapper rejects SUPER-CHIP and XO-CHIP programs.

| Quirk | Chosen default | Reason |
|---|---|---|
| Shift (`8XY6/8XYE`) | `shiftUsesVy: true`. VX = VY shifted, VF = shifted-out bit | Original CHIP-8 semantics, and Octo's default (its "shift quirks" option is off). Games written for Octo expect this. |
| Load/store (`FX55/FX65`) | `loadStoreIncrementsI: true`. I += X + 1 | Original semantics, Octo default (load/store quirks off). Octo programs that stream data through `save`/`load` rely on it. |
| Jump (`BNNN`) | `jumpUsesVx: false`. PC = NNN + V0 | Original semantics, Octo default (`jump0` quirk off). |
| VF reset (`8XY1/2/3`) | `logicResetsVf: false`. VF is left unchanged | Octo's default (logic quirk off). Modern ROMs and Octo output do not depend on the reset. Note the original VIP resets VF, so this one differs from the VIP. |
| Sprite clipping/wrapping | `spriteWrap: true`. Pixels wrap; start coordinates always wrap | Octo's default (clip quirk off), and generated games benefit from wrapping since the LLM often draws near edges. Differs from the VIP, which clips. |
| `FX0A` | `waitKeyOnRelease: true` | Original VIP behavior, and Octo's `key` wait behavior. |
| Flag ordering | `flagWrittenLast: true`. VF wins when X = 0xF | Matches Octo's default order; avoids ambiguity in `8FY4`-style code. |

Other fixed behavior (not configurable): `7XNN` sets no flag, `FX1E` sets no flag, `DXYN` with N = 0 draws nothing, `0NNN` is unknown.

The top-of-file comment in `chip8.ts` lists this same table with the reasons, and records that it was reconciled with Octo in spec 2.

## Authored test ROM (`testRom.ts`)

Hand-assembled by us, written as 16-bit opcodes with a comment per line. The program waits for a key, then draws that key's font glyph at a column that advances for each key press:

```
200  00E0   CLS
202  6A00   VA = 0        ; x
204  6B0C   VB = 12       ; y
206  F20A   V2 = wait key (press then release)
208  F229   I = font(V2)
20A  00E0   CLS
20C  DAB5   draw 5 rows at (VA, VB)
20E  7A06   VA += 6
210  3A3C   skip next if VA == 60
212  1206   jump 206
214  6A00   VA = 0
216  1206   jump 206
```

Before any key press the screen is blank (the title of the page tells the user to press a key). The first press of key `5` draws glyph `5` at (0,12). A second key draws its glyph at x = 6 after clearing (the CLS wipes the previous glyph; the x position still advances, so the glyph moves right). The test asserts exact pixel positions derived from the font table. Rendering "something" immediately matters for a smoke check in the browser, so `main.ts` also lets a human see glyphs by key press.

Note: because `FX0A` waits for release, the browser flow is press, release, glyph appears.

## Hook

`.kiro/hooks/run-headless-tests.kiro.hook` (JSON): event `fileEdited`, patterns `["examples/**", "src/emulator/**"]`, action `runCommand` with `npx vitest run tests/emulator`. Later specs may extend the command to run the harness over `examples/*.8o`. The exact hook schema is checked against an existing Kiro hook file format by the coder; the intent above is what is required.

## Error handling

| Operation | Failure | Class | Caller gets | Logging |
|---|---|---|---|---|
| `loadRom` | not `Uint8Array` | caller bug | throws `TypeError` | none |
| `loadRom` | length 0 or > 3584 | caller bug | throws `RangeError`, machine unchanged | none |
| `pressKey/releaseKey` | not integer 0..15 | caller bug | throws `RangeError` | none |
| constructor | `cyclesPerFrame` not integer 1..1000, or seed not uint32 | caller bug | throws `RangeError` | none |
| `step/runFrame` | unknown opcode, stack over/underflow, bad memory access | fatal for the program | no throw; status `crashed: true` with reason; further calls no-op | none in core (core has no logger). The renderer shows it in the status line and `console.error` once. |
| renderer | canvas 2D context missing | fatal for UI | status line "Canvas not supported", no loop started | `console.error` once |
| renderer | unmapped key | ignorable | event untouched | none |

## Validation rules for external inputs

| Input | Required | Type | Limits | On failure |
|---|---|---|---|---|
| ROM bytes | yes | `Uint8Array` | 1..3584 bytes | throw (above) |
| Key index | yes | integer | 0..15 | throw `RangeError` |
| `cyclesPerFrame` | no (12) | integer | 1..1000 | throw `RangeError` |
| `seed` | no (1) | integer | 0..2^32-1 | throw `RangeError` |
| `quirks` | no | partial boolean record | known keys only | unknown keys throw `TypeError` |
| `KeyboardEvent.key` | n/a | string | n/a | unmapped returns `null`, ignored |

## Invariants and who enforces them

- Registers, `I`, and timers hold the right width (`Uint8Array` registers, masked `I`): enforced by the `Chip8` class on every write, because it is the only writer.
- Memory access in range: enforced in each handler before mutation, since only the handler knows the effective address.
- Display holds 0 or 1: enforced in `DXYN`, the only writer, and by copying in `getDisplay`.
- A crashed machine never changes: enforced by an early return in `step()`.
- Valid key indexes: enforced at the API boundary (`pressKey/releaseKey`). The renderer cannot produce bad ones because `keymap.ts` only returns 0..15.
- Core is deterministic: enforced by design (no clock, no `Math.random`) and by the determinism test.

## Testability

Unit tests (all headless, no DOM): every opcode through a helper `run(machine, opcodes[])` that loads a ROM built from opcode numbers and steps it. Quirks are tested by constructing a machine with the quirk toggled. Crash tests execute bad programs. The ROM test uses the real `TEST_ROM` and asserts pixels. The key map is tested as pure data. The renderer's rAF loop and canvas painting are not unit-tested; they are checked manually by the dev-server done check. A small pure function `framesToRun(elapsedMs, accumulator)` can be extracted from the renderer and tested if the coder wants, but this is optional.

## Edge cases

- `8XY6` with X = 0xF: VF holds the shifted-out bit.
- `FX55` with X = 0xF at `I = 4080` is valid (`I + 15 = 4095`); at `I = 4081` it crashes.
- `DXYN` at `VX = 70`: start is `70 % 64 = 6`.
- `2NNN` to the instruction's own address is allowed (infinite recursion is caught as stack overflow at depth 16).
- A ROM that never draws and never crashes simply runs. Hang detection belongs to the harness (spec 2).
- Key pressed before `loadRom`: cleared by the reset in `loadRom`.
- `FX0A` while a key is already held at entry: the held key does not count until it is released after being observed as pressed in this wait (latching begins on the first step of the wait; a key already down is latched immediately, and completes when it is released).
