# Build log

Dated record of what was built, which Kiro features were used, and what was changed by hand.

## 2026-11-19: spec 1, `emulator` (in progress)

**Built**
- Vite + TypeScript scaffold (strict mode), Vitest config.
- `.env.example` (placeholders only), `THIRD_PARTY.md` skeleton, `examples/` placeholder.

**Kiro features used**
- Steering: `.kiro/steering/reanimator.md` (integrity rules, stack, emulator requirements).
- Spec: `.kiro/specs/emulator/` (requirements, design, tasks).
- Hook: `.kiro/hooks/run-headless-tests.kiro.hook` runs `npx vitest run tests/emulator` on save of `examples/**` or `src/emulator/**`.

**Changed by hand**
- Nothing yet.
