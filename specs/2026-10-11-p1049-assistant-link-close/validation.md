# Validation — #1049

- [ ] `npm run lint`, `npm run typecheck`, `npm run format:check` pass.
- [ ] `npx vitest run tests/help-assistant-panel.test.tsx` passes, including the new R1–R3 test;
      reverting the component change makes that test fail.
- [ ] Full `npx vitest run` (run alone) passes.
- [ ] Under `npm run preview` (assistant on, Aheed): open the assistant → Rewards → "See your
      points" lands on `/account/loyalty` (or `/login` when signed out) with the panel closed.
- [ ] #1051: under `npm run preview`, with the assistant on, the contact button shows the help
      assistant and no direct WhatsApp icon; switched off at `/staff/assistant`, the WhatsApp icon
      returns.
- [ ] After the guide edit: `kms:validate`, `kms:check-generated`, `kms:assemble:internal`, and a
      real Next build in `kms/site-internal`.
- [ ] #1052: under `npm run preview`, `/help` on Aheed (assistant on) shows **Open the help
      assistant** and it opens the panel; with the assistant off, the card shows the WhatsApp link;
      SriMart (no assistant) shows whichever its WhatsApp setting allows.
