---
id: model-handoff-workflow-plan
title: "Project-state model handoff workflow integration (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-09-11
visibility: internal
summary: Formalize the project-state model handoff within Orient, Build Notes, and final Document while keeping slice detail, durable truth, current project position, and live verification distinct.
tags: [sdd, workflow, handoff, orientation, documentation]
related: [sdd-workflow, claude-md]
---

# Project-state model handoff workflow integration (plan)

**Goal:** close `#726` by making `docs/model-handoff.md` a defined part of the existing SDD loop,
without creating another artifact or allowing it to replace Build Notes, permanent documentation,
or live orientation.

## Why This Slice Exists

The repository now has a useful point-in-time project snapshot, but the governing workflow does not
say when to read it, when to reconcile it, or how to decide what belongs there. That leaves four
artifacts answering overlapping questions without an ownership rule:

- Build Notes can become a project overview instead of the current slice's validation handoff.
- Permanent documentation can be deferred into a volatile snapshot instead of being corrected.
- The model handoff can become another changelog or copy the roadmap.
- Orient can trust dated external state instead of reverifying it live.

The governing `specs/sdd-workflow.md` also contradicts the current `/orient` command: it still calls
Project #2 a status-only layer and omits the board Priority and pagination rules. Since the workflow
governs when command files disagree, that directly related wording must be corrected here.

## Responsibility Model

- **Build Notes = what happened in this slice.** Implementation decisions, changed areas,
  deviations, validation context, and known-shaky areas needed across the pre-validation Clear.
- **Authoritative documentation = what is permanently true.** Architecture, runtime, roadmap,
  operating rules, and other standing decisions are corrected at their source.
- **Model Handoff = what a fresh model needs to understand about the current overall project
  position.** It is concise, points to authority, and marks volatile information for live
  verification.
- **Orient = what is actually true now.** It recovers from the handoff, then reverifies Git,
  GitHub, Project, PR, deployment, and scope-relevant environment state before acting.

## Scope

1. Update `.claude/commands/orient.md` so recovery starts with `CLAUDE.md` and
   `docs/model-handoff.md`, explicitly treats the handoff as dated context, and limits deeper reads
   to the current area and discrepancies found during live verification.
2. Update `.claude/commands/build-notes.md` with the mandatory pre-Clear Project-State Handoff
   Check. Route current-slice detail, durable truth, and important overall current state to their
   respective owners before `sdd:preclear` runs.
3. Update `.claude/commands/document.md` with final-state reconciliation after Validate, Fix, and
   Ship. Authoritative docs are corrected first; the handoff is reconciled only when the shipped
   result materially changes overall project state, replacing stale information rather than
   appending history.
4. Update `specs/sdd-workflow.md` as the governing definition of the responsibility model and both
   handoff checks. Correct its directly related Project Priority/status-layer and Orient wording.
5. Introduce `docs/model-handoff.md` on this branch with a concise scope and ownership boundary,
   using the existing checkpointed snapshot as the recovery baseline without bringing the #713
   draft into this slice.

## Duplication Controls

- Routine implementation and validation detail stays in the slice's `build-notes.md`.
- Durable truth is written to its authoritative document; the handoff links to that document rather
  than copying it.
- Historical completion detail stays in `specs/roadmap.md` and `CHANGELOG.md`.
- Volatile facts are visibly marked for live verification and checked by Orient.
- Reconciliation removes or replaces stale handoff content instead of accumulating a history feed.
- An unchanged overall project position results in no handoff edit.

## Deliberately Excluded

- No new handoff artifact or parallel workflow.
- No automation of the semantic handoff decision in `scripts/sdd-check.ts` or `sdd:preclear`.
- No new required heading in `specs/templates/feature-spec/build-notes.md`.
- No change to `/validate`; the spec remains authoritative and Build Notes remain supporting
  context.
- No application, schema, infrastructure, or deployment behavior change.
- No #713 implementation, spec completion, audit, or brand-colour change.
- No rewrite, squash, reset, or alteration of the `docs/orient-reads-board-priority` branch or its
  local `2938597` and `d56c7b9` checkpoint commits.

## Coordination With Existing Work

PR #725 remains the owner of #724's `/orient` Priority change. This slice defines the governing
workflow end state and may need to reconcile with a newer `origin/staging` before Build or Ship, but
it does not rewrite or repurpose that branch. PR #722 remains the owner of the recent final-document
gaps reported by `sdd:audit`; this slice does not absorb those closeouts.

## Open Items Carried Forward

- **#713** remains the next feature slice after this process work completes. Its checkpointed plan
  remains draft and unapproved.
- **#714** remains dependent on #713 and is unaffected by this workflow change.
