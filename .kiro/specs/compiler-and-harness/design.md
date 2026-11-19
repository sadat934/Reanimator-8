# Design: `compiler-and-harness` (spec 2 of 6)

## Overview
Octo's `compiler.js` is vendored unchanged except for an ES module export. `src/compiler/compile.ts` wraps it in a typed, non-throwing `compile()`. `src/harness/headless.ts` runs a ROM on the `Chip8` class and reports. `tools/mcp-chip8/` exposes both to Kiro as one MCP tool.

## File layout
```
src/compiler/octo-compiler.js     # vendored (MIT), one-line export change
src/compiler/octo-compiler.d.ts   # minimal types for the vendored class
src/compiler/compile.ts           # compile(source) -> CompileResult
src/compiler/LICENSE              # Octo license
src/harness/headless.ts           # runHeadless(rom, options) -> HarnessReport
examples/*.8o                     # bounce, catch, etch, runner (original)
tools/mcp-chip8/handler.ts        # JSON-RPC handling and compileAndTest(source)
tools/mcp-chip8/server.ts         # stdio transport
tools/mcp-chip8/vite.config.ts    # bundles the server to dist/server.mjs
.kiro/settings/mcp.json           # registers the server
.kiro/steering/octo-cheatsheet.md
tests/compiler/  tests/harness/  tests/mcp/
```

## Quirk set (closed)
Octo's own emulator was compared with each default in `DEFAULT_QUIRKS`. All seven already matched, so no default changed. `tests/compiler/octo-quirks.test.ts` pins each one by compiling Octo programs and running them. Differences that are not quirks (12-deep call stack in Octo, 16x16 sprite for N = 0) are noted in `chip8.ts`.

## Harness
- 300 frames at the default cycles per frame. Frames 1 to 5 are idle. Then each of 16 keys goes down for 10 frames in an 18-frame slot, in the order `1 2 3 4 Q W E R A S D F Z X C V` (hex 1 2 3 C 4 5 6 D 7 8 9 E A 0 B F).
- Criteria: not crashed; lit pixel in some frame after frame 5; display differs between consecutive frames after frame 5; not (never lit in any frame). `changedAfterKeypress` is reported as extra information.
- `failures` holds one sentence per failed criterion, for the later repair prompt.
- Determinism: no clock, and `CXNN` uses the seeded PRNG.

## MCP server
- Newline-delimited JSON-RPC 2.0 on stdio. Handles `initialize`, `ping`, `tools/list`, `tools/call`. Notifications get no reply.
- `compile_and_test` input: `{ source: string }`. Output (as JSON text content): `{ compile: { ok, romBytes } | { ok: false, errors }, report: HarnessReport | null }`. A non-string `source` returns `isError: true`.
- The server imports TypeScript, so `npm run mcp:build` bundles it with Vite to `tools/mcp-chip8/dist/server.mjs` (git-ignored). `npm run build` runs it. `mcp.json` runs `node tools/mcp-chip8/dist/server.mjs`.
- Logic lives in `handler.ts` (unit-tested without a process), transport in `server.ts`.

## Hook
`examples/**` and `src/emulator/**` trigger `npx vitest run tests/emulator tests/harness tests/compiler`. The examples test lives in `tests/harness`.

## Decisions
- No MCP SDK: the protocol subset is small and this avoids a dependency.
- `@types/node` added as a dev dependency for the server's stdio code only.
