# Tasks: `compiler-and-harness` (spec 2 of 6)

Commit after each task on `main` with `git -c user.name="sadat934" -c user.email="sadat934@users.noreply.github.com" commit`. Never push. Do not touch or ignore `.kiro/`.

- [x] 1. **Vendor Octo.** Verify the license, copy `compiler.js` to `src/compiler/octo-compiler.js` with `LICENSE`, add `.d.ts` and `compile.ts`, list in `THIRD_PARTY.md`, add tests. _R1 to R3_
- [x] 2. **Reconcile quirks.** Compare Octo's emulator with `DEFAULT_QUIRKS`, add `tests/compiler/octo-quirks.test.ts`, close the open item in the emulator design. _R4, R5_
- [x] 3. **Write the harness** `src/harness/headless.ts` and `tests/harness/headless.test.ts` with a passing and a failing ROM per criterion. _R6 to R9_
- [x] 4. **Write four original examples** in `examples/` and `tests/harness/examples.test.ts`. _R10_
- [x] 5. **Write the MCP server** in `tools/mcp-chip8/` with handler tests and a Vite bundle script. _R11_
- [x] 6. **Register the server** in `.kiro/settings/mcp.json`. _R12_
- [x] 7. **Write `.kiro/steering/octo-cheatsheet.md`** and `tests/compiler/cheatsheet.test.ts`. _R13_
- [x] 8. **Check the hook** covers `examples/**` and `src/emulator/**`, and extend its command to the harness and compiler tests. _R14_
- [x] 9. **Update `docs/BUILD_LOG.md`.** _R15_
- [x] 10. **Run the done checks:** `npm install`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`; all examples pass the harness; start the MCP server and call `compile_and_test` on an example. _AC1 to AC3_
- [ ] 11. **Review step.** Review against R1 to R16 and the integrity rules, fix findings, re-run task 10. _All_
