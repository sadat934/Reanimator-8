# Tasks: `emulator` (spec 1 of 6)

Commit after each task on `main` with `git -c user.name="sadat934" -c user.email="sadat934@users.noreply.github.com" commit`. Never push. Do not touch or ignore `.kiro/`.

- [x] 1. **Scaffold the project.** `package.json` (scripts `dev`, `build`, `test`, `typecheck`; dev deps `typescript`, `vite`, `vitest`), `tsconfig.json` (strict, ES2022, ESM, `noUncheckedIndexedAccess`), `vite.config.ts` (with `test.include`), `index.html` with canvas, status element, and keymap legend, and a stub `src/main.ts`. Run `npm install`. _Requirements: R35, N1_
- [x] 2. **Add repo files.** `.env.example` (placeholders only), `THIRD_PARTY.md` skeleton (table, npm deps, Octo-in-spec-2 note), `examples/README.md`, `docs/BUILD_LOG.md` with the first dated entry. Confirm `.gitignore` still allows `.env.example` and does not mention `.kiro`. _R36, R37, R38, R39, R42, R43_
- [x] 3. **Add the Kiro hook** in `.kiro/hooks/run-headless-tests.kiro.hook` for `examples/**` and `src/emulator/**`, running `npx vitest run tests/emulator`. Follow the Kiro hook file format. _R39_
- [x] 4. **Write types, font, and PRNG.** `src/emulator/types.ts`, `font.ts` (authored glyphs), `rng.ts`, `index.ts`. Include `DEFAULT_QUIRKS`, `describeCrash`, and config validation. _R2, R3, R22, R42, N2_
- [x] 5. **Implement the core and API.** `chip8.ts` with the quirks comment at the top (all rows of the design table, reasons, "reconcile with Octo in spec 2"), `loadRom`, `reset`, `step`, `runFrame`, keys, `getDisplay` (copy), `getStatus`, crash mechanism, and bounds checks. _R1, R6 to R14, R21, R23_
- [x] 6. **Implement all opcodes** by group (flow, skips, load/add, ALU, index/memory, random, display, timers/keys including FX0A). Add crash reasons for unknown opcode, stack overflow and underflow, and out-of-bounds. Commit once per two or three groups. _R4, R5, R15 to R20_
- [x] 7. **Write the test helper** `tests/helpers.ts` (opcode-to-bytes, `run`). _R31, R34_
- [x] 8. **Write unit tests per opcode group** (`flow`, `skips`, `registers`, `alu`, `memory`, `random`, `display`, `timers-keys`), including each quirk toggle. Fix core bugs they reveal. _R31, R21, R22_
- [x] 9. **Write the crash, API, and determinism tests** (each crash reason with `pc` preserved, validation errors, `getDisplay` copy, two-machine identical runs, timer ticks per frame, crashed machine no-ops). _R10 to R20, R32_
- [x] 10. **Author the test ROM** `src/emulator/testRom.ts` (commented hand assembly from the design) and `tests/emulator/rom.test.ts` asserting exact pixels for at least two key sequences. _R33, R41, AC11_
- [x] 11. **Write the key map** `src/ui/keymap.ts` and `tests/ui/keymap.test.ts` (all 16 keys, case-insensitivity, unmapped returns null). _R25, R29, R32_
- [x] 12. **Write the renderer** `src/ui/renderer.ts` (fixed-step rAF loop, canvas paint, key listeners with repeat/modifier handling, blur release, status line with crash text) and a minimal `src/main.ts`. No CRT effects or audio. _R24, R26 to R30_
- [x] 13. **Run the done checks:** `npm install`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` all exit 0. Start `npm run dev` and confirm manually that the test ROM renders and key presses change the canvas. Confirm no push occurred (`git status -sb`) and that `git grep` finds no secrets. _AC1 to AC15_
- [x] 14. **Update `docs/BUILD_LOG.md`** with what was built, Kiro features used (steering, spec, hook), hand edits, and the open quirk flag for spec 2. Commit. _R38, R44_
- [x] 15. **Review step.** Review the code against requirements R1 to R44 and the integrity rules, fix findings, and re-run task 13. _All_
