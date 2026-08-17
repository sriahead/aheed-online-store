# Phase 6.5 — Autonomous Application Self-Review, Gap Detection & Hardening

## Overview

Phase 6.5 is an autonomous audit and hardening loop operating across all application layers (KMS,
schema, backend, frontend, security, payments, tests, performance, deployment) prior to Phase 7.

> **Corrected 2026-08-17** by `specs/2026-08-17-p6.5-residual-validation/` (issue #192). This file
> previously stated its acceptance criteria as prose "Objectives" and "Exit Criteria" with no
> `R1..Rn` numbering, while `validation.md` verified rows labelled `R1..R6` that corresponded to
> nothing in this file. Worse, two of those rows were satisfied by a document asserting something
> about *itself* — "inspect the gap register to ensure it lists 0 unresolved CRITICAL or HIGH gaps"
> passes whenever the register *says* so, regardless of whether the code matches. That is the
> mechanism that let GAP-010 (staff bulk order transitions) sit as an accounted-for `Deferred` row
> while the feature had never been built, undiscovered until P7a's first real `/validate` in
> PR #204. The criteria below are renumbered and re-pointed at artifacts.

## Objectives

1. Inspect the codebase and documentation for consistency, security, correctness, data integrity
   and compliance.
2. Record every finding in the master gap register.
3. Fix safe Critical/High gaps with regression tests and updated KMS docs.
4. Produce a Phase 6 exit-gate report.

## Acceptance criteria

R1. The P6.5 audit's findings are recorded as rows `GAP-001`..`GAP-004` in the master gap register
    (`docs/gap-register.md`), each carrying a category, a severity and a status.

R2. `docs/sdd/self-review/SELF-REVIEW.md` exists and states an explicit Phase 6 exit-gate decision.

R3. GAP-001 is fixed in the code: `lib/tenant.ts` derives the request hostname via `splitHostPort()`
    and contains no `.split(":")[0]` host parsing.

R4. GAP-002 is fixed in the code *and* against the reported symptom: `lib/auth-origin.ts` exports
    `splitHostPort` and `inferProto`, `buildAuthOrigin` preserves a non-default port, and a real
    browser sign-in against `npm run preview` at `http://localhost:8787` completes without a 403
    `Invalid origin`.

R5. GAP-003 is fixed: `app/not-found.tsx` exists and renders a vendor-branded 404 for an unknown
    route.

R6. GAP-004 is fixed: `ARTIFACT_INDEX.md` is current — `gates.yml`'s normalised rebuild-and-diff
    check exits 0.

R7. Every High/P1-severity gap left `Open` in the master register is an operational prerequisite
    whose resolution is an action outside this repository (a credential, a DNS record, a bucket
    policy), and its row names that external action. No High/P1 gap remains open against a code
    defect.

R8. `npm run typecheck` exits 0.

R9. `npm test` exits 0.

R10. `npm run lint` exits 0.

R11. `npm run kms:validate` exits 0.
