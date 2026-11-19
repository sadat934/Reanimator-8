# Tasks: `llm-provider-layer` (spec 3 of 6)
Commit after each task on `main` with `git -c user.name="sadat934" -c user.email="sadat934@users.noreply.github.com" commit`. Never push. Do not touch or ignore `.kiro/`.
- [x] 1. **Types, config, HTTP helper** in `src/llm/`. _R1, R2, R9_
- [x] 2. **Gemini, Mistral, Groq providers.** _R11_
- [x] 3. **Fallback chain** in `provider.ts` with the typed error. _R3 to R8, R10_
- [x] 4. **Tests** in `tests/llm/provider.test.ts` using mocked `fetch`. _AC2_
- [x] 5. **Manual script** `npm run llm:try` and `.env.example`. _R12_
- [x] 6. **Update `docs/BUILD_LOG.md`.**
- [x] 7. **Run the done checks:** `npm install`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`. _AC1_
- [x] 8. **Gap fix after review:** offline mock as last chain link (src/llm/mock.ts), tests, docs. _R13_
- [ ] 9. **Review step.** Review against R1 to R13 and the integrity rules. _All_
