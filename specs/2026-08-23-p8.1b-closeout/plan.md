---
id: p8-1b-closeout-plan
title: "P8.1b — P8.1 Closeout (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-23
visibility: internal
summary: The remaining three P8.1 slices delivered as one — relocating every request-scoped facade out of lib/repositories behind a real location gate, dev/staging environment hygiene, and the guest machine-readable data export.
tags: [p8, repositories, gdpr, dev-environment, refactor]
---

# P8.1b — P8.1 Closeout (plan)

**Goal:** close the rest of P8.1 in one slice — issues **#335**, **#336** and **#337**, and through
them **#252**, **#269**, **#273**, **#276**, **#277**, **#235** and **#253**. After this, P8.1's
"Core Debt & Compliance" bucket is empty and P8.2 (launch & operations) is the only thing between
the repo and go-live.

## Why one slice, and what that costs

The three were specced as separate slices because P7.5 established that a slice should be small
enough to survive its own `/validate`. Combining them was a deliberate call by the human at Propose.
The cost is real and is named here rather than discovered at Validate: this slice contains a
mechanical refactor touching roughly 67 call-site files, a live edge-cache measurement, a
destructive write against a live database, and a new route serving personal data. Those are four
different kinds of risk with four different kinds of evidence.

The mitigation is structural, not optimistic: `requirements.md` and `validation.md` are split into
**three clearly separated blocks (A, B, C)** matching the three original slices, in the same order,
with no requirement in one block depending on another block's outcome. A fresh-context validator can
work block by block and stop cleanly at a failure without losing the blocks already proven. The
parts genuinely do not share code — the only file touched by more than one block is `CHANGELOG.md`.

## Part A — Repository facade relocation (#335, closing #252)

**The rule.** `CLAUDE.md`'s repository-layer section requires that every function exported from
`lib/repositories/<name>.ts` take its Prisma client and `vendorId`/`userId` as explicit parameters
and read no request context, so a plain `tsx` script can import the module in real Node and exercise
it against a real database with no live Workers request. A facade that resolves a live client and
the current vendor from request context must live in a sibling `lib/<name>-service.ts`.

**What is actually non-compliant.** A complete sweep of `lib/repositories/*.ts` for value imports of
`next/headers`, `@/lib/tenant`, `@/lib/auth` and `@/lib/auth-rbac` returns **exactly nine files**:

| File | What moves | New home |
|---|---|---|
| `cart.ts` | `getCartRepository` | `lib/cart-service.ts` |
| `categories.ts` | `getCategoryRepository` | `lib/categories-service.ts` |
| `discounts.ts` | `getDiscountRepository` | `lib/discounts-service.ts` |
| `loyalty.ts` | `getLoyaltyRepository` | `lib/loyalty-service.ts` |
| `orders.ts` | `getOrderRepository`, `getWebhookOrderService`, `getGuestOrderLookupService` | `lib/orders-service.ts` |
| `products.ts` | `getProductRepository` | `lib/products-service.ts` |
| `reviews.ts` | `getReviewRepository` | `lib/reviews-service.ts` |
| `roles.ts` | `getVendorTeam`, `setVendorRole` — a **split**, not a move | `lib/roles-service.ts` |
| `vendor.ts` | `getCurrentVendorProfile`, `getCurrentVendorSenderName` | `lib/vendor-service.ts` |

The remaining six files — `customers.ts`, `data-rights.ts`, `order-lookup-rate-limit.ts`,
`prisma-errors.ts`, `promotions.ts`, `reports.ts` — are already clean and are not touched.

**Two corrections to the tracked scope, both found at this slice's Orient.**

1. **`roles.ts` was never on the list, and it is the hardest case.** Its only two exports,
   `getVendorTeam` and `setVendorRole`, each call `getCurrentVendorId()` directly, and
   `setVendorRole` also calls `requireVendorRole("ADMIN")`. They are not factories wrapping pure
   functions — the file contains no pure functions at all — so this is a pure/facade **split to
   write**, not a relocation. `roles.ts` keeps `listVendorTeam(prisma, vendorId)` and
   `applyVendorRole(prisma, vendorId, actor, targetEmail, newRole)` taking everything explicitly;
   `lib/roles-service.ts` resolves the vendor, performs the `requireVendorRole` check and calls
   them. The authorization check moves to the service deliberately: it reads a session, which is
   request context by definition, and leaving it in the repository would defeat the whole property.

