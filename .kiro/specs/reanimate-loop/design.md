# Design: `reanimate-loop`

## Files
- `src/loop/reanimate.ts`: the loop. Pure orchestration over `compile` and `runHeadless`.
- `src/llm/prompt.ts`: system prompt, user and repair messages, `sanitizeUserText`, `stripFences`.
- `src/llm/examples.ts`: the four examples from `examples/` bundled with Vite `?raw` (`raw.d.ts` types the import).
- `tools/reanimate-cli/`: Vite-bundled Node script, run by `npm run reanimate`.

## Provider contract
The loop depends on `ReanimateProvider.generate(input)` returning `{ text, provider, offline? }`. The real `ProviderChain` satisfies it. Tests pass a scripted fake. A provider that answers with a canned program must set `offline: true` or be named `mock*` / `offline*`.

## Flow
```
sanitize text -> attempt 1..3:
  generate -> stripFences -> compile
    error  -> log "compile error on line N, repairing..." -> repair message
    ok     -> runHeadless -> passed? success : log failures -> repair message
after attempt 3 -> failure with simpler-prompt hint
provider throws -> failure at once (retrying cannot help)
```

## Decisions
- Progress is a callback plus the same events in `log`. An async iterator can wrap it later for `api/generate.ts`.
- The user text is wrapped in `<<<REQUEST ... REQUEST>>>` markers inside the user message and described as data. The system prompt has no user text.
- The result carries `offline` and `origin` so the UI can label the game honestly.
- No mock provider was added to `src/llm` (spec 3 decision stands). The loop only handles one if it appears.
- The repair message always asks for the full program, not a patch.
