# Design: `llm-provider-layer` (spec 3 of 6)
## File layout
```
src/llm/types.ts              # LLMProvider, GenerateInput, ProviderFailure, ProviderError
src/llm/config.ts             # env parsing and chain order (documented variables)
src/llm/http.ts               # postJson: timeout, quota detection, key redaction
src/llm/gemini.ts             # generateContent request/response
src/llm/openai-compatible.ts  # shared chat/completions provider
src/llm/mistral.ts  groq.ts   # thin wrappers with endpoint and token field
src/llm/provider.ts           # createProviderChain, AllProvidersFailedError
src/llm/index.ts
tools/try-llm/                # manual real-key check, bundled by Vite
tests/llm/provider.test.ts    # mocked fetch only
```
## Endpoints (checked against vendor docs)
- Gemini: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, header `x-goog-api-key`, body `systemInstruction`, `contents`, `generationConfig.maxOutputTokens`. Text is in `candidates[0].content.parts[].text`.
- Mistral: `POST https://api.mistral.ai/v1/chat/completions`, `Authorization: Bearer`, body `model`, `messages`, `max_tokens`. Text is in `choices[0].message.content`.
- Groq: `POST https://api.groq.com/openai/v1/chat/completions`, Bearer, body as above with `max_completion_tokens`.
## Behavior
`createProviderChain(env, { fetchFn?, timeoutMs? })` builds the chain once. `generate()` walks it in order. A `ProviderError` carries `status` and `quota`. Quota is true for 429 or a body matching quota, rate limit, or resource exhausted. Every failure message is scrubbed of all configured keys before it is stored. `fetchFn` is injectable for tests and defaults to the global `fetch`.
The interface stays exactly as in section 6. The chain is a separate object that returns a richer result so `api/generate.ts` and the reanimate loop can log provider, attempt and success.
## Decisions
- No default model names in code (free tiers change). `.env.example` lists suggested values.
- A missing model counts as a failure (visible), a missing key as a skip (expected).
- No retries within a provider. The 3-attempt loop belongs to spec 4.
