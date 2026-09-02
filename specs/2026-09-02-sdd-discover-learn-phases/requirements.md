# DISCOVER and LEARN — milestone-level SDD phases (requirements / acceptance criteria)

Closes `#550`. Adds two phases outside the per-slice SDD loop — Discover (forward-looking research)
and Learn (milestone retrospective) — their three durable homes under `docs/research/`, and the
milestone-close sequence that runs them. `plan.md` carries the narrative and the two design
decisions these requirements exist to protect: neither phase is a gate, and neither produces
approved scope.

R1. `specs/sdd-workflow.md` contains a top-level `## Discover` section and a top-level `## Learn`
    section.

R2. `specs/sdd-workflow.md` contains a top-level `## Milestone close (Discover, then Learn)` section
    that states Discover runs before Learn and gives the ordered close sequence.

R3. `specs/sdd-workflow.md` front-matter declares `version: "2.27.0"` and `updated: 2026-09-02`, and
    its `summary` names both phases.

R4. `.claude/commands/discover.md` and `.claude/commands/learn.md` both exist, each opening with a
    front-matter block carrying a `description:` key, matching the shape of the nine existing
    command files.

R5. `docs/research/README.md`, `docs/research/discovery-log.md` and
    `docs/research/milestone-retrospectives.md` all exist and carry KMS front-matter whose `id`
    matches `^[a-z0-9-]+$`.

R6. `npm run kms:validate` reports `invalid front-matter (failing): 0`, and none of the three
    `docs/research/` files appears in its no-front-matter warning list.

R7. All three `docs/research/` files appear in `ARTIFACT_INDEX.md`.

R8. `npm run kms:check-generated` exits 0, confirming `ARTIFACT_INDEX.md` and
    `app/(admin)/staff/runbook/docs.ts` are both current.

R9. `npm run kms:assemble:internal` followed by `npx next build --webpack` in `kms/site-internal`
    exits 0, with the three research documents among the prerendered pages.

R10. `.claude/commands/document.md` contains a numbered step instructing that a milestone-closing
     slice runs `/discover` then `/learn` before the model switch and `/clear`.

R11. `.claude/commands/orient.md` contains a numbered step instructing the reader to read
     `docs/research/discovery-log.md`.

R12. `CLAUDE.md` describes both phases, states that they run automatically at milestone close with
     Discover first, and states that neither is a gate.

R13. `CLAUDE.md`'s "The four SDD gates (non-negotiable)" section still lists exactly four numbered
     gates, unchanged in wording.

R14. `docs/research/discovery-log.md` contains exactly three seeded findings, each ending in exactly
     one next action drawn from `RESEARCH MORE`, `PROPOSE`, `ADD TO ROADMAP/BACKLOG`,
     `READY FOR SPEC`, `DO NOT PURSUE`.

R15. No GitHub issue is opened under this slice for any of the three seeded findings, and none of
     them is added to `specs/roadmap.md`. The only issues this slice creates are `#550` (this work)
     and `#551` (the deferred `sdd:audit` question).

R16. `docs/research/milestone-retrospectives.md` contains an entry template and no milestone entry,
     and states in prose that P8 is deliberately not backfilled.

R17. `scripts/sdd-check.ts` is unmodified by this slice, and no new npm script is added to
     `package.json`.

R18. `CHANGELOG.md` updated (Gate 4).

R19. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
