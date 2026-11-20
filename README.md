# Reanimator-8

A CHIP-8 machine with a CRT front end. Describe a game in one sentence, a model writes it in Octo, our own emulator tests it, and the CRT plays it.

## Run the UI locally

```
npm install
cp .env.example .env     # optional: add provider keys. Without keys an offline stand-in answers.
npm run dev
```

Open the printed address. Pick a game from the gallery, or type a sentence and press Reanimate.

- Keys stay on the server side of the dev server (a Vite plugin serving `POST /api/generate`, see `docs/API.md`). The browser never sees them.
- Labels tell the truth: "pre-generated" (gallery), "generated just now" (a live model) and "offline stand-in, not generated just now" (no key or all providers failed). The two gallery entries are placeholders until spec 6.
- Sound starts muted. Click the Sound button to hear the buzzer.
- `?renderer=css` forces the CSS fallback instead of the WebGL shader.
- Browser check (needs Microsoft Edge): start the dev server on port 5199 with empty keys and `DEV_API_DELAY_MS=500`, then run `node tools/browser-check/check.mjs`. It writes screenshots to `docs/screenshots/`.
