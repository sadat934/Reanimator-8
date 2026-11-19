# Requirements: `emulator` (spec 1 of 6)

## Summary

A from-scratch CHIP-8 virtual machine in strict TypeScript with a deterministic headless API, plus a minimal keyboard-mapped canvas renderer in a Vite + TypeScript scaffold. This spec also creates the repo scaffolding the later specs build on: tests, Kiro hook, `.env.example`, `THIRD_PARTY.md`, and `docs/BUILD_LOG.md`.

Source of truth: `.kiro/steering/reanimator.md` (sections 2, 3, 4, 5, 13).

## Assumptions

- A1. Octo is vendored later (spec 2). This spec does not include any Octo code. The quirk set is chosen here and was reconciled with Octo in spec 2 (see design, "Quirk set (CLOSED in spec 2)").
- A2. Everything runs locally. No hosting, serverless, or deployment work.
- A3. The CRT shader, audio, LLM code, harness, compiler, and gallery are out of scope. A plain 2D canvas is used.
- A4. "Deterministic" means: the same ROM, the same configuration, and the same sequence of API calls always produce the same state. No `Math.random` or wall-clock reads inside the core. `CXNN` uses an injectable seeded PRNG.
- A5. Node 18+ and npm are available. Dependencies are limited to `typescript`, `vite`, `vitest` (dev only).

## Functional Requirements (EARS)

### Core machine

- **R1.** The system shall provide 4096 bytes of memory, load programs at `0x200`, and accept ROMs of up to 3584 bytes.
- **R2.** The system shall store the built-in 16-glyph font (5 bytes each, 80 bytes) at `0x050`, authored by this project.
- **R3.** The system shall provide registers `V0..VF`, index `I`, program counter `PC`, a 16-entry call stack, a delay timer, and a sound timer.
- **R4.** The system shall provide a 64x32 monochrome display where sprites are XORed and `VF` is set to 1 if any lit pixel is turned off, else 0.
- **R5.** The system shall implement every standard CHIP-8 opcode: `00E0, 00EE, 1NNN, 2NNN, 3XNN, 4XNN, 5XY0, 6XNN, 7XNN, 8XY0..8XY7, 8XYE, 9XY0, ANNN, BNNN, CXNN, DXYN, EX9E, EXA1, FX07, FX0A, FX15, FX18, FX1E, FX29, FX33, FX55, FX65`.
- **R6.** When `runFrame()` is called, the system shall execute `cyclesPerFrame` instructions (default 12, configurable, valid range 1 to 1000) and then decrement each non-zero timer by one, once per frame (60 Hz).
- **R7.** When an opcode handler reads or writes memory, the system shall check bounds first and never silently wrap or throw a JS exception.

### Headless API

- **R8.** The system shall expose `loadRom(bytes)`, `step()`, `runFrame()`, `pressKey(k)`, `releaseKey(k)`, `getDisplay()`, `getStatus()`, plus `reset()`.
- **R9.** When `loadRom` is called, the system shall reset all state (memory, registers, stack, timers, display, keys, crash state), install the font, and copy the ROM to `0x200`.
- **R10.** If `loadRom` receives an empty ROM, a ROM larger than 3584 bytes, or a non-`Uint8Array`, then it shall throw a `RangeError` or `TypeError` with a clear message and leave the machine unchanged.
- **R11.** If `pressKey` or `releaseKey` receives anything other than an integer 0..15, then it shall throw a `RangeError`.
- **R12.** `getDisplay()` shall return a copy (a `Uint8Array` of 2048 entries, each 0 or 1, row-major), so callers cannot mutate machine state.
- **R13.** `getStatus()` shall return `{ crashed, reason, pc, cycles, frames, delayTimer, soundTimer, waitingForKey }`, where `reason` is `null` when not crashed.
- **R14.** If the machine is crashed, then `step()` and `runFrame()` shall do nothing and shall not throw.

### Crash handling

- **R15.** If an opcode is not recognized, then the machine shall crash with reason kind `unknown-opcode`, including the opcode and `pc`.
- **R16.** If `2NNN` would push to a full stack (16 entries), then the machine shall crash with `stack-overflow`.
- **R17.** If `00EE` is executed with an empty stack, then the machine shall crash with `stack-underflow`.
- **R18.** If an instruction fetch, `FX55`, `FX65`, `FX33`, or `DXYN` would access memory outside 0..4095, then the machine shall crash with `out-of-bounds-memory`. Partial writes shall not occur before the check.
- **R19.** If `PC` points at an odd or out-of-range fetch (`PC > 4094`), then the machine shall crash with `out-of-bounds-memory`.
- **R20.** The crashing instruction shall leave `PC` pointing at the faulting instruction, so reports are reproducible.

### Quirks

- **R21.** The system shall implement one documented quirk set for shift, load/store, jump, VF reset, sprite clipping/wrapping, `FX0A` completion, and flag ordering, and shall describe it in a comment at the top of `src/emulator/chip8.ts`, with a reason for each choice.
- **R22.** The quirk set shall be held in a typed `Quirks` config with defaults equal to the documented set, so spec 2 can change a default without touching opcode logic.
- **R23.** The design shall flag that the quirk set must be reconciled with the Octo compiler defaults when Octo is vendored in spec 2.

### Browser renderer and keyboard

