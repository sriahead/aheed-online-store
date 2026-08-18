---
id: gap-register-audit
title: Master Application Gap Register
audience: [dev, staff]
type: doc
status: approved
version: "2.2.0"
updated: 2026-08-18
visibility: internal
summary: The single master gap register for the application — every GAP-ID in the repo, its severity, its current status and the artifact that proves it, reconciled against the code rather than against itself.
tags: [gap-register, audit, orient, master]
related: [gap-register, self-review-report, p6-5-residual-validation-plan, catalogue-debt-bucket-plan]
---

# Master Application Gap Register

**This is the single master register.** Every GAP-ID in the repository lives in the table below.
`docs/sdd/self-review/GAP-REGISTER.md` (the P6.5 audit's own file) previously held GAP-001..004 in a
second table using the same ID space; it now keeps its P6.5 narrative and points here.

> **A row's `Status` is a claim about the code, and this register has been wrong about that before.**
> See the reconciliation note below for what the 2026-08-17 audit found and changed.

| GAP-ID | Category | Title | Severity | Root Cause | Status |
|---|---|---|---|---|---|
| GAP-001 | Security / Tenancy | IPv6 loopback host truncation in `lib/tenant.ts` | **P1** | `.split(":")[0]` truncated bracketed IPv6 literal hosts (`[::1]:8787` → `[`). | Fixed |
| GAP-002 | Security / Auth | Local preview sign-in origin mismatch (#176) | **P1** | Port stripped from the Host header and `wrangler dev`'s default `x-forwarded-proto` trusted over loopback HTTP. | Fixed |
| GAP-003 | Frontend / UI | Unstyled fallback 404 page | **P2** | No `app/not-found.tsx` existed. | Fixed |
| GAP-004 | KMS Docs | `ARTIFACT_INDEX.md` staleness | **P3** | Index not rebuilt after front-matter edits. | Fixed |
| GAP-005 | Operations / Email | Resend Unverified Custom Domain (#104) | **P1** | No verified domain configured in Resend account, preventing delivery emails from reaching real customer inboxes. | Open |
| GAP-006 | Operations / Payments | Stripe Production Live Keys (#113) | **P1** | Environment configured with Stripe test-mode keys; requires owner live key provisioning before opening store. | Open |
| GAP-007 | Operations / Infra | Production R2 Bucket CORS Setup (#180) | **P1** | Production R2 bucket `aheed-images-production` had no CORS rules, so every browser-direct presigned `PUT` failed preflight. Policy applied 2026-08-18; #180 closed. | Fixed |
| GAP-008 | User Journey / Auth | Guest Order Status Lookup (#123) | **P2** | Guest shoppers could not track an order without an account. Shipped in P7a, then found insecure and corrected in PR #204. | Fixed |
| GAP-009 | UI Reference Parity | Slide-Over Cart Drawer vs Dedicated Cart Page | **P2** | Reference mockup uses a slide-over drawer; storefront used only a `/cart` page. Drawer shipped in P7a alongside the page. | Fixed |
| GAP-010 | Feature / Admin | Staff Bulk Order Status Transitions (#162) | **P2** | Staff order dashboard advanced one order at a time. Built in PR #204. | Fixed |
| GAP-011 | Feature / Search | Dedicated Database Trigram Index for Search (#163, #169) | **P2** | Global product search uses token matching; `pg_trgm` fuzzy search index deferred until catalogue size demands a raw SQL query. | Deferred |
| GAP-012 | User Journey / Cart | Reorder Past Order in One Click (#124) | **P3** | Order history had no one-click reorder. Built as `features/orders/reorder-items.ts` and wired into the order detail page. | Fixed |
| GAP-013 | UI Reference Parity | Homepage Featured Products Rail (#45) | **P3** | Reference mockup includes a featured-products rail. Now driven by a real `Product.isFeatured` flag; the rail also turned out to render nothing at all until the 2026-08-17 audit (#211) found and fixed the underlying `search("")` misuse. | Fixed |
| GAP-014 | Feature / Admin | Admin Multi-Image Product Management (#173) | **P3** | `ProductImage` supports many rows per product; the admin can now add, remove, reorder and set the primary image — the real gap (no code path ever created a second row) was bigger than "remove and reorder", fixed in #211. | Fixed |
| GAP-015 | Feature / Admin | Superseded Image Storage Cleanup (#174) | **P3** | Replacing or removing a product photo now deletes the superseded object from storage (`StorageService.deleteObject`, #211). Abandoned uploads (no `ProductImage` row ever written) are still not cleaned up — #174 stays open for that narrower remainder. | Fixed (partial) |

---

## Reconciliation note — 2026-08-17

Performed by `specs/2026-08-17-p6.5-residual-validation/` (issue #192). Every row above was
re-derived from the code, the schema and `gh` issue state rather than from what the row said about
itself. Prior to this audit the register had been wrong on **seven** of fifteen rows.

| GAP-ID | Change |
|---|---|
| GAP-001 | Confirmed unchanged (`Fixed`). Evidence added: `lib/tenant.ts:17`. |
| GAP-002 | See the sign-in verification recorded below; evidence added: `lib/auth-origin.ts:43-68`. |
| GAP-003 | Confirmed unchanged (`Fixed`). Evidence added: `app/not-found.tsx`. |
| GAP-004 | Confirmed unchanged (`Fixed`). |
| GAP-005 | Confirmed unchanged (`Open`); #104 open. |
| GAP-006 | Confirmed unchanged (`Open`); #113 open. |
| GAP-007 | **Issue citation corrected: #167 → #180.** #167 is the *closed* P6b2 image-upload slice; the production-CORS prerequisite is #180, which is open. Status `Open` unchanged and correct. |
| GAP-008 | **`Deferred` → `Fixed`.** Shipped in P7a and corrected in PR #204; #123 closed. |
| GAP-009 | **`Deferred` → `Fixed`.** `components/cart/CartDrawer.tsx` ships and is mounted from `components/layout/Header.tsx`. |
| GAP-010 | **`Deferred` → `Fixed`.** Built in PR #204 (`features/orders/advance-status-bulk.ts`); #162 closed. |
| GAP-011 | Confirmed unchanged (`Deferred`); no `pg_trgm` index exists, #163 and #169 both open. Evidence added: `lib/repositories/products.ts:173`. |
| GAP-012 | **`Deferred` → `Fixed`.** `features/orders/reorder-items.ts` is a complete server action wired into a real `<form action={reorderItems}>` on the order detail page. **Issue #124 was still open** against work that had already shipped. |
| GAP-013 | **`Deferred` → `Fixed (partial)`.** The rail shipped and #45 is closed, but `app/(storefront)/page.tsx:28` populates it with `productsRepo.search("", { take: 4, isHalal: true })` — the comment in that file calls it "simulated deals / halal featured". No featured flag exists on `Product`. The remainder is **#208**. |
| GAP-014 | Status `Deferred` unchanged and correct, but the Root Cause understated the position: the schema already has `ProductImage` with `sortOrder`/`isPrimary`, a gallery read path, and `attachProductImage`/`setPrimaryProductImage`. What is missing is **remove** and **reorder**, not multi-image support outright. Wording corrected. |
| GAP-015 | Confirmed unchanged (`Deferred`); no delete path exists in `lib/storage`. |

### What this audit says about the register's own conclusions

The "Final Production Readiness Recommendation" below was written on 2026-08-13 and asserted
**0 P0 (Critical Code/Security) gaps** with the application "100% functionally complete, fully
tested, and verified". Both claims were false on the day they were written:

- **GAP-010 was recorded as an accounted-for `Deferred` item while the feature had never been
  built**, and `specs/roadmap.md`'s P7a-closure row simultaneously reported it as shipped.
- The guest order lookup shipped in P7a reused `findOrderForWebhook` — the one deliberately
  un-scoped read in the codebase — behind a public page with an *optional* email field, so an order
  number alone disclosed any order's full contents, in any vendor, unauthenticated and unthrottled.
  That is a P0 security gap by this register's own severity scale, and it went unlisted.

Neither was detectable from inside the register, because nothing checked a row against the code.
That is why P6.5's exit gate was rewritten in the same slice
(`specs/2026-08-13-p6.5-self-review-hardening/validation.md`).

---

## Detailed Gap Descriptions

### GAP-001 — IPv6 loopback host truncation
- **Severity:** **P1** · **Status:** Fixed
- **Description:** `lib/tenant.ts` parsed the Host header with `.split(":")[0]`, truncating a
  bracketed IPv6 literal (`[::1]:8787`) to `[` and failing tenant resolution.
- **Evidence:** `lib/tenant.ts:17` now calls `splitHostPort(rawHost).hostname`.

### GAP-002 — Local preview sign-in origin mismatch (#176)
- **Severity:** **P1** · **Status:** Fixed
- **Description:** Sign-in against `npm run preview` at `http://localhost:8787` returned 403 with
  `Invalid origin`, because the port was dropped when building Better Auth's trusted origin and
  `wrangler dev`'s default `x-forwarded-proto: https` was trusted over a plain-HTTP loopback.
- **Evidence:** `lib/auth-origin.ts:43-68` (`splitHostPort`, `inferProto`), `buildAuthOrigin:82`
  preserving a non-default port, and 26 unit tests in `tests/auth-origin.test.ts`.
- **Note:** Until 2026-08-17 the only evidence for this row was those unit tests — the reported
  symptom itself had never been re-fired, which is why #176 stayed open while the register said
  `Fixed`. See the verification record in the reconciliation note.

### GAP-003 — Unstyled fallback 404 page
- **Severity:** **P2** · **Status:** Fixed
- **Evidence:** `app/not-found.tsx` exists and renders vendor-branded markup with a store return link.

### GAP-004 — `ARTIFACT_INDEX.md` staleness
- **Severity:** **P3** · **Status:** Fixed
- **Evidence:** `gates.yml`'s normalised rebuild-and-diff check; `npm run kms:build-index`.

### GAP-005 — Transactional Email Service & Outbound Domain (#104)
- **Category:** Operations / Transactional Email
- **Severity:** **P1** · **Status:** Open
- **Description:** `EmailService` logs and dispatches transactional emails via Resend API. To eliminate external service costs and resolve Cloudflare Workers Error 1102 (10ms CPU timeout limit), the platform is flagged to migrate to Cloudflare Email Sending (outbound) and Cloudflare Email Routing (inbound) under Cloudflare Workers Paid ($5/month).
- **Evidence:** `lib/email.ts` line 45; issue `#104`; Cloudflare Dashboard Email Service.
- **Root Cause:** Transition from developer sandbox email to production edge-native email & CPU headroom expansion.
- **Recommended Fix (Flagged for Phase 8):** Upgrade Cloudflare account to Workers Paid ($5/mo) to unlock Cloudflare Email Sending (outbound) + Email Routing (inbound) and 50ms CPU time limit.
- **Dependencies:** Cloudflare Workers Paid subscription ($5/mo) and domain DNS binding. **External to this repo.**

### GAP-006 — Stripe Production Live Keys (#113)
- **Category:** Operations / Payments
- **Severity:** **P1** · **Status:** Open
- **Description:** Production environment relies on Stripe test-mode API keys (`pk_test_...`, `sk_test_...`). Real customer transactions cannot be processed until live keys are configured.
- **Evidence:** `secrets/production.vars` and issue `#113`.
- **Root Cause:** Deliberate safety posture during development and testing phases.
- **Recommended Fix:** Swap `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in production secrets to live mode keys prior to launch.
- **Dependencies:** Stripe account activation. **External to this repo.**

### GAP-007 — Production R2 Bucket CORS Setup (#180)
- **Category:** Operations / Storage Infrastructure
- **Severity:** **P1** · **Status:** **Fixed** (2026-08-18)
- **Description:** Browser-direct product image uploads (presigned `PUT`) worked in staging
  (`aheed-images-staging`), but the production bucket (`aheed-images-production`) had no CORS
  configuration at all, so every production browser upload failed at preflight.
- **Evidence:** Applied out of band at P7's `/propose` with
  `wrangler r2 bucket cors set aheed-images-production --file <policy> --force`, using the R2 API
  shape (`rules[].allowed`) documented in `specs/2026-08-12-p6b2-image-upload/plan.md`. Absence was
  confirmed first — `wrangler r2 bucket cors list` returned *"The CORS configuration does not exist
  [code: 10059]"*. Verified afterwards by live `OPTIONS` preflight rather than by the set command's
  own success: `https://aheedfoodcentre.nocaped.com` and `https://srimart.nocaped.com` each return
  `204` with `Access-Control-Allow-Origin` echoing the origin, `PUT` and `content-type` allowed;
  `https://staging.aheedfoodcentre.nocaped.com` and `https://example.invalid` each return `403`
  with no such header, proving the policy discriminates rather than being permissive. Full record
  on **#180**.
- **Root Cause:** Cloudflare R2 bucket CORS policies are applied per bucket via Wrangler CLI, not
  via application code — so nothing in a deploy could ever have applied it.
- **Severity in hindsight:** #180's own text read "Blocks nothing else… the last outstanding item
  from P6." That was true when filed, when the only upload path was P6b2's single primary image.
  PR #214 then promoted the whole multi-image manager to production, and **every** admin image
  operation there was failing preflight. An issue's severity assessment goes stale when a later
  slice widens the surface depending on it, and nothing re-reads it.
- **Citation history:** This row cited `#167` until 2026-08-17. #167 is the closed P6b2 image-upload
  slice, not the CORS prerequisite; the correct issue is **#180**.

### GAP-008 — Guest Order Status Lookup (#123)
- **Category:** User Journey / Guest Checkout
- **Severity:** **P2** · **Status:** Fixed
- **Description:** Guest shoppers could not look up an order after checkout without an account.
- **Evidence:** `/orders/lookup` with `findOrderForGuestLookup` (vendor-scoped, email-matched) and a
  Postgres-backed 5/minute limiter (`OrderLookupAttempt`), migration
  `20260817120702_p7a_order_lookup_rate_limit`. Shipped in P7a, corrected in **PR #204**.
- **History:** The P7a implementation reused `findOrderForWebhook` with an *optional* email field,
  disclosing any order in any vendor from its order number alone. Fixed at P7a's first `/validate`.

### GAP-009 — Slide-Over Cart Drawer vs Dedicated Cart Page
- **Category:** UI Reference Parity / Frontend
- **Severity:** **P2** · **Status:** Fixed
- **Description:** The reference mockup (`docs/ui-ref/src/components/CartDrawer.tsx`) provides an instant slide-over drawer when clicking the cart icon; the storefront originally offered only `/cart`.
- **Evidence:** `components/cart/CartDrawer.tsx` and `components/cart/CartDrawerShell.tsx`, mounted from `components/layout/Header.tsx`. The `/cart` page is retained for deep-linking, as the original recommendation proposed.

### GAP-010 — Staff Bulk Order Status Transitions (#162)
- **Category:** Feature / Admin
- **Severity:** **P2** · **Status:** Fixed
- **Evidence:** `features/orders/advance-status-bulk.ts`, wired into `app/(admin)/staff/orders/page.tsx` via HTML5's `form=` attribute (nested `<form>`s being invalid). One `$transaction` per batch, legality re-checked per order against its own persisted status. Built in **PR #204**; #162 closed.
- **History:** This row read `Deferred` while `specs/roadmap.md`'s 2026-08-13 P7a-closure row simultaneously claimed bulk transitions had shipped. Neither was true until PR #204.

### GAP-011 — Dedicated Database Trigram Index for Search (#163, #169)
- **Category:** Feature / Search
- **Severity:** **P2** · **Status:** Deferred
- **Description:** Global product search matches on substring containment rather than fuzzy/typo-tolerant matching.
- **Evidence:** `lib/repositories/products.ts:173`'s `search()` builds an `OR` of `contains`/`insensitive`
  filters on `name` and `description` — no `pg_trgm` extension, index, or raw SQL query anywhere in
  the repo. Deferred until catalogue size demands it; #163 and #169 both open.

### GAP-012 — Reorder Past Order in One Click (#124)
- **Category:** User Journey / Cart
- **Severity:** **P3** · **Status:** Fixed
- **Evidence:** `features/orders/reorder-items.ts` (a `"use server"` action that re-adds an order's items to the caller's cart, skipping lines whose product no longer exists), rendered as `<form action={reorderItems}>` in `app/(storefront)/account/orders/[orderNumber]/page.tsx:45`.
- **Live verification (2026-08-17):** signed in as `demo-staff` against `npm run preview`, clicking **Reorder items** on cancelled order `AHE-20260817-3V492G` redirected to `/cart` containing exactly that order's line (`5 × Kitchen Roll, pack of 4`, subtotal `£16.45`).
- **Note:** Found already built during the 2026-08-17 audit while both this row and issue #124 still reported it outstanding. #124 closed on the evidence above.

### GAP-013 — Homepage Featured Products Rail (#45)
- **Category:** UI Reference Parity
- **Severity:** **P3** · **Status:** Fixed
- **Evidence:** `Product.isFeatured` (`prisma/schema.prisma`), an admin checkbox in `ProductForm`, and `app/(storefront)/page.tsx` reading it via `ProductRepository.list({ isFeatured: true })`. The rail is retitled "Featured Products".
- **Also found and fixed (#211):** the rail — and the "New Arrivals" row beside it — rendered **nothing at all**, independent of the proxy-flag issue. Both called `productsRepo.search("", {...})`, and `search()`'s empty-query guard (`lib/repositories/products.ts`) unconditionally returns zero results; `ProductRow` renders `null` for zero products. Neither row's title appeared anywhere in `npm run preview`'s rendered homepage before this fix. `#208`'s own text ("It renders correctly; only its data source is a placeholder") was itself wrong on the first half — this is the reconciliation.

### GAP-014 — Admin Multi-Image Product Management (#173)
- **Category:** Feature / Admin
- **Severity:** **P3** · **Status:** Fixed
- **Description (was):** `ProductImage` already modelled many images per product (`sortOrder`, `isPrimary`) and the storefront read a gallery, but **no code path had ever created a second row** — `attachProductImage` always repointed the single primary row. The real gap was bigger than "remove and reorder are missing".
- **Evidence:** `lib/repositories/products.ts`'s `addProductImage`/`promoteProductImage`/`removeProductImage`/`reorderProductImages`, wired into `features/admin/product-image.ts`'s four new server actions and `components/staff/ProductImageManager.tsx`.

### GAP-015 — Superseded Image Storage Cleanup (#174)
- **Category:** Feature / Admin
- **Severity:** **P3** · **Status:** Fixed (partial)
- **Description (was):** Replacing a product photo writes a new immutable key and repoints the row (by design — keys are immutable so no CDN purge is needed). The superseded object was never deleted, and neither was an abandoned upload's.
- **Evidence:** `lib/storage.ts`'s `deleteObject`, called from `removeProductImage` (`features/admin/product-image.ts`) whenever an image is removed or replaced.
- **Remaining:** an abandoned upload — an object PUT to storage whose `ProductImage` row was never written (browser closed mid-flow) — has no cleanup path. Inline delete doesn't reach it; a scheduled sweep was considered and deliberately deferred as bigger infrastructure than this slice's scope. **#174 stays open** for that narrower remainder.

---

## Gap Summary Table

| Status | Total | P1 | P2 | P3 |
|---|---|---|---|---|
| Open | 3 | 3 | 0 | 0 |
| Deferred | 1 | 0 | 1 | 0 |
| Fixed | 11 | 2 | 4 | 5 |
| **Total** | **15** | **5** | **5** | **5** |

All three `Open` rows are P1 operational prerequisites whose fix is an action outside this
repository — a Resend DNS verification, a Stripe live-key provisioning, and an R2 bucket CORS
policy. No P1 gap remains open against a code defect.

---

## Production Readiness

**Decision: READY WITH CONDITIONS**, unchanged — but on evidence rather than on assertion.

Two conditions remain: **GAP-005** (Resend sending domain, #104) and **GAP-006** (Stripe live keys,
#113) — both owner actions, neither of them code. **GAP-007 was the third and is now discharged**
(production bucket CORS applied and preflight-verified, 2026-08-18).

> **Superseded claims (2026-08-13).** This section previously stated "0 P0 (Critical Code/Security)
> gaps" and that the application was "100% functionally complete, fully tested, and verified", and
> the Audit Consistency Matrix rated Backend↔Frontend and Test-Coverage↔Business-Rules at "100%
> Consistent". Those claims did not survive contact with P7a's first real validation, which found an
> unauthenticated cross-vendor order-disclosure hole and a feature recorded as deferred that had
> never been built. They are removed rather than restated: a readiness percentage that nothing
> measures is exactly the kind of self-certification this register is being corrected for.