2. **`vendor.ts` is in scope, which is a change from what Propose said.** Propose proposed leaving
   `getCurrentVendorProfile` and `getCurrentVendorSenderName` alone as vendor-profile accessors
   rather than repository facades, and noting them. That was wrong on the thing that matters: with
   them left in place the location gate below needs a two-entry allowlist, and a gate with an
   allowlist is the exact shape of control this repo has already watched get rubber-stamped
   (`tests/repository-vendor-scoping.test.ts`'s own docstring says so about a 38-entry version of
   itself). Moving them makes the rule **zero-exception** and therefore mechanically checkable.
   `fetchVendorProfile(vendorId)` and the rest of `vendor.ts` stay put; only the two
   context-reading wrappers move, and `getCurrentVendorProfile` keeps its `cache()` wrapper at its
   new address.

**The gate, which is the actual deliverable.** `CLAUDE.md` currently claims
`tests/repository-vendor-scoping.test.ts` "allowlists all nine by name with their reasons, so the
list cannot quietly grow." Both halves are false, and this was verified by reading the test rather
than trusting the sentence:

- That test detects an exported function that **directly** issues a Prisma call against a
  vendor-scoped model without taking a `vendorId` parameter. That is a vendor-_scoping_ check. It
  has nothing to say about where a facade _lives_.
- Its allowlist holds six of the nine facades plus `roles.ts`'s two functions, and is blind to
  `getDiscountRepository`, `getWebhookOrderService` and `getGuestOrderLookupService` — three facades
  that exist today and are invisible to it precisely because they delegate to pure functions instead
  of inlining queries. A tenth facade written the same way would also be invisible.

So the safety net named in the rule does not exist, which is why #252 is on its third round. This
slice adds `tests/repository-purity.test.ts`: no file in `lib/repositories/*.ts` may contain a
**value** import of `next/headers`, `@/lib/tenant`, `@/lib/auth` or `@/lib/auth-rbac`. Type-only
imports stay legal — `promotions.ts` and `data-rights.ts` already rely on
`import type { getPrisma }` and that is the documented compliant pattern. The check is whole-file
and import-level, so delegation cannot evade it, and it needs no allowlist once the nine are moved.

**Documentation corrected in the same slice**, because a rule that misdescribes its own enforcement
is how this issue survived twice: `CLAUDE.md`'s repository-layer section, and
`lib/repositories/promotions.ts`'s docstring, which likewise tells a reader that
`tests/repository-vendor-scoping.test.ts` "is what enforces it". The eight now-stale facade entries
come out of that test's `ALLOWED` map; its genuine exceptions (`data-rights.ts`'s two cross-vendor
functions, `orders.ts`'s webhook reads) stay exactly as they are.

## Part B — Dev and staging environment hygiene (#336)

None of these change production behaviour. All of them decide whether a local `npm run preview` or
the dev Neon branch can be trusted as evidence — which is what every future slice's `/validate`
depends on.

- **#277 + #235 — the dev image path.** `.env` and `.dev.vars` pair `S3_BUCKET="aheed-images-dev"`
  with `CDN_BASE_URL="https://images.staging.aheedfoodcentre.nocaped.com"`, so anything written
  locally lands in a bucket the configured CDN host does not serve, and every image request under
  `npm run preview` additionally fails the CDN's hotlink/referer rule. The human has provisioned a
  dev-tier CDN hostname bound to `aheed-images-dev` with no hotlink rule (see **Open items** — the
  literal hostname is an input to Build, not something this spec may invent). Both files, plus
  `.env.example` and `docs/env-setup.md`, move to it. The requirement is written behaviourally — a
  real GET with a localhost `Referer` returns 200 — so it proves the pairing works rather than that
  a string was edited.
- **#273 — two fixture rows that bypassed `placeOrder`.** The dev Neon branch carries
  `DiscountRedemption` rows with `seq` 888888 and 999999, hand-inserted rather than written by
  `placeOrder`, which render a spurious discount line on orders that should show none. Removed by a
  checked-in script under `scripts/` run with `DIRECT_URL`, not by an ad-hoc statement — so the
  action is reviewable and repeatable. **This is a destructive write against a live database**, and
  the pre-flight check `CLAUDE.md` mandates has already been run at this slice's Orient: `.env` and
  `.dev.vars` both resolve to `ep-sparkling-paper-za3j7xza`, which is neither
  `secrets/staging.vars`' host nor `secrets/production.vars`' host. The script re-asserts that at
  runtime and refuses to run against either, because a check performed once in a session that a
  later reader cannot see is not a control.
- **#276 — the seed's silent half-run.** `prisma/seed.ts` seeds SriMart only when both
  `SEED_AHEED_HOST` and `SEED_SRIMART_HOST` are set. Two of the three unhappy paths already log;
  the third — `SEED_AHEED_HOST` set, `SEED_SRIMART_HOST` unset — is silent, which is the one that
  matters, because it produces a database that looks correctly seeded and is missing the second
  vendor every multi-tenant check depends on. It gains a warning naming SriMart explicitly.
