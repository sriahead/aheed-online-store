---
id: model-handoff
title: "Model handoff: repository orientation snapshot"
audience: [dev]
type: doc
status: approved
version: "1.0.0"
updated: 2026-09-11
visibility: internal
summary: "Concise project-state handoff for fresh-session recovery, covering current position, owner priorities, blockers, reconciliation gaps, and the volatile facts Orient must verify live."
tags: [handoff, orientation, roadmap, backlog, operations]
related: [claude-md, roadmap, sdd-workflow, architecture]
---

# Model handoff: repository orientation snapshot

> **Point-in-time handoff, not authority for volatile state.** This snapshot preserves the useful
> project-wide findings from the latest orientation. GitHub, Project #2, branches, deployments,
> environments and local work may have changed. Re-run **Fresh-session recovery** before acting.

## Scope And Ownership

This document answers **where the overall project stands now**. Keep only important current position
a fresh model would otherwise need to rediscover, and reference authoritative documents instead of
copying them.

- **Build Notes answer what happened in one slice.** Implementation decisions, changed areas,
  deviations, validation context and known-shaky areas stay in that slice's `build-notes.md`.
- **Authoritative documents answer what is permanently true.** Architecture, runtime, roadmap,
  operational rules and standing decisions are corrected at their source; this file points to them.
- **Final Document reconciles shipped reality.** It updates permanent documentation first and then
  this snapshot only when the completed work materially changed overall project state.
- **Orient answers what is true now.** It reads this snapshot for recovery and reverifies every
  volatile fact live before relying on it.

Do not append slice history here, reproduce the roadmap or CHANGELOG, or use this file in place of
Build Notes across the pre-validation Clear. Remove or replace stale information during
reconciliation. If overall project state did not materially change, leave this file untouched.

## Last Verified

- **Date:** 2026-09-11.
- **Checkout:** `feature/model-handoff-workflow`, created from `origin/staging` at `f1dfb03`; #726's
  approved spec commit is `b237d67`. Reverify the current head.
- **Base state:** `origin/staging` at `f1dfb03`; `origin/main` at `36c5b92`. Staging had no commit
  absent from main after PR #721's promotion.
- **Worktrees:** only the main checkout.
- **Protected local work:** the separate `docs/orient-reads-board-priority` branch points to
  `d56c7b9`, whose parent is the #713 draft checkpoint `2938597`. Preserve both; neither belongs in
  #726's branch diff.

## Project Position

The product is a functioning multi-vendor grocery storefront and staff panel, not the walking
skeleton still named in a few stale headers. P0 through P8 and P2.6 are substantially closed. Work
is in **P9 launch readiness**, but the owner's High-priority P9.2 feature set currently displaces
P9.3 launch validation and P9.4 certification.

Do not recover architecture from this handoff. Read `CLAUDE.md`, `specs/architecture.md`,
`specs/tech-stack.md`, `specs/decisions/ADR-001..006` and `specs/sdd-workflow.md` when their areas are
in scope.

## High-Priority Work

The live board showed **22 open High-priority items**, all with blank Complexity:

- Search operability: #582, #583, #589, #602.
- Staff/admin polish: #638, #683.
- Brand safety: #713, then dependent #714.
- Stock and fulfilment: #363, #400, #401, #402, #613.
- Saved lists: #116.
- Paid-order cancellation and reversals: #696, then #137 and #151.
- Trust and contact: #406 and #695.
- Data activation: #697.
- Location decision reconciliation: #422.
- Exposed credential rotation: #219.

Dependencies and scope boundaries worth preserving:

- #713's checkpointed plan is draft only, with no `requirements.md` or approval; #714 depends on it.
- #696 makes #137 and #151 reachable. Current cancellation acts only on `PENDING_PAYMENT`.
- #363 gates delivery slots and Click & Collect. #402 also needs the location decision and real
  operating inputs such as capacity, rounds and order volume.
- #400 is three concerns: the low-stock badge exists; restock dates and async loading do not;
  per-store stock depends on location modelling.
- #583 and #589 are confirmed defects in `lib/search-synonym-proposals.ts`: the real Workers AI
  response is not reliably a string, and `response.json()` is unguarded.
- #697 is not missing code. The net-content columns, form, unit-price derivation and pack-size facet
  exist, but dev measurement found zero populated products. Production was not measured.
- #406 must choose between third-party widgets and first-party rendering after considering CSP,
  PECR consent, performance and per-vendor identifiers.
- #695 needs Meta approval, inbound webhook design and phone-to-user identity; it is not
  repository-only work.

Completed items still carrying board Priority `High` were #397, #405, #407, #608 and #694. Do not
mistake them for backlog.

## In-Flight Work

All facts in this section require live verification:

- **PR #725** into `staging` taught `/orient` to read board Priority and corrected stale board-field
  claims. Required checks were green, but it remained open.
- **PR #722** into `staging` carried final documentation for social/contact and mobile-nav/
  bundle-card work plus promotions PR #717/#721. Required checks were green, but it remained open.
- `npm run sdd:audit` reported four gaps: the #713 draft being treated mechanically as an
  undocumented slice, the mobile-nav slice, and promotions #717/#721. PR #722 was expected to close
  the latter three; re-run rather than assuming it merged.

