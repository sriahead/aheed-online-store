---
description: "Write everything that must survive the pre-validation Clear — build notes, Gate 4 CHANGELOG, persistent docs, tracked issues"
---

Write the build notes and everything else that must survive the context Clear.

Follow the **Document (build notes)** stage of `specs/sdd-workflow.md` (read it if not already in
context). This is a **write-to-disk** stage, not a summary stage — anything left only in the
conversation is destroyed by the Clear that follows.

1. Write `specs/<YYYY-MM-DD-feature>/build-notes.md`:
   - What changed and why.
   - Decisions taken during the build that the spec didn't dictate.
   - Anything that deliberately deviates from the spec, with the justification.
   - Known-shaky areas worth extra scrutiny during validation.
   No front-matter — like `requirements.md`/`validation.md` it's slice-local, not a KMS artifact.
2. **Gate 4 lands here.** Add the `[Unreleased]` `CHANGELOG.md` entry now, in the terse style of
   existing entries. Ship comes *before* the final documentation pass, and both the pre-push hook
   and CI reject a branch with no CHANGELOG diff against its base. Gate 4's CI check only verifies a
   diff against the PR's *current* base branch — if another PR merges first and moves that base,
   your diff can vanish and the check fails on reopen. Write it before opening the PR.
3. Update any **persistent doc** (`specs/architecture.md`, `tech-stack.md`, `design-system.md`, an
   ADR) whose standing decision this slice changed. These are part of the change and belong on the
   same branch — not deferred to the post-ship pass.
4. File a GitHub issue for every deliberately deferred item, now, while the reasoning is fresh.
5. **Commit it all**, then tell the user explicitly that it's safe to `/clear` and switch to
   Sonnet 5 (`/model claude-sonnet-5`) — you cannot do either yourself.

Do not validate here. Validation runs deliberately from a fresh context against the spec.
