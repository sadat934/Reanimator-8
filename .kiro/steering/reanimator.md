---
inclusion: always
---

# The Reanimator: Project Steering Document

Save this file as `.kiro/steering/reanimator.md` in the project root. Kiro will load it into every conversation and spec.

## 1. What we are building

**The Reanimator** turns a one-sentence description ("a ghost chases you through a haunted house") into a playable game for **CHIP-8**, a 1977 virtual machine, running on a glowing green CRT in the browser. The user can also download the `.ch8` ROM and run it in any CHIP-8 emulator.

Hackathon category: **Frankenstein** (stitch together technologies that shouldn't work together).

The stitched parts:
1. **CHIP-8 virtual machine** (1977): 4KB memory, 64x32 monochrome display, 16-key hex keypad.
2. **LLM** (Gemini, Mistral, or Groq, swappable) that writes games in **Octo**, a high-level CHIP-8 language.
3. **Self-healing loop**: compile, run headlessly, test, send errors back to the LLM, retry up to 3 times.
4. **Modern web skin**: CRT shader, Web Audio buzzer sounds, lightning animation while "reanimating".

## 2. Integrity rules (Kiro must follow these)

This is a competition entry and must be fair and honest.

- All project code is written **during the hackathon submission period**. Do not import code from earlier personal projects.
- Write the CHIP-8 emulator, headless test harness, LLM loop, and UI **from scratch**. Do not copy code from other emulators or tutorials.
- Third-party code (for example Octo) is allowed **only if its license permits it**. Keep the license file next to the vendored code and list every third-party item (code, fonts, sounds, images) with its license in `THIRD_PARTY.md`.
- Do not use copyrighted ROMs, sounds, images, or fonts. Generate or create assets ourselves, or use clearly licensed ones.
- **Never commit API keys or secrets.** Use environment variables and a `.env.example` file.
- Keep a running `docs/BUILD_LOG.md`: dated entries describing what was built, what Kiro features were used, and what was changed by hand.
- The gallery must be labeled honestly: games that were pre-generated are marked "pre-generated", live ones are "generated just now". Never fake a result in the demo.
- Do not delete the `.kiro/` directory or add it to `.gitignore`. Specs, steering, and hooks are part of the submission evidence. (Confirm the exact requirement in the official rules.)
- Commit small and often, so the git history shows the real build timeline.

## 3. Tech stack

- **Frontend:** Vite + TypeScript. Plain DOM or a very light framework. No heavy UI libraries.
- **Rendering:** HTML canvas with a WebGL (or CSS) CRT effect: scanlines, phosphor glow, slight curvature, flicker.
- **Audio:** Web Audio API square-wave beep driven by the CHIP-8 sound timer.
- **Backend:** one serverless function `POST /api/generate` (Vercel, Netlify, or Cloudflare Workers).
- **LLM:** behind a provider interface (section 6). Providers: Gemini, Mistral, Groq.
- **Tests:** Vitest.
- **Compiler:** Octo's compiler, vendored with its license. If the license is unclear, write a small own assembler for a documented Octo subset instead.

## 4. Project structure

```
src/
  emulator/chip8.ts        # CPU, memory, display, timers, keypad (from scratch)
  compiler/                # vendored Octo compiler + LICENSE (or own assembler)
  harness/headless.ts      # runs a ROM N frames without a screen, returns a report
  llm/provider.ts          # LLMProvider interface + fallback chain
  llm/gemini.ts
  llm/mistral.ts
  llm/groq.ts
  loop/reanimate.ts        # generate -> compile -> test -> repair (max 3 attempts)
  ui/                      # CRT canvas, lightning animation, audio, gallery
api/generate.ts            # serverless endpoint, rate limiting
examples/*.8o              # hand-written example games (used as few-shot examples)
gallery/*.json             # pre-generated games {title, prompt, source, romBase64}
tools/mcp-chip8/           # local MCP server exposing compile_and_test
docs/BUILD_LOG.md
THIRD_PARTY.md
.env.example
```

## 5. CHIP-8 emulator requirements

- Memory 4096 bytes. Programs load at `0x200`, leaving 3584 bytes for the program. Built-in font sprites at `0x050`.
- 16 registers `V0..VF` (`VF` is the flag), index register `I`, program counter, stack of 16 entries, delay timer, sound timer.
- Display 64x32, XOR sprite drawing with collision flag in `VF`.
- Timers tick at 60Hz. Run about 10 to 20 CPU cycles per frame (configurable).
- Keypad mapped to the keyboard:
  ```
  1 2 3 C  ->  1 2 3 4
  4 5 6 D  ->  Q W E R
  7 8 9 E  ->  A S D F
  A 0 B F  ->  Z X C V
  ```
- Expose a deterministic API: `loadRom(bytes)`, `step()`, `runFrame()`, `pressKey(k)`, `releaseKey(k)`, `getDisplay()`, `getStatus()`. Status includes `crashed` and a reason (unknown opcode, stack overflow or underflow, out-of-bounds memory).
- Document which CHIP-8 "quirks" are used (shift, load/store, jump, VF reset) in a comment at the top of the file, and match what the Octo compiler expects.
- Unit tests: each opcode group, plus one known test ROM that we author ourselves.

## 6. LLM provider layer

```ts
interface LLMProvider {
  name: string;
  generate(input: { system: string; user: string; maxTokens: number }): Promise<string>;
}
```

- Selected by env var `LLM_PROVIDER`, with a fallback chain (for example gemini, then mistral, then groq).
- On HTTP 429 or a quota error, fall back to the next provider. If all fail, return a friendly error: "The ghost is resting. Try the gallery."
- Keys come from `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY`. Never expose them to the browser.
- Model names live in config, not hard-coded, because free-tier model availability changes.

## 7. Self-healing loop (`loop/reanimate.ts`)

Per request, max **3 attempts**:

1. Ask the LLM for Octo source (system prompt in section 8).
2. Compile. On compile error, go to the repair step with the error message.
3. Run the ROM headlessly for **300 frames** with a scripted key sequence (press each of `1 2 3 4 Q W E R A S D F Z X C V` in turn).
4. The test report passes only if ALL are true:
   - did not crash,
   - the display was non-blank in at least one frame after frame 5,
   - the display changed over time or after a keypress,
   - the program did not hang without ever drawing.
5. If it fails, send the LLM: the previous source, the compile error or test report, and ask for a corrected full program. Then repeat from step 2.
6. Stream a **progress log** to the UI (for example "Attempt 1: compile error on line 12, repairing...").

If all 3 attempts fail, tell the user honestly and suggest trying a simpler prompt.

## 8. LLM prompting rules

- System prompt contains: a short Octo cheat sheet, CHIP-8 limits (64x32 screen, 3584 bytes, 16 keys), design rules for games (simple, one clear goal, visible score or lives, game-over state, restart with a key), and 3 to 4 full example programs from `examples/`.
- Output rule: **return only the Octo source code**, no markdown fences, no explanation.
- Keep programs small. Prefer 8x8 or smaller sprites, defined with `:` labels.
- User text is untrusted: limit to 200 characters, strip control characters, and never put it in a position where it can override the system prompt.
- The generated code only ever runs inside our emulator sandbox. Never `eval` anything produced by the LLM.

## 9. UI requirements

- Main screen: a large CRT with a green phosphor look, scanlines, glow, and a subtle flicker. A prompt box labeled like a spell, and a "Reanimate" button.
- While generating: lightning animation, a log of the self-healing attempts as terminal text.
- Controls panel showing the keyboard mapping, pause, reset, speed slider, and **Download ROM (.ch8)** and **Copy Octo source** buttons.
- Gallery of 8 or more pre-generated games that work instantly with no API call, each labeled "pre-generated".
- Sound: square-wave buzzer while the sound timer is above zero, with a mute toggle (default muted until the user interacts).
- Responsive, keyboard accessible, and readable text outside the CRT area.

## 10. Rate limiting and cost control (`api/generate.ts`)

- Max 3 live generations per visitor per day, and a global daily cap set by env var.
- When a cap is hit, return a clear message and point to the gallery.
- Log provider, attempt count, and success per request, with no personal data.

## 11. How to use Kiro features (so the project shows real Kiro usage)

- **Specs:** create one spec per feature, in this order: `emulator`, `compiler-and-harness`, `llm-provider-layer`, `reanimate-loop`, `crt-ui`, `gallery-and-ratelimit`. Review the requirements and design before accepting tasks.
- **Steering:** this file, plus a second steering file `.kiro/steering/octo-cheatsheet.md` containing the Octo syntax reference and example snippets.
- **Hooks:** a hook that runs the headless tests whenever a file in `examples/` or `src/emulator/` is saved, and a hook that updates `docs/BUILD_LOG.md` reminders.
- **MCP:** `tools/mcp-chip8` exposes a `compile_and_test(source)` tool returning the test report, so Kiro itself can write and verify games while we build the machine.

## 12. Definition of done / submission checklist

- [ ] Live URL works for a first-time visitor with no login.
- [ ] Gallery works with zero API calls.
- [ ] Live generation works, with rate limits and graceful failure.
- [ ] ROM download runs correctly in an independent CHIP-8 emulator.
- [ ] Public repo with the `.kiro/` folder visible, a clear README, `THIRD_PARTY.md`, and `.env.example`.
- [ ] README explains how Kiro (specs, steering, hooks, MCP) was used, with examples.
- [ ] Demo video (about 3 minutes) showing: prompt, lightning, repair loop, playing the game, ROM running elsewhere.
- [ ] Submission text matches the official required fields, and the category is Frankenstein.
- [ ] No secrets in git history.

## 13. Coding conventions

- TypeScript strict mode. Small pure functions. No `any` unless commented.
- Every module has tests where practical. Emulator and harness must be deterministic.
- Prefer clarity over cleverness. Comment the CHIP-8 quirks and the reasons for each decision.
- When unsure about requirements, ask me rather than guess.

## Appendix: first prompt to give Kiro (Spec mode)

> Using the steering document, create a spec for the `emulator` feature: a from-scratch CHIP-8 emulator in TypeScript with a deterministic headless API, full opcode coverage, unit tests, and a keyboard-mapped browser renderer on a canvas. Follow the integrity rules and log progress in `docs/BUILD_LOG.md`.
