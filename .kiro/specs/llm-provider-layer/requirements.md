# Requirements: `llm-provider-layer` (spec 3 of 6)
## Summary
A server-side layer that sends one prompt to Gemini, Mistral or Groq over HTTP, with a fallback chain and honest failure reporting. Source of truth: `.kiro/steering/reanimator.md` (sections 2, 3, 4, 6, 8, 13).
## Assumptions
- A1. User decision (revised after the spec 3 review): the chain ends with an offline mock provider (R13). Mocked `fetch` is used only inside Vitest tests. The user supplies API keys later.
- A2. Plain `fetch`, no vendor SDKs. Nothing third-party is added.
- A3. Keys are read from environment variables on the server only. Model names come from environment variables, with no defaults in code.
- A4. Everything runs locally. No hosting work.
## Functional Requirements (EARS)
- R1. The module shall export `LLMProvider` as `{ name; generate({ system, user, maxTokens }): Promise<string> }`.
- R2. The system shall order the chain with `LLM_PROVIDER` first, then the remaining providers in the order gemini, mistral, groq. An unknown value shall be ignored and the default order used.
- R3. When a provider has no API key, the system shall skip it and list it as skipped, not as an error.
- R4. When a provider has a key but no model variable, the system shall record a failure for it and continue.
- R5. When a provider returns HTTP 429 or a quota or rate-limit error body, the system shall fall back to the next provider and mark the failure as quota.
- R6. When a provider fails for any other reason (HTTP error, network error, timeout, non-JSON or empty response), the system shall record the reason and fall through to the next provider.
- R7. When a provider succeeds, the result shall expose `text`, the serving `provider`, the earlier `failures` with reasons, and the `skipped` list.
- R8. If every provider including the offline mock fails, `generate()` shall throw `AllProvidersFailedError` with the message "The ghost is resting. Try the gallery." and the `failures` and `skipped` lists.
- R9. Errors, failure reasons and logs shall never contain an API key.
- R10. The system shall never present canned or mocked text as a generated result. Mock output is always marked (R13).
- R11. Gemini shall send the key in the `x-goog-api-key` header, never in the URL.
- R12. A manual script (`npm run llm:try`) shall send one prompt through the chain using keys from a local `.env`, never print keys, and report clearly when no key is set.
- R13. After the real providers, the chain shall append an offline mock (src/llm/mock.ts) as its final link. It is used when Gemini, Mistral and Groq all fail or have no key. It returns a hand-written Octo program (adapted from examples/bounce.8o) that compiles and passes the harness. The result shall carry provider: 'mock' and offline: true. Real successes carry offline: false.

## Acceptance Criteria
- AC1. `npm install`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` pass.
- AC2. Tests (mocked `fetch` only, no network) cover R1 to R13.
