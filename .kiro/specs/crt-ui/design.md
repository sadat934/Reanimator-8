# Design: `crt-ui`
## Files
- `src/shared/api.ts`: request and stream types, `GENERATE_PATH`, `MAX_PROMPT_CHARS`, base64 helpers. Shared by browser and server, type-only imports from the loop.
- `tools/dev-api/handler.ts`, `vite-plugin.ts`: framework-free handler and the Vite plugin that mounts it (dev and preview). Spec 6 wraps the same handler in a serverless function.
- `src/ui/labels.ts`, `state.ts`, `api-client.ts`, `gallery.ts`, `audio.ts`: pure logic, tested in Node with fakes.
- `src/ui/player.ts`: owns one `Chip8`, the 60 Hz loop, key handling, buzzer hook and the status line.
- `src/ui/crt.ts`, `lightning.ts`, `styles.css`: presentation.
- `src/ui/app.ts`, `src/main.ts`, `index.html`: wiring and markup.
- `tools/browser-check/check.mjs`: end-to-end check in headless Edge.
## Contract and stream format
`POST /api/generate` with `{prompt}` returns `application/x-ndjson`: `progress` lines, then one `result` line (or an `error` line). NDJSON was chosen over `EventSource` because the request is a POST with a body. Details and an example are in `docs/API.md`. The server runs `reanimate()` with the provider chain, so offline results carry `offline: true` and the UI labels them.
## State machine
| Phase | Action | Next phase |
|---|---|---|
| idle, playing, failed | `submit` (non-empty) | generating |
| idle, playing, failed | `submit` (empty) | same, with a message |
| generating | `progress` | generating (log grows) |
| generating | `resultOk` | playing (live game) |
| generating | `resultFail`, `streamError` | failed |
| not generating | `loadGallery` | playing (gallery game) |
| any | `togglePause`, `reset` | same (pause flag changes, no-op without a game) |
`reduce` is pure. `app.ts` performs the effects: it decodes the ROM and calls `player.load` when `state.game` changes, and starts `generate()` after a successful `submit`.
## Labels
`labelFor(origin)` is the only source of label text. A test pins the offline text to `OFFLINE_NOTICE` in `src/loop/reanimate.ts`.
## Player
Fixed-step accumulator (at most 5 frames per tick, backlog dropped). Pause stops frames and silences the buzzer. A crash is shown as `CRASHED: ...` and silences the buzzer. The canvas carries `data-lit-pixels` for the browser check. `Chip8.setCyclesPerFrame` was added so the speed slider changes speed without losing machine state.
## Audio
`createAudioController` creates its `AudioContext` lazily on the first unmute (a click). A 440 Hz square oscillator at gain 0.05 runs while the sound timer is above zero.
## CRT and fallback
`pickRenderer({webglAvailable, forceCss})` chooses the path. WebGL availability is probed with the whole shader on a scratch canvas, so a failure leaves the real canvas free for the 2D path. The shader does barrel curvature, a 3x3 neighbour glow, scanlines, phosphor tint, pixel gaps, vignette and a 3 percent flicker (0 under reduced motion). The CSS path puts class `crt--css` on the wrapper: pixelated canvas, `drop-shadow` glow, a scanline gradient overlay and a flicker keyframe.
## Reduced motion
Read from `matchMedia` at start and on change. It switches off shader flicker and lightning. CSS also disables animations and hides the lightning canvas. The "Reanimating..." badge is static.
## Keys
`isTypingTarget` ignores text inputs, textareas, selects and contenteditable. Range inputs and buttons keep passing game keys. Key-up is always forwarded so a key cannot stick.
## Security
The browser bundle has no keys and no server imports. `tests/ui/no-secrets.test.ts` scans `src/ui` and `src/main.ts`. The dev handler never writes a key into a stream line (tested with a fake key and a 429 response).
## Tests
Vitest, no network: labels, state machine, NDJSON client, audio fake, gallery parsing, no-secrets scan, dev API handler, `pickRenderer`, bolt geometry. The browser check covers what Node cannot (DOM, WebGL, keys, layout).
## Known limits
- Headless Edge runs the emulator slower than real time on some runs, so the browser check waits for the basket to settle instead of using fixed delays.
- The gallery holds two placeholder entries until spec 6.
