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

## 2026-11-19: spec 2, compiler-and-harness (part 2: harness, examples, MCP, steering)
**What was built**
- src/harness/headless.ts: runs a ROM for 300 frames with the 16 scripted keys and returns the section 7 report (crash, non-blank after frame 5, display changed, never drew). Deterministic. Tests use passing and failing ROMs.
- examples/: four original Octo games (bounce, catch, etch, runner). tests/harness/examples.test.ts compiles each and requires a passing report.
- tools/mcp-chip8/: local MCP server (stdio JSON-RPC, no SDK) with a compile_and_test(source) tool returning the compile result and harness report. Bundled by Vite (npm run mcp:build, also part of npm run build). Registered for this workspace in .kiro/settings/mcp.json.
- .kiro/steering/octo-cheatsheet.md: Octo syntax reference in our own words (Octo docs are MIT-licensed, nothing copied). tests/compiler/cheatsheet.test.ts compiles its snippets.
- .kiro/specs/compiler-and-harness/: requirements, design, tasks.
**Kiro features used**
- Spec (requirements, design, tasks), steering (reanimator.md, octo-cheatsheet.md), hook (now runs emulator, harness and compiler tests on saves in examples/ and src/emulator/), MCP (chip8 server).
**Changed by hand / deviations**
- Added @types/node (dev) for the MCP server. No MCP SDK dependency: only four JSON-RPC methods are needed.
- Hook command widened from tests/emulator to tests/emulator tests/harness tests/compiler so saving an example runs the example test.
**User action**
- A permission rule blocks agent writes to .kiro/settings/, so the user created .kiro/settings/mcp.json by hand (server `chip8`, command `node`, args `tools/mcp-chip8/dist/server.mjs`). Run `npm run mcp:build` first to produce the bundle.

## 2026-11-19: spec 3, llm-provider-layer
**What was built**
- src/llm/: LLMProvider interface (section 6), Gemini, Mistral and Groq providers over plain fetch, a fallback chain ordered by LLM_PROVIDER, and a config module. Model names come from env only. Keys are read server-side only and scrubbed from every error and failure reason.
- generate() on the chain returns the text, the serving provider, earlier failures with reasons and the skipped providers. If all fail or no key is set it throws AllProvidersFailedError with "The ghost is resting. Try the gallery." plus the failure list.
- tools/try-llm and npm run llm:try: sends one prompt through the chain using keys from a local .env, never prints keys, says clearly when none are set.
- tests/llm/provider.test.ts: mocked fetch only, no network.
- .kiro/specs/llm-provider-layer/: requirements, design, tasks.
**Decision**
- No mock provider in the runtime chain (user decision, overrides the earlier idea of a mock fallback). Mocks exist only inside Vitest tests. No canned program is ever returned as if generated.
**Deviations**
- No third-party additions, so THIRD_PARTY.md is unchanged. A provider with a key but no model variable is a recorded failure, not a skip.
**User action**
- Copy .env.example to .env, add the three API keys and check model names, then run npm run llm:try.

## 2026-11-20: spec 4, reanimate-loop
**What was built**
- src/loop/reanimate.ts: generate, compile, headless test, repair, max 3 attempts. Progress events go to a callback and are returned in the result log. Success returns source, ROM, report, attempt count and provider. Failure is honest and suggests a simpler prompt. If no provider answers, the loop stops with the provider message.
- src/llm/prompt.ts and examples.ts: system prompt (condensed Octo cheat sheet, CHIP-8 limits, design rules, four examples from examples/, output rule), user and repair messages, 200 character sanitizer, defensive fence stripping. User text is only in the user message.
- Offline labeling: a provider flagged offline (offline true, or a name starting with mock or offline) is reported as "offline stand-in, not generated just now" in the log and result.
- tools/reanimate-cli and npm run reanimate: runs the loop with keys from a local .env, writes out/<slug>.ch8 and .8o, never prints keys.
- tests/loop/reanimate.test.ts: scripted fake provider, no network.
- .kiro/specs/reanimate-loop/: requirements, design, tasks.
**Kiro features used**
- Spec (requirements, design, tasks) and steering (reanimator.md sections 7 and 8, octo-cheatsheet.md).
**Deviations**
- The task brief mentioned a mock provider at the end of the chain, but spec 3 shipped none (recorded user decision). No mock provider was added. The loop already labels one honestly if it is added later.

## 2026-11-21: gap fix, offline mock as last link of the LLM chain
**What was found**
- After the spec 3 review: the user asked for a mock provider as the final fallback when Gemini, Mistral and Groq fail or have no key. Spec 3 shipped without it ("real providers only"), and spec 4 reported finding none. This was a gap, not a decision to drop it.
**What was fixed**
- src/llm/mock.ts: hand-written Octo program adapted from examples/bounce.8o, returned for any prompt. createProviderChain always appends it last. Results carry provider "mock" and offline true. Real results carry offline false.
- The reanimate loop already labeled offline results. It now gets the real flag from the chain, so the log and result say "offline stand-in, not generated just now". Checked by a test using the real chain with no keys.
- "The ghost is resting. Try the gallery." now appears only when even the mock cannot serve.
- Tests (mocked fetch only): all providers fail or keyless gives the mock, flagged; a real success does not use it; the mock source compiles and passes the harness; the loop labels it honestly.
- Specs for llm-provider-layer and reanimate-loop, .env.example and the two CLIs updated. The earlier entries above are left as written.