- **#269 — P7.5a's R8, verified for real.** `next.config.mjs` emits
  `Cache-Control: private, no-store, must-revalidate` for `/staff/:path*`. P7.5a proved the header
  is present; it never proved the Cloudflare edge honours it. Verified here against **staging**, by
  fetching a `/staff/*` URL twice and reading `cf-cache-status` — the same method that measured the
  original defect. This is a measurement, not a code change, and if it fails it becomes its own
  issue rather than being fixed inside this slice.

## Part C — Guest machine-readable data export (#337, closing #253)

Guest shoppers gained erasure (UK GDPR Art. 17) in the P7 closeout via `eraseGuestOrderData`, but
have no export (Art. 15). `/orders/lookup` already renders the whole order in human-readable form
once the order-number/email pair is proven, so this is a **format gap, not an unmet right** — which
is why it is a small slice and not a compliance project.

It reuses P7b's shape rather than inventing a second export format: a new pure
`exportGuestOrderData(prisma, vendorId, orderNumber, email)` in `lib/repositories/data-rights.ts`
beside `eraseGuestOrderData`, verifying the same credential pair at the query level in the same way;
a method on `lib/data-rights-service.ts`'s existing `GuestDataRightsService`; and a route handler at
`app/(storefront)/orders/lookup/export/route.ts` modelled on the account export route, including its
`Content-Disposition: attachment` and `Cache-Control: no-store`. The lookup page gains a download
link beside the existing `GuestEraseForm`.

Two limits are inherited deliberately rather than re-litigated: the **household-mailbox scope**
(`specs/2026-08-19-p7-closeout/plan.md` Part C decision 2) — an export covers the one order proven
by the credential pair, not every order sharing that email — and `checkOrderLookupRateLimit`, which
already guards the lookup page and must guard this route too, since an export endpoint is a strictly
more attractive enumeration target than the page it sits behind.

## Deliberately excluded

- **`getCartRepository`-style facades for the six already-clean repository files.** Nothing to move.
- **Any behaviour change in Part A.** It is a relocation and one split; every function keeps its
  signature and its callers keep their semantics. A behaviour change hiding inside a 67-file diff is
  exactly what makes a refactor unreviewable.
- **Row-level security.** `specs/2026-08-19-p7-closeout/rls-experiment.md` establishes it is not
  reachable on this stack; `tests/repository-vendor-scoping.test.ts` remains the compensating
  control and this slice leaves its real exceptions untouched.
- **Broadening the guest export past one order.** Anything wider needs a stronger proof of identity
  than an order number and an email, which is a different decision and not this slice's to make.
- **Fixing whatever #269's measurement finds.** If the edge does not honour the header, that is a
  new issue with its own Propose — folding an unknown-size fix into this slice would break the
  block independence the whole combination rests on.
- **`.env` cosmetic cleanup.** `CDN_BASE_URL` and several neighbours are written with spaces after
  `=`, against `CLAUDE.md`'s `.env` format rule. `CDN_BASE_URL`'s own line is rewritten by Part B
  anyway and lands compliant; sweeping the rest of the file is unrelated churn in a slice that is
  already large.

## Open items carried forward

- **The dev CDN hostname is supplied and already half-applied.** It is
  `images.dev.aheedfoodcentre.nocaped.com`, provisioned by the human and bound to
  `aheed-images-dev`. During this Spec stage the human wrote it into `.env` and `.dev.vars`
  directly, so those two files are already correct in the working tree; `.env.example` and
  `docs/env-setup.md` still name the staging host and remain Build's work. **This means R10 is
  satisfied by an edit no commit of this slice made** — Build must not assume it authored it, and
  Validate should check the file contents rather than the slice's own diff.
- **The live CDN check cannot run from the assistant's sandbox.** Outbound DNS is blocked there —
  the known-good staging host fails identically to the new one, so a failed probe from that
  environment is evidence of nothing. R12 and R13 must be run from the human's own shell or under
  `npm run preview`, and a `000`/DNS-timeout result must never be reported as a CDN failure.
- **P8.1a is merged to staging and not yet in production.** Promotion was deliberately deferred so
  all of P8.1 promotes as one `staging → main` PR after this slice. Recorded here so the pending
  promotion is not mistaken for an oversight at the next Orient.
- **#252's wording lesson outlives the issue.** Two earlier attempts failed because the rule pointed
  at a non-compliant example and claimed an enforcement that did not exist. If Part A's gate is ever
  weakened, that is the failure mode to expect a third time.
