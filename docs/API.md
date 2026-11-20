# Generate API

The browser asks the server to write a game. The server runs the reanimate loop (generate, compile, test, repair) and streams progress back. The types live in `src/shared/api.ts`.

Keys never leave the server. The browser sends only the prompt and never sees an API key, a model name or a provider URL.

## Request

`POST /api/generate`

```json
{ "prompt": "a bouncing ball" }
```

`Content-Type: application/json`. `prompt` must be a string. The server removes control characters and cuts it to 200 characters (`MAX_PROMPT_CHARS`). An empty prompt is not an HTTP error: it produces a `result` line with `ok: false`.

## Status codes

| Status | Meaning |
|---|---|
| 200 | A stream of lines follows (`application/x-ndjson`). Problems inside the loop arrive as lines, not as an error status. |
| 400 | The body is not JSON, or `prompt` is missing or not a string. Body: `{"error": "..."}`. |
| 405 | The method is not POST. The `Allow: POST` header is set. Body: `{"error": "..."}`. |
| 413 | The request body is larger than 2048 bytes. Body: `{"error": "..."}`. |

## Response lines

The 200 response has one JSON object per line (newline separated, `Cache-Control: no-cache`). The `type` field says which kind it is.

| `type` | Shape | Meaning |
|---|---|---|
| `progress` | `{"type":"progress","event":{"attempt":1,"kind":"generating","message":"..."}}` | One terminal line from the loop. `attempt` is 0 outside an attempt. `kind` is one of `start`, `generating`, `provider`, `compile-error`, `test-failed`, `repairing`, `success`, `failure`. |
| `result` | `{"type":"result","result":{...}}` | The last line of a normal stream. `result.ok` is `true` or `false`. |
| `error` | `{"type":"error","message":"..."}` | An unexpected server problem. The message is generic and never contains key material. The stream ends after it. |

### Result, success (`ok: true`)

`source` (Octo text), `romBase64` (ROM bytes, base64), `report` (the headless test report), `provider` (for example `gemini` or `mock`), `attempts`, `offline`, `origin` (plain-language origin) and `log` (all progress events).

### Result, failure (`ok: false`)

`message` (safe to show), `attempts`, `lastProblem`, `lastSource` (string or `null`), `provider` (string or `null`), `offline` and `log`.

## Example transcript

```
{"type":"progress","event":{"attempt":0,"kind":"start","message":"Reanimating: \"a bouncing ball\""}}
{"type":"progress","event":{"attempt":1,"kind":"generating","message":"Attempt 1: asking the model for Octo source..."}}
{"type":"progress","event":{"attempt":1,"kind":"provider","message":"Attempt 1: served by \"mock\", an offline stand-in, not generated just now. No live model wrote this."}}
{"type":"progress","event":{"attempt":1,"kind":"success","message":"Attempt 1: compiled (... bytes) and passed the 300-frame test. It lives! (offline stand-in, not generated just now)"}}
{"type":"result","result":{"ok":true,"source":"...","romBase64":"...","report":{"passed":true},"provider":"mock","attempts":1,"offline":true,"origin":"offline stand-in, not generated just now","log":[]}}
```

Fields are shortened here. Real lines carry the full `report` and `log`.

## Honesty rule

`offline: true` means an offline stand-in answered, not a live model. The UI must label such a game "offline stand-in, not generated just now" and must never call it "generated just now".

## Implementations

- Local development: `tools/dev-api/vite-plugin.ts` mounts the handler in `tools/dev-api/handler.ts` on the Vite dev and preview servers. Keys come from the local `.env` and the process environment.
- Hosting: a serverless function can wrap the same framework-free handler and emit the same lines.