- **R24.** The system shall provide a Vite + TypeScript page that loads the project's test ROM, runs it at 60 frames per second via `requestAnimationFrame`, and draws the display to a plain `<canvas>`.
- **R25.** The renderer shall map keys as: `1 2 3 C -> 1 2 3 4`, `4 5 6 D -> Q W E R`, `7 8 9 E -> A S D F`, `A 0 B F -> Z X C V` (case-insensitive, by `event.key`).
- **R26.** When a mapped key goes down or up, the renderer shall call `pressKey` or `releaseKey` and call `preventDefault`. Auto-repeat keydown events shall not cause repeated presses.
- **R27.** When the window loses focus, the renderer shall release all keys.
- **R28.** The renderer shall show the machine status (including crash reason) as text outside the canvas, and a visible keymap legend.
- **R29.** `src/main.ts` shall stay minimal. Renderer logic and key mapping shall live in separate modules so the key map is unit-testable without a DOM.
- **R30.** The renderer shall not implement CRT effects, audio, pause, speed, or download (later specs).

### Tests

- **R31.** The repo shall include Vitest unit tests for each opcode group: system/flow (`00E0, 00EE, 1, 2, B`), conditional skips (`3, 4, 5, 9, E`), register loads and arithmetic (`6, 7, 8`), index/memory (`A, F-group memory ops, FX33, FX55, FX65, FX29, FX1E`), random (`C`), display (`D`), timers/keys (`FX07, FX0A, FX15, FX18`).
- **R32.** The repo shall include tests for each crash reason, API validation (R10, R11, R12), determinism, timer ticking, and the key map.
- **R33.** The repo shall include one test ROM authored by this project (not copied), with a test that runs it headlessly and asserts exact display output.
- **R34.** Tests shall not rely on timers, wall-clock, network, or DOM.

### Scaffold and files

- **R35.** The repo shall contain `package.json` (scripts: `dev`, `build`, `test`, `typecheck`), `tsconfig.json` (`strict: true`), `vite.config.ts`, `index.html`, and `src/main.ts`.
- **R36.** The repo shall contain `.env.example` with placeholders only: `LLM_PROVIDER`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY`, model-name variables for each provider, and daily-cap variables (per-visitor and global).
- **R37.** The repo shall contain a `THIRD_PARTY.md` skeleton with a table (item, type, source, license, license file path) and a note that Octo is added in spec 2. It shall list runtime/dev npm dependencies honestly.
- **R38.** The repo shall start `docs/BUILD_LOG.md` with a dated entry listing what was built, Kiro features used, and what was changed by hand.
- **R39.** The repo shall contain a Kiro hook in `.kiro/hooks/` that runs the headless tests when files in `examples/` or `src/emulator/` are saved. `examples/` shall exist (with a `.gitkeep` or README) so the pattern is valid.

### Integrity

- **R40.** All code shall be written from scratch in this repo during the submission period. No code from other emulators or tutorials shall be copied.
- **R41.** No copyrighted ROMs, fonts, sounds, or images shall be included. The font glyphs and test ROM are authored here.
- **R42.** No secrets shall be committed. `.env` stays ignored, `.env.example` is tracked.
- **R43.** `.kiro/` shall not be deleted or added to `.gitignore`.
- **R44.** Work shall be committed in small commits on `main` as `sadat934`. Nothing shall be pushed to the remote.

## Non-Functional Requirements

- **N1.** TypeScript strict mode. No `any` unless commented. Small pure functions where practical.
- **N2.** The core (`src/emulator/`) has no DOM, Node, or browser imports, so the later headless harness and serverless code can reuse it.
- **N3.** Performance: 1000 cycles per frame at 60 frames per second shall not allocate per instruction in the hot path (no per-step object creation except on crash).
- **N4.** The full test suite shall run in under 10 seconds.

## Acceptance Criteria

1. `npm install` exits 0.
2. `npx tsc --noEmit` exits 0 with `strict: true`.
3. `npx vitest run` exits 0, with at least one test file per group listed in R31 and tests for R32 and R33.
4. `npm run build` exits 0 and produces `dist/`.
5. `npm run dev` serves a page where the test ROM renders on the canvas. Pressing a mapped key changes the canvas (the test ROM shows that key's hex digit). Releasing and pressing other keys behaves per R26.
6. Loading a ROM that executes `0xF0FF` (unknown) yields `getStatus()` with `crashed: true` and reason kind `unknown-opcode`. Equivalent tests exist for stack overflow, stack underflow, and out-of-bounds memory.
7. After `loadRom(rom)` and N `runFrame()` calls, two separate machines produce byte-identical `getDisplay()` and `getStatus()`.
8. `getDisplay()` returns a new array each call; mutating it does not change the next result.
9. The top of `src/emulator/chip8.ts` has a quirks comment naming each choice in R21 and a reason.
10. The design file contains a section titled "Quirk set (CLOSED in spec 2)" that mentions the Octo reconciliation in spec 2.
11. The test ROM's headless test asserts the exact lit-pixel pattern for at least two different key sequences.
12. `.env.example` contains every variable in R36 with empty or placeholder values. `git grep` finds no real key patterns.
13. `THIRD_PARTY.md`, `docs/BUILD_LOG.md` (dated entry), and the hook file exist. The hook's patterns include `examples/**` and `src/emulator/**`.
14. `.gitignore` does not mention `.kiro`. `git log` shows multiple commits by `sadat934`. `git status -sb` shows no push to `origin`.
15. `grep` of the repo for `Octo` source files (`src/compiler/`) finds none.

## Out of Scope

- Octo vendoring, compiler, or assembler (spec 2). Headless report harness (spec 2).
- LLM providers, loop, API endpoint, rate limiting (specs 3, 4, 6).
- CRT shader, lightning, Web Audio, controls panel, gallery UI (spec 5, 6).
- SUPER-CHIP / XO-CHIP opcodes, hi-res mode, scrolling.
- Deployment, hosting, CI.
- ROM download, pause, speed slider, save states.
- MCP server (`tools/mcp-chip8`) and the BUILD_LOG reminder hook.
