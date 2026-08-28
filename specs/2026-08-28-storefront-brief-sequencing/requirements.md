# Storefront & fulfilment brief — roadmap sequencing (requirements / acceptance criteria)

Sequences the fourteen issues of the #408 brief (#394–#407) into `specs/roadmap.md` as two new
phases plus a pre-launch set inside P8.2, and adds `ADR-006` to settle the store-location question
gating #400 and #402. Builds on `roadmap`, `adr-004-multi-tenancy`, `adr-005-payments-money-flow`
and `mission`. Documentation and decision work only — **no storefront feature from the brief is
built by this slice**, including the pre-launch set, which is sequenced here and built later under
its own issue. Full narrative and the reasoning behind each requirement: `plan.md`.

## Roadmap — the sequencing

R1. `specs/roadmap.md` contains a subsection defining **P8.6 — Storefront discovery & conversion**,
    and that subsection names each of #394, #395, #396, #397, #400, #404, #405 and #406.

R2. `specs/roadmap.md` contains a subsection defining **P8.7 — Fulfilment & merchandising data
    models**, and that subsection names each of #397, #398, #399, #400, #401 and #402.

R3. `specs/roadmap.md`'s **P8.2** subsection names a pre-launch set consisting of #398, #403, #407
    and #397, and states in prose that this set is sequenced by the present slice and built by a
    separate later slice under its own issue.

R4. `specs/roadmap.md` records the #408 brief by naming issue #408, its date 2026-08-27, its issue
    range #394–#407, and issue #420 as the slice that sequenced it.

R5. `specs/roadmap.md`'s P8 decomposition still contains its pre-existing **P8.1**, **P8.2**,
    **P8.3** and **P8.5** entries, none of them renumbered or removed by this slice.

R6. `specs/roadmap.md` states that #397 is split across three phases, naming Country-of-Origin as
    pre-launch, the three boolean certification facets as P8.6, and Pack Size and Brand as P8.7.

R7. `specs/roadmap.md` records each of these six gating relationships in prose: #363 gates #401 and
    #402; #113 gates #403's live half; ADR-006 gates #402 and #400's per-store half; the discount
    engine issues (#146, #147, #148, #372, #377) gate #404; #398's variant model gates #399 and
    #397's Pack Size facet; and #399 additionally requires a payments-capture decision.

R8. `specs/roadmap.md` states that `lib/payments.ts` sets no `capture_method` and that #399's
    pre-authorisation guarantee therefore requires a payments-capture decision amending ADR-005.

R9. `specs/roadmap.md` has a change-log row citing the path
    `specs/2026-08-28-storefront-brief-sequencing/`.

R10. `specs/roadmap.md` has a change-log row containing the literal string `PR #419`, and
     `npm run sdd:audit` reports PR #419 in its promotions section as cited by a roadmap change-log
     row rather than as pending.

R11. `specs/roadmap.md`'s front-matter `version` is higher than the pre-slice `1.51.0` and its
     `updated` field reads `2026-08-28`.

## ADR-006 — the store-location ruling

R12. `specs/decisions/ADR-006-store-locations.md` exists, with front-matter `id:
     adr-006-store-locations` and `type: adr`.

R13. ADR-006 states that `vendorId` remains the sole tenancy isolation axis, that a store location
     is not a tenancy root, and that a location never becomes a second mandatory filter on queries
     in `lib/repositories/*`.

R14. ADR-006 names ADR-004 decision 1's anticipated `Region`/`Location` reference tables and states
     how a trading location differs from that geography-reference concept.

R15. ADR-006 states that `specs/mission.md` lists multi-branch management as out of scope and that
     this slice does not amend that line.

R16. ADR-006 names #400 and #402 as the issues its ruling unblocks for scoping, and states which
     changes would be additive if locations are later adopted.

R17. `git diff origin/staging...HEAD -- specs/mission.md` produces no output — `specs/mission.md` is
     unchanged by this slice.

## Issue tracker reconciliation

R18. GitHub milestones titled `P8.6 — Storefront discovery & conversion` and `P8.7 — Fulfilment &
     merchandising data models` both exist on the repository.

R19. Every issue #394–#407 carries exactly the milestone given by this rule: **an issue split
     across phases takes the milestone of its earliest phase.** A GitHub issue holds one milestone,
     and #397, #398 and #400 are each split, so the rule is stated here rather than left to
     inference. Concretely — #394, #395, #396, #404, #405, #406 and #400 on `P8.6 — Storefront
     discovery & conversion`; #399, #401 and #402 on `P8.7 — Fulfilment & merchandising data
     models`; #397, #398, #403 and #407 remaining on `P8 — Deployment & launch`, because their
     earliest phase is P8.2, which is a subdivision of P8 and has no milestone of its own.

R20. `specs/roadmap.md` or `ADR-006` records that Project #2's Phase field cannot express P8.6 or
     P8.7, citing issue #267.

R21. Every one of #394–#407 remains an open issue — this slice closes none of them.

## Gates

R22. `npm run kms:validate` exits 0.

R23. `npm run kms:assemble:internal` exits 0, and the internal docs site build
     (`npx next build --webpack` in `kms/site-internal`) exits 0 — the MDX check that the root
     `lint`/`test`/`build` do not perform for edited `specs/*.md`.

R24. `ARTIFACT_INDEX.md` contains a row whose link target is
     `specs/2026-08-28-storefront-brief-sequencing/plan.md`, and a row whose link target is
     `specs/decisions/ADR-006-store-locations.md`, both produced by `npm run kms:build-index` rather
     than hand-edited.

R25. `CHANGELOG.md` updated (Gate 4).

R26. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.

<!--
  Note on R10: it is pinned to PR #419 — a promotion that has ALREADY merged — deliberately.
  A row asking `sdd:audit` to exit 0 outright cannot pass at /validate, because this slice's own
  spec directory exists on the filesystem and its roadmap change-log row is written by
  Document (final), which runs after Ship. See specs/sdd-workflow.md's note on this.

  Note on R19: the earliest-phase rule exists because a GitHub issue carries at most one milestone
  while three of these issues are deliberately split across phases. Without the rule stated, a
  validator and a builder can both be "correct" and disagree.

  Note on R24: it checks the link TARGET (the file path), not the front-matter `id`. The generated
  table renders title/type/version/updated/status/visibility/summary and keys rows by path — no
  slice's `id` string has ever appeared in ARTIFACT_INDEX.md, so a check grepping for the `id`
  could not pass for any slice. See specs/sdd-workflow.md's P8.1b note.

  Note on R11: bump the front-matter BEFORE running `npm run kms:build-index`, not after — the
  index embeds each artifact's version/updated, so a later bump re-stales the index and CI's
  rebuild-and-diff catches it. See CLAUDE.md's KMS section.
-->
