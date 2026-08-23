# P8.1b — P8.1 Closeout (build notes)

Written at the end of Build, **before** the Clear. Three commits on
`feature/p8.1b-closeout`, after the spec commit `d8d0c6f`:

- `8196b00` — Block A, the facade relocation and its gate.
- `ac364fe` — Blocks B and C, dev/staging hygiene and the guest export.
- (this commit) — build notes, CHANGELOG, persistent docs.

`lint`, `typecheck`, `test` (538 passing, up from 529), `format:check` and `next build` were all
green at the end of Build. **That is not validation** — every live check in `validation.md`
(R12, R13, R17, and the `npm run preview` half of R20–R24) is still outstanding and cannot be run
from the assistant's sandbox; see Known-shaky areas.

## What changed and why

### Block A — facade relocation (#335, closing #252)

Thirteen exports moved out of nine `lib/repositories/*.ts` files into sibling
`lib/<name>-service.ts` modules: `cart`, `categories`, `discounts`, `loyalty`, `orders` (three
factories), `products`, `reviews`, `roles` (two functions), `vendor` (two accessors). Every export
remaining in `lib/repositories/` now takes its client and `vendorId` as explicit arguments and
reads no request context, which is what lets a plain `tsx` script import any of those modules in
real Node — the property the whole rule exists to protect, and the one this build actually used
twice (see Block C).

**The facades were not all thin delegation, and that shaped the work.** `getCartRepository`,
`getProductRepository`, `getReviewRepository`, `getLoyaltyRepository().ledger()` and seven of
`getOrderRepository`'s ten methods contained real query bodies inside the closure. Moving those
wholesale would have relocated query logic out of `lib/repositories/`, which is precisely where
ADR-004 puts the tenant boundary and where `tests/repository-vendor-scoping.test.ts` looks for it.
So each inline query was first extracted into a pure module-level function taking `prisma` and
`vendorId`, leaving a facade that is pure delegation — and only then moved. The net effect is that
**more** code is now under the vendor-scoping check than before, not less.

`tests/repository-purity.test.ts` is the actual deliverable. It is an import-level, whole-file AST
check: no file in `lib/repositories/*.ts` may contain a **value** import of `next/headers`,
`@/lib/tenant`, `@/lib/auth` or `@/lib/auth-rbac`. Type-only imports stay legal, since
`import type { getPrisma } from "@/lib/db"` is the documented compliant pattern. It carries **no
allowlist**, deliberately — the reasoning is in its own docstring and is the main thing a future
reader needs.

Why import-level rather than per-function: a facade can reach request context through any number of
indirections, so a function-level check would have to chase them; and a call-site grep is worse
still, because these files legitimately *name* `getCurrentVendorId()` in prose explaining why it is
absent — the P4a "grep rewards deleting the rationale" trap, which `specs/sdd-workflow.md` records
three prior instances of. An import either exists or it does not.

### Block B — dev/staging hygiene (#336)

- **#273** — `scripts/remove-fixture-redemptions.ts`, plus `lib/db-target-guard.ts` and
  `tests/db-target-guard.test.ts`. The script was **run against the dev branch during Build**: it
  found exactly the two rows the issue describes, reported their orders before deleting, and left
  `seq >= 888888` at zero. The two affected orders (`AHE-20260811-XCVTT3`, `AHE-20260810-UQG827`)
  now read `discountPence=0` with `discountUse=null`.
- **#276** — `prisma/seed.ts` gains a `console.warn` on the one previously silent path
  (`SEED_AHEED_HOST` set, `SEED_SRIMART_HOST` unset). The other two paths are untouched.
