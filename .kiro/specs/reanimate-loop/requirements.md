# Requirements: `reanimate-loop` (spec 4 of 6)

Source: `reanimator.md` sections 2, 7, 8, 13.

1. **R1 Attempts.** `reanimate(text, { provider })` makes at most 3 attempts per request.
2. **R2 Generate.** Each attempt asks the provider for Octo source using the system prompt (R8).
3. **R3 Compile.** The reply is compiled with `src/compiler`. A compile error goes to the repair step with the error message and line.
4. **R4 Test.** A compiled ROM runs in the headless harness (300 frames, scripted keys). The report must pass.
5. **R5 Repair.** On a compile error or a failed report, the next request contains the previous source, the error or report, and asks for a complete corrected program.
6. **R6 Progress.** A progress callback receives one line per step, for example "Attempt 1: compile error on line 12, repairing...". The same events are returned in `log`.
7. **R7 Result.** Success returns source, ROM bytes, report, attempt count and provider. After 3 failures the result is an honest failure that suggests a simpler prompt. If no provider answers, the loop stops at once with the provider's message ("The ghost is resting. Try the gallery.").
8. **R8 System prompt.** It holds a short Octo cheat sheet, CHIP-8 limits (64x32, 3584 bytes, 16 keys), game design rules (simple, one goal, visible score or lives, game-over state, restart key), and four full examples from `examples/`. Output rule: only Octo source, no fences, no explanation.
9. **R9 Untrusted input.** User text is cut to 200 characters, control characters are removed, and it appears only in the user message, never in the system prompt.
10. **R10 Fence stripping.** Replies are cleaned of markdown fences defensively.
11. **R11 Honest labeling.** If the provider is flagged offline (`offline: true` or a name starting with `mock` or `offline`), the log and result say "offline stand-in, not generated just now" and never claim live generation.
12. **R12 No eval.** Model output is only compiled and run in our emulator.
13. **R13 Tests.** Vitest with a scripted fake provider, no network, deterministic.
14. **R14 CLI.** `npm run reanimate -- "prompt"` runs the loop with keys from a local `.env`, prints the log, writes `.ch8` and `.8o` to `out/`, never prints keys.

## Acceptance criteria
- AC1: `npm install`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` pass.
- AC2: tests (including the real chain with no keys, served by the mock) cover success on attempt 1, compile-error repair, harness-fail repair, 3 failures, sanitization, fence stripping, progress log and mock labeling.
