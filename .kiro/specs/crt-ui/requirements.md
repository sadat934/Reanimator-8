# Requirements: `crt-ui` (spec 5 of 6)
Source: `reanimator.md` sections 2, 9, 13 and the crt-ui task plan.
1. **R1 CRT screen.** A large 2:1 CRT shows the 64x32 display with green phosphor, scanlines, glow, curvature and a subtle flicker. A WebGL shader written for this project draws it. If WebGL is unavailable, or the URL has `?renderer=css`, a 2D canvas dressed with CSS draws it instead.
2. **R2 Spell form.** A labeled prompt box ("Speak the incantation") with `maxlength` 200, a live character counter and a "Reanimate" button. The button is disabled while a request runs. An empty prompt shows a message and sends nothing.
3. **R3 Generating state.** While generating, a lightning overlay plays and the terminal log shows each progress line from the loop, in an element with `role="log"`.
4. **R4 Honest labels.** Every loaded game shows its origin: "pre-generated" (gallery), "generated just now" (live provider) or "offline stand-in, not generated just now" (offline mock). An offline result never shows "generated just now" alone. Placeholder gallery entries also show their note.
5. **R5 Controls.** Pause (with `aria-pressed`), Reset, a speed slider (1 to 60 instructions per frame), Download ROM (.ch8), Copy Octo source, and a keyboard mapping table. Download and Copy are enabled only while a game is loaded.
6. **R6 Keyboard.** The 16 keypad keys map as in `src/ui/keymap.ts`. Keys typed into the prompt box or other text fields never reach the game. Held keys are released on blur, load and reset.
7. **R7 Sound.** A square-wave buzzer plays while the sound timer is above zero. It starts muted. It becomes audible only after the user clicks the sound toggle, and the toggle reports its state with `aria-pressed`.
8. **R8 Gallery.** Pre-generated games load instantly with no network call. Entries come from `gallery/*.json`. This spec ships two placeholder entries; spec 6 adds the real ones (8 or more).
9. **R9 Generate API.** The browser talks only to `POST /api/generate` (NDJSON stream, `docs/API.md`). Provider keys stay on the server. No file under `src/ui` or `src/main.ts` imports server code or reads env keys.
10. **R10 Dev server API.** For local runs, a Vite plugin serves `/api/generate` with the real loop and keys from a local `.env`. `DEV_API_DELAY_MS` slows progress lines for demos and screenshots.
11. **R11 Reduced motion.** With `prefers-reduced-motion: reduce` there is no lightning animation, no flicker and no animated transitions. A static "Reanimating..." badge shows instead.
12. **R12 Accessibility and layout.** Semantic landmarks, visible `:focus-visible` outlines, text outside the CRT with at least 4.5:1 contrast, a single column under 800 px wide, no horizontal overflow at 390 px.
13. **R13 Fonts and assets.** System fonts only. No UI library, no web fonts, no images copied from elsewhere.
14. **R14 Browser check.** `node tools/browser-check/check.mjs` drives headless Edge over the DevTools protocol, asserts the behavior above, fails on any console error and writes seven screenshots to `docs/screenshots/`.
## Acceptance criteria
- AC1: `npm install`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` pass.
- AC2: the browser check passes with empty provider keys: a gallery game lights pixels and answers keys, a Reanimate run ends labeled "offline stand-in, not generated just now", Download and Copy are enabled afterward.
- AC3: seven screenshots exist in `docs/screenshots/` (home, gallery playing, generating, offline result, mobile, reduced motion, CSS fallback).
- AC4: no `.env`, `dist/` or `out/` file is committed.
