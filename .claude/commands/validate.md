---
description: "Gate 3 — run lint/typecheck/test/build locally, then trust CI, not local, as ground truth"
---

Validate the current changes against `validation.md`.

Follow the **Validate** stage of `specs/sdd-workflow.md` (read it if not already in context):

1. Run the local suite as a fast pre-flight: `npm run lint`, `npm run format:check`,
   `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
2. **Do not fully trust local `format`/`lint` output on a Windows checkout.** `core.autocrlf`
   rewrites line endings on checkout, which makes `prettier --check` flag files that are actually
   fine on the real (Linux) CI runner. If local flags a file you didn't touch, verify by diffing
   the actual committed blob (`git show HEAD:<file>`) before treating it as real drift — don't
   reflexively reformat unrelated files.
3. Walk through every row of the relevant `validation.md` and confirm it, not just the generic
   lint/test/build commands.
4. UI changes: verify by running the dev server and inspecting the rendered output (compiled CSS,
   rendered HTML, or a browser screenshot) — not from code review alone.
5. Once pushed, treat the actual CI `gates` check on GitHub as the authority — don't report a
   slice "should pass CI," confirm it actually did (see `/ship` for how to wait on this correctly).
