---
description: "Gate 3 — from a fresh context, check the artifact strictly against the spec; CI, not local output, is ground truth"
---

Validate the built artifact strictly against its spec.

Follow the **Validate** stage of `specs/sdd-workflow.md` (read it if not already in context). This
stage is designed to run from a **fresh context**, after a Clear, on Sonnet 5. If the conversation
still carries the build that produced this artifact, say so — a context that just built something
reads its own intent into the code and is the worst judge of whether it matches the spec.

1. Load the spec first: `specs/<date-feature>/requirements.md` and `validation.md`, plus the
   artifact itself. Read `build-notes.md` only as **supporting context** — where to look, what was
   deliberately deviated. It is a claim about the artifact, never a substitute for checking it. If
   the notes and the artifact disagree, the artifact is the fact.
2. Run the local suite as a fast pre-flight: `npm run lint`, `npm run format:check`,
   `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
3. **Do not fully trust local `format`/`lint` output on a Windows checkout.** `core.autocrlf`
   rewrites line endings on checkout, which makes `prettier --check` flag files that are actually
   fine on the real (Linux) CI runner. If local flags a file you didn't touch, verify by diffing
   the actual committed blob (`git show HEAD:<file>`) before treating it as real drift — don't
   reflexively reformat unrelated files.
4. Walk through **every row** of `validation.md` and confirm it, not just the generic
   lint/test/build commands. A row you can't check in this environment is reported as **unverified,
   with the reason** — never quietly counted as passing.
5. UI changes: verify by inspecting rendered output (compiled CSS, rendered HTML, or a browser
   screenshot) — not from code review alone. DB-touching code: `npm run preview`, never
   `npm run dev` (see `CLAUDE.md`).
6. **If the spec itself looks wrong, say so** rather than validating around it. Conforming to a bad
   requirement produces a passing slice that's still broken. If it's a real design defect, that's a
   Spec-level change, not something to patch under `/fix`.
7. Once pushed, treat the actual CI `gates` check on GitHub as the authority — don't report a
   slice "should pass CI," confirm it actually did (see `/ship` for how to wait on this correctly).

If validation fails, go to `/fix`, then re-run this command **from the top** — not just the failing
row. If it passes, continue to `/ship`.
