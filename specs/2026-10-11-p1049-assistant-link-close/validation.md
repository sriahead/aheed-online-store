# Validation — #1049

- [ ] `npm run lint`, `npm run typecheck`, `npm run format:check` pass.
- [ ] `npx vitest run tests/help-assistant-panel.test.tsx` passes, including the new R1–R3 test;
      reverting the component change makes that test fail.
- [ ] Full `npx vitest run` (run alone) passes.
- [ ] Under `npm run preview` (assistant on, Aheed): open the assistant → Rewards → "See your
      points" lands on `/account/loyalty` (or `/login` when signed out) with the panel closed.
