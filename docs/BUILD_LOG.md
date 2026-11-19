# Build log

Dated record of what was built, which Kiro features were used, and what was changed by hand.

## 2026-11-19: spec 1, `emulator`

**Built**
- Vite + TypeScript scaffold (strict mode, `noUncheckedIndexedAccess`), Vitest config.
- From-scratch CHIP-8 core in `src/emulator/` (`chip8.ts`, `types.ts`, `font.ts`, `rng.ts`, `testRom.ts`): all standard opcodes, crash reasons (unknown opcode, stack overflow/underflow, out-of-bounds memory) with PC left at the faulting instruction, deterministic API (`loadRom`, `reset`, `step`, `runFrame`, `pressKey`, `releaseKey`, `getDisplay`, `getStatus`) plus a read-only `inspect()` used by tests.
- Authored assets: a 3x5 pixel font and a 28-byte test ROM (draws glyph 0, then the glyph of each key pressed, moving right).
- Browser renderer on a plain canvas (`src/ui/renderer.ts`) with a 60 Hz fixed-step loop, status line, and keyboard map (`src/ui/keymap.ts`).
- 13 test files, 98 tests: one per opcode group, crash reasons, API validation, determinism, test ROM exact pixels for several key sequences, key map.
- `.env.example` (placeholders only), `THIRD_PARTY.md` skeleton, `examples/` placeholder.

**Kiro features used**
- Steering: `.kiro/steering/reanimator.md` (integrity rules, stack, emulator requirements).
- Spec: `.kiro/specs/emulator/` (requirements, design, tasks; tasks ticked as completed).
- Hook: `.kiro/hooks/run-headless-tests.kiro.hook` runs `npx vitest run tests/emulator` on save of `examples/**` or `src/emulator/**`.

**Checks run**
- `npm install`, `npx tsc --noEmit`, `npx vitest run` (98 passed), `npm run build`: all exit 0.
- Dev server check: Vite dev server plus headless Edge driven over the DevTools protocol. The canvas showed glyph 0 at start (12 lit pixels), then keyboard keys W, 4, Z drew glyphs 5, C, A at x = 0, 6, 12 (11, 9, 12 lit pixels), so rendering and key input work in a real browser.

**Changed by hand / deviations from the design**
- PRNG is xorshift32 instead of the mulberry32 named in the design, to keep the implementation plainly our own.
- Font glyphs are 3 pixels wide (not the usual 4) so the glyph set is our own design.
- Added `Chip8.inspect()` (read-only copies of registers, I, stack, memory) because tests need register access.
- The test ROM draws glyph 0 before the first key press so the canvas is not blank at start.
- Odd PC values are allowed (only PC > 4094 crashes), following the design's bounds rules.

**Open flag for spec 2**
- The quirk defaults in `DEFAULT_QUIRKS` (`src/emulator/types.ts`) were chosen from what is known about Octo's defaults, not from its source. Verify each one against the vendored Octo and change the defaults if they differ. See "Quirk set (OPEN FLAG)" in `.kiro/specs/emulator/design.md`.

## 2026-11-19: spec 2, compiler-and-harness (part 1: vendored Octo and quirk reconciliation)

**What was built**
- Vendored the Octo compiler (js/compiler.js, commit 76f816c, John Earnest, MIT) into src/compiler/octo-compiler.js with src/compiler/LICENSE beside it. License verified from the repository's LICENSE.txt and GitHub metadata before vendoring. Listed in THIRD_PARTY.md.
- src/compiler/compile.ts: typed wrapper, compile(source) returns {ok: true, rom} or {ok: false, errors: [{message, line}]}. It never throws, rejects SUPER-CHIP/XO-CHIP programs, and rejects ROMs over 3584 bytes.
- Quirks reconciled: read Octo's own emulator (js/emulator.js) and compared each emulator default. All seven already matched Octo's defaults (shift reads VY, load/store increments I, jump0 uses V0, logic ops leave VF, sprites wrap, FX0A completes on release, VF written after the result), so no default value changed. The open item in .kiro/specs/emulator/design.md is closed, comments in chip8.ts and 	ypes.ts updated, and 	ests/compiler/octo-quirks.test.ts compiles Octo programs and runs them on our emulator to pin each default.
**Changed by hand / deviations**
- One edit to the vendored file: the last line became export { Compiler }; (documented in its header and in THIRD_PARTY.md).
- Octo differences that are not quirks, noted in chip8.ts: Octo's call stack is 12 deep (ours 16), and Octo draws a 16x16 sprite for N = 0 (ours draws nothing).
**Kiro features used**
- Spec follow-up edits to .kiro/specs/emulator/ (design and requirements) to close the open flag.
