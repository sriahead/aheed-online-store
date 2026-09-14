---
id: model-handoff
title: "Model handoff: repository orientation snapshot"
audience: [dev]
type: doc
status: approved
version: "1.4.0"
updated: 2026-09-14
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

- **Date:** 2026-09-14.
- **Checkout:** `docs/p748-document-final` (this Document (final) closeout, off `staging` at
  `623c24f`).
- **Base state:** `origin/staging` at `623c24f` (PR #752 merged); `origin/main` at `02d8e82` (PR
  #741 promotion merged). **Staging is ahead of main by 21 commits** — #401 (Shared Fulfilment
  Slots, PR #744), #613 (Postcode & Address Lookup, code via #744's shared ancestry; its own PR
  #743 closed without merging), #402 (Express SLA, PR #746) and now #748 (Shared Fulfilment State,
  PR #752) have all shipped to `staging`; **none promoted to `main`**.
- **🛑 DO NOT PROMOTE `staging` → `main` — still held at the owner's explicit request (2026-09-14).**
  The owner described **seven** defects on deployed `staging`, triaged into three issues:
  - **#748** — fulfilment method is never persisted (postcode un-editable once set, cart and
    checkout disagree, minimum-order tracker missing, "Delivery FREE" under Click & Collect).
    **Shipped to `staging` via PR #752 (`623c24f`), 2026-09-14.** Board status **In Review**; stays
    open until promoted (`Done` means in production here — see `CLAUDE.md`'s branch-strategy
    section). Two narrow gaps left open as their own tracked follow-ups rather than blocking this
    slice: **#753** (R14/R18 need a live-browser check — no Chrome automation was available during
    this slice's `/validate`; code-level reasoning is sound and the risk is well-understood).
  - **#749** — checkout "Find Address" does nothing; vendor logo upload fails at
    `/staff/storefront`. **Still open, not started.**
  - **#750** — delivery slots and Express Collection shipped with no staff configuration and no
    seed, so neither can ever appear. **Still open, not started.**

  **Promotion still needs at least #750**: promoting now would ship `#401`/`#402` to production
  with no way to enable either feature. `#748`'s fix removes one of the three defects blocking the
  hold, but does not lift it — see `specs/roadmap.md`'s matching 2026-09-14 change-log rows.
- **Worktrees:** only the main checkout.
- **Protected local work:** the separate `docs/orient-reads-board-priority` branch (PR #725, still
  open) points to `d56c7b9`, whose parent is the #713 draft checkpoint `2938597`. Preserve both;
  neither belongs in the current branch diff. PR #722 (`docs/document-final-social-contact-mobile-nav`)
  is also still open, independently of this session's work — both #725 and #722 had green checks
  as of 2026-09-10/09-11 but were not re-verified live by this session.

## Project Position

The product is a functioning multi-vendor grocery storefront and staff panel, not the walking
skeleton still named in a few stale headers. P0 through P8 and P2.6 are substantially closed. Work
is in **P9 launch readiness**, but the owner's High-priority P9.2 feature set currently displaces
P9.3 launch validation and P9.4 certification.

**The P10 "Delivery cluster" (#401/#402/#613) shipped to `staging` on 2026-09-14, ahead of its own
documented sequencing** — `specs/roadmap.md`'s P10 candidate list said `#363` (vendor timezone)
"must land first"; it did not, and `#402`'s own build-notes record this explicitly as a
known-shaky area rather than a silent gap. Fine for this app's UK-only vendors today. **`#748`
(fulfilment state, the first of the three owner-reported defects blocking promotion) also shipped
to `staging` the same day, via PR #752.** Promotion to `main` is still blocked — see the
DO-NOT-PROMOTE note above; #750 (no staff configuration surface) is the remaining hard blocker.

Do not recover architecture from this handoff. Read `CLAUDE.md`, `specs/architecture.md`,
`specs/tech-stack.md`, `specs/decisions/ADR-001..006` and `specs/sdd-workflow.md` when their areas are
in scope.

## High-Priority Work

The live board showed open High-priority items, all with blank Complexity:

- Brand safety & staff operability: #714 (promoted via PR #732), #733 (promoted via PR #736), and #737 (merged to `staging` via PR #738, currently **In Review** on Project #2 awaiting promotion).
- Stock and fulfilment: #401, #402 and #613 **shipped to `staging` 2026-09-14** (PRs #744/#746),
  board status corrected to **In Review**; **not promoted to `main`** (see DO-NOT-PROMOTE note
  above). #363 and #422 remain genuinely open/unresolved — #402 shipped without either, flagged as
  known-shaky (timezone) and unresolved (multi-site). #400 remains split: the async-loading half
  still open, the per-store half still blocked on #422. **#748 (fulfilment method persistence) also
  shipped to `staging` 2026-09-14 via PR #752**, board status **In Review**; #749 and #750 (the
  other two owner-reported defects) remain open and unstarted.
- Saved lists: #116.
- Paid-order cancellation and reversals: #696, then #137 and #151.
- Trust and contact: #406 and #695.
- Data activation: #697.
- Location decision reconciliation: #422.
- Exposed credential rotation: #219.

Dependencies and scope boundaries worth preserving:

- #696 makes #137 and #151 reachable. Current cancellation acts only on `PENDING_PAYMENT`.
- #363 gates delivery slots and Click & Collect. #402 also needs the location decision and real
  operating inputs such as capacity, rounds and order volume.
- #400 is three concerns: the low-stock badge exists; restock dates and async loading do not;
  per-store stock depends on location modelling.
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

