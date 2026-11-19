# Requirements: `compiler-and-harness` (spec 2 of 6)

## Summary
Vendor the Octo compiler behind a typed wrapper, reconcile the emulator's quirks with it, add a deterministic headless test harness, ship four original example games, and expose compile-and-test to Kiro through a local MCP server. Adds the Octo steering file.

Source of truth: `.kiro/steering/reanimator.md` (sections 2, 3, 4, 7, 11, 13).

## Assumptions
- A1. Octo is vendored (user decision), not rewritten. License verified from the Octo repository before vendoring: MIT.
- A2. Everything runs locally. No hosting work.
- A3. Only plain CHIP-8 is supported. SUPER-CHIP and XO-CHIP programs are rejected.
- A4. The MCP server speaks newline-delimited JSON-RPC over stdio and implements only `initialize`, `ping`, `tools/list`, `tools/call`, so it needs no SDK dependency.

## Functional Requirements (EARS)
### Compiler
- **R1.** The repo shall contain the Octo compiler under `src/compiler/` with its `LICENSE` beside it, and `THIRD_PARTY.md` shall list it with source commit and license.
- **R2.** `compile(source)` shall return `{ ok: true, rom }` or `{ ok: false, errors: [{ message, line }] }` and shall never throw.
- **R3.** If a program uses SUPER-CHIP or XO-CHIP instructions, or the ROM exceeds 3584 bytes, then `compile` shall return an error.

### Quirks
- **R4.** The emulator's default quirks shall equal what the vendored Octo expects, verified by tests that compile Octo programs and run them on the emulator.
- **R5.** The open quirk item in `.kiro/specs/emulator/design.md` shall be closed.

### Harness
- **R6.** `runHeadless(rom)` shall run 300 frames, pressing keys `1 2 3 4 Q W E R A S D F Z X C V` in turn, and return a report with `passed`, `crashed`, `nonBlankAfterFrame5`, `displayChanged`, `changedAfterKeypress`, `hungWithoutDrawing`, and `failures`.
- **R7.** The report shall pass only if the machine did not crash, the display was lit in some frame after frame 5, the display changed over time, and the program drew at least once.
- **R8.** The harness shall be deterministic: the same ROM gives an identical report.
- **R9.** Tests shall cover passing and failing ROMs, one per criterion.

### Examples
- **R10.** `examples/` shall hold at least four original `.8o` games. Each shall compile and pass the harness, checked by a test. No copied games.

### MCP and steering
- **R11.** `tools/mcp-chip8/` shall provide an MCP server with a `compile_and_test(source)` tool that returns the compile result and, when it compiled, the harness report.
- **R12.** `.kiro/settings/mcp.json` shall register the server for this workspace.
- **R13.** `.kiro/steering/octo-cheatsheet.md` shall document Octo syntax in our own words, and a test shall compile its snippets.

### Kiro and docs
- **R14.** The hook in `.kiro/hooks/` shall fire on saves in `examples/` and `src/emulator/` and run the emulator, harness, and compiler tests.
- **R15.** `docs/BUILD_LOG.md` shall get a dated entry for this spec.
- **R16.** Work shall be committed in small commits on `main` as `sadat934`. Nothing shall be pushed. No secrets. `.kiro/` is neither deleted nor ignored.

## Non-Functional Requirements
- **N1.** TypeScript strict. The harness has no DOM or Node imports.
- **N2.** The full test suite runs in under 10 seconds.

## Acceptance Criteria
1. `npm install`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` exit 0.
2. All examples compile and pass the harness.
3. The built MCP server starts, and `compile_and_test` on an example returns a passing report.