- **#277 / #235** — `.env.example` and `docs/developer-portal/env-setup.md` now carry an explicit
  three-row table pairing each bucket with its CDN host, and state that the dev host is the only
  one without a hotlink rule. `.env` and `.dev.vars` were already correct: **the human edited them
  directly during the Spec stage**, so no commit in this slice contains that change (recorded in
  `plan.md`'s Open items, and R10 is written to check file contents rather than the diff).

### Block C — guest data export (#337, closing #253)

`exportGuestOrderData(prisma, vendorId, orderNumber, email)` in
`lib/repositories/data-rights.ts`, sitting beside `eraseGuestOrderData` and verifying the same
credential pair the same way — all four terms inside the `WHERE`, `userId: null` included, so an
account-holder's order is unreachable through this door however its number is guessed, and a wrong
email returns `null` indistinguishably from a nonexistent order.

`getGuestDataRightsService()` gains `exportGuestOrder`; no new service file.
`app/(storefront)/orders/lookup/export/route.ts` serves it with `Content-Disposition: attachment`
and `Cache-Control: no-store`, modelled on the account export route. `/orders/lookup` gains a plain
`<a download>` link — no client JS, since the response carries the disposition header itself.

## Decisions taken during the build

- **`GuestOrderExport` is a narrower type than `PersonalDataExport`, not a reuse of it.** The spec
  said "reuse P7b's shape rather than invent a second export format," and the shared blocks (order,
  address) are field-for-field identical. But `PersonalDataExport` is built around an `identity`
  (a `User` row), `linkedAccounts` and `sessions`, and a guest has none of those. Emitting them as
  empty arrays would assert "we hold nothing of this kind about you" when the truth is that the
  question does not apply. Rejected: reusing the wide type with nulled sections.
- **The export document states its own scope.** A `scope` string names the household-mailbox limit
  in the file itself, rather than leaving a recipient to assume a one-order export is everything
  held about them. This is the difference between an export that is honest and one that is merely
  accurate.
- **The `#273` guard is a pure, unit-tested module rather than an inline check.** `validation.md`'s
  first draft (written by me at Spec) asked a validator to point the deletion script at staging to
  watch it refuse. That is a demonstration which *deletes staging rows if the guard is broken* —
  precisely the outcome it exists to prevent. Rewritten before any code was written: the refusal is
  established by `tests/db-target-guard.test.ts`, and no requirement asks anyone to aim the script
  at a non-dev database. R14a was added to the spec for this.
- **The guard compares Neon endpoints with the `-pooler` suffix normalised away.** A guard holding
  only `secrets/production.vars`'s `DIRECT_URL` would wave through the pooled URL for the same
  database. It also fails closed on a missing or unparseable target, and checks all four URLs
  (direct and pooled, staging and production).
- **`lib/cart-service.ts` calls `getPrismaWs()` at each write's call site, not once per factory.**
  Constructing it up front would open a WebSocket on every read-only request that merely resolves a
  cart repository, against CLAUDE.md's 50-socket ceiling. This matches `lib/data-rights-service.ts`.
- **`roles.ts`'s authorization check moved to the service, and the actor is passed to the
  repository as data** (`RoleActor { id, via }`). Leaving `requireVendorRole` in the repository
  would have defeated the entire point; passing the actor as data is what makes the hierarchy rules
  (who may grant ADMIN, who may modify a platform admin, the last-admin self-demotion guard)
  exercisable without a live Workers request. `tests/roles.test.ts` needed only its import path
  changed, which is itself evidence the split preserved behaviour.
- **`lib/repositories/cart.ts`, `reviews.ts` and `roles.ts` had their `@/lib/db` imports converted
  to `import type`.** They no longer construct clients, and a value import of
  `@prisma/client/wasm` is unloadable from plain Node — the same reason `promotions.ts` and
  `data-rights.ts` already do this.
- **Naming follows the repository file, not the domain noun**: `lib/categories-service.ts` (not
  `category-service.ts`), matching `lib/promotions-service.ts` ← `lib/repositories/promotions.ts`.
  `lib/discounts-service.ts` and `lib/loyalty-service.ts` sit beside the pre-existing pure
  `lib/discounts.ts` and `lib/loyalty.ts`; the `-service` suffix is what distinguishes them, and
  both new files say so in their docstrings.

## Deviations from the spec

- **R2/R4 say "thirteen names"; the requirement text as first written said "fourteen".** Corrected
  in the spec commit itself after a recount during the adversarial pass, before any code. Not a
  deviation in the artifact — recorded here because a validator counting the table in `plan.md`
  will get thirteen and should not treat that as a discrepancy.
- **`tests/repository-vendor-scoping.test.ts` gained two allowlist entries that R6 does not
  mention.** R6 only requires the eight stale facade entries to go and the four genuine exceptions
  to remain. Extracting `reviews.ts`'s writes into named functions made
  `upsertReview`/`deleteReview` newly *visible* to that test — they query vendor-scoped models
  without taking a `vendorId`, deriving it from the Product row inside the transaction instead.
  This is the unchanged body of the old `getReviewRepository().upsert()`/`.delete()`, which the
  test could not see while it sat inside an allowlisted facade. Two entries were added with that
  full reasoning rather than changing the behaviour, because R9 guarantees this slice changes none.
  **See Known-shaky areas — there is a real question underneath this, and it is now tracked.**
- **Nothing else.** No requirement was skipped, narrowed, or reinterpreted.

## Known-shaky areas

- **Every live check is outstanding.** R12 (CDN 200 with a localhost referer), R13 (images under
  `npm run preview`), R17 (staging edge-cache measurement) and the `npm run preview` half of
  R20–R24 were **not run**. Outbound DNS is blocked in the assistant's sandbox — the known-good
  staging host fails identically to the new dev host — so a failed probe from that environment is
  evidence of nothing, and none was treated as evidence. These are the first thing validation
  should do, from a real shell.
- **`reviews.ts`'s writes do not scope the product lookup to the current vendor.** `upsertReview`
  resolves `vendorId` from whatever `Product` the given `productId` names, so a caller passing an
  untrusted id from another vendor would write a review scoped to *that* vendor's product. This is
  **pre-existing and unchanged** — it is why the two new allowlist entries exist — but it was
  invisible before this slice and is worth a deliberate look. **Tracked as #340** rather than fixed
  inside a no-behaviour-change refactor; it needs a `/propose`, since the fix is a judgment call
  about whether the review form's product id should be re-scoped or the function should take
  `vendorId` and refuse a mismatch. The issue lays out the three options.
- **Block A is 68 files of mechanical change and the risk is a missed call site, not a bad
  algorithm.** `tsc --noEmit` is the real guard here — a stale import of a moved export does not
  resolve — and it is clean, as is `next build`. But `getCurrentVendorProfile` in particular is
  imported by eleven files including `app/layout.tsx`, `app/manifest.ts` and `components/layout/Header.tsx`;
  if a page renders without vendor branding, that import is where to look first.
- **`lib/vendor-service.ts` keeps `getCurrentVendorProfile`'s React `cache()` wrapper at its new
  address.** Per-request memoisation across layout/header/page/metadata depends on all four
  importing the *same* module instance. Nothing in the test suite covers that, and a regression
  would show up as extra identical queries per request rather than as a wrong page — invisible
  without looking.
- **The `#273` deletion has already happened against the dev branch.** Re-running the script is
  safe and idempotent (it reports "No fixture redemptions found"), but a validator checking R15 by
  running it will not see the rows being removed — only the zero count afterwards. The evidence
  that they existed and what they were attached to is in this file and in `ac364fe`'s message.
- **`prisma/seed.ts`'s new warning has not been observed firing.** It is a three-line `console.warn`
  on a branch reachable only by running the seed with one of two env vars set, which needs a real
  seeding run against a database.
