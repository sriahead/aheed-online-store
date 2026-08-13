# Changelog

All notable changes to the Aheed Online Store are recorded here. Format based on
[Keep a Changelog](https://keepachangelog.com/). Per SDD Gate 4, this file is updated **before**
every branch merges.

## [Unreleased]

### Fixed
- **Cloudflare Worker CPU Execution Limit**: Set `[limits] cpu_ms = 50` in `wrangler.toml` to prevent Error 1102 ("Worker exceeded resource limits") during Next.js RSC cold starts on category pages.
- **Transactional Email Strategy (GAP-005)**: Flagged migration to native Cloudflare Email Sending (outbound) and Email Routing (inbound) under Workers Paid ($5/mo) for Phase 8, replacing Resend and expanding CPU execution headroom.

### Added
- **P6.6 — P0 Core Shopping UI Overhaul** (`specs/2026-08-13-p6.6-p0-ui-overhaul/`):
  Full UI redesign mapping to the `docs/ui-ref` prototype while maintaining the `VendorConfig` multi-tenancy constraints.
  - **Header & Cart Drawer**: Added delivery promise strip, global search UI, dynamic brand logo rendering, and a styled cart drawer button displaying the total price.
  - **Hero & Trust Strip**: New storefront landing page (`page.tsx`) with a dynamic gradient Hero banner, real postcode checking, and Trust Values row.
  - **Product Discovery**: Converted static placeholder text into live, data-driven "New Arrivals" and "Featured Halal Deals" merchandising rows.
  - **Product Card Flow**: Overhauled visual card styling (badges, discount display, layout) and added an inline quantity selector directly into `AddToCartButton` to satisfy the requested Image → Title → Pack Size → Price → Offer → Qty Selector → Add to Cart UX flow without introducing complex client state.
- **P7a — UK compliance, operational gap closure, and UX hardening** (`specs/2026-08-13-p7a-compliance-hardening/`):
  Delivers UK GDPR/PECR compliance, OWASP edge security headers, guest order tracking, slide-over cart drawer, staff bulk order transitions, and one-click reordering.
  - **UK GDPR & PECR Cookie Consent**: `CookieBanner.tsx` component managing essential/optional cookies with host-scoped `aheed_cookie_consent` cookie. Legal Terms of Service (`/terms`) and Privacy Policy (`/privacy`) pages.
  - **OWASP Security Headers**: Injection of HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-XSS-Protection` in `next.config.mjs`.
  - **Guest Order Lookup**: `/orders/lookup` page allowing unauthenticated guest shoppers to track orders via Order Number + Email.
  - **Slide-Over Cart Drawer**: `components/cart/CartDrawer.tsx` matching `docs/ui-ref` design mockup visual look and feel.
  - **One-Click Reorder**: Reorder items Server Action on `/account/orders/[orderNumber]` page.
- **P6b2 — product image upload via presigned PUT** (#167,
  `specs/2026-08-12-p6b2-image-upload/`): P6's last slice, and the first time an admin can put a
  real photograph on a product. P6b1 made every *field* editable and left images read-only, so the
  only way to change one was a developer re-running `prisma/seed.ts`. Three capabilities the
  project has never had land together: the **first write through `lib/storage`** at runtime, the
  **first request the Worker has ever signed**, and the **first browser-direct upload**. The Worker
  signs a short-lived `PUT` (`presignPut`, SigV4 query signing via aws4fetch — still plain S3, no
  R2 feature) and the browser uploads **straight to storage**, so no image byte transits the Worker
  and its request-size and CPU limits are not in the upload path. **Keys are immutable —
  `products/{productId}/{uuid}.webp`** — so replacing an image writes a *new* object and repoints
  the row rather than overwriting: that keeps a Cloudflare cache purge out of the design entirely,
  which would otherwise have meant a purge-scoped API token as a new Worker secret and a
  provider-specific call inside a deliberately vendor-agnostic port. Keying on the product id
  rather than the slug survives the slug edits P6b1 made possible. **The server never accepts a
  key**: `requestImageUpload` takes a product id and a byte length and nothing else, because a
  signature proves *who is asking*, never *what they may ask for* — a client-named key would let
  one vendor's admin obtain a valid signature for a PUT over another vendor's object. **The row is
  written only after the object is verified**: `attachProductImage` re-runs the ADMIN check and the
  vendor-scoped product lookup, re-checks the key shape against that product, then issues a
  server-side `headObject` (must exist, be `image/webp`, be within 2 MiB) before anything changes,
  since a presigned PUT cannot police a body it never sees. Bytes are written before the row
  deliberately — the reverse order risks a row pointing at an object that was never uploaded, a
  visibly broken product page, where this order risks orphaned bytes, which are invisible. The
  browser converts to **WebP on a canvas** (1200px longest edge, quality 0.82, EXIF orientation
  honoured) because the Worker never sees the bytes and so cannot; the `.webp` convention now holds
  literally rather than by hope. **No schema change, no migration** — `ProductImage` has carried
  `storageKey`/`alt`/`sortOrder`/`isPrimary` since P2. Scope is the **primary image only**:
  add/remove/reorder is #173, and **nothing is ever deleted**, so superseded objects accumulate by
  design (#174). Corrects four docs that all gave the example key as `products/{sku}/main.webp` —
  `Product` has no `sku` field and never has, and the seed actually writes
  `products/{slug}/main.svg`; ADR-003 gains an additive implementation note recording the port's
  real methods, the aws4fetch-vs-AWS-SDK substitution and the immutability rule, reopening no
  decision. Staging bucket CORS applied and verified during the slice; **production CORS is
  deliberately deferred to the promotion**.
- **P6b1 — catalogue management: product, category & inventory writes** (#159,
  `specs/2026-08-12-p6b1-catalogue-writes/`): the first admin **write** path to the catalogue.
  `lib/repositories/products.ts` and `categories.ts` were read-only — every exported method a query
  — so products, categories and inventory existed only because `prisma/seed.ts` created them, and
  the owner could not add a product, correct a price or mark something out of stock without a
  developer and a re-seed. Product and category **create + edit** plus inventory editing now live
  inside P6a's `(admin)` panel at `/staff/products` and `/staff/categories`, ADMIN-only, matching
  `/staff/loyalty` and `/staff/discounts`. **No schema change and no migration** — every field
  written already existed; what was missing was never the columns. Admin routes key on **`id`, not
  `slug`**, because this slice makes a slug editable for the first time and an admin URL that
  changes when you rename the thing it points at breaks every bookmark. **Admin reads are separate
  functions, not a flag on the storefront's** — every storefront read filters `isActive: true`,
  which is right there and fatal here, since the owner's first need after hiding a product is to
  find it again; an `includeInactive` boolean in the storefront hot path would leak hidden products
  to shoppers on one wrong call. **`categoryId` is untrusted**: `Product.categoryId`'s foreign key
  carries no vendor, so a write resolves the category *scoped to the acting vendor* and refuses
  otherwise — the same defence P3d used for its review-form product ids. Every field rule is pure
  and DB-free in `lib/catalogue-form.ts` (28 unit tests), including slug derivation from the name
  and the rule that a "was" price must be strictly above the price it advertises a saving against.
  **Nothing is deletable** — `isActive` is the only removal, for both models: `Product` is
  referenced by `OrderItem`, `CartItem` and `Review`, so a hard delete would either fail on the
  foreign key or destroy order history (same posture P5b took for discount codes). **Deactivating a
  category with active products or sub-categories is refused, naming the blockers**, rather than
  cascading — one click quietly rewriting rows the owner never saw is the wrong default with no
  undo. **A category's parent must itself be top-level**, capping the tree at the two levels the
  storefront can actually render and making a cycle unrepresentable; recorded in
  `specs/architecture.md` (1.12.0) beside the model, since the schema's self-relation is unbounded.
  Creating a product creates its `Inventory` row in the same transaction, and updates upsert it, so
  "out of stock" and "never given stock" stop being indistinguishable. `isUniqueViolation` extracted
  to `lib/repositories/prisma-errors.ts` and shared with `discounts.ts` — slug collisions become a
  routine human error once a person types slugs. Product image upload is deliberately **not** here:
  it is #167 (P6b2), the only part of P6b that is new infrastructure and the only part blocked on
  owner-provisioned bucket CORS and Worker `S3_*` secrets; the form shows existing images read-only
  and `lib/storage.ts` is untouched. Also deferred with issues filed: a STAFF-visible stock-only
  surface (**#168**) and search on the admin product list (**#169**).
- **P6a — admin panel shell & order dashboard** (#158, `specs/2026-08-12-p6a-admin-shell-orders/`):
  the first P6 slice. Before this, `/staff/orders`, `/staff/loyalty` and `/staff/discounts` were
  three orphan pages with no index, no navigation between them, and the *shopper's* header rendered
  above each — reachable only by typing the URL. A new **`app/(admin)/` route group** with its own
  layout makes them one navigable panel; route groups are URL-invisible, so **every path is
  unchanged**. The new layout re-carries the two things the storefront layout had been silently
  providing: the **ADR-004 slice 3b tenant gate** (`getCurrentVendorId()` *throws* on an
  unresolvable host, so a layout without the `/coming-soon` redirect turns an unknown host into a
  500 — `specs/architecture.md` now records the gate as a per-layout obligation, not a property of
  one file) and the **slice 4 brand tokens**, extracted to `lib/vendor-theme.ts` so two layouts
  cannot drift apart on the same palette. The layout's role lookup drives **navigation only** — a
  layout is not an authorization boundary in the App Router, so every page still calls
  `requireVendorRole` with its own roles and every action re-checks independently. Adds a `/staff`
  landing page. **The order dashboard supersedes P4b's deliberate stopgap** (#129): with no query
  string it is still *exactly* P4b's actionable queue — the packing floor's default does not move —
  while `?status=` (including `?status=all`) and `?q=` reach the rest, so a delivered order from
  last week is findable at all. An absent **or unrecognised** status both fall back to the queue
  rather than widening it, and the pagination link carries the **normalised** value, never the raw
  input, so a typo cannot propagate through paging; all of it lives in a pure, DB-free
  `lib/staff-orders-query.ts`. Search spans order number, guest email and a member's email.
  **A per-order detail view at `/staff/orders/{orderNumber}`** — the first staff have ever had —
  served by `getForStaff()`, a **third** order read beside `getByOrderNumber` (P3b's capability-URL
  rule) and `getForUser` (P4a's owner-only rule) and deliberately neither: vendor-scoped, *not*
  owner-scoped, so a guest order with no owner is visible to the staff who must pack it while
  another vendor's number resolves to nothing. It is the **first reader of
  `OrderStatusEvent.createdByUserId`**, which P4b shipped with nothing able to display it.
  **P4a's no-note guarantee is preserved structurally rather than by filtering**: `buildTimeline`
  and `StatusEventInput` still have no `note` field at all, and the staff view gets its own builder,
  its own entry type and its own repository select — so a note reaching a shopper's order page would
  require changing three things, not forgetting one. Unlike the customer timeline it does **not**
  collapse consecutive identical statuses, because for staff that repeat is the diagnostic
  information. `STAFF_QUEUE_STATUSES` moved to `lib/order-status.ts` (it was always a status rule,
  not a data-access concern) so the pure parser can reach it without importing a repository.
  **No schema change and no migration** — `Order`'s `@@index([vendorId, status, createdAt])` from
  P3b already serves every list here. Deliberately excluded and tracked: catalogue management
  (#159, P6b), bulk order actions (#162), and search indexing for real volume (#163); staff
  cancellation and refunds remain ADR-005 territory. `docs/repo-structure.md`'s app-tree sketch,
  which showed an `(admin)/admin/` group that was never built, corrected to the `(admin)/staff/`
  group that now exists.
- **P5b — discount codes: engine, checkout application & staff admin** (#145,
  `specs/2026-08-11-p5b-discount-codes/`): P5's second slice and the discounts half of the phase.
  Per-vendor `PERCENTAGE`/`FIXED_AMOUNT` codes with a validity window, minimum spend, a global usage
  cap and a per-customer cap; entered at checkout, created and deactivated at `/staff/discounts` by
  a vendor ADMIN. **P5a's generic `Order.discountPence` paid off exactly as designed**: `computeTotals`
  already took a discount parameter, so `lib/payments.ts`, `/api/webhooks/stripe` and `Order` itself
  are untouched, no ADR-005 decision is reopened, and `eligibleSpendPence` already excluded the whole
  discount from earning — so a code-discounted order earns fewer points with **no new code**, and
  codes cannot become a points-farming loophole. **Codes and points stack, code first**: the code is
  evaluated against the pre-discount subtotal (a percentage must not shrink because points were also
  spent) and `clampRedemption` gained an optional `existingDiscountPence` (default `0`, so every P5a
  case passes unmodified) so points fill only the remaining headroom above the 30p payment floor.
  **The usage counter counts DOWN** — `remainingRedemptions`, nullable for unlimited — because
  `usedCount < maxRedemptions` is a column-to-column comparison Prisma cannot express in a `where`
  and raw SQL is forbidden in application code; counting down restores the literal-to-column guard
  `Inventory.quantity` (P3b) and `balancePoints` (P5a) already use, and `NULL` arithmetic keeps an
  unlimited code unlimited with no branch. **The per-customer cap is structural, not a
  count-then-write race**: `DiscountRedemption.seq` under `@@unique([codeId, userId, seq])` means two
  concurrent claims by one shopper both compute `seq 0` and the database refuses the second. **An
  abandoned checkout gives the use back** — `releaseOrder` releases the code beside the points
  reversal, or a 100-use launch code would die without a single paid order; that release **deletes**
  the redemption row rather than writing a reversal, deliberately unlike the loyalty ledger, because
  nothing financial happened and deleting frees the shopper's `seq` slot. **An unusable code fails
  the checkout with its reason**, the opposite of P5a's treatment of an unparseable points value:
  silently charging full price for an order the shopper believes is discounted is the worse failure.
  One additive migration (two tables, one enum); no column added to `Order`. Deliberately excluded
  and tracked: category-scoped codes (#146), auto-applied promotions (#147), multiple codes per
  order (#148), first-order-only eligibility (#149), naming the applied code on order pages and in
  the email (#150), and code-use reversal on refund (#151, unreachable today for the same structural
  reason as #137). P5 does **not** close on this slice's promotion — **#143** must be resolved first,
  since P5a is live in production but dark.

### Fixed
- **P6a closeout docs.** `specs/roadmap.md` (1.18.0) gains P6a's slice row and its promotion row,
  written from what live validation actually proved: **every one of build-notes' "known-shaky"
  areas came back clean**, most notably the search `where`'s `user.email` relation-filter leg
  (17 real matches through the relation, not the scalar legs) and `mode: "insensitive"` both proven
  against the real Neon driver adapter for the first time, and the advance-status Server Action
  driven end-to-end through a genuine rendered `multipart/form-data` form. No defect found in the
  artifact; two apparent test failures during validation traced back to the validation harness
  itself (an `Origin`-header mismatch on a hand-built Server Actions POST; a literal-string check
  that missed a React hydration comment). **P6a promoted** (PR #165, merge `035fa69`), carrying
  P5's still-unpromoted closeout (#157) along with it — no migration, the simplest promotion of the
  phase so far. P6 stays **open**: P6b (#159, catalogue management) is next.
  `specs/sdd-workflow.md` (2.6.0) **corrects the model-switch point**: the loop had the switch to
  Opus 5 landing right after Ship, so Document (final) — reconciliation work against a branch the
  current session already has full context on — ran on a freshly-switched, cold Opus 5 session that
  then spent tokens re-orienting to do work that didn't need Opus's extra reasoning. The switch now
  sits at the *end* of Document (final), immediately before the second `/clear`, so Document runs on
  the already-warm model and the next loop's Orient starts already on Opus 5. `CLAUDE.md` and the
  `/ship`/`/document` command files updated to match.
- **P6b1 closeout docs.** `specs/roadmap.md` (1.19.0) gains P6b1's slice row and its promotion row.
  A real defect was found and fixed **before** the slice ever reached `staging`: the write path's
  `"use server"` file (`features/admin/catalogue.ts`) also exported a plain object
  (`initialCatalogueState`) alongside its two actions, and Next validates a `"use server"` file's
  *entire* export set together whenever any one action dispatches — so every product/category write
  500'd, for any caller, with `next build`/`tsc`/`npm test` all staying green throughout (none of
  them load the module through the flight-loader's runtime dispatch path). Only `npm run preview`'s
  live write rows caught it. Fixed by moving the constant into `lib/catalogue-form.ts`; re-validated
  live in full afterward, with every write-path requirement re-proven against real Postgres on
  staging rather than just re-read. `CLAUDE.md` (1.1.0) gains a new "Server Actions" section
  recording the trap so it isn't rediscovered. **P6b1 promoted** (PR #171, merge `a577697`),
  carrying P6a's still-unpromoted Document-final closeout (#166) along with it — no migration. P6
  stays **open**: P6b2 (#167, product image upload) is next.
- **P6b2 closeout docs — P6 closed.** `specs/roadmap.md` (1.20.0) gains P6b2's slice row, its
  promotion row and a phase-closure row: all three P6 slices (P6a #158, P6b1 #159, P6b2 #167) are now
  live in production. All 32 `validation.md` rows pass, including a full real-browser end-to-end run
  (EXIF-upright confirmation, exact 1200×900 downscale, zero CORS/console errors, CDN fetch of the
  resulting key). Two real defects found and handled during this slice's Validate: `validation.md`'s
  own R26 fixture script named the wrong vendor slug and built a `PrismaClient` with no driver
  adapter (both would have made the script throw as originally written — fixed in `ddaf30a`,
  **before** `staging`), and a pre-existing, unrelated bug in `lib/auth-origin.ts` that 403s
  real-browser sign-in against `npm run preview` on any non-default port — filed as **#176**, not
  fixed here (staging/production are unaffected; default port, Cloudflare sets `x-forwarded-proto`
  correctly there). `specs/sdd-workflow.md` (2.7.0) records #176 in the Validate stage so it isn't
  rediscovered. `CLAUDE.md` (1.2.0) records the Windows `npm run preview` orphaned-process trap
  (`workerd.exe`/`wrangler dev`'s children survive the parent's termination, causing `EBUSY` on the
  next build) hit twice during this slice's live-browser Validate. **P6b2 promoted** (PR #178, merge
  `2f8ae5b`) — no migration. **One prerequisite the promotion does not carry**: production's
  `aheed-images-production` bucket CORS is deliberately not applied yet (owner action, tracked in
  `plan.md`'s Prerequisites), so uploads will 403 in production until it's set.
- **The order confirmation email and order-detail pages labelled the combined discount line "Loyalty
  points" unconditionally**, unchanged from P5a — so as of this slice, an order discounted by a code
  alone (no points touched) rendered a line claiming the shopper's loyalty balance had been spent.
  The arithmetic was always correct (`subtotal - discount + delivery = total` held either way); only
  the label was wrong. Found at this slice's Validate. Relabelled to "Discount" in both
  `features/checkout/send-confirmation.ts` and `components/orders/OrderItemsCard.tsx` (shared by
  `/checkout/{orderNumber}` and `/account/orders/{orderNumber}`); `tests/order-confirmation-email.test.ts`
  updated to assert the new label.
- **P5b closeout docs.** `specs/roadmap.md` (1.16.0) gains P5b's slice row, written from what live
  validation actually proved: **every one of build-notes' eight "known-shaky" areas came back
  clean**, most notably both concurrency guarantees (the global usage-cap race and the per-customer
  race) actually running under `Promise.all` against real Postgres, and the admin cross-vendor
  replay proven in **both directions** — closing, for discount codes, the exact gap **#141** recorded
  for P5a's loyalty config. P5 stays **open**: **#143** (P5a live but dark) must resolve first.
- **P5 closeout.** P5b promoted to production (PR #155, merge `1b66bdf`); unlike P5a's promotion,
  `deploy-production` applied a genuinely pending migration (`20260811175844_p5b_discount_codes`),
  confirmed from the deploy log rather than inferred from a green merge. **#143 resolved**: production
  re-seeded for Aheed only (`SEED_SRIMART_HOST` deliberately unset, so SriMart's block never ran) —
  `loyaltyEnabled: true`, Silver/Gold tiers, and `WELCOME10` all confirmed live by direct read, not
  assumed from the seed's exit code. **P5 (#88) closes here**: loyalty and discounts are now both live
  *and reachable*, which neither promotion alone achieved. Two new gitignored-file defects found and
  filed, not fixed in this diff: **#154** (`secrets/production.vars`' `CDN_BASE_URL` held staging's
  host — fixed by the owner before the re-seed ran) and **#156** (`RESEND_API_KEY`'s malformed `=`
  spacing broke plain-bash `source`, briefly printing the key to a terminal).
  `specs/sdd-workflow.md` (2.5.2) gains a fourth Validate trap: a Next.js server action's id is a
  stable build-time hash in `.next/server/server-reference-manifest.json`, independent of any
  session — which is what let this slice's admin RBAC rows (no-`Cookie`, wrong-role) be driven live
  **without** a valid session to render the form first. `specs/2026-08-11-p5b-discount-codes/validation.md`'s
  C6 fixture corrected in place (matching P4a's R27 precedent): it was described as sharing C1's
  code string, which directly contradicted R48's own premise that C6 exists on no other vendor —
  found and fixed at this pass, not carried forward as a live defect. **#144** (P5a's promotion-row
  backfill) closed — confirmed landed on `staging`. **#141 commented, not closed**: the account
  blocker it named turns out to be avoidable (a platform `ADMIN` transcends vendor membership, so no
  dedicated SriMart-admin account is needed), but it names P5a's `/staff/loyalty` action
  specifically, which this slice's validation didn't re-run.
- **P5a closeout docs.** `specs/roadmap.md` (1.14.0) gains P5a's slice row, written from what live
  validation actually proved rather than what the build expected. It **supersedes
  `build-notes.md`'s "nothing in this slice has touched a real database"** — honest when written,
  and exactly what aimed validation at the right places: all 65 rows were then walked against real
  Postgres and **seven of the notes' eight "known-shaky" areas came back clean**, including the one
  that mattered most (the double-spend guard survived a genuine `Promise.all` race with one winner,
  one `REDEEM` and a balance that never went negative — the unit test had only ever simulated a lost
  race by hand). The eighth stands: **#104** still blocks any inbox-level email proof. P5 stays
  **open** — P5b (discounts engine) is the remaining slice, so there is no phase-closure row here.
- **A real environment defect, found by validation and unrelated to the slice.** `.env` *and*
  `.dev.vars` both pointed at the **production** Neon project while `S3_BUCKET`/`CDN_BASE_URL` in
  the same files correctly said staging — so nothing looked wrong, the documented "check both"
  passed cleanly, and P5a's migration reached production ahead of its promotion PR. Additive and
  verified harmless (row counts unchanged, every `discountPence = 0`, no drift), but the identical
  slip against a destructive migration would not have been. **`CLAUDE.md` now requires diffing
  `.env`/`.dev.vars` against `secrets/staging.vars` and `secrets/production.vars`, not merely
  against each other** — two files agree on the wrong target as easily as they disagree. **#119**
  updated: its framing described only half the failure mode, and its closing criteria should widen
  from "make the two files agree" to "make the target unambiguous". Recorded for the upcoming
  promotion: `deploy-production` will report **no pending migrations**, which is expected, not
  drift (same situation PR #108 logged for P3).
- **`specs/sdd-workflow.md` (2.5.0) — `gh pr checks` is a view, not the truth.** During P5a's
  promotion (#140) a `gates` run showed every step green including `Complete job`, while the job's
  status stayed `in_progress` and `gh pr checks` reported `pending 0` for **56 minutes**;
  `gh run cancel` returned `HTTP 500`. The run had actually succeeded in ~1 minute.
  githubstatus.com showed **Actions "Operational"** alongside a separate active **API Requests /
  GraphQL** degradation — status finalisation rides that degraded path, so Actions' own badge stays
  green while its reporting is broken. The Ship stage now says to cross-check a long "pending"
  against `gh run view --json status,conclusion`, and to read **every** status-page component
  rather than only Actions: an `until ! gh pr checks | grep pending` loop can spin forever on a
  finished run, and "still pending" is not evidence a job is still working. The same incident also
  silently dropped a delivery-board write (#135 reverted from `In Review` to `In Progress` after a
  verified edit) — board state was re-applied and re-verified.
- **#141 filed** — P5a's R56 was verified in one direction only. An Aheed admin's tampered
  `vendorId`/foreign tier key were both ignored (write landed on Aheed, SriMart byte-for-byte
  unchanged), but the reverse leg `validation.md` asks for — a **SriMart** admin submitting from the
  SriMart host — was skipped, because `scripts/demo-accounts.ts` seeds memberships against the first
  ACTIVE vendor only, so no SriMart admin exists. A test-coverage gap, not a known defect; the fix
  worth making is seeding a per-vendor admin for every active vendor, which several later slices
  will want anyway.
- **P5a — loyalty points: earn, redeem, tiers, expiry & admin config** (#135,
  `specs/2026-08-11-p5a-loyalty-points/`), the first P5 slice and the loyalty half of the phase.
  A shopper earns per-vendor points on orders they actually pay for, spends them at checkout, and
  loses them to inactivity. The discounts engine stays P5b.
  - **One money seam, so the payment path needed no change at all.** `computeTotals` gained a
    discount and the identity `subtotal − discount + delivery = total`; everything downstream —
    the `Order` row, `Payment.amountPence`, the Stripe session amount — derives from it, so
    `lib/payments.ts` and the webhook are untouched and **ADR-005's decisions are unaltered**
    (it gains an additive implementation note only). Free delivery and the vendor's minimum order
    are judged on the subtotal **before** the discount: custom already earned isn't clawed back by
    paying with points.
  - **A double-spend is structurally impossible.** `LoyaltyAccount.balancePoints` is a
    compare-and-set counter guarded by a conditional `updateMany` carrying `vendorId`, `userId`,
    `balancePoints: { gte: n }` and the lapse bound — the same technique P3b used against
    overselling and P4b against double-advancing, aimed at a third race. The append-only
    `LoyaltyLedgerEntry` beside it is the audit trail, exactly as `OrderItem` sits beside
    `Inventory.quantity`; a `SUM()` balance cannot be guarded, which is why both exist.
  - **The debit runs before the order is written**, so an order can never carry a discount whose
    points the shopper turned out not to have. `@@unique([orderId, kind])` makes a second `EARN`
    (duplicate Stripe delivery) or a second `REDEEM` (double submit) a database error rather than a
    check someone has to remember.
  - **Points are credited on payment confirmation**, inside the transaction that sets `CONFIRMED`,
    and **only a `REDEEM` is ever reversed** — `releaseOrder` acts on `PENDING_PAYMENT` orders,
    strictly before an earn exists, so no current path can cancel an earned order. Earn reversal
    arrives with refunds (ADR-005 territory).
  - **Expiry is derived at read time, adding no infrastructure.** `wrangler.toml` still declares no
    cron triggers; a lapsed balance reads as zero, is refused by the redemption guard, and is reset
    rather than incremented by the next earn.
  - Earning excludes both delivery and the discounted portion, so redeemed points cannot re-earn
    points. Tier multipliers are basis points and are **snapshotted onto the earn**, keeping a
    historical earn explainable after the tier table changes. Redemption is clamped so
    `discountPence` is always exactly `pointsSpent × pencePerPoint` and the payable total never
    falls below `MIN_PAYABLE_PENCE` (30p) — below Stripe's GBP floor an order would exist that
    could never be paid for.
  - Surfaces: `/account/loyalty` (balance, cash value, lifetime, tier, ledger) and an ADMIN-only
    `/staff/loyalty` on P4b's `/staff` segment. `STAFF` is deliberately excluded there — advancing
    an order is a packing-floor action, changing the earn rate is an owner decision.
  - One additive migration: three tables, one enum, `Order.discountPence` and six `VendorConfig`
    columns, all defaulted. Seed turns loyalty **on** for Aheed with two tiers and deliberately
    **off** for SriMart, which is what proves it is per-vendor data.
  - Also corrected here: the order confirmation email gains a discount line — without it the three
    money lines stop reconciling the moment an order carries a discount. No new email is sent.
  - Deliberately excluded: the discounts engine (P5b), tier create/delete from the admin UI, guest
    loyalty, and cross-vendor balances.

- **P4b — staff order status transitions & delivery emails** (#125,
  `specs/2026-08-11-p4b-order-status-transitions/`), the write half of P4 and the slice that closes
  the phase. `OUT_FOR_DELIVERY` and `DELIVERED` have been in the `OrderStatus` enum since P3b's
  initial migration with **nothing in the codebase able to reach them** — an order landed on
  `CONFIRMED` when Stripe's webhook fired and stayed there forever. P4a made status visible; this
  makes it move, under a real person's hand, with that person on the record.
  - **A vendor-role-gated staff queue at `/staff/orders`** — `requireVendorRole("STAFF","ADMIN")`,
    the **first real consumer of ADR-004 slice 3a's `VendorMembership`**, which until now had no
    caller exercising it. A new `/staff` segment parallel to `/dev`, so P6's admin panel has a
    namespace to grow into rather than needing a URL migration.
  - **A double-advance is structurally impossible, not merely unlikely.** Legality is evaluated
    against the *persisted* status and the write is a conditional `updateMany` whose `where` repeats
    that status — the same compare-and-set P3b used to make overselling impossible, aimed at a
    different race. A stale tab or a double click matches zero rows and writes nothing. `vendorId`
    sits in the `where` too, so another vendor's order number is indistinguishable from one that
    does not exist.
  - **`OrderStatusEvent.createdByUserId`**, nullable, `ON DELETE SET NULL` — the slice's one
    additive migration. This **corrected issue #125's own "no schema change" line**, which was an
    Orient-time observation rather than a decision and could not survive contact with "the acting
    user recorded". P4's roadmap line promises an audit trail, and attribution not captured now is
    unbackfillable. Nullable means P3-era rows need no backfill and system transitions keep leaving
    it null; `SetNull` because removing a departed staff member's account must not delete the audit
    trail of the orders they handled.
  - **The transition rules are pure** (`canTransition`/`nextStatus` over a `LEGAL_TRANSITIONS` map
    in `lib/order-status.ts`, unit-tested across the full 5×5 matrix by asserting the exact legal
    set, so a future added status cannot widen the ladder silently). `PENDING_PAYMENT` is absent as
    a *source*: only Stripe's webhook moves an unpaid order. Staff cannot cancel — that is
    refund-adjacent (ADR-005) and a decision of its own.
  - **The server action re-runs its own RBAC check.** A server action is a public endpoint exposed
    at a stable action id; a gate on the page is a gate on the page and nothing more.
  - **Emails on the two staff transitions only**, sent after the transaction commits and never
    throwing — a delivery that physically happened must not be undone because a provider was
    unreachable. No `CONFIRMED` branch exists, so P3c's confirmation email stays the only one for
    that event.
  - **`note` stays system-written.** P4b ships no input through which staff can type into that
    column, so P4a's structurally-unrenderable-note guard is honoured by not opening the door. A
    staff-authored note needs a customer-visible/internal distinction and belongs with P6.
  - The queue is **keyset-paginated** like P4a rather than a fixed `take`: a worklist that silently
    stops at row *N* hides the order nobody packs. It shows only actionable statuses, deliberately
    inverting P4a's unfiltered customer list — a shopper is hunting one order, a packer is working a
    queue.
  - Deliberately excluded, tracked: a staff order **detail** view, filters, search and bulk actions
    (**#129**, P6's panel supersedes this queue wholesale).

### Fixed
- **`CLAUDE.md` documented `lib/config`'s env precedence backwards, and always had.** It claimed
  `process.env` wins over the Cloudflare request context, "so local `.env` wins in dev and a stray
  `.dev.vars` can't shadow it". `readEnv()` does the opposite — it tries `getCloudflareContext()`
  first and falls through to `process.env` only when there is no Worker request context — and has
  since the file was written (`e41e8ec`). So under `npm run preview` **`.dev.vars` wins**, which is
  exactly how a fixture script (reading `.env`) and the app under preview can silently use different
  Neon projects while every result still looks plausible (**#119**). Found at P4a's Validate, where
  the two files did point at different projects. Corrected to describe real behaviour; the code is
  unchanged, since flipping the precedence would be a behaviour change needing its own proposal.

### Changed
- **P4a closeout docs**: roadmap change-log row for the slice (`specs/roadmap.md` 1.11.0), and a
  `specs/sdd-workflow.md` (2.3.0) Spec-stage rule earned twice in one slice — **don't `grep` for the
  absence of a word in prose or commented code**, because the artifact names what it deliberately
  excludes, so the check matches its own explanation and "passing" means deleting the rationale
  (P4a's R5 at Build, R27 at Validate). P4a's `validation.md` R27 row corrected in place.
- **P4b closeout docs, and P4 closed.** `specs/roadmap.md` (1.13.0) gains P4b's promotion row and a
  **P4 closure** row: order history, the three-step ladder with an attributed audit trail, staff
  updates and delivery emails are all in production, and the one gap carried out of the phase is
  infra not code — Resend still has no verified sending domain (**#104**), so P4b's emails are
  correct in every structurally checkable respect and still cannot be confirmed to reach a real
  inbox anywhere. The promotion row deliberately **supersedes `build-notes.md`'s "nothing in this
  slice has touched a real database"**: that was true when written and is what aimed validation at
  the right places, and three of the four "known-shaky" areas it named came back clean under live
  checking — the compare-and-set held under a genuine concurrent `Promise.all` double-submit, the
  keyset crossed a real 20/6 page boundary, and the migration applied with no drift and no row
  touched.
- **`specs/sdd-workflow.md` (2.4.0) — a third grep-shaped check retired, and a CI trap written
  down.** P4b's `validation.md` R23 row required `grep` to show **no** `skip:` in the staff list
  method; `skip: 1` is Prisma's standard keyset idiom for excluding the cursor row, already shipped
  in P4a's `listForUser` and P2b's `products.ts` and endorsed by `specs/architecture.md`. The check
  would have failed a correct implementation and passed one that dropped the cursor entirely — the
  same class as the rule P4a added. Row corrected in place. Separately, the Clear checklist now
  requires `npm run kms:build-index` to have been run and committed: **every slice adds a
  front-mattered `plan.md`, so every slice makes `ARTIFACT_INDEX.md` stale**, CI's `gates` job fails
  on exactly that, and nothing local catches it — not `sdd:preclear`, not Validate's pre-flight. P4a
  remembered by hand, P4b didn't and burned a red CI run. **#132** tracks making it mechanical.

### Added
- **P4a — order history & status timeline** (#122, `specs/2026-08-11-p4a-order-history/`), the first
  P4 slice and the read half of the phase. A signed-in shopper gets `/account/orders` — their own
  orders for **this vendor**, newest first, ten per page — and `/account/orders/{orderNumber}`,
  showing the purchased lines, the snapshotted delivery address, and a **status timeline**. P4a
  builds less than P4's roadmap line implies because P3 left more behind than the line recorded:
  `OrderStatusEvent` rows were already being written in three places and `Order` already carried
  `@@index([vendorId, createdAt])`, so this slice is **read-only — no schema change, no migration**.
  - **`getForUser()` is a second, stricter read next to `getByOrderNumber()`, which is untouched.**
    The existing method implements P3b's capability-URL rule — a guest order has no owner, so the
    unguessable order number *is* the credential. That is right for `/checkout/{n}` and wrong for
    `/account/orders/{n}`: a page claiming to be *your* history must not render someone else's order
    because a valid number was pasted into the address bar. `userId` is part of the `WHERE`, not a
    post-hoc check, so a guest order and another member's order both simply fail to match.
  - **The timeline is built from `status` and can never render `OrderStatusEvent.note`.** Today's
    notes are system-written and harmless, but P4b hands staff a control that writes that column,
    and an internal note on a customer's own order page is a live incident rather than a cosmetic
    bug. `buildTimeline`'s types carry no note field, the repository does not select it, and a unit
    test asserts a smuggled note cannot reach the output — the leak is unrepresentable, not merely
    unlikely.
  - **The list is deliberately unfiltered by status.** An abandoned `PENDING_PAYMENT` order and a
    `CANCELLED` one both appear. Hiding them would look tidier while concealing the exact order
    someone is most likely hunting for after a failed payment.
  - Pure, DB-free logic in `lib/order-status.ts` (12 unit tests), matching the split already used by
    `lib/cart-rules.ts` and `lib/shopping-list.ts`; `en-GB` dates pinned explicitly, because a
    Workers isolate has no user locale and an unpinned format renders the US month order.
  - `components/orders/` extracts the items/totals and address cards out of the P3b confirmation
    page so both order pages share one implementation instead of two copies of the money breakdown.
  - Deliberately excluded, each tracked: guest order lookup (**#123**), reorder-from-a-past-order
    (**#124**, inherited from P3d), and all staff transitions and delivery emails (**#125**, P4b).
  - Two **spec** rows were corrected during the build rather than worked around, recorded inline in
    `requirements.md`: R9 demanded "exactly one Prisma query", which a nested relation `select` can
    never satisfy (Prisma issues a second batched query unless `relationJoins` is enabled) and now
    states the property that matters — no N+1; and R5 verified "no note field" with a grep that
    matched the module's own explanatory comment, which would have meant deleting the explanation to
    please the check.

### Changed
- **`specs/sdd-workflow.md` 2.2.1** — corrects the delivery-board blockquote, which claimed
  `Backlog` and `In Review` "do not exist yet" and told the reader to substitute `Todo`. Both are
  false: Project #2 has all four Status options and `CLAUDE.md` already records the rename as done,
  so a reader following the workflow doc would have filed status wrongly. Rides P4a's branch per the
  carry-forward rule.
- **Post-promotion documentation pass for P3 in production** (`specs/roadmap.md`,
  `docs/env-setup.md` 1.7.0) — rescued from PR #110, which branched before P3d and had gone stale
  and conflicting; the content below is the part of it that had not landed any other way.
  - **The roadmap now records the promotion itself** (PR #108) in the existing promotion-entry
    style: `deploy-production` green, production `/api/health` reporting commit `034a380` with
    `db.ok: true`, and `/api/webhooks/stripe` live (an unsigned POST is rejected 400, so signature
    verification is active). It also records that the two P3 migrations were **already applied** to
    the production database — CI reported "no pending migrations" — because no `main` push occurred
    between PR #81 and #108, so they reached production out-of-band. No drift resulted (CI
    confirming zero pending *is* the proof repo and DB agree), but it bypassed `CLAUDE.md`'s
    migrations-run-in-CI rule, which is worth having on the record rather than discovering twice.
  - **Corrects two claims in `env-setup.md` that live verification made false**: it said production
    would use a live Stripe key and that test mode was for "everything except production".
    Production deliberately runs **test-mode** keys, because it shipped before the storefront opened
    to customers; installing a live key is a separate decision (#113), not a consequence of
    promoting code.
  - **Puts the per-endpoint webhook trap where operators will hit it** — each Stripe endpoint has
    its own `whsec_…`, so staging's cannot verify production's deliveries, and the failure is
    *silent*: the handler rejects every delivery, so orders never leave `PENDING_PAYMENT` and their
    stock is never released. Also records the Cloudflare gotcha that forces deploy-then-secrets
    ordering: a Worker secret cannot be edited while an undeployed version is pending.

### Fixed
- **`sdd:audit` was passing a slice it should have failed** (`scripts/sdd-check.ts`). The check that
  exists specifically to catch "shipped without a roadmap entry" reported P3d as documented while
  the roadmap said only that P3d was *still to come*. It matched a bare token (`p3d`) against
  change-log rows, guarded by `row.date >= sliceDate` on the reasoning that a row predating a slice
  can't document it. That guard does not hold: the P3a/P3b/P3c backfill row is dated `2026-08-10`
  and names "P3d", and the P3d slice dir is **also** `2026-08-10`, so the row satisfied its own
  guard. Spec and ship land the same day routinely here, so same-day collisions are the normal case,
  not an edge. A row now counts only when it cites the slice's **spec path** (`specs/<slice>/`) —
  precise, unfakeable by prose, and already the convention every real closure row follows. Verified
  by watching it fail on the genuine P3d gap, then pass once the real row landed. This is the third
  time this specific gap has bitten: P3a/P3b/P3c shipped undocumented, the audit was written to stop
  it, and the audit then let P3d through too.
- **`configure-env.mjs` now knows about the Stripe secrets.** P3c added `STRIPE_SECRET_KEY` and
  `STRIPE_WEBHOOK_SECRET` as Worker secrets but never taught the sync tool about them, so the
  script silently reported them as "unrecognized" and skipped them — which is why production ran
  without Stripe credentials until they were set by hand. Added as a new **`OPTIONAL_WORKER_SECRETS`**
  list rather than under `WORKER_SECRETS`, mirroring the app's own contract: `getPaymentService()`
  falls back to the stub when `STRIPE_SECRET_KEY` is unset, so an environment without Stripe is a
  supported state, not a misconfiguration. Making them required would block configuring a fresh
  environment that has no Stripe yet — verified both ways (present → pushed; absent → skipped,
  exit 0). `STRIPE_PUBLISHABLE_KEY` is deliberately still unrecognized: hosted Checkout runs
  nothing in the browser, so the app never reads it.
  - Records the trap that caused the mismatch: **`STRIPE_WEBHOOK_SECRET` is per-endpoint, not
    per-account.** Staging's value cannot verify deliveries to production's endpoint, so it must
    never be copied between environments — each `secrets/<env>.vars` carries the secret belonging
    to that environment's own Stripe endpoint.
- **Backfilled the missing P3a/P3b/P3c roadmap change-log entries** (`specs/roadmap.md` 1.9.0). All
  three slices shipped without one — the roadmap still ended at ADR-004 slice 3c (2026-08-09) while
  cart, checkout and Stripe payments were live on staging. Records what each slice delivered, the
  live-verification outcome for P3c, and that **P3 remains open pending P3d ("Shop your list")**.
  This is the gap that motivated the post-Ship documentation audit in `specs/sdd-workflow.md` 2.0.0:
  every SDD gate fires before or at merge, so the roadmap update — which happens after the PR lands
  — had nothing enforcing it. The KMS index, by contrast, was never at risk: `gates.yml` already
  rebuilds and diffs it (normalizing timestamp and commit) on every PR.

### Added
- **P3d — "Shop your list"** (#114, `specs/2026-08-10-p3d-shop-your-list/`): the second way to fill
  a cart. Paste a list, see what each line matched, then add the confirmed lines in one action. The
  last P3 slice.
  - **Matching is token-AND on product `name`**, in a new `ProductRepository.matchListTerms()` that
    issues **one** query for the whole list (candidate rows, capped at 200) and leaves every
    per-line decision to pure code in `lib/shopping-list.ts`. Deliberately not
    `ProductRepository.search()`: that is a single `contains` OR'd across name and description, so
    `"2x chicken breast"` matches nothing — exactly the input this feature invites. Matching
    `description` was rejected too, since a term hitting prose yields a confident-looking wrong
    product.
  - **A leading bare integer is a quantity only when not glued to a unit** — `2 apples` is two
    apples, `5kg basmati rice` is one bag of *Basmati Rice 5kg*. Four seeded products carry a size
    in their name, so this is ordinary input, not an edge case. Explicit `2x` / `x2` forms always
    win.
  - **Nothing enters the cart unreviewed.** Every line renders as matched, ambiguous (with a
    chooser), unmatched, or unavailable; only an explicit action writes. Ambiguity is real here —
    `milk` matches both *Whole Milk* and *Coconut Milk*.
  - **The matching pass writes nothing at all** — no `Cart`, no `CartItem`, no guest cookie —
    preserving P3a's rule that browsing creates no state. The guest token is issued only by
    `add-list-to-cart`.
  - New `CartRepository.addItems()` resolves the cart once and writes every line in a single
    transaction, reusing `effectiveStock()`/`clampQuantity()` rather than re-deriving them.
    Duplicate lines are summed first (`sumLinesByProduct`), since two upserts of one row inside a
    transaction would fight. Product ids from the stateless review form are **untrusted**: stock is
    resolved through the existing vendor-scoped `stockMap`, so an id from another vendor has no row,
    resolves to 0, and is skipped.
  - **Typos are explicitly out of scope** (`bannanas` reports unmatched). Handling them means
    `pg_trgm`, whose `similarity()` needs `$queryRaw` — forbidden in application code — and P2
    deliberately deferred trigram search. The mandatory review step is what keeps that honest: an
    unmatched line is visible, not silently dropped.
  - No schema change, no migration, no saved lists.
- **Two machine checks behind the SDD loop's honor-system stages** (`scripts/sdd-check.ts`,
  `specs/sdd-workflow.md` 2.1.0). Every existing gate fires before or at merge — `pre-commit`
  (Gate 2), `pre-push`/`gates.yml` (Gate 4), CI (Gate 3) — so nothing had teeth after Ship. That is
  how P3a/P3b/P3c all shipped with no roadmap entry.
  - `npm run sdd:preclear` (end of `/build-notes`) — derives the slice from the branch diff, then
    requires all four spec files, the build-notes template's four sections, a `CHANGELOG.md` diff
    against the base, and a clean working tree. The Clear is irreversible, so "everything is
    persisted" stops being a claim and becomes an exit code.
  - `npm run sdd:audit` (at `/orient`) — reports slices that shipped without a roadmap change-log
    entry or never reached `ARTIFACT_INDEX.md`. **Only audits slices after a baseline constant**, so
    it never retroactively polices work that predates the loop. A roadmap row only counts if it is
    dated on/after the slice — without that, the backfill row naming P3d would have satisfied the
    check for an undocumented P3d.
  - Both copy `hooks/pre-push`'s posture (origin/staging → origin/main → don't block offline) and
    reuse `readFrontMatter`/`ROOT` from `kms/schema/repo`. Verified against real history: with the
    baseline set before P3a, the audit reports the exact three gaps that existed pre-backfill.
- **`specs/templates/feature-spec/build-notes.md`** — build notes stop being free-form. Its four
  headings are exactly what `sdd:preclear` greps for, making the template the check's contract
  rather than decoration. `plan.md`/`requirements.md`/`validation.md` were already templated; the
  one artifact the Clear actually bets on was not.
- **Delivery-board steps wired into the loop.** Propose adds the issue to GitHub Project #2 with a
  Phase; Build moves it to In Progress; Ship moves it to **In Review** on staging merge; it closes
  to **Done** only on promotion to `main` — because `Done` means *in production* and `Closes #NN`
  never fires on a merge into `staging`. Ten issues (#93–#106) filed after the board was provisioned
  had never been added to it; `scripts/provision-project.sh` was re-run to adopt them. **Still
  needed, UI-only:** the Status field keeps GitHub's default `Todo/In Progress/Done`, so `Backlog`
  and `In Review` don't exist yet.

### Changed
- **P3 closed** (`specs/roadmap.md` 1.10.0). Cart → checkout → payment → list-based cart entry all
  shipped to production (P3a #93, P3b #96, P3c #99, P3d #114). Adds the P3d closure row and the
  phase-closure row, and carries out the two known gaps — both infra, not code: Resend has no
  verified sending domain so no confirmation email reaches a real inbox in any environment (#104),
  and the payment-provider failure path still needs a window against staging's live secrets (#103).
  Neither blocks P4.
- **P3d's R10 corrected after ship** (`specs/2026-08-10-p3d-shop-your-list/requirements.md`). The
  row specified ranking as "all-terms matches first, then shorter name, then alphabetical", but R9
  defines a candidate *as* an all-terms match, so that first tier can never fire. Flagged as a
  deviation at build and confirmed at `/validate` as a **spec defect rather than an implementation
  shortcut** — `rankCandidates()` shipped the two reachable tiers instead of a branch that provably
  cannot execute. The requirement now says what the code does; every behaviour it asserts
  (exact-match-wins, determinism, the 5-candidate cap) was already tested. Corrected in place with
  a dated note rather than rewritten silently.
- **How to validate server actions without a browser** (`specs/sdd-workflow.md` 2.1.0 → 2.2.0,
  Validate stage). Next renders progressive-enhancement fields on every server-action form, so
  posting those fields as `multipart/form-data` invokes the real action — and the response's
  `Set-Cookie` is how you prove a *negative*, which is how P3d's "matching writes nothing" was
  actually verified rather than inferred. Records the three traps that each cost a dead end:
  `fetch`/undici **silently drops a caller-set `Host` header** (fatal under multi-tenancy — every
  request resolves to `/coming-soon` and reads as a broken app; use `node:http` with
  `setHost: false`), `$ACTION_REF_1` renders with **no `value` attribute** (a parser requiring one
  drops it and the POST fails as a bare `500` with an empty body), and a `<select>` is a form field
  that must be serialized in document order alongside `<input>`s. Also adds: confirm which database
  the Worker is on before trusting a live result, since `preview` reads `.dev.vars` while seeds and
  inspection scripts read `.env` (#119).
- **SDD workflow restructured from a seven-stage sequence into a delivery loop with two context
  Clears** (`specs/sdd-workflow.md` 1.0.0 → 2.0.0). The order is now **Orient → Propose → Spec →
  Build → Document (build notes) → CLEAR → Validate ⇄ Fix → Ship → Document (final) → CLEAR →
  Orient**, with the model switching to Sonnet 5 for the validation half and back to Opus 5 for the
  final documentation pass.
  - **Why the Clear before Validate:** a context that just built something is the worst judge of
    whether it matches the spec — it remembers the intent and reads that intent into the code. The
    reset forces Gate 3 to run against `requirements.md` and the artifact on disk, which is the only
    version of the spec a future maintainer ever gets. This already caught real defects under the
    old single-context flow (a consolidated `features/cart/actions.ts` that deviated from the
    spec's one-file-per-action shape; webhook functions resolving `getPrisma()` internally, so they
    couldn't be proven against real Postgres) — the reset makes that systematic rather than lucky.
  - **Document split in two.** `/build-notes` (new) is a **write-to-disk** stage before the Clear:
    build notes, persistent-doc updates, deferred items filed as issues — and **Gate 4's CHANGELOG
    entry**, which has to be on the branch before it merges, i.e. before Ship, which now precedes
    the final documentation pass. `/document` is now purely the post-ship durable record (KMS index,
    roadmap, reconciling docs with what validation actually found) and supersedes the build notes
    where they disagree.
  - **`/fix` (new)** formalises the Validate ⇄ Fix cycle: fix the root cause rather than the check,
    re-run `/validate` from the top rather than just the failed row, and stop when a "fix" is really
    a redesign — that's a Spec-level change, not something to improvise in a validation mindset.
  - Existing commands realigned: `/build` now hands off to `/build-notes` instead of `/validate`,
    `/validate` treats build notes as a claim about the artifact rather than evidence, `/orient`
    doubles as the post-Clear re-entry point, and `/spec` records that `requirements.md` is the only
    thing the fresh validation context will have.
  - **Two rules the assistant cannot enforce on itself** and must therefore ask for, now stated in
    `CLAUDE.md`: `/clear` is user-invoked, and so is every model switch.

### Added
- **Stripe payments, webhooks & confirmation email (P3c, #99)** — money actually moves
  (`specs/2026-08-10-p3c-stripe-payments/`). Replaces P3b's stub with a real hosted **Stripe
  Checkout** adapter, a signature-verified idempotent webhook at `/api/webhooks/stripe`, and an
  order confirmation email. **Closes the stock-release gap P3b explicitly recorded**: an order that
  fails or expires now returns its items to stock instead of holding them forever.
  - **Fixes a latent defect in P3b**: `createPayment()` was called *inside* `placeOrder`'s Prisma
    transaction. Harmless with a stub that does no I/O — which is why it passed every check — but a
    real HTTP call there would hold a Postgres transaction open on a serverless connection against
    Prisma's 5s timeout, so a slow Stripe response would roll back a good order. The session is now
    created **after commit**, and if it fails a **compensating transaction** cancels the order and
    releases its stock, so a shopper is never left with an unpayable order holding inventory.
  - **Raw `fetch`, no `stripe` SDK** — the same Worker-bundle reasoning that chose `aws4fetch` over
    the AWS SDK and plain fetch over Resend's. Signatures are verified with **WebCrypto**
    (HMAC-SHA256 over `{timestamp}.{rawBody}`, constant-time compared, 5-minute replay tolerance),
    using the **raw** body — re-serialising parsed JSON changes bytes and breaks verification.
  - **Idempotent by the same conditional-update guard as the stock decrement** (`WHERE status =
    'PENDING_PAYMENT'`), not a new event-log table. Stripe retries aggressively and can deliver out
    of order, so a duplicate delivery must change nothing — and must not send a second email or
    release stock twice.
  - **The webhook is vendor-agnostic**: it has no tenant context, so it finds the order by the
    `orderNumber` in session metadata and derives the vendor from the row. **One endpoint per
    environment, not one per vendor host** — the same Worker serves every host, and per-host
    endpoints would produce multiple signing secrets the single `STRIPE_WEBHOOK_SECRET` can't hold.
  - **`checkout.session.completed` alone isn't enough** — it can fire `payment_status: "unpaid"` for
    asynchronous methods, so confirmation requires `"paid"`.
  - **The confirmation email fires only from the webhook**, after payment confirms — never at order
    creation, where a later failure would leave the shopper holding a "confirmed" email for a
    cancelled order. Email failure never rolls back a confirmed payment.
  - **`/checkout/{orderNumber}` is now status-aware** rather than assuming the redirect means
    success: the browser redirect routinely races the webhook and a closed tab means it never
    happens, so the page renders whatever `order.status` actually is.
  - Two new **optional** Worker secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`); with neither
    set the app **falls back to the stub**, so local dev and CI need no Stripe setup. Deliberately no
    `STRIPE_PUBLISHABLE_KEY` — hosted Checkout never runs anything in the browser. Deferred and
    tracked: resume-payment for stuck orders (**#100**), webhook reconciliation sweep (**#101**).
  - **Live-verified against staging** (2026-08-10) with real Stripe test-mode keys: two real
    payments confirmed the webhook, idempotency, and status-aware confirmation page against
    staging's actual database. Uncovered a real infra gap in the process — Resend has no verified
    sending domain yet, so it rejects delivery to any address outside its own test address
    (**#104**, owner action). That failure incidentally proved the email-failure-is-non-fatal
    guarantee live: the order still confirmed and the webhook still returned 200. Remaining gap
    (payment-provider failure path, **#103**) needs a deliberate window against staging's live
    secrets rather than being done inline.
- **Checkout + order core (P3b, #96)** — a cart can now become a real order
  (`specs/2026-08-10-p3b-checkout-order-core/`). Adds vendor-scoped `Address`/`Order`/`OrderItem`/
  `Payment`/`OrderStatusEvent` behind a new `lib/repositories/orders.ts`, a `/checkout` page
  following `docs/ui-ref/CheckoutModal.tsx`, and a `/checkout/{orderNumber}` confirmation served
  from the persisted order so a refresh shows the same thing.
  - **Overselling is structurally impossible.** The whole checkout is one interactive transaction —
    decrement stock → create address/order/items/payment/status-event → clear the cart — and the
    decrement is a **conditional `updateMany`** (`quantity: { gte: qty }`) whose `count === 0` means
    someone else took the last one, rolling everything back. No raw SQL (`CLAUDE.md`), no
    read-then-check gap. Clearing the cart *inside* the transaction also makes a **double submit**
    safe: the second finds an empty cart instead of creating a duplicate order.
  - **Stock decrements at order creation**, so an order opens as **`PENDING_PAYMENT`** — an unpaid
    order must never read as `CONFIRMED` or staff would pick and deliver it. ⚠️ **Gap until P3c:**
    an abandoned checkout holds its stock, because release on payment-failure/expiry is P3c's
    webhook. **P3b must not reach production ahead of P3c.**
  - **Money is recomputed server-side** from the database inside the transaction and never read from
    the form; prices are then snapshotted onto `OrderItem`. The **delivery address is snapshotted
    per order** for the same reason — editing a saved address later must not rewrite where a past
    order went.
  - Five checkout gates, each its own error: unresolved P3a merge, empty cart, unavailable line,
    undeliverable postcode (via the existing `isDeliverable`), and below the vendor's minimum order.
  - **`PaymentService` port created** (`lib/payments.ts`) — named in `tech-stack.md` since the
    architecture baseline, never previously written. P3b ships a **stub** that charges nothing, so
    the risky logic was testable before any Stripe credential existed; P3c swaps in Stripe.
  - **Order numbers** are `{VENDOR}-{YYYYMMDD}-{6 random}` with the prefix derived from the vendor
    slug — deliberately **not sequential**, since a counter lets anyone who places two orders infer
    the shop's volume. Collisions retry against the unique index rather than being assumed away.
  - **ADR-005 — Payments & multi-vendor money flow**: Stripe behind the port, hosted Checkout (it
    handles UK SCA/3DS, a legal requirement), and a single platform account with a Connect-ready
    seam. Records the **merchant-of-record** consequence — with one account the platform is the
    seller for every vendor's sales, which is acceptable only while Aheed is the sole real merchant.
  - Additive migration (two enums + five tables). `VendorProfile` gains `slug`. `architecture.md`
    (v1.8.0) and `tech-stack.md` (v1.1.0) updated.
- **Cart foundation (P3a, #93)** — the storefront's inert "Add to Cart" is now real
  (`specs/2026-08-09-p3a-cart-foundation/`). Vendor-scoped `Cart`/`CartItem` behind a new
  `lib/repositories/cart.ts`, so one shopper has an **independent cart per vendor**. Identity is
  **exactly one of** `userId` or an opaque `guestToken` in a **host-only** `aheed_cart` cookie
  (mirroring slice 3c's isolation), and carts are created **lazily** — no row and no cookie until a
  first add, so crawling this public, indexed storefront writes nothing. UI follows
  `docs/ui-ref/CartDrawer.tsx`: a slide-out drawer whose **contents are server-rendered** (quantity
  and remove are plain `<form>` posts to server actions) with only open/close as a client island,
  plus a `/cart` route as the canonical URL. `AddToCartButton` is the one other island — it exists
  because `ProductCard`'s body is a `<Link>` and the click must not navigate.
  - **Two carts are never silently merged.** Signing in with both a guest and a saved cart prompts
    the shopper — combine (sum, capped at stock) / keep saved / keep new — and nothing is destroyed
    until they choose. No prompt when there's nothing to decide (empty saved cart is simply adopted).
    This is also what makes the shared-device case safe: a second person signing in on a borrowed
    browser is *asked* about the stranger's basket rather than inheriting it.
  - **The cart stores no prices** — unit price is read from `Product` at render and is snapshotted
    into `OrderItem` only at order creation (P3b); a cart that cached prices would serve stale money.
    Stock is advisory here and authoritative at the P3b decrement (a cart is not a reservation).
  - **Delivery rules became vendor data**: `VendorConfig` gains `deliveryFeePence` (default 349),
    `freeDeliveryThresholdPence` (null = never free) and `minimumOrderPence` (default 0), seeded
    differently for Aheed and SriMart. The reference mockup's hardcoded `£30` threshold and
    `#1B5E20` greens are **translated, not copied** — thresholds come from the DB and colours through
    `design-system.md`'s token table, so per-vendor theming can't regress the way #77 did. Applying
    fee/minimum to a payable total stays P3b.
  - Edge cases closed during spec review: a product with **no `Inventory` row** counts as out of
    stock (never unlimited), and a product that goes inactive **while sitting in a cart** renders as
    unavailable and is excluded from the subtotal instead of quietly adding money.
  - Additive migration (two tables + three defaulted/nullable columns). `ProductSummary` gains
    `inStock` so cards can show the out-of-stock state. Deferred: abandoned guest-cart cleanup
    (**#94**, likely P7 with the GDPR retention review).
- **GitHub Project delivery tracking (`scripts/provision-project.sh`).** Adds the idempotent
  provisioning script for the *Aheed Online Store — Delivery* Project (Projects V2), plus the
  `specs/roadmap.md` note establishing the rule: **the Project is a generated view of the roadmap,
  never a second plan** — it carries only the status layer (in progress / in review / blocked), while
  scope and acceptance criteria stay in `specs/`. Provisions 6 area labels, 11 milestones 1:1 with the
  roadmap phases (M0–P2.5 created **and closed**, P3–P8 open), and one epic per unspec'd phase (P3–P8)
  linking to its criteria rather than copying them. Check-then-create throughout: a re-run creates
  nothing. Deliberately omitted as duplication: a `feature` label (the repo already uses
  `enhancement`), `priority:*` labels (Priority is a Project field), and `phase:*` labels (Phase is a
  Project field). **Two GitHub limits, flagged not papered over:** Projects V2 exposes no public API
  for built-in workflows or view creation (the script prints the UI steps), and issues here never
  auto-close on `Closes #NN` because PRs merge to `staging`, not the default branch — so **Done means
  "promoted to production"** and staging-merged work legitimately sits in In Review.
- **Data-driven auth cookie scoping (ADR-004 slice 3c, #74)** — the last multi-tenancy gate before P3
  (`specs/2026-08-09-multitenancy-slice3c-auth-cookie-scoping/`). Better Auth's `baseURL`,
  `trustedOrigins` and cookie domain are now resolved **per request** from the host
  (`lib/auth-origin.ts`: pure `buildAuthOrigin` + async `resolveAuthOrigin`; `getAuth()` is now
  `async`), replacing the single hardcoded `BETTER_AUTH_URL`. Every vendor host gets a **host-only
  session, trusting only its own origin, by default** — no shared subdomain family exists (Aheed and
  SriMart sit on distinct hosts), so isolated-by-default is the correct posture. A new **optional**
  platform env `AUTH_COOKIE_FAMILY_DOMAIN` (unset in every environment today) arms the parent-domain
  family-SSO cookie for a future `{slug}.<family>` subdomain family with no code change; a
  custom-domain vendor never matches it and stays isolated. No schema/migration change. **Onboarding
  caveat:** because `baseURL` is per host, each vendor host must be registered in the Google OAuth
  client's redirect URIs (Aheed + SriMart done). ADR-004 carries a breadcrumb reconciling decision 4's
  assumed subdomain family with the deployed topology; `specs/roadmap.md` change-log back-fills slices
  3a/3b/4 + the #81 promotion. **ADR-004 slice sequence complete — P3 unblocked.** See the `trustedOrigins`
  correction below (#83), caught during this slice's own staging verification.
- **Per-vendor search-box placeholder (ADR-004 slice 4 follow-up).** The header search placeholder was
  hardcoded Aheed grocery copy ("Search halal lamb, basmati, lentils…") shown on every vendor. Adds a
  nullable `VendorConfig.searchPlaceholder` column (additive migration), read via
  `lib/repositories/vendor.ts` with a generic `"Search products…"` fallback; seeded per vendor (Aheed
  keeps its copy, SriMart gets "Search chargers, earbuds, lamps…"). Re-seed each environment to apply.

### Fixed
- **Auth `trustedOrigins` narrowed to same-vendor-only (#83, ADR-004 slice 3c correction).** Live
  staging verification of #74, right after merge, showed the original design — `trustedOrigins`
  populated from every `VendorDomain` host — would let one vendor's origin pass Better Auth's
  origin/CSRF check on **another** vendor's auth endpoints (e.g. SriMart's origin trusted by Aheed's
  `/api/auth/*`), reopening a cross-tenant surface that isolated-by-default exists to close.
  `trustedOrigins` now contains only the current request's own origin (+ the family wildcard when
  `AUTH_COOKIE_FAMILY_DOMAIN` is armed) — confirmed with the human. `lib/auth-origin.ts` no longer
  needs a DB call at all. `requirements.md`/`validation.md`/ADR-004/`architecture.md`/`env-setup.md`
  corrected to match.
- **Roadmap's slice 3c change-log entry corrected (#83 follow-up).** Missed when #83 fixed the other
  standing docs — `specs/roadmap.md` still described `trustedOrigins` as resolved "from the host +
  `VendorDomain`". Now matches the same-vendor-only design.
- **Multi-vendor browse/product polish (ADR-004 slice 4 follow-up, #79).** Three Aheed-hardcoded
  surfaces that looked wrong on a 2nd vendor (SriMart): (1) the **speciality filters**
  (Halal/Fresh/Organic) are now **data-driven** — `ProductRepository.availableSpecialities()` shows
  each only if the vendor has ≥1 active product with that attribute (a tech vendor shows none); (2)
  the shared product-image placeholder no longer reads "Aheed placeholder" — `placeholder-product.svg`
  is now brand-neutral ("No image", grey), re-uploaded to existing products by a new seed
  `refreshProductImages` step; (3) `app/manifest.ts` is **vendor-aware** (name/short_name/theme_color
  from the resolved vendor, neutral fallback). Re-seed to refresh the placeholder image.
- **Per-vendor theming now recolours the storefront (ADR-004 slice 4 follow-up).** The slice-4
  injection set only the eight `--color-brand-*` primitives on the storefront wrapper, but Tailwind v4
  emits the semantic tokens at `:root` as `var(--color-brand-*)` and the browser resolves that inner
  `var()` **at `:root`** — freezing e.g. `--color-primary` to the default palette, so a 2nd vendor's
  colours never applied (caught on staging: SriMart seeded blue but still rendered green). The wrapper
  now also re-declares the **semantic** tokens (same primitive→semantic mapping as `tokens.css`) and
  derives the hover shades per vendor via `color-mix()`. Data/seed were correct; only the injected
  layer changed (`app/(storefront)/layout.tsx`). No schema/seed change.

### Added
- **Multi-tenancy — branding-as-CSS-vars + config split (ADR-004 slice 4)**
  (`specs/2026-08-08-multitenancy-slice4-branding-config/`, #73). Fills the empty
  `VendorBranding`/`VendorConfig`/`VendorDeliveryArea` satellites and wires the read paths, so a
  vendor's **look and locality are data-driven**: the eight `--color-brand-*` primitives are injected
  as CSS custom properties per request (semantic tokens/components unchanged — the `var()` seam
  cascades), and header/hero copy, locality, delivery area, logo, page metadata and email sender name
  come from the DB. New `lib/repositories/vendor.ts` read path (per-request `cache()`, keeps the
  no-direct-Prisma guard green); `lib/delivery.ts`'s `isDeliverable(postcode, prefixes)` is now pure +
  vendor-scoped; header logo renders from `logoStorageKey` via the CDN or a **text wordmark** fallback.
  Seeds **SriMart** with a visibly distinct (blue/tech) palette, Reading/`RG` locality and its own
  tagline — proving two hosts render as different vendors from data alone. No schema migration (slice-1
  tables) and no new env vars. Deferred (tracked): the per-page `metadata.title` long tail + async
  `manifest.ts`, per-vendor email From (Resend domain verification), a named theme catalogue (#75),
  and dedicated hero-copy columns; auth cookie scoping / family SSO stays slice 3c (#74).
- **Multi-tenancy — host→tenant resolution + 2nd vendor (SriMart)**
  (`specs/2026-08-08-multitenancy-slice3b-host-resolver/`, #70; ADR-004 slice 3b). The app now serves
  the right vendor's data based on the **request host**: a `VendorDomain(host)` table maps hosts to
  vendors, and `lib/tenant.ts`'s resolver looks it up (falling back to the sole vendor while only one
  exists; unmatched hosts with 2+ vendors → a `/coming-soon` page linking to the default store).
  `getCurrentVendorId()` keeps its non-null contract, so repositories/`requireVendorRole` are
  unchanged. **No Next middleware** (edge runtime is forbidden) — the storefront layout gates the
  tenant. Adds **SriMart** as a real 2nd vendor with a distinct dummy catalogue, seeded (with its
  `VendorDomain`) only when both `SEED_AHEED_HOST`/`SEED_SRIMART_HOST` are set. `wrangler.toml`
  declares the `srimart.nocaped.com` / `srimart-staging.nocaped.com` custom domains. Additive
  migration (`VendorDomain` table).
- **Multi-tenancy — per-vendor authorization (`VendorMembership`)**
  (`specs/2026-08-08-multitenancy-slice3a-vendor-membership/`, #68; ADR-004 slice 3a). Authorization
  is now two-tier: `User.role` is the **platform** role (platform `ADMIN` transcends vendors; `/dev`
  still gates on it), and a new **`VendorMembership(userId, vendorId, role)`** carries **per-vendor**
  staff/admin (`VendorRole` = STAFF|ADMIN). A new `requireVendorRole()` gate allows platform admins
  or matching members of the current vendor. The demo-accounts tool now provisions memberships
  (`demo-admin` → Aheed ADMIN, `demo-staff` → Aheed STAFF; `demo-staff`'s platform role corrected to
  CUSTOMER). Additive migration (new table, no backfill). No infra; testable at one vendor. Host
  resolution (3b) and auth cookie scoping (3c) follow.
- **Multi-tenancy — repository-layer `vendorId` enforcement**
  (`specs/2026-08-08-multitenancy-slice2-vendor-enforcement/`, closes #66; ADR-004 slice 2). Adds a
  `lib/tenant.ts` `getCurrentVendorId()` tenant seam (interim: the single ACTIVE vendor; slice 3
  swaps in host→tenant resolution) and injects `where: { vendorId }` across `lib/repositories/*`
  (products/categories/reviews), resolved once per request-scoped repository instance — method
  signatures unchanged, so pages/features are untouched. An ESLint guard now makes importing
  `@/lib/db` (`getPrisma`) or `@prisma/client` an error in `app/`/`features/`/`components/` (the
  `/api/health` infra probe is allowlisted), keeping domain queries inside the repository layer.
  Runtime output is unchanged at one vendor. Also records the deferred slice-0/1 roadmap closure (#65).
- **Multi-tenancy foundation — Vendor aggregate + `vendorId` migration**
  (`specs/2026-08-08-multitenancy-slice1-vendor-schema/`, closes #62; ADR-004 slice 1). Introduces a
  `Vendor` tenancy root plus `VendorBranding`/`VendorConfig`/`VendorDeliveryArea` satellite tables
  (empty until slice 4), and a required `vendorId` FK on `Category`/`Product`/`Inventory`/`Review`.
  Global slug uniques become per-vendor composites (`@@unique([vendorId, slug])`,
  `@@unique([vendorId, userId, productId])`); read indexes lead with `vendorId`. A hand-authored
  migration backfills all existing rows to a single "Aheed Food Centre" vendor (fixed UUID, identical
  across environments). `seed.ts` and the review upsert supply `vendorId`. **Runtime behavior is
  unchanged** — read-side `vendorId` filtering / repository enforcement is slice 2. `User` and auth
  tables stay global (identity is platform-wide).

### Changed
- **KMS internal docs site is now live** at `https://docs.internal.aheedfoodcentre.nocaped.com`,
  gated by a Cloudflare Access self-hosted application (One-time PIN, email allow-list) — the site
  has no auth of its own; Access is the auth. Uncommented the custom-domain route in
  `kms/site-internal/wrangler.toml` (the Access app was created first, so the hostname was gated
  before it ever resolved). `workers_dev` stays `false`. Linking it from the `ADMIN`-gated `/dev`
  page (`KMS_INTERNAL_URL`) is deferred to the dev-role view work (#60).
- **Separated the staging and production Neon databases** (`specs/2026-08-08-neon-db-separation/`,
  closes #56; ADR-004 slice 0). Staging and production no longer share one Neon project — each has
  its own, so a staging test can never read or mutate live production rows (environment isolation vs
  tenant isolation). Production stays on the original project untouched; staging moves to a fresh
  project (migrated by CI, seeded + demo accounts restored via `npm run demo:accounts -- add`).
  `docs/env-setup.md` documents the one-project-per-environment topology and fresh-DB bootstrap. This
  is the prerequisite before the `vendorId` multi-tenancy migration (slice 1).

### Added
- **Demo-accounts tool** (`specs/2026-08-08-demo-accounts-tool/`, closes #57). A standalone
  `scripts/demo-accounts.ts` (`npm run demo:accounts -- add|remove`) that adds/removes the demo login
  accounts (`demo-admin`/`demo-staff`/`demo-customer`, one per RBAC role) on demand against any
  environment via its `DIRECT_URL` — deliberately separate from `prisma/seed.ts` so demo accounts
  survive DB resets and stay in prod + staging until all phases complete.
  - Created **through Better Auth** (hashed, real sign-in) via a minimal **email-free** auth instance,
    with `role` set via a post-signup Prisma update (`role` is `input:false`) and `emailVerified`
    forced true — **no** verification email is ever sent. `add` is idempotent; `remove` cascades.
  - Password comes from `DEMO_ACCOUNT_PASSWORD` (never committed); `docs/env-setup.md` documents usage.
  - Groundwork for ADR-004 slice 0 (#56): restores demo accounts on the fresh staging Neon project.
- **Dev view — admin diagnostics page** (`specs/2026-08-07-dev-view/`, closes #41). A minimal
  ADMIN-gated `/dev` page — the safe core of the mockup's "Developer Control Toolbar", without the
  parts that would either expose secrets or switch to views that don't exist yet.
  - `app/(storefront)/dev/page.tsx` — gated with `requireRole("ADMIN")` (401 → `/login`; 403 →
    "administrators only", not the diagnostics). Real RBAC, not a client toggle.
  - `lib/dev-diagnostics.ts` — `getDevDiagnostics()` returns **non-secret** values only: the
    deployed commit and **configured-or-not booleans** per integration (Google/storage/email/CDN/
    `BETTER_AUTH_URL`), never a key value. Unit-tested, including an assertion that a sentinel
    secret never appears in the serialized output.
  - The page shows environment (derived from host), commit, integration ✓/✗ rows, the admin's own
    session, and a link to the KMS internal docs — or a "pending setup" note until `KMS_INTERNAL_URL`
    is set (the KMS internal site still needs DNS + a Cloudflare Access gate, a human task).
  - **Deliberately excluded**: any secret/API-key/webhook value, and view/role switching (deferred
    to P6, when the Staff/Admin panels it would switch to actually exist).

### Changed
- **Browse-page layout flipped (from live review).** Departments and filters swapped places:
  departments are now a **horizontal, icon-led strip across the top**, scrolled by ‹ › arrow
  buttons with the scrollbar hidden (`.no-scrollbar`) — a small `DepartmentScroller` client
  component (the arrows drive `scrollBy`; it degrades to native touch/trackpad scroll without JS).
  Search + filters moved into a **vertical left sidebar** (`ProductFilterForm` restyled to a stacked
  panel). Applies to the homepage, category, and search pages; the old vertical `CategorySidebar`
  is removed.
- **Storefront polish (from live review).** Delivery check broadened from Milton Keynes MK1–MK19 to
  **any MK postcode district** (MK1–MK99, e.g. MK24 — previously wrongly rejected); `lib/delivery.ts`
  regex + test + copy updated, and the precise per-vendor footprint is flagged as future DB config
  (ADR-004 / #49). The header **logo is cropped (whitespace trimmed) and enlarged** (`docs/logo.png`
  re-exported to `public/images/brand/logo.png`, 298×160, displayed `h-11` mobile / `h-16` desktop).
  **Mobile UI reworked to best practices**: the search bar (previously hidden below `sm`) now gets a
  dedicated full-width row on mobile; the header compacts (icon-only account/cart) instead of
  overflowing; the homepage departments became a **horizontal, icon-led, scrollable row**
  (Uber-Eats style) instead of a grid; and the category sidebar scrolls horizontally on mobile
  rather than burying products under a tall vertical list.
- **`/api/health` now reports the deployed commit** (`commit: "<short-sha>"`, `null` locally),
  giving a reliable way to trace a live environment back to its GitHub commit. Originally attempted
  via `wrangler deploy --tag/--message` (self-labeling the Cloudflare dashboard's Version History)
  — reverted after the first real `deploy-staging` run failed with `Unknown argument: request`.
  Root cause: an upstream Cloudflare limitation, not a quoting bug — `--tag`/`--message` are
  documented on `wrangler deploy` but broken for Static Assets deployments (which this Worker is,
  via OpenNext's `ASSETS` binding); see
  [workers-sdk#9611](https://github.com/cloudflare/workers-sdk/issues/9611) and
  [#10933](https://github.com/cloudflare/workers-sdk/issues/10933). `--dry-run` doesn't hit the
  broken path, so it looked fine locally before the real deploy caught it. Replaced with
  `--var GIT_COMMIT_SHA:$(git rev-parse --short HEAD)` (a stable, well-supported flag) read back via
  `lib/config.ts`'s newly-exported `readEnv()`.

### Fixed
- **KMS — internal docs site build broken by `CLAUDE.md`'s HTML comments.** PR #26 gave
  `CLAUDE.md` front-matter for the first time, which made `kms/scripts/assemble.ts` start
  including it in `deploy-docs-internal`'s build — but its `next dev`-regenerated
  `<!-- BEGIN/END:nextjs-agent-rules -->` markers are valid Markdown, not valid MDX (Nextra's
  compiler parses `<` as a JSX tag open and chokes on the following `!`). Can't fix at the source
  (that exact HTML-comment block is rewritten verbatim by `next dev`, see `CLAUDE.md` itself), so
  `assemble.ts` now rewrites `<!-- ... -->` to `{/* ... */}` for every doc at assembly time.
  Verified: `npm run build` in `kms/site-internal` now compiles clean.

### Added
- **Env-config CLI + multi-tenancy ADR (platform foundation)** — tooling and decision docs, no
  runtime change.
  - `scripts/configure-env.mjs` (`npm run configure-env -- <staging|production>`) configures every
    required secret for an environment in one command, routing each to the correct store —
    **GitHub environment secrets** (`CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`/`DIRECT_URL`, for
    CI) vs. **Cloudflare Worker secrets** (everything the app reads at runtime). Reads a gitignored
    `secrets/<env>.vars` (template: `secrets/example.vars`), validates all values are present, and
    pipes them via stdin so **no value ever appears in argv or logs**. `--dry-run` validates +
    shows routing without setting anything. Adds two required vars the original list omitted:
    `BETTER_AUTH_URL` (per-env origin) and `S3_REGION` (ADR-003). Documented in `docs/env-setup.md`
    (surfaced in the internal KMS).
  - **ADR-004 (draft)** — `specs/decisions/ADR-004-multi-tenancy.md`: the direction for a
    DB-driven multi-vendor platform (vendors/regions/branding as data, per-vendor theming over one
    business-logic/data layer), with open questions (tenant resolution, isolation model) to resolve
    before it's Accepted. Tracked by #49; also flags that **staging and production currently share
    one Neon database**.
- **P2.5b2 — Storefront visual redesign UI** (`specs/2026-08-07-p2-5b2-visual-ui/`), the UI half
  of P2.5b and the slice that closes the "live site is nowhere near the mockup" gap that opened
  P2.5 (closes #43). Applies P2.5b1's tokens/schema/seed to a real storefront matching the AI
  Studio mockup (`docs/ui-ref/`).
  - **Layout + header**: root `app/layout.tsx` drops the `max-w-2xl` body constraint that had
    silently narrowed every page since P2a; a new `app/(storefront)/layout.tsx` (`force-dynamic`,
    since it reads the session) hosts `components/layout/Header.tsx` — a **Server Component** (no
    client JS) with a promo bar, logo, GET search form, an auth-aware account control
    (`getSession()` → account link vs. "Sign in"), and an inert cart button (no count; no cart
    until P3). The layout adds no second `<main>` — pages keep their own.
  - **Hero homepage**: the M0 walking-skeleton `app/page.tsx` is removed and `/` is now served by
    `app/(storefront)/page.tsx` — a hero band, a data-driven department grid, and a postcode
    deliverability checker wired to P2.5b1's `isDeliverable()`. (`/api/health` is unchanged and
    remains the machine-readable health surface.) The checker lives on the hero, not the sticky
    header, because Next App Router layouts don't receive `searchParams` — only pages do.
  - **Redesigned `ProductCard`**: Halal/Fresh badges, a discount "Offer" badge + "Save £X" +
    strikethrough original price (derived from `originalPrice`), a star rating, `origin`, and an
    inert Add-to-Cart control. All brand colors come from semantic tokens (no raw hex); the gold
    rating star uses stock Tailwind `amber-400`, the one non-brand decorative color the design
    system already defers to Tailwind for.
  - **Category sidebar + speciality filters**: `components/layout/CategorySidebar.tsx`
    (presentational, receives categories as props) renders on the category and search pages;
    `ProductFilterForm` gains Halal/Fresh/Organic checkboxes wired to P2.5b1's real filter fields,
    with both pages parsing the params, passing them to the repository, and carrying them through
    pagination.
  - **Two data-layer additions surfaced during Orient** (not pure UI, so called out): (1)
    `ProductSummary`/`ProductDetail` now expose `averageRating`/`reviewCount` — P2.5a denormalized
    these *for the cards* but no read path ever selected them; (2)
    `components/product/category-icon.ts` maps a category slug to a lucide icon with a **generic
    default fallback**, so a category added to the DB later still renders an icon without a schema
    `iconName` field (honors the "auto-size to more categories" requirement).
  - **Dynamic-sizing / performance / auth** (explicit human requirements on #43): every grid and
    sidebar renders straight from `.map()` over DB results — no hardcoded 8-category/16-product
    counts; loading stays Server-Component + keyset-paginated (P2b's cursor pattern, reused); the
    header reflects real auth state, no mock.
  - **Deliberately excluded**: cart/Add-to-Cart wiring (P3), the Dev Control Toolbar (#41),
    `next/image`, a `Category.iconName` field, real photography, and a homepage "featured products"
    rail (no backing data — no featured field or list-all method exists yet).
  - **Post-preview adjustments** (from reviewing the running preview): the delivery area moved from
    Leicester (LE1–LE5) to **Milton Keynes (MK1–MK19)** — `isDeliverable()`, its test, and all
    locality copy (header/hero/metadata); the header now uses the **real logo** (`docs/logo.png`
    resized to `public/images/brand/logo.png`) in place of the "A" placeholder; and `globals.css`
    now forces `color-scheme: light` with an explicit white background + brand-ink text — a
    dark-mode browser was painting a dark canvas, making dark text on the transparent category
    cards unreadable.
- **P2.5b1 — Visual redesign foundation** (`specs/2026-08-07-p2-5b1-visual-foundation/`), first of
  two P2.5b slices (issue #40), split from a single oversized slice so tokens/schema/seed could be
  validated before P2.5b2's UI work (issue #43) consumes them.
  - **Design tokens**: `design-system/tokens/tokens.css` gains three tint primitives
    (`#E8F5E9`/`#FFF3E0`/`#FFEBEE`, confirmed against both the brand kit and the mockup's own
    `index.css`) as `--color-action-tint`/`--color-accent-tint`/`--color-danger-tint` — named
    relative to their base color, matching the existing hover/active-shade convention rather than
    inventing generic "success/warning" status vocabulary. `specs/design-system.md` (v1.1.0) also
    documents the brand kit's type scale as Tailwind utility mappings and resolves its two
    long-open items: real logo source (`docs/logo.png`, now committed) and red's dual role
    (alert/danger **and** sale-badge color, confirmed via the mockup's `ProductCard.tsx`).
  - `lucide-react` added — the mockup's actual icon library, not a guessed choice.
  - **Prisma**: `Product` gains `origin` (String?), `originalPrice` (Int? pence — a discount badge
    is derived from the gap to `basePrice` at render time, not a separate boolean that could drift),
    and `isHalal`/`isFresh`/`isOrganic` (Boolean, default false). `lib/repositories/products.ts`'s
    `ProductFilters`/`ProductSummary`/`ProductDetail` extended to match; `search()` and
    `listByCategory()` both route through the same `buildFilterWhere()`, so the three new filters
    behave identically from either entry point — no divergent behavior to maintain.
  - **Seed**: adds 6 categories (halal-meat, groceries, international, beverages, snacks,
    household) and 12 products, bringing the catalogue to 9 categories / 18 products — covers the
    mockup's 8 real departments plus the existing `bakery` (which the mockup doesn't have and isn't
    being removed; content parity matters more than exact slug parity with already-live URLs).
    **Bug caught mid-build**: the original seed script's idempotency check was a single
    `category.count() > 0` gate — since the existing 3 categories already exist in every
    environment, it would have silently skipped all 6 new categories forever. Rewritten to check
    per-category by slug, so partial catalogues extend correctly instead of getting stuck. New
    product images go through the same real `putObject()` storage round-trip as P2a's seed, never
    an external URL.
  - `lib/delivery.ts` — pure `isDeliverable()`, checks a postcode's LE1–LE5 (Leicester) prefix,
    case/whitespace-tolerant. No persistence; P3's checkout decides what to do with the result.
  - **Fixed while validating**: `docs/ui-ref/` (the mockup's committed reference source, its own
    separate Vite/React project) was never excluded from this repo's root `eslint.config.mjs`/
    `tsconfig.json`, so both `lint` and `tsc --noEmit` failed on code that isn't part of this app at
    all. Excluded, matching the existing pattern for `kms/site-internal`/`kms/site-public`.
  - **Corrected during build**: `requirements.md`/`plan.md` originally said "5 new categories...
    8 total" while separately listing 6 category names — an arithmetic slip, not a scope change.
    Fixed to 6 new / 9 total (12 new products / 18 total) before implementing, matching the
    enumerated list and the "add every mockup category we're missing" rationale that was always
    the actual intent.
  - **Deliberately excluded**: any layout/component/visual application of these tokens — P2.5b2
    (issue #43). Real product photography remains deferred per P2a's original note.
- **P2.5a — Ratings & reviews backend** (`specs/2026-08-07-p2-5a-ratings-reviews/`), first slice
  of P2.5 — a phase inserted into the roadmap after P2's close (closes #39, see `specs/
  roadmap.md` v1.2.0 for why: comparing the live site against the project's own AI Studio design
  mockup surfaced that ratings/reviews were never in the original P0–P8 plan at all).
  - **Prisma**: `Review` (one per user per product via `@@unique([userId, productId])` —
    resubmitting updates rather than duplicates; cascade-deletes with the user, matching
    `Session`/`Account`'s existing pattern). `Product` gains denormalized `averageRating`/
    `reviewCount`, recomputed from a full aggregate (not incremental, avoids float drift) inside
    the same transaction as every review write — matches `Inventory.quantity`'s existing
    denormalized-for-read-performance precedent, needed because ratings render on every
    paginated product-grid card.
  - `lib/repositories/reviews.ts` — `upsert`/`delete` (ownership-checked via a single atomic
    `deleteMany({ id, userId })`, not a read-then-check), `listByProduct`, `getByUserAndProduct`
    (pre-fills the submission form for a returning reviewer).
  - `features/reviews/` — **the first real use of `features/` since auth**, and for the same
    underlying reason: a genuine session-gated write use-case, unlike P2's read-only browsing
    which correctly stayed in `components/product/`. Two Server Actions
    (`submit-review.ts`/`delete-review.ts`) behind a plain `<form>` — no client component, same
    progressive-enhancement pattern as P2's GET forms.
  - `features/reviews/validate-rating.ts` — pure, unit-tested `parseRating()`, same pattern as
    `parse-price-input.ts`.
  - `app/(storefront)/products/[slug]` extended with a review list, the submission form for
    logged-in visitors, and a login prompt (not a redirect) for guests — browsing stays
    guest-accessible, no regression.
  - **Deliberately excluded**: review moderation (fits P6's admin panel better), verified-purchase
    gating (impossible before P3/cart exists), review-list pagination (bounded to the most recent
    20 for now), any visual/component redesign — all P2.5b (#40), once this lands.
- **P2b — Catalogue search & filters** (`specs/2026-08-07-p2b-catalogue-search/`), second and
  final P2 slice, closing out P2 (closes #34).
  - `lib/repositories/products.ts` gains `search()` (global, across all categories, same keyset
    cursor pagination as `listByCategory()`) and a shared `ProductFilters` shape
    (`minPricePence`/`maxPricePence`/`inStockOnly`) used by *both* `search()` and
    `listByCategory()` — one filter definition, not two parallel ones. Search matching is plain
    Postgres case-insensitive `contains` on `name`/`description` — `specs/architecture.md`
    explicitly defers a trigram index or a dedicated search service until the catalogue actually
    grows; this slice fulfills what was already decided there, doesn't reopen it. An
    empty/whitespace query returns no results, not the whole catalogue.
  - `app/(storefront)/search` — new route. `app/(storefront)/categories/[slug]` extended (not
    replaced) to accept the same price/availability filters.
  - `components/product/ProductFilterForm.tsx` — one shared component for both routes, a plain
    `<form method="GET">` with no client-side JS, matching P2a's zero-client-JS precedent
    (`<Link>`-based pagination). No hidden cursor field, so a filter change naturally restarts
    pagination at page 1.
  - `components/product/parse-price-input.ts` — pure, unit-tested counterpart to P2a's
    `formatPrice()`: parses a user-typed pounds string into integer pence for the repository
    layer, `undefined` (not `0`) for blank/invalid/negative input.
  - **Corrected assumption from `/propose`**: expected this slice would finally give
    `features/catalogue/` real content (client-side search interactivity). Didn't hold up — a
    plain GET form matches P2a's established pattern better than debounced client search, so
    `features/catalogue/` is still just `.gitkeep` after P2 in full.
  - **Deferred, not implemented**: typo-tolerant/fuzzy search. Real fuzzy matching needs
    `pg_trgm` and Prisma has no native wrapper for its `similarity()`/`%` operator, so it would
    mean both a new Postgres extension and `$queryRaw` (against `CLAUDE.md`'s no-raw-SQL rule) —
    and it's exactly the trigram work `specs/architecture.md` already defers until the catalogue
    grows past its current 6 placeholder products. Not a quick add; left flagged for whenever
    that condition is actually met.
  - `specs/roadmap.md`'s change log gains the **P2 closure entry**, and — noticed while adding
    it — **P0 and P1 never got their own closure entries either**, despite both being long done;
    backfilled retroactively (v1.1.0) so the log reads as a coherent history instead of jumping
    from M0 straight to P2.
- **P2a — Catalogue browsing** (`specs/2026-08-07-p2a-catalogue-browsing/`), first slice of P2.
  Split from the full roadmap line — search & filters follow separately as P2b (issue #34), same
  split pattern as P1a/P1b.
  - **Prisma**: `Category` (self-referential, slug/name/sortOrder/isActive), `Product`
    (slug/name/description/categoryId/basePrice pence/unitLabel/isActive), `ProductImage`
    (relative `storageKey` only, never a URL), `Inventory` (quantity/lowStockThreshold) — matches
    the representative schema already designed in `specs/architecture.md` §3.2. Migration applied
    directly to Neon staging (same pattern P1a used).
  - `lib/repositories/categories.ts` / `products.ts` — `CategoryRepository`/`ProductRepository`
    ports + Prisma implementations, constructed fresh per call (never cached across requests, same
    contract as `lib/db.ts`'s `getPrisma()`). Flat files, not a directory per domain — follows the
    flat-file precedent P1a set (`lib/auth.ts`) over `docs/repo-structure.md`'s stale sketch.
  - Keyset (cursor) pagination on product listings — cursor `(createdAt, id)`, never `OFFSET`, per
    `specs/architecture.md`'s pagination strategy.
  - `app/(storefront)/categories`, `/categories/[slug]`, `/products/[slug]` — category index,
    paginated product grid, product detail page. All publicly reachable, no auth regression.
  - **Bug caught by `npm run build`, not local `next dev`**: `/categories` (no dynamic segment) was
    getting statically optimized at build time — Next.js tried to prerender it in plain Node, but
    `lib/db.ts` loads Prisma via `@prisma/client/wasm`, which only works in the Workers runtime,
    so the build hard-failed (`Unknown file extension ".wasm"`). Same root cause as P1b's
    `/login`/`/register` fix; same fix here — `export const dynamic = "force-dynamic"` on all three
    new routes. Also means `specs/architecture.md`'s "Data Cache/ISR for catalogue pages" can't be
    Next's own SSG-based ISR while Prisma requires the Workers runtime — any caching for these
    pages needs to happen at Cloudflare's edge-cache layer instead, not attempted in this slice.
  - `components/product/` — `ProductCard`, `ProductImageGallery`, and a pure, unit-tested
    `formatPrice(pence)` helper (`450` → `"£4.50"`) — same pure-helper-alongside-I/O-code pattern
    as `lib/storage.ts`'s `composePublicUrl`.
  - Product images resolved via the existing `composePublicUrl(CDN_BASE_URL, storageKey)` — no raw
    R2/S3 URL ever rendered or stored.
  - `prisma/seed.ts` extended: seeds placeholder categories/products (real Aheed product data
    doesn't exist yet) and actually uploads a placeholder SVG through `lib/storage.ts`'s
    `putObject()` for each product image, proving the real storage round-trip. Uploads all images
    before writing any DB rows, and writes all rows in a single `prisma.$transaction` — found while
    validating locally: a mid-run failure (wrong/missing storage credentials) otherwise left an
    orphaned `Category` with zero `Product`s, which then silently broke the seed script's own
    idempotency check (`Category` count `> 0` → skip) on every subsequent run.
  - **Infra fix, found validating images against the real staging CDN domain**: R2's custom
    domain (`images.staging.aheedfoodcentre.nocaped.com`) was returning a Cloudflare
    `Cf-Mitigated: challenge` 403 on every request — confirmed via both a cookie-less `curl` and,
    once the browser extension was available, a real Chrome `<img>` tag load (broken-image icon),
    ruling out "just a bot-detection false positive." Turning off Bot Fight Mode alone didn't fix
    it; the actual cause was the zone's **Security Level** (Security → Settings), which issues a JS
    challenge independently of Bot Fight Mode. Lowered for this zone; re-verified 200 via both
    `curl` and a real browser afterward. Worth checking Security Level on **production**'s zone
    too before promoting, not just staging's.
  - **Still needed from the human before this is live end-to-end on production**: the same
    `S3_*`/`CDN_BASE_URL` Worker secrets confirmed on staging still need setting on production, and
    the Security Level check above repeated for production's zone.
  - Two persistent docs corrected against what this slice actually found, not just noted in this
    changelog entry: `specs/architecture.md`'s Caching section (the Data Cache/ISR claim above,
    v1.1.0) and `docs/repo-structure.md`'s `lib/` tree (flat files for single-adapter concerns —
    `db.ts`, `storage.ts`, `auth.ts`, `email.ts`, `config.ts` — vs. a real directory only for
    `lib/repositories/`, which genuinely holds multiple per-domain files; v1.1.0). The latter had
    already been contradicted once by P1a's `lib/auth.ts` without the doc being fixed — fixed now
    instead of deferring a third time.
- **`docs/onboarding.md` refreshed** — was still framed around M0-only ("Feature work (P0+) starts
  only after M0 is green"), badly stale now that M0/P0/KMS/design-system have shipped and P1a is
  in flight. Updated: current phase status (pointing at `specs/roadmap.md`'s change log as the
  source of truth, not duplicating it), `.env` vs `.dev.vars` distinction, the `npm run preview`
  vs `npm run dev` DB-touching gotcha surfaced immediately rather than buried in `CLAUDE.md`, the
  seven-stage SDD workflow + slash commands, and a pointer to the internal docs site. Verified no
  real duplication with `kms/site-internal/`'s content — that site auto-assembles from `specs/`,
  `docs/`, and `CLAUDE.md` (confirmed all 20 backfilled docs, including this one, assemble
  correctly), nothing hand-duplicated there. Its one stale line (`content/dev/index.mdx` said
  pages were "populated once those docs carry real front-matter" — no longer true post-backfill)
  fixed to point at the now-real content instead.
- **SDD — backfill missing `plan.md` files + prevent future drift.** 4 slices had drifted to a
  two-file (`requirements.md`/`validation.md`) pattern, missing `plan.md` — unintentional; started
  with the design-system slice and got entrenched when `specs/sdd-workflow.md`'s own `/spec` stage
  only mentioned the other two. Fixed:
  - `specs/templates/feature-spec/{plan,requirements,validation}.md` — scaffolded for the first
    time (`docs/repo-structure.md` documented this directory but it never existed), so future
    slices copy a real template instead of improvising from "the most recent slice."
  - `plan.md` backfilled for `design-system`, `kms-backfill`, `kms-gates`, `kms-site` — the
    narrative (goal, scope, deliberately-excluded, rationale) that front-matter now lives on,
    moved off `requirements.md` to match the established one-entry-per-slice precedent.
  - `kms/schema/repo.ts`'s `walk()` now excludes `specs/templates/` — the template's placeholder
    front-matter (`id: REPLACE-ME-...`) would otherwise hard-fail `kms:validate` once gate-wired.
  - `specs/sdd-workflow.md` and `.claude/commands/spec.md` now require all three files for every
    new slice, not just two.
  - `specs/2026-08-06-p1-auth/plan.md` lands separately, directly on PR #24's branch (doesn't
    exist on `staging` yet).
- **KMS — front-matter backfill** (`specs/2026-08-06-kms-backfill/`), closing the last deferred
  item from the KMS foundation slice (`specs/2026-08-06-kms/requirements.md` R8).
  `ARTIFACT_INDEX.md` now indexes 19 docs instead of 1: `CLAUDE.md`, all three `docs/*.md`, the 9
  persistent `specs/` docs (architecture, mission, roadmap, tech-stack, design-system,
  sdd-workflow, and the 3 ADRs), and one representative file per dated slice folder. Matches the
  precedent already set by `specs/2026-08-06-kms/plan.md`: one indexed entry per meaningful
  doc/slice, not every acceptance-criteria file — sibling `requirements.md`/`validation.md` files
  stay deliberately un-indexed. `specs/2026-08-06-p1-auth/requirements.md` is excluded from this
  slice (doesn't exist on `staging` yet, only on PR #24) — its front-matter lands with that PR
  instead.
- **P1b — Google Sign-In** (`specs/2026-08-06-p1b-google-signin/`), closing out P1's auth line on
  top of P1a below. Unblocked by the human provisioning the Google Cloud Console OAuth client and
  setting `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` as Cloudflare secrets on both `staging` and
  `production` (issue #28) — the one credential P1a's proposal had deferred as P1b.
  - `lib/auth.ts` — new exported pure `buildSocialProviders(env)`: returns a
    `socialProviders.google` block only when both credentials are present, `undefined` otherwise
    (never a half-configured provider). Split out specifically so it's unit-testable —
    `getAuth()` itself has no tests, since it depends on `getPrisma()`. `emailAndPassword`
    unchanged. No new Prisma migration — Google sign-ins land in the `Account` table P1a already
    created, and get `role: CUSTOMER` via the same Prisma default as email/password sign-up.
  - `lib/config.ts` gains `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, both optional (same
    degrade-not-crash pattern as `RESEND_API_KEY`) — documented in `.env.example` and
    `.dev.vars.example`.
  - `features/auth/components/GoogleSignInButton.tsx` — one shared "Continue with Google" control
    for both `/login` and `/register` (Better Auth's social sign-in creates an account on first
    use, so login and register need the same control, not two).
  - **Bug caught by `npm run build`'s route table, not local `next dev`**: `/login`/`/register`
    were being statically prerendered, which would have baked the Google-button visibility check
    in at *build* time — but `wrangler secret put` values only exist at Worker *request* time, so
    the button would have silently never rendered in production regardless of the secrets being
    set. Fixed with `export const dynamic = "force-dynamic"` on both pages (same pattern
    `/account` already uses).
  - **Deliberately incomplete**: the actual Google consent-screen flow can't be exercised against
    `npm run preview` locally — the OAuth client's redirect URIs are only registered for
    `staging`/`production`, not `localhost`. Verified as far as possible locally (the button
    renders/hides correctly, and `POST /api/auth/sign-in/social` returns a correctly-built Google
    authorization URL with the right `client_id`/scopes/PKCE challenge/redirect URI); the actual
    consent screen + callback need a real sign-in against a deployed environment before this is
    fully confirmed end-to-end.
- **P1a — `plan.md`** added (`specs/2026-08-06-p1-auth/plan.md`) — part of backfilling the
  `plan.md` file every slice is now required to have (issue #27); this one lands directly on this
  branch since the spec folder doesn't exist on `staging` yet.
- **P1a — Email/password auth, RBAC, account shell** (`specs/2026-08-06-p1-auth/`), split from the
  full P1 roadmap line since Google Sign-In needs a Google Cloud Console OAuth client only the
  human can create (tracked as P1b, issue #23):
  - **Prisma**: `User` (`role` enum — `CUSTOMER`/`STAFF`/`ADMIN`, default `CUSTOMER`), `Session`,
    `Account`, `Verification` — Better Auth's standard relational shape, no `Json` columns,
    explicit FKs. Migration applied directly to Neon staging (`prisma migrate dev` — confirmed
    with the user, no separate local Postgres exists); CI's `prisma migrate deploy` no-ops on it.
  - `lib/auth.ts` — Better Auth server instance (Prisma adapter, email/password, required email
    verification, password reset). `role` added via `additionalFields` with `input: false` so a
    signup request can never set its own role. No Google/OAuth provider — P1a is email/password
    only. `lib/auth-rbac.ts` — `requireRole()` gates a route/action to one or more roles, returning
    401/403 (never a silent pass-through) rather than throwing.
  - `lib/email.ts` — new `EmailService` port + Resend adapter via plain `fetch` (no SDK, same
    Workers-bundle-size reasoning as `lib/storage.ts`'s `aws4fetch` choice). Degrades to a logged
    no-op, not a crash, when `RESEND_API_KEY` is unset.
  - `app/api/auth/[...all]/route.ts`, and UI under a new `app/(storefront)/` route group:
    `/login`, `/register`, `/forgot-password`, `/reset-password`, a protected `/account` shell.
  - **Prerequisite fix, found stress-testing this slice against the real Workers runtime**
    (`npm run preview`, not `next dev` — see below): `lib/db.ts`'s `getPrisma()` cached a Prisma/
    Neon client across requests, which Cloudflare Workers forbids (I/O objects can't cross request
    boundaries) — rapid sequential requests failed ~1-in-3 times with `"Cannot perform I/O on
    behalf of a different request."` Pre-existing since M0 (affects `/api/health` too, just never
    caught — validation never hammered it with back-to-back requests). Fixed: `getPrisma()` and
    `getAuth()` now construct fresh per call rather than caching across requests, matching Neon's
    own recommended pattern for serverless/edge. Stress-tested clean afterwards.
  - `eslint.config.mjs` now excludes `.wrangler/**` (missed alongside `.next/**`/`.open-next/**` —
    running `npm run preview` locally left bundled worker output that `npm run lint` was linting
    as source, producing dozens of bogus errors from third-party code).
  - **Gate 3 fix, found validating locally against the `gates` CI job's actual env**: `lib/email.ts`'s
    `getEmailService()` called the shared `getEnv()`, which requires `DATABASE_URL`/
    `BETTER_AUTH_SECRET` — unrelated to email — so `tests/email.test.ts` failed in any environment
    without those two set (including CI, which never provides them for the test step). Split a
    narrow `getEmailEnv()`/`emailSchema` out of `lib/config.ts` covering only
    `RESEND_API_KEY`/`RESEND_FROM_EMAIL`; `getEmailService()` now depends on that instead.
  - **Still needed from the human before this is live end-to-end**: `RESEND_API_KEY` (a Resend
    account/key — verification and password-reset emails currently log-and-skip, don't send) and
    `BETTER_AUTH_SECRET`/`RESEND_API_KEY` set via `wrangler secret put` on staging/production.
  - **Discovered while validating, not fixed (documented for awareness)**: `@prisma/client/wasm`
    cannot load under plain `next dev` (Node.js runtime, not workerd) — any DB-touching route
    silently shows an error state under `npm run dev`. Always use `npm run preview` (OpenNext +
    local Workers runtime) to validate DB-touching code; `next dev` is UI-only from now on.
- **KMS — gate wiring** (`specs/2026-08-06-kms-gates/`), closing the last deferred item from the
  KMS design (`specs/2026-08-06-kms/plan.md` §2, `requirements.md` R8). `gates.yml` now runs
  `kms:validate` and an `ARTIFACT_INDEX.md` staleness check (regenerated and diffed with the
  `Last build:` timestamp normalized out, so the check is meaningful rather than always failing).
  Includes two prerequisite bug fixes found while grounding — wiring the validator as originally
  sketched would have broken every future PR:
  - `kms/schema/repo.ts`'s `walk()` now excludes `kms/site-*/content/` (assembled/generated site
    output) — it was indexing the same doc twice (source path + assembled copy) and wasn't even
    deterministic in CI, since that gitignored directory doesn't exist on a fresh checkout.
  - `kms/schema/validate.ts` now distinguishes "no front-matter" from "front-matter present but
    missing `visibility`" (the schema's own required, no-default field) — the latter is reported
    informationally, not hard-failed. Fixes false-positive failures on `.claude/commands/*.md`
    (Claude Code's own `description:` frontmatter) and Nextra's `title:`-only stub pages.
- **SDD workflow, generalized as keywords + slash commands** (`specs/sdd-workflow.md`,
  `.claude/commands/`). Expands CLAUDE.md's four gates (Propose/Spec/Validate/Changelog) into seven
  stages — **Orient → Propose → Spec → Build → Validate → Document → Ship** — each also an
  invokable slash command, generalized from patterns and failure modes actually hit running the
  process across the KMS and design-system-tokens slices (stale planning-doc traps, Windows
  `core.autocrlf` giving false `prettier --check` positives against real CI, PRs merging before a
  fast-follow commit landed, a Gate-4 CHANGELOG check whose diff base moves between pushes).
  `CLAUDE.md`'s gate section now points to it.
- **P0 — Design-system tokens** (`specs/design-system.md`, `specs/2026-08-06-design-system/`),
  closing the last item deferred from the P0 foundation slice below. Encodes the Aheed brand kit
  as real tokens rather than leaving Tailwind uninstalled:
  - Tailwind CSS v4, CSS-first `@theme` config (no `tailwind.config.ts` — v4's own recommended
    default; `docs/repo-structure.md`'s sketch of a JS config is stale, same as its now-wrong P6
    tag on `tsconfig.json`).
  - `design-system/tokens/tokens.css` — primitive brand-kit colors (`--color-brand-*`) layered
    under semantic tokens (`--color-primary`/`--color-action`/`--color-accent`/`--color-danger`/
    `--color-surface-muted`) plus radius tokens, so components read the semantic layer, never a
    raw hex. Two hover/active shades are derived (not brand-sourced) and commented as such.
  - Poppins loaded via `next/font/google` (self-hosted at build, no runtime request — matters on
    Workers), one family at two weights (400/600), not two families.
  - `app/globals.css`/`app/page.tsx` restyled with the tokens to prove they flow live, not just
    sit as unused config; the old hand-rolled `.card`/`.ok`/`.bad` CSS is gone.
  - Deliberately deferred: real logo source files (the brand kit is a reference image, not
    exportable assets), `components/`/`design-system/{components,patterns,pages,guidelines}/`
    (nothing consumes tokens yet), dark mode, and the hex/px-banning eslint rule (P6-tagged).
- **P0 — Foundation & scaffolding (first slice).** Hardens what M0 proved, scoped to what wasn't
  already built during M0's infrastructure work (`specs/2026-08-06-p0-foundation/`):
  - Local SDD git hooks (`hooks/pre-commit` — Gate 2 spec-before-code, `hooks/pre-push` — Gate 4
    changelog-before-merge), activated by the `core.hooksPath` wiring `scripts/bootstrap.sh`
    already had. Fast local feedback only — `gates.yml` in CI remains the real enforcement.
  - Prettier (`.prettierrc.json`, `.prettierignore`, `npm run format`/`format:check`), wired into
    `gates.yml`. Deliberately excludes `.md`/`.mdx` — Prettier's markdown table reformatting pads
    every cell to align columns, which wrecks readability on long-prose cells.
  - `app/robots.ts`, `app/sitemap.ts`, `app/manifest.ts` — the Next.js App Router convention for
    SEO/PWA metadata (route files under `app/`, not static files under `public/`). `robots.ts` is
    host-aware: only the production domain allows crawling, staging always disallows. No brand
    icon assets exist yet, so `manifest.ts` ships an empty `icons` array rather than fabricated
    placeholders — a real follow-up needing actual brand input.
  - `tests/setup.ts`, wired into `vitest.config.mts`'s `setupFiles` — loads `.env` for tests that
    read `process.env`.
  - Deliberately out of scope: design-system tokens (no `specs/design-system.md` spec exists yet),
    `lib/repositories/` (nothing to wrap until P1's catalogue models exist), and GitHub
    branch-protection rules on `main`/`staging` (a real gap, flagged as a follow-up recommendation).
- **KMS — front-matter schema & validator (foundation slice).** First piece of the knowledge-
  management system design (`specs/2026-08-06-kms/plan.md`): `kms/schema/frontmatter.ts` (the Zod
  contract — `id`, `title`, `audience`, `type`, `status`, `version`, `updated`, `visibility`,
  `summary`, `tags`; `visibility` has no default, so a doc can never silently become public) and
  `kms/schema/validate.ts` (`npm run kms:validate` — walks all `.md`/`.mdx`, hard-fails on invalid
  front-matter, warns on missing front-matter without blocking). `ARTIFACT_INDEX.md` moved to the
  repo root per the design's folder structure. Deliberately deferred to follow-up work: the index
  generator, the internal/public site assembly, CI gate wiring, and backfilling front-matter onto
  existing docs — see `specs/2026-08-06-kms/requirements.md` R8.
- **KMS — index generator, assembly & internal site** (`specs/2026-08-06-kms-site/`), the deferred
  follow-up to the schema/validator foundation slice above:
  - `kms/scripts/build-index.ts` (`npm run kms:build-index`) walks front-matter docs and regenerates
    `ARTIFACT_INDEX.md` grouped by track; deterministic output aside from its `Last build:` timestamp.
  - `kms/scripts/assemble.ts --visibility internal|public` (`npm run kms:assemble:internal`/`:public`)
    copies single-source docs into a site's `content/` by `visibility`, so doc bodies are never
    duplicated by hand. Both scripts share new `kms/schema/repo.ts` (walk/parse helpers factored out
    of `validate.ts`).
  - `kms/site-internal/` — a standalone Next.js + Nextra 4 app (own `package.json`, own toolchain,
    excluded from the root's lint/typecheck via `eslint.config.mjs`/`tsconfig.json`) serving
    assembled docs under `/dev`, with `/staff` stubbed. Its `wrangler.toml` targets a separate Worker
    (`aheed-kms-internal`) with `workers_dev = false` and the custom-domain route commented out —
    not internet-reachable until the human provisions DNS + a Cloudflare Access application gating it
    (zero-trust; the site has no auth of its own).
  - `.github/workflows/deploy-docs-internal.yml` mirrors `deploy-staging.yml`'s build-then-deploy
    pattern, triggered on push to `staging`/`main`. Safe to run before Cloudflare-side provisioning
    exists (no public route to expose), but won't do anything useful until it does.
  - The public site (track 3) stays stubbed — no storefront exists yet to document.
### Milestone
- **M0 — Walking Skeleton closed.** `/api/health` returns `db.ok: true` on both staging and
  production; `gates`, `deploy-staging`, and `deploy-production` all green end-to-end. Proceeding
  to P0 per `specs/roadmap.md`.

### Fixed
- `kms/scripts/assemble.ts`, `kms/scripts/build-index.ts`, `kms/site-internal/tsconfig.json`
  reformatted to satisfy `prettier --check` — missed locally because a Windows checkout
  (`core.autocrlf=true`) masks real formatting diffs behind line-ending noise; `gates` runs on
  Linux/LF and caught it. No logic changes. (Landed on `staging` via PR #10; this entry was
  originally missed there — see #11.)
- **M0 infrastructure fixes to actually reach `db.ok: true` in production:**
  - `PrismaNeon` adapter takes a `PoolConfig` (`{ connectionString }`), not a `Pool` instance.
  - `prisma/schema.prisma` generator now sets `engineType = "client"` — the default `"library"`
    engine calls `fs.readdir` at runtime, unsupported by workerd's `nodejs_compat` polyfill.
  - `lib/db.ts` imports `PrismaClient` from `@prisma/client/wasm` explicitly, not the bare
    `@prisma/client` specifier — Next's Node-based build tracer otherwise resolves the `"node"`
    export condition (`fs.readFileSync`-based loader) even though the code runs in workerd.
  - `package-lock.json` resynced with `package.json` (`npm ci` was failing in CI); restored the
    `allowScripts` allowlist needed for native postinstall scripts under npm 11+.
  - Wired up the GitHub Actions deploy pipeline: created the missing `staging` environment,
    populated `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`/`DIRECT_URL` secrets on both
    environments, set the Worker's own runtime `DATABASE_URL` secret (`wrangler secret put`),
    enabled R2 and created the image buckets. Disabled the competing Cloudflare Workers Builds
    git integration, which was misconfigured (wrong build command, no `--env`, skipped migrations)
    and racing against the correct GitHub Actions pipeline.

### Changed
- **Upgraded to Next 16 / vitest 4** (deliberate major-version adoption, not incremental):
  - `next lint` (removed in Next 16) replaced with plain `eslint .`; migrated `.eslintrc.json` to
    flat config (`eslint.config.mjs`) using `eslint-config-next/core-web-vitals`.
  - `dev`/`build` scripts pin `next ... --webpack` — Turbopack (Next 16's default) can't resolve
    `@prisma/client/wasm`'s subpath export (`Module not found`), even though webpack and the
    package's `exports` map both handle it fine.
  - `vitest.config.ts` → `vitest.config.mts` (vitest 4's native config loader warns on ESM syntax
    in a file loaded as CommonJS).
  - `tsconfig.json`: `jsx` → `"react-jsx"` (Next 16 requires the automatic runtime); added
    `.next/dev/types/**/*.ts` to `include`.
  - Restored `@neondatabase/serverless` to an exact pin (`0.10.4`, no caret) and
    `@opennextjs/cloudflare` to `^1.20.2` — both had drifted to older/looser ranges outside this
    change.

### Added
- **Milestone 0 — Walking Skeleton.** Minimal end-to-end app to validate the pivoted
  infrastructure before feature work: `HealthCheck` model, `/` page and `/api/health` route that
  read it back through Prisma → Neon.
  - Next.js on **Cloudflare Workers** via `@opennextjs/cloudflare` (`open-next.config.ts`,
    `wrangler.toml` with `staging`/`production` envs + custom domains + `nodejs_compat`).
  - `lib/config` (zod env with `getCloudflareContext()` fallback), `lib/db` (Neon serverless driver
    adapter, lazy singleton), `lib/storage` (S3-compatible port via `aws4fetch`, keys-not-URLs).
  - GitHub Actions: `gates.yml` (lint/typecheck/test + CHANGELOG check), `deploy-staging.yml`
    (auto), `deploy-production.yml` (manual approval via `production` environment). Migrations run
    in CI against `DIRECT_URL`; runtime uses pooled `DATABASE_URL`.
  - SDD assets: feature/bug issue forms, PR template, gate labels; M0 spec
    (`specs/2026-08-05-m0-walking-skeleton/`) and `docs/walking-skeleton-runbook.md`.
- SDD constitution + `specs/architecture.md` (Cloudflare Workers + Neon design, migration strategy).

### Changed
- Roadmap now begins with **Milestone 0 (Walking Skeleton)** ahead of P0, so infrastructure is
  proven end-to-end before scaffolding features.
- Hosting pivoted from GCP Cloud Run + Cloud SQL to **Cloudflare Workers + Neon** (revised ADR-001);
  object storage via the **S3-compatible API only** (ADR-003).

### Notes
- No feature code beyond the skeleton. Auth, catalogue, cart, checkout, and the design system
  arrive in P1+ behind their specs and gates.
