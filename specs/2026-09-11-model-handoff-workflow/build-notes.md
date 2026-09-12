# Project-state model handoff workflow integration (build notes)

Written at the end of Build, before the pre-validation Clear. The approved spec is
`specs/2026-09-11-model-handoff-workflow/` and the tracked issue is #726.

## What changed and why

- Added the four-part responsibility model to `specs/sdd-workflow.md`: Build Notes hold current-slice
  context, authoritative docs hold durable truth, `docs/model-handoff.md` holds important overall
  current position, and Orient recovers then verifies what is live.
- Updated `.claude/commands/orient.md` to read `CLAUDE.md` then the handoff, reverify volatile Git,
  GitHub, Project, PR, deployment and scope-relevant environment state, and avoid repository-wide
  rediscovery. The command also includes the Priority and `--limit 600` behavior currently owned by
  open PR #725 so it matches the governing workflow on this branch.
- Updated `.claude/commands/build-notes.md` and the governing stage with the mandatory pre-Clear
  Project-State Handoff Check and its three information destinations.
- Updated `.claude/commands/document.md` and the governing final stage with material-overall-state
  reconciliation: authoritative docs first, then replacement/removal of stale handoff state, or no
  handoff edit when nothing material changed.
- Added `docs/model-handoff.md` from the checkpointed orientation findings, with an explicit
  scope/ownership boundary and refreshed volatile state. The protected checkpoint commits were not
  cherry-picked, rewritten or mixed into this branch.
- Corrected `specs/sdd-workflow.md`'s directly related status-only Project description and stale
  Orient board command. No application, schema, infrastructure or runtime behavior changed.

## Decisions taken during the build

- Kept the semantic handoff decision as a mandatory judgment check. `scripts/sdd-check.ts` remains
  untouched because it cannot determine whether a finding is routine slice detail, durable truth or
  material overall state.
- Kept the Build Notes template and `/validate` unchanged. Adding a fifth template heading would
  force every slice to manufacture handoff prose and encourage duplication; the check instead sits
  in the stage instructions before commit and `sdd:preclear`.
- Reproduced only the approved handoff document on this branch rather than cherry-picking `d56c7b9`,
  whose parent is the separate #713 draft checkpoint. The original branch still points to `d56c7b9`
  with parent `2938597`.
- Preserved the existing post-Ship carry-forward rule. Model-handoff reconciliation is part of final
  Document, not a reason to create a parallel documentation PR.
- Treated the first root `npm run build` timeout as a non-result and retried with a longer timeout.
  The retry again compiled, typechecked, generated every static page and collected traces, then did
  not return before the 360-second shell timeout. No repository-scoped orphaned Node or workerd
  process remained. This is recorded for fresh-context validation rather than described as a pass.

## Deviations from the spec

None.

## Known-shaky areas

- PR #725 remains open and overlaps `.claude/commands/orient.md`'s Priority wording. Before Ship,
  fetch `origin/staging`; if #725 landed, reconcile against its final text and verify the governing
  workflow and command still agree rather than resolving mechanically.
- PR #722 remains open and is expected to close three of the four existing `sdd:audit` gaps. The
  fourth is the #713 draft false-positive. Validation should re-run the audit and classify its live
  output rather than requiring zero gaps for this not-yet-documented slice.
- Root `npm run build` did not produce an exit code in either Build attempt despite reaching the end
  of visible Next output. Validation must rerun it from the fresh context and report the real result;
  compilation output alone is not a pass.
- Documentation edits require the internal KMS build in addition to root checks. The spec draft's
  KMS build passed; Build Notes regenerates the checked-in artifacts after all prose is final.
- Build-stage checks that did complete: `lint`, `format:check`, `typecheck`, and Vitest at 118 files /
  1589 tests, plus `kms:validate`. No tests or test baselines changed in this slice.