- **#401/#402/#613 all shipped to `staging` 2026-09-14** — see the DO-NOT-PROMOTE note under Last
  Verified and `specs/roadmap.md`'s matching change-log rows for the full history (PR #744, #743
  closed superseded, PR #746, #742 closed as a hazardous stale PR that would have deleted this
  work). **`deploy-staging` and `deploy-docs-internal` both confirmed `success` for `0e3c4f1`** —
  the latter is notable because it had been broken since before #744 (pre-existing, root-caused to
  a bare `<dialog>` tag in `specs/roadmap.md`, unrelated to either slice) and #746 carried the fix.
- **`#748` shipped to `staging` 2026-09-14 via PR #752 (`623c24f`)** — full SDD loop
  (`specs/2026-09-14-p10-shared-fulfilment-state/`), `/validate` run from a fresh context with live
  checks against both real seeded vendor hosts, `deploy-staging` confirmed `success`. Board status
  **In Review**. One follow-up filed rather than blocking the ship: **#753** (R14/R18 need a live
  browser check this session couldn't run). A stale `validation.md` grep row (R20, pointed at
  `CartContents.tsx` after the control moved to `CheckoutLink.tsx` mid-build) was corrected on the
  same PR — see `CLAUDE.md`'s new curl/cookie-jar bullet in "Live-testing staff panel server
  actions without a browser" for the multi-vendor testing trap this slice's `/validate` also hit.
- **Issue #737** (Staff/Admin delegation, Category Manager, Help Centre, Zero-review ratings;
  `specs/2026-09-12-staff-admin-help-ratings/`) merged to `staging` via **PR #738** (`2687f16`),
  its own Document (final) closeout merged via **PR #739**, and is **In Review** on Project #2;
  closes upon promotion to `main` (blocked with everything else — see DO-NOT-PROMOTE).
- **PR #736** merged `staging → main` (`0d41faa`), promoting #733 and closing #582, #583, #589, #602, #638, and #683 to `Done`.
- **PR #732** merged `staging → main` (`b505d81`), promoting #714 to `Done`.
- **PR #725** (`docs/orient-reads-board-priority`) and **PR #722**
  (`docs/document-final-social-contact-mobile-nav`) are **both still open**, unrelated to this
  session's work. Checks were green as of 2026-09-10/09-11; not re-verified live here — re-check
  before acting on either.
- **Branch `feat/location-control`'s delivery-postcode-modal fix merged 2026-09-12 via PR #740** —
  no longer awaiting a PR; this line was stale as of the 2026-09-12 handoff.
- **`feat/p401-shared-fulfilment-slots`, `feat/p613-address-lookup`, `feat/p402-express-sla` and
  now `feat/p10-shared-fulfilment-state` are all merged/closed and safe to delete** (locally and on
  the remote) — not done by this session, left for a deliberate cleanup pass since branch deletion
  wasn't asked for.

## P10 Delivery-Cluster Review Findings (2026-09-14)

Established live against deployed `staging` (`b85fc2b`) and the staging database. These are
**evidence a future session should not re-derive**, not scope.

- **`#401`/`#402` have no administrative surface at all.** `offerDeliverySlots`,
  `expressCollectionEnabled`, `bookingWindowDays`, `slotHoldDurationMinutes`,
  `VendorFulfilmentSlot` and `VendorExpressSchedule` appear in **no** file under
  `components/staff/`, `app/(admin)/`, `features/admin/` or `prisma/seed.ts`. Live staging for
  Aheed: both flags `false`, **0** express schedules, **0** fulfilment slots. The features cannot
  be switched on, and no time window can be authored. That is `#750`.
- **The CSP blocks `api.postcodes.io`.** Staging's live header is
  `connect-src 'self' https://*.r2.cloudflarestorage.com`, and `lib/postcodes-api.ts` has no
  `"use server"`, so its `fetch` runs in the browser and is blocked before it leaves the page —
  then swallowed by a `console.warn`-only fallback. `#613`'s address lookup has therefore never
  worked in any deployed environment. Part of `#749`.
- **The vendor logo upload's root cause is still unknown, but three candidates are RULED OUT** —
  do not re-check these: R2 bucket **CORS is correctly configured** (preflight from the staging
  origin returns `204` with `Access-Control-Allow-Methods: PUT`); the **CSP permits** the R2
  endpoint; and **nothing throws server-side** (no `ErrorEvent` rows later than 2026-09-10, and
  server-action throws do reach that table). The next step is a browser reproduction with DevTools
  open. Separately certain: `components/staff/VendorLogoUploader.tsx:74` carries a corrupted
  template literal that discards the HTTP status, and its `fetch` is unguarded inside
  `startTransition` — it is the only one of the repo's four uploaders that cannot report why it
  failed, which is why this was unreportable.

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
- `CLAUDE.md`'s Vitest baseline is now 128/1632 (corrected 2026-09-14, `#748`'s Build, after the
  P401/P613/P402 work's 127/1618) — three of the files it counts
  (`tests/concurrency-slot-booking.test.ts`, `tests/slot-capacity.test.ts`,
  `tests/express-sla.test.ts`) are `it.skipIf(!DATABASE_URL)`-guarded and report **skipped**, not
  run, in CI, so a real CI job's own summary line will read 3 fewer tests even when fully green —
  expected, not a discrepancy to chase.
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
   checkpoint branch without modifying it. **Check whether the DO-NOT-PROMOTE hold under Last
   Verified has been lifted or superseded before proposing or running any `staging → main`
   promotion** — if this handoff has not been updated since 2026-09-14, assume it still applies and
   ask the owner rather than promoting.
5. Query Project #2 with `--limit 600`; filter `Priority == High` and read Status, Phase and
   Complexity. Re-open issue bodies before accepting stale/duplicate findings.
6. Read `docs/research/discovery-log.md` for newer evidence touching the selected scope.
7. Verify health/deployment state and any scope-dependent secret, database or Cloudflare fact live.
8. Report discrepancies and stop at the current stage's approval boundary.

