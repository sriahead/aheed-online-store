---
id: model-handoff
title: "Model handoff: repository orientation snapshot"
audience: [dev]
type: doc
status: approved
version: "1.14.0"
updated: 2026-09-18
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

- **Date:** 2026-09-18.
- **Checkout:** `main` and `staging` are **converged** at `d8f61a4` (PR #799, "Promote staff
  cancellation of a CONFIRMED order to production (#696, #137, #151)", merge `staging -> main`,
  carrying PR #796's feature merge and PR #798's Document (final) closeout). **No slice pending
  promotion.** `#696`, `#137` and `#151` all closed on this merge, their Project #2 items
  auto-moving to `Done`. Migration `20260917140514_p696_staff_cancel_confirmed_order` applied
  (additive: `LoyaltyEntryKind.EARN_REVERSAL`, `DiscountRedemption.reversedAt`, no backfill).
  Production `/api/health` confirmed serving `d8f61a4` with `db.ok: true` post-deploy.
- **`CLAUDE.md` was reduced from 149,380 to 13,925 characters (`#786`, PR #787/#788,
  2026-09-17).** Every rule was relocated to an authoritative destination first, not deleted — see
  `specs/2026-09-17-claude-md-guardrail-refactor/migration-ledger.md` for the line-by-line proof
  and `docs/developer-portal/{runtime-pitfalls,app-conventions,local-dev-playbook}.md` for the
  three new documents that absorbed the material with no prior owner. A session that still expects
  `CLAUDE.md` to carry the vitest suite baseline, a Milestone-0 claim, `phase:`/`gate:` PR labels,
  or `@prisma/adapter-neon@6.19.3` is working from a stale memory — all five were corrected or
  removed, not merely reworded. `#584` and `#546` closed on this promotion. **`#724` has since
  CLOSED** (PR #793/#794, 2026-09-17) — its remaining half was `specs/roadmap.md` denying the
  board's `Priority`/`Complexity`/Phase fields in three places, corrected there. `#505` is still
  open for its non-`CLAUDE.md` half.
- **Two prior slices promoted to `main` with no separate Document (final) PR of their own**:
  the stakeholder business case (`#777`, PR #778/#779, 2026-09-16) and the credential verification
  closeout (`#780`/`#781`/`#782`, PR #784/#785, 2026-09-17). This section's SHA/issue state below is
  now current for both, but neither got the dedicated narrative section a Document pass normally
  writes — read those PRs directly for detail beyond what's summarised here.
- **THE LIVE R2 CREDENTIAL OUTAGE IS OVER (`#755`, resolved 2026-09-16) AND ITS FOLLOW-UP WORK IS
  ALSO DONE (`#780`/`#781`/`#782`, closed on PR #785, 2026-09-17).** `scripts/verify-storage-
  credentials.ts` now probes all four env files (`.dev.vars` included) and reports whether each
  deployed Worker is running its newest version; `CLAUDE.md` (now `docs/developer-portal/
  runtime-pitfalls.md`) documents the loud half of the undeployed-version trap; `saveStorefrontTheme`
  validates its input and uses the shared `isUniqueViolation` check. See the dedicated section below
  for the outage itself — **the rotation was the easy half**, and the way it stayed invisible is the
  part a future session needs.
- **Both Workers were redeployed and are on clean wrangler-sourced deploys**: staging `859a1ff6`,
  production `8d1c074c`, each its own newest version, as of the `#755` rotation — not re-verified
  live since.
- **Issues closed 2026-09-16/17 after live verification**, not on assertion: `#755` (rotation),
  `#756` (fulfilment seed), `#713` (brand-colour validation, found already shipped), `#219`
  (Cloudflare token rotation), `#777` (business case), `#780`/`#781`/`#782` (credential closeout),
  `#786`/`#584`/`#546` (this slice).
- **NEW INFRASTRUCTURE — a second Neon project now exists, and is live in production.** See the
  dedicated section below. This is the most consequential project-level change since multi-tenancy.
- **Worktrees:** only the main checkout.
- **PR #725 and PR #722 are OBSOLETE — stop protecting them.** Verified live 2026-09-17: both are
  open, both are `CONFLICTING`, and both touch `CLAUDE.md`, which `#786` rewrote from 149,380 to
  13,925 characters underneath them. Their substance has already landed by other routes — #725's
  `orient.md` half via PR #726/#727, its `CLAUDE.md` half via `#786`, its roadmap half via PR #793,
  and `#724` itself is closed; #722's roadmap rows already exist at `specs/roadmap.md:1032` and
  `:1035`. Rebasing either costs more than re-deriving anything still missing. **Recommend closing
  both** — an owner action, not taken here.

## The R2 credential outage is resolved — and HOW it stayed hidden is the durable lesson (`#755`, 2026-09-16)

`#755` is closed. The R2 API token was rotated, all four env files updated, both Workers
redeployed, and a real vendor-logo upload confirmed on staging **and** production. Do not re-open
this as a live defect. What follows is why it took four steps beyond what the repository documented.

**Rotating the token and updating the files was necessary and NOT sufficient.** The credential
lives in two stores. The secrets were updated through the Cloudflare **dashboard**, which creates a
new Worker version and does **not** deploy it — so both Workers went on serving the revoked key
while every local check said the rotation had worked. Specifically:

- `scripts/verify-storage-credentials.ts` reported **ACCEPTED for all three environments**. It read
  files. The files were correct.
- `/api/health` reported `storage: { configured: true }`, which only ever meant the variables exist.
- `wrangler secret list` would have shown the secrets present, because it reports the *script's*
  secrets, not the running version's bindings.

The only thing that showed it was reading the **deployed version** through the Cloudflare REST API
and seeing four `by dash` versions newer than the deployed one.

**The undeployed versions had also wedged CI**, which is the louder half and was not documented
anywhere. Both deploy workflows open their deploy step with `wrangler secret put`, and wrangler
refuses that call while an undeployed version is newest (`Secret edit failed. You attempted to
modify a secret, but the latest version of your Worker isn't currently deployed.`). Every future
deploy on both environments would have failed. Recovery was
`npx wrangler versions deploy <version-id>@100 --env <env>`, after which both workflow reruns
succeeded.

**Prefer `node scripts/configure-env.mjs <env>` over a dashboard secret edit** — it writes through
`wrangler secret put` and therefore deploys as it goes, and updates the GitHub environment secrets
in the same pass.

`#780` and `#781` — **closed** on PR #785, 2026-09-17 — closed the tooling and documentation gaps
this exposed. `docs/developer-portal/env-setup.md` now carries both halves (moved out of
`CLAUDE.md` by `#786`, substance unchanged).

**Two things this did NOT resolve:** whether the previously-exposed Cloudflare token was actually
*deleted* rather than merely superseded (an owner dashboard action, unobservable from here), and
`#783` — staging and production still share one Cloudflare API token, which was `#219` step 3 and
became untracked when that issue closed.

## A second database now exists: `uk-location-reference` (#764, shipped to staging 2026-09-16)

**This is the fact a fresh session is most likely to be missing.** The application now reads from
**two** Neon projects.

- **Aheed's own database** is unchanged in purpose: vendors, customers, orders, `Address` snapshots,
  `CustomerAddress`, carts, products, delivery configuration.
- **`uk-location-reference`** holds shared UK postcode/place reference data: `PostcodeReference`,
  `PlaceReference`, dataset versions/checksums, materialised area coverage and sync state. Its own
  schema (`prisma/reference/schema.prisma`), migrations (`npm run ref:migrate`) and generated client
  (`node_modules/@aheed/reference-client`, regenerated by `npm run db:generate`).

Branches: dev and staging **share** `ep-wild-violet-zaa9udu5`; production is
`ep-summer-boat-zapzp2t9`. Env vars `UK_LOCATION_REF_DATABASE_URL`, `UK_LOCATION_REF_DIRECT_URL`
and `UK_LOCATION_REF_POSTCODE_AREAS` exist in all four env files — and, since 2026-09-16, in the
places that actually serve traffic: both Cloudflare Workers carry the two runtime values, and both
GitHub environments carry `UK_LOCATION_REF_DIRECT_URL` as a **secret** with
`UK_LOCATION_REF_POSTCODE_AREAS` as a **variable** (`vars.`, which is what the sync workflow reads).
**A local env file is not evidence about either.** Staging served `UNVERIFIED` for every postcode
for a day with a perfectly healthy database, because its secrets sat on a dashboard-created Worker
version that was never deployed; `/api/health`'s `reference` block and
`scripts/verify-reference-coverage.ts` exist to answer that question directly.

**Why it exists:** a full-GB Code-Point import into Aheed's database occupied **456.9 MB of its
512 MB ceiling**, the Open Names import then failed outright, and ordinary application writes
started failing. Those superseded tables and their 1.75M rows have since been **dropped from Aheed's
database** (489.8 MB → 17.3 MB) by migration `20260915221254_p10_drop_superseded_reference_tables`.

**Coverage is demand-driven:** only `MK` and `RG` are materialised, at 40,031 postcodes and 23,472
places — **identical in dev/staging and production** as of 2026-09-16, when `#767` bootstrapped
production from empty and `#770` retired the leftover `LU`. Adding an area is configuration plus a
sync run; **removing one is `sync-reference-data.ts --decommission`**, which is opt-in, never run by
the schedule, and deletes each area's coverage row before its data rows so the area degrades to
`UNVERIFIED` rather than briefly reading as `INVALID`. `LU` had been materialised for Code-Point
only, left from proving the expansion path, and that was not harmless: its coverage row made the
service an authority on Luton while nothing would ever refresh it.

**The monthly sync cannot run yet.** `.github/workflows/sync-reference-data.yml` has never existed
on `main`, and GitHub resolves `schedule` and `workflow_dispatch` from the default branch, so every
import so far has been manual and will stay manual until `#764` is promoted (**#772**).

**Production's reference DATABASE is bootstrapped (`#767`, 2026-09-16) — the APPLICATION serving
it is not, and those are two separate facts.** The database itself is migrated and synced, matching
dev/staging row for row (see the paragraph above); confirmed live via `scripts/verify-reference-
coverage.ts --env-file secrets/production.vars` and `prisma migrate status`. But `#764` — the slice
that adds `GET /api/address/lookup` — has not been promoted to `main`, so production's deployed
Worker does not route that endpoint at all, on a database or not. **Do not read a production 404 on
that path as a reference-data failure**: it is the application, not the data, that is not there yet.
This line previously said the database itself was unmigrated, which was true until `#767` and is
stale now — the two facts (database readiness, application promotion) were conflated here and need
checking independently.

**The feature this database backs is now live in PRODUCTION, not just staging**: `GET
/api/address/lookup`, postcode validation and delivery-eligibility consolidation
(`lib/delivery-eligibility.ts`), and customer saved addresses (`CustomerAddress`, separate from
the per-order `Address` snapshot) — promoted via PR #775, `1e44533`, 2026-09-16. `addresses[]` in
the lookup response stays empty until a licensed property-address provider exists — tracked as
**`#766`**, not a defect (Backlog, Phase `P10`), the only issue in this group still open. `#764`,
`#767`, `#770`, `#771` and `#772` all closed on the promotion.

## Reference coverage reconciliation — NOW IN PRODUCTION (`#770`, `#771`, `#767`, PR #773/#774 to
staging, promoted via PR #775, merge `1e44533`, 2026-09-16)

Closed the one hole `#764`'s coverage model left open: the sync pipeline could add a postcode area
but never remove one, so an area dropping out of `UK_LOCATION_REF_POSTCODE_AREAS` froze at whatever
release imported it while its `ReferenceAreaCoverage` row kept claiming authority — reading
`INVALID`, the exact outcome `UNVERIFIED` exists to prevent. `sync-reference-data.ts --decommission`
closes that gap (coverage row removed before data rows, refuses on an empty required list, never
run by the schedule); `LU` — the one area that had drifted this way — was retired from dev/staging
(production never had it). `/api/health` carries a `reference` block
(`lib/reference/reference-status-service.ts`) reporting configured/reachable/required areas and
per-source drift in both directions, never fatal.

**Production is now fully live, not just the database.** Promoting `#764` to `main` is what `#772`
itself named as the fix for the dormant monthly schedule (`.github/workflows/sync-reference-data.yml`
now exists on `main`; `gh workflow list` shows it `active`, confirmed live). Production `/api/health`
reports `db.ok: true` and `reference.drift: false` at `1e44533`; `/api/address/lookup?postcode=MK10
0AA` returns `DELIVERABLE` with real coordinates; `LU11AA` correctly returns `UNVERIFIED` (never
imported in production, a different reason than dev/staging's retired `LU`, same correct state).

**Found and fixed at this slice's own `/validate`, before promotion**: a routine `deploy-staging`
CI run had silently wiped `UK_LOCATION_REF_POSTCODE_AREAS` from the deployed staging Worker's
bindings — `wrangler deploy` rebuilds a Worker's `vars` entirely from `wrangler.toml`, and the
variable had only ever been added via the Cloudflare dashboard, never committed. Fixed by declaring
it as `[env.staging.vars]`/`[env.production.vars]` in `wrangler.toml` — confirmed working on both
environments' own first real deploy from committed config (staging's post-merge `deploy-staging`,
then production's `deploy-production` on promotion), neither needing a dashboard workaround.

Read `CLAUDE.md`'s "Database" section ("Two databases exist" bullet) and `specs/architecture.md`
§3.0 before touching any of it.

## Project Position

The product is a functioning multi-vendor grocery storefront and staff panel, not the walking
skeleton still named in a few stale headers. P0 through P8 and P2.6 are substantially closed. Work
is in **P9 launch readiness**, but the owner's High-priority P9.2 feature set currently displaces
P9.3 launch validation and P9.4 certification.

**The P10 "Delivery cluster" (#401/#402, plus #748/#749/#750/#751) is now fully promoted to
production (2026-09-15, PR #759)** — see Last Verified above. It shipped ahead of its own documented
sequencing (`specs/roadmap.md`'s P10 candidate list said `#363`, vendor timezone, "must land first";
it did not, and `#402`'s own build-notes record this explicitly as a known-shaky area, fine for
this app's UK-only vendors today).

**`#613` was never part of this cluster and was never touched by it — a citation error in this
project's own history conflated the two.** The real GitHub issue `#613` is about delivery-*area*
postcode-district granularity (`MK9` deliverable, `MK17` not), unrelated, still open, and gated on
operational input from Aheed (van count, round size). It was mistakenly cited across
`specs/2026-09-13-p613-address-lookup/`, this file (in its prior revisions) and part of
`specs/roadmap.md` for the unrelated checkout postcode-*lookup*/address-autofill feature that
actually shipped via `#744`'s ancestry — **that feature has no issue of its own.** Found at this
slice's `/ship` (2026-09-15) while preparing the promotion PR's closing-issue list; `#613` was
deliberately left open and uncited by PR #759. See the Documentation Reconciliation section below
for the tracked cleanup issue.

**`#764` (address lookup, reference-data framework, saved addresses) and `#770`/`#771`/`#767`
(reference coverage reconciliation) are BOTH now promoted to production** (PR #775, merge
`1e44533`, 2026-09-16) — see Last Verified above and "Reference coverage reconciliation" for what
shipped and how it was live-verified post-deploy. `#764`, `#767`, `#770`, `#771` and `#772` all
closed; `#766` remains open, deliberately (no licensed address provider in scope).

Do not recover architecture from this handoff. Read `CLAUDE.md`, `specs/architecture.md`,
`specs/tech-stack.md`, `specs/decisions/ADR-001..006` and `specs/sdd-workflow.md` when their areas are
in scope.

## High-Priority Work

The live board showed open High-priority items, all with blank Complexity:

- Brand safety & staff operability: #714 (promoted via PR #732), #733 (promoted via PR #736), and #737 (merged via PR #738, **closed** 2026-09-12 — see In-Flight Work below, this line was stale as of the 2026-09-14 handoff).
- **Stock and fulfilment: DONE, 2026-09-15** — #401, #402, #748, #749, #750, #751 all **closed →
  Done**, promoted to production via PR #759. (`#613` was never part of this — see Project Position
  above.) #363 and #422 remain genuinely open/unresolved — #402 shipped without either, flagged as
  known-shaky (timezone) and unresolved (multi-site). #400 remains split: the async-loading half
  still open, the per-store half still blocked on #422.
- Saved lists: #116.
- **Paid-order cancellation and reversals: DONE, 2026-09-18** — #696, #137 and #151 all **closed →
  Done**, promoted to production via PR #799 (`specs/2026-09-17-p696-staff-cancel-confirmed-order/`).
  `cancelConfirmedOrder` never touches `Payment`; refunds stay with #606.
- Trust and contact: #406 and #695.
- Data activation: #697.
- Location decision reconciliation: #422.
- Exposed credential rotation: **#219 is CLOSED** (rotated, verified 2026-09-16). Its step 3 — the
  per-environment token split — is now **#783**.

Dependencies and scope boundaries worth preserving:

- #696 made #137 and #151 reachable, now in production (see High-Priority Work above and Checkout).
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

- **`#764` and `#770`/`#771`/`#767` are DONE — see Last Verified/Project Position above.** Both
  promoted to production via PR #775 (`1e44533`, 2026-09-16); `#764`, `#767`, `#770`, `#771`,
  `#772` all closed. `feature/reference-coverage-reconciliation` and
  `docs/document-final-reference-coverage-reconciliation` already deleted, locally and remote.
- **The whole delivery cluster is DONE — see Last Verified/Project Position above.** `#401`, `#402`,
  `#748`, `#749`, `#750`, `#751` all shipped, closed, and are live in production (`d855e1f`,
  2026-09-15). `#613` was never part of it (citation error, corrected above).
- **`#755` and `#756` are both CLOSED** (2026-09-16) — see the resolved section below. The
  credential rotation happened and was verified end to end; this line previously said they remained
  open and unresolved.
- **Issue #737** (Staff/Admin delegation, Category Manager, Help Centre, Zero-review ratings) is
  **CLOSED** (2026-09-12), independently of and before this session's work.
- **PR #736** merged `staging → main` (`0d41faa`), promoting #733 and closing #582, #583, #589, #602, #638, and #683 to `Done`.
- **PR #732** merged `staging → main` (`b505d81`), promoting #714 to `Done`.
- **PR #725 and PR #722 — see Last Verified above.** Both still open, both now `CONFLICTING`, both
  superseded. This line previously said only "not re-verified live"; they have since been verified,
  and the answer is that neither is worth rebasing.
- **Merged and safe to delete** (locally and on the remote), not done by this session: the four
  branches already noted in the 2026-09-14 handoff (`feat/p401-shared-fulfilment-slots`,
  `feat/p613-address-lookup`, `feat/p402-express-sla`, `feat/p10-shared-fulfilment-state`), plus
  this session's own `feat/p10-fulfilment-config-and-checkout-fixes` and
  `fix/staff-nav-fulfilment-orders-adjacent`.

## P10 Delivery-Cluster — Resolved (was "Review Findings", 2026-09-14)

The three defects this section used to describe as live findings on staging are now **fixed and in
production** (`specs/2026-09-14-p10-fulfilment-config-and-checkout-fixes/`): the administrative
surface (`/staff/fulfilment`, `#750`), the CSP-blocked postcode lookup (now server-side, `#749`),
and the vendor logo upload's diagnosability (`#749`) — whose actual root cause turned out to be
`#755` (rejected R2 credentials in all three environments), not CORS or CSP as this section
previously suspected; see the dedicated section below. Kept here only as a pointer, not to
re-derive: read the spec directory above for what shipped and why.

## RESOLVED — was "Live Production Defect: R2 Storage Credentials" (`#755`, closed 2026-09-16)

**Kept as a pointer only. Do not re-derive this as a live defect.** This section described the R2
credential pair being rejected in dev, staging and production simultaneously, breaking every staff
image upload while the storefront looked perfectly healthy. It is fixed — see "The R2 credential
outage is resolved" above for what the fix actually required and why every local check said it had
already worked.

Two things that section recorded are worth keeping, because they outlive the outage:

- **`prisma/seed.ts` was blocked entirely**, even against an already-seeded database, because
  `refreshProductImages` threw before anything after it ran. That is resolved: the seed now
  completes with 26 successful `putObject` calls, which is the rotation proven through real
  application code rather than through a probe script. `#756` verified this and is **closed** — its
  own four criteria were executed, including a re-run proving idempotence and a checkout slot
  picker driven end to end under `npm run preview`.
- **The operational workaround is still in place and is still not seed data.** A full week of
  `VendorFulfilmentSlot` rows and the two canonical `Theme` rows were written **directly** against
  staging's database on 2026-09-15, via repository functions rather than the blocked seed. Staging
  therefore holds fulfilment data that no seed run produced. `#756`'s verification ran against
  **dev**; staging and production were deliberately not re-seeded, since nothing asked for it.
- **The browser-side symptom was a red herring worth remembering**: the upload failed with
  `"The upload could not reach storage: Failed to fetch"`, which reads like CORS. It was not. R2
  omits `Access-Control-Allow-Origin` on its own `403` error body, so the browser could not read the
  response and `fetch()` threw a bare `TypeError`. No CORS change was needed, exactly as predicted.


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

- `package.json` and `prisma/schema.prisma` still contain walking-skeleton descriptions.
  (`CLAUDE.md`'s own copy was corrected — the project is stated as P10 — by `#786`, 2026-09-17.)
- Architecture and tech-stack prose says "Pages/Workers" although the runtime is Workers only.
- `specs/architecture.md` says the storage port has five operations and no delete; the code has six,
  including `getObject` and `deleteObject`.
- `specs/design-system.md` says local `VendorDomain` values must not carry a port; `lib/tenant.ts`
  deliberately supports a port-qualified local fallback. (Relocated verbatim from `CLAUDE.md` by
  `#786`, 2026-09-17 — the discrepancy itself is unchanged, only where it's written down.)
- `deploy-production.yml` still cites the obsolete private-repository paid-plan explanation for no
  approval gate. The current decision is deliberate self-approval avoidance on a public repo.
- `specs/mission.md` still cites ISR although this Prisma/Workers stack cannot use Next ISR.
- **The hardcoded vitest suite baseline this bullet used to track no longer exists anywhere**
  (`#584`, closed by `#786`, 2026-09-17) — it was removed, not relocated, after going stale roughly
  twenty times. `CLAUDE.md` and `docs/developer-portal/local-dev-playbook.md` now document the
  forks-pool trap it existed to catch via a detection procedure instead of a recorded count. If you
  need the current count for some other reason, run `npx vitest run` alone (never beside or
  straight after a heavy build — see the forks-pool trap) and read its own summary line; three
  `it.skipIf(!DATABASE_URL)`-guarded files still report fewer tests in CI than locally, which is
  expected, not a discrepancy.
- The roadmap says the internal KMS site went live behind Access; its deploy workflow says no public
  route is configured. Verify Cloudflare before correcting either statement.
- **`#613` citation error, tracked as `#761`:** `specs/2026-09-13-p613-address-lookup/`, and rows in
  `specs/roadmap.md`, cite the real (unrelated, still-open) issue `#613` for the address-lookup
  feature that actually shipped. See Project Position above and `#761` for the full history and
  what needs correcting. Not fixed here — this handoff and `#761` are the record of it.

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
- ~~`#755` — every staff/admin image upload is broken in all three environments~~ **RESOLVED
  2026-09-16.** Rotated, both Workers redeployed, real uploads confirmed on staging and production.
  `#750`'s R15/R16 and `#756` are all unblocked and `#756` is closed. Kept as a crossed-out line
  rather than deleted because this was the single largest live defect the project has carried.
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
- Whether the **#175** rotation happened outside GitHub issue state. (**#219** is answered: rotated,
  confirmed by the owner, GitHub secret timestamps post-date the exposure. Still unverified is
  whether the OLD token was deleted rather than merely superseded — a dashboard-only fact.)
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
4. List open PRs live (#722 and #725 are both obsolete — see Last Verified; do not reflexively
   re-read them), check #726, run `npm run sdd:audit`, and verify the protected
   checkpoint branch without modifying it. **There is no active DO-NOT-PROMOTE hold as of
   2026-09-15** — the one this handoff carried through 2026-09-14 was lifted when `#750`/`#749`
   shipped and `staging` promoted to `main` via PR #759. Compare `origin/main` with `origin/staging`
   live (step 3) rather than trusting that either state here — a new hold or divergence may exist by
   the time this is read.
5. Query Project #2 with `--limit 600`; filter `Priority == High` and read Status, Phase and
   Complexity. Re-open issue bodies before accepting stale/duplicate findings.
6. Read `docs/research/discovery-log.md` for newer evidence touching the selected scope.
7. Verify health/deployment state and any scope-dependent secret, database or Cloudflare fact live.
8. Report discrepancies and stop at the current stage's approval boundary.