## Backlog Reconciliation Findings

Verified candidates, not instructions to close anything without re-checking:

- **#422 appears answered:** `specs/roadmap.md` records "single site now, multiple planned", while
  the issue and ADR-006 still call the business decision open.
- **#280 is obsolete:** its owner comment says `VendorPromotion` was deleted and the issue was
  superseded by P8.5b, but it remains open.
- **#423, #596 and #712 overlap:** all describe `kms/site-internal/next-env.d.ts` command-dependent
  churn; #712 identifies the broken ignore rule most precisely.
- **#174 is partially stale:** inline deletion handles superseded/removed images; only abandoned
  uploads remain.
- **#405's title is stale:** its contact-link half is Done; chat re-ordering is split to #695.
- **#397 is Done in code but inert in data:** #697 records the missing net-content values.
- **#472's title is stale:** both branches have active PR/status-check rulesets; only the
  approval-gate portion remains.
- **#421 is a stale umbrella candidate:** most constituents shipped or have independent issues.
- **#286 retains only its narrower database-backed fuzzy/performance question.** Its history says
  #565 chose AI correction, but current search recovery is deterministic.
- **#682 is intentionally open:** its reported error did not reproduce, although related cursor and
  read-amplification fixes shipped. #689 is the separately reproduced repeated-parameter 500.

Board Phase and GitHub milestone disagreed for #151, #422, #589, #602, #695, #696 and #697.

## Documentation Reconciliation

- `CLAUDE.md`, `package.json` and `prisma/schema.prisma` still contain walking-skeleton descriptions.
- Architecture and tech-stack prose says "Pages/Workers" although the runtime is Workers only.
- `specs/architecture.md` says the storage port has five operations and no delete; the code has six,
  including `getObject` and `deleteObject`.
- `CLAUDE.md` says local `VendorDomain` values must not carry a port; `lib/tenant.ts` deliberately
  supports a port-qualified local fallback.
- `deploy-production.yml` still cites the obsolete private-repository paid-plan explanation for no
  approval gate. The current decision is deliberate self-approval avoidance on a public repo.
- `specs/mission.md` still cites ISR although this Prisma/Workers stack cannot use Next ISR.
- `CLAUDE.md`'s Vitest baseline was 117/1557; the last verified full run was 118/1589.
- The roadmap says the internal KMS site went live behind Access; its deploy workflow says no public
  route is configured. Verify Cloudflare before correcting either statement.

## Risks And Blockers

These are separate from, not a silent reordering of, the owner's High priorities:

- Hard launch inputs: #113 production Stripe live keys and #104 verified Resend sending domain.
- Security/operations: #219 and #175 credential rotations; #436 demonstrated restore; #437 outbound
  alert delivery; #438 tested rollback; #246 persisted-log confirmation.
- Reproduced or live defects: #236 rapid cart-mutation ceiling, #689 repeated query parameters
  causing list-page 500s, #723 duplicate current collection links, and #655 missing-image fallback
  gaps.
- Launch evidence remains incomplete: #439 through #445, including no Playwright harness, UAT,
  accessibility validation, game day, exact-candidate verification or GO/NO-GO.
- #599 confirms `Cache-Control` did not create edge caching for search suggestions.
- Prisma migration generation repeatedly proposes deleting the hand-authored trigram indexes.
- The raw-SQL exception has no mechanical single-file enforcement (#676).
- Workers Logs remain at 100 percent sampling and must be reviewed before real traffic.
- The platform remains merchant of record for all vendors until ADR-005's Connect trigger is met.

## Requires Live Access

Not verified by the latest orientation:

- Whether production Stripe credentials are test or live.
- Resend domain verification and real external delivery.
- Cloudflare Worker secret presence, including scheduler/application token parity.
- Whether #219/#175 rotations happened outside GitHub issue state.
- Neon plan limits, backup retention and an actual isolated restore.
- Persisted Workers Logs, alert-channel delivery and scheduler executions.
- Production/staging net-content row counts for #697.
- Whether the internal KMS Worker has an Access-protected route despite the workflow comment.

Public health checks verified Aheed and SriMart staging/production Workers at the expected commits,
with `db.ok: true` and storage configured. That does not verify any item above.

## Fresh-Session Recovery

1. Read `CLAUDE.md`, then this handoff and `.claude/commands/orient.md`.
2. Read `specs/roadmap.md` sections P9 and P10. Treat this handoff as leads to re-check, never as
   newer authority than live state.
3. Run `git fetch --all --prune`, `git status --short --branch`, `git worktree list`, and compare
   `origin/main` with `origin/staging`.
4. Re-read open PRs #722 and #725, check #726, run `npm run sdd:audit`, and verify the protected
   checkpoint branch without modifying it.
5. Query Project #2 with `--limit 600`; filter `Priority == High` and read Status, Phase and
   Complexity. Re-open issue bodies before accepting stale/duplicate findings.
6. Read `docs/research/discovery-log.md` for newer evidence touching the selected scope.
7. Verify health/deployment state and any scope-dependent secret, database or Cloudflare fact live.
8. Report discrepancies and stop at the current stage's approval boundary.
