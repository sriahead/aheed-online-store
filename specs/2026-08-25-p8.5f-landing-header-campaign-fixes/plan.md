---
id: p8-5f-landing-header-campaign-fixes-plan
title: "P8.5f — Landing Slim-Down, Header Postcode & Campaign Date/Banner Fixes (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-25
visibility: internal
summary: Moves the landing page's browse sections to a rebuilt /categories, relocates the postcode checker into a route-aware header, fixes a live timezone defect that shifted campaign schedules by the BST offset, and adds AI banner generation reusing the existing Workers AI pipeline.
tags: [p8.5, storefront, header, staff-panel, campaigns, timezone, proxy]
related: [p8-5e-hero-campaigns-plan, p8-5b-department-hero-plan, adr-004-multi-tenancy]
---

# P8.5f — Landing Slim-Down, Header Postcode & Campaign Date/Banner Fixes (plan)

## Why this slice exists

Five findings from a human review of the live storefront and `/staff/promotions` after P8.5e (#356)
shipped. Four are UI/UX corrections; **one is a live data defect that silently writes the wrong
instant to the database**, and it is the reason this slice isn't purely cosmetic.

The landing page currently carries the hero, a trust strip, a department scroller and two
four-product rows. Everything below the trust strip duplicates what a browse page is for, and it
pushes the hero — the one surface carrying vendor campaign artwork from P8.5e — off the fold on a
laptop. The header, meanwhile, carries a search box and a "Shop List" link on *every* route
including the landing page, where the hero already has its own call to action.

**The defect:** `lib/campaign-form.ts:89` parses a `datetime-local` value with a bare
`new Date("2026-08-25T07:25")`. ECMAScript specifies that a date-time string carrying **no**
timezone designator is interpreted as *the runtime's own local time* — which on a Cloudflare Worker
is UTC. The value is then rendered back by `components/staff/CampaignForm.tsx:29-33` using
`date.getHours()`, a **browser**-local read. Write and read therefore assume two different
timezones, and the gap between them is exactly the vendor's UTC offset: an admin in Milton Keynes
typing `07:25` during BST sees `08:25` come back. The same defect exists independently in
`features/admin/discount-codes.ts:65-73`, where it decides when a discount code starts being
redeemable. Neither is caught by `lint`, `typecheck` or `test`, because every one of those runs in a
single process where the two wrong assumptions cancel out.

**Goal:** a landing page that is hero-first, a header that adapts to its route, campaign and
discount schedules that store the instant the admin actually meant, and a banner image an admin can
generate rather than having to photograph.

## Scope (this slice)

### 1. Landing slim-down, `/categories` rebuilt as the shop page

- `app/(storefront)/page.tsx` drops `DepartmentScroller` and both `ProductRow`s (today
  `page.tsx:234-253`) and the postcode form in the hero (`page.tsx:136-164`). What remains is the
  hero (including `DepartmentHero`, untouched) and the three-tile trust strip.
- `app/(storefront)/categories/page.tsx` — today a bare `<ul>` of links — is rebuilt to carry
  exactly what the landing page gives up: the "Shop by department" scroller, then **New Arrivals**
  and **Featured Products**, using the same `productsRepo.list({ take: 4 })` /
  `list({ take: 4, isFeatured: true })` reads and the same `getRequestCartQuantities()` pass-through
  the landing page uses today, so the cards keep P8.5a's cart-aware steppers.
- **Folded-in vendor-leak fix.** That page's `export const metadata = { title: "Categories — Aheed
  Food Centre" }` is hardcoded, so SriMart's shop page is titled with Aheed's trading name — the
  same defect class #239 spent a slice removing. It becomes a vendor-derived `generateMetadata()`,
  matching the landing page's existing one. In scope only because this slice rewrites the file
  anyway; it is not a licence to sweep for other instances.

### 2. Postcode checker moves into the header, remembered in a cookie

- The hero's `<form method="GET">` becomes a **server action** form rendered by
  `components/layout/Header.tsx`. The action `setDeliveryPostcode` lives in a new
  `features/storefront/delivery.ts` (`"use server"`), validates with the existing pure
  `isDeliverable()` (`lib/delivery.ts`, unchanged) against the vendor's `deliveryPrefixes` — which
  `Header` already loads via `getCurrentVendorProfile()` — and writes a `delivery-postcode` cookie.
  That file exports **only async functions**, per CLAUDE.md's Server Actions rule: a single value
  export makes every action in the file 500 at runtime with nothing at build time catching it
  (#159).
- `Header` is already a Server Component that calls `cookies()`, so the ✓/✗ badge renders
  server-side on every route with **no client JS**, which is the posture the header was written to
  and the reason this doesn't become a `"use client"` island.
- Cookie shape copies `lib/cart-identity.ts:48-56`'s precedent exactly: `httpOnly`, `secure`,
  `sameSite: "lax"`, `path: "/"`, 30-day `maxAge`, host-only (no `domain`). Submitting an empty
  value deletes it.
- **Consent posture is unchanged and this needs no banner change.** `CookieBanner.tsx:36` already
  describes the essential set as covering "cart, authentication, and store preferences" — a
  postcode preference is a store preference, is functional rather than analytical, and is set only
  in response to a deliberate submission, never on browse.

### 3. Route-aware header (`proxy.ts`)

- The search form (`Header.tsx:199-202` and the mobile row at `:268-271`) and the "Shop List" link
  (`:206-216`) render on every storefront route except `/`. On `/` the header shows the postcode
  checker in that space instead. Everywhere else, the postcode appears as the compact cookie-backed
  badge.
- A layout in Next cannot see which page it wraps, and this repo has **no middleware/proxy file
  today**, so the route has to be carried in. A new root `proxy.ts` copies the incoming headers,
  sets `x-pathname`, and returns `NextResponse.next({ request: { headers } })`. `Header` reads it
  through the `headers()` call it already makes.
- **This is Next 16, where `middleware.js` is deprecated and renamed to `proxy.js`**
  (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`). Two
  details from the current `proxy.md` that are easy to get wrong: the request-header form is
  `NextResponse.next({ request: { headers } })` — passing `headers` at the top level instead exposes
  them to the *client*, which the doc calls out explicitly — and Proxy defaults to the Node.js
  runtime in 16, with the `runtime` segment option **forbidden** (setting it throws). The default
  suits this Worker's `nodejs_compat` and no `runtime` export is added.
- A `config.matcher` excludes `_next/static`, `_next/image`, favicon and asset extensions, so the
  hook does not run on every static byte.
- Chosen over a route-group split (moving ~20 page directories into `app/(storefront)/(shop)/` so
  each group could own its own layout) at `/propose`. That alternative has zero runtime cost but a
  large, route-changing diff; this one is ~15 lines and reversible.
- **Accepted consequence:** there is no search box on the landing page at all. A shopper searches
  from the header on any other route, or from `/categories`. This is the explicitly requested
  behaviour, recorded here so a later reader doesn't "fix" it as an oversight.

### 4. Timezone fix — `lib/local-datetime.ts`

- A new pure, DB-free, session-free module — same posture as `lib/campaign-form.ts` and
  `lib/product-image.ts` — exporting `STORE_TIMEZONE = "Europe/London"`, `parseLocalInput(value)`
  (a `YYYY-MM-DDTHH:mm` wall-clock string → the `Date` instant it names **in the store's
  timezone**) and `formatLocalInput(date)` (the inverse).
- Offsets come from `Intl.DateTimeFormat` with an explicit `timeZone`, never from the process
  clock, so **the result does not depend on where the code runs** — Worker, CI runner, or the
  admin's browser. That property is what actually fixes the bug, and it is what the tests assert.
- Both call sites are corrected: `lib/campaign-form.ts`'s `optionalDate` and
  `features/admin/discount-codes.ts`'s `optionalDateField` parse through it; `CampaignForm.tsx`'s
  local `toLocalInputValue` is deleted in favour of `formatLocalInput`.
- **Timezone is one constant, not a vendor column.** Both seeded vendors are UK. Per the recorded
  multi-tenancy direction this is a deliberate "flag now, change later": one constant to swap for a
  `Vendor.timezone` field when a non-UK vendor exists, not a rewrite. Recorded in ADR-004's notes.

### 5. AI-generated campaign banner

- New `POST /api/admin/campaign-images/generate`, mirroring
  `app/api/admin/product-images/generate/route.ts` in shape and guard (`requireVendorRole("ADMIN")`,
  JSON body, JSON error envelope).
- Reuses `lib/image-generation.ts`'s existing `getImageGenerationService()` (Cloudflare Workers AI,
  `flux-1-schnell`, already retry/429-aware) and `buildCampaignImageKey()` from
  `lib/campaign-image.ts`. Prompt is built server-side from the department name and the campaign's
  headline/subtitle — the client sends the `categoryId` only, so the caller cannot inject an
  arbitrary prompt or name a storage key.
- Persists through the existing `saveCampaignImageForVendor()`, so P8.5e's rule that **an image is
  never stored without alt text** continues to hold: the route requires alt text, taking the
  admin's typed value when present and otherwise deriving one from the department and headline.
- `components/staff/CampaignBannerUploader.tsx` gains an "Auto-Generate" button beside the existing
  upload control, copying `ProductImageManager.tsx:91-110`'s `fetch` → `router.refresh()` shape.

**No schema change and no migration in this slice.** Every column it touches already exists.

## Deliberately excluded

- **An editable AI prompt box.** The prompt is derived server-side from the department and headline.
  Offered at `/propose` and declined in favour of matching the product flow's one-button shape; a
  free-text prompt field is a second uncontrolled input surface and can be its own follow-up.
- **A `needsReview` flag for campaign banners.** `Product` has `imageNeedsReview` because the
  backfill job generates images unattended; a campaign banner is generated by an admin who is
  looking at the form and sees the result immediately, and the campaign can be left inactive until
  they are happy. Adding the column would make this slice carry a migration for no live benefit.
- **A per-vendor timezone column.** See scope §4.
- **Backfilling or correcting campaign/discount rows written before this fix.** Rows saved under the
  old behaviour name an instant one BST hour from what was typed. There are few, they are all
  staging-side, and a migration would have to *guess* which rows were mis-entered versus deliberate.
  Corrected by hand at `/validate` instead, and recorded in build-notes.
- **Redesigning `/search`.** It stays the query-results surface; `/categories` becomes the curated
  browse surface. The "View all" link on New Arrivals continues to point at `/search`.
- **Sweeping other hardcoded vendor strings.** Only `/categories`'s title is fixed, because this
  slice rewrites that file. Anything else found stays a separate issue.
- **Removing search from the header on mobile for non-landing routes.** The mobile search row
  (`Header.tsx:268-271`) follows the same landing/non-landing rule as the desktop one and is
  otherwise untouched.

## Risks this spec deliberately designs validation around

- **`Intl.DateTimeFormat` with a named timezone must work under `workerd`.** It is the mechanism the
  whole fix rests on, and a failure would be a runtime one that `next dev` (real Node, full ICU)
  would never show. R19 checks it under `npm run preview`, not `dev` — the same trap CLAUDE.md
  records for `@prisma/client/wasm`.
- **`proxy.ts` is a new global request hook** and is exactly the kind of file that behaves
  differently between `next dev` and the deployed Worker. R13/R14 exercise it under `npm run
  preview`.
- **The generated banner is a raster image, so it cannot be confirmed visually under local
  preview.** CLAUDE.md's storage section records that both CDN zones return **403** to a request
  carrying a `localhost` referer, live-confirmed 2026-08-24 (#235). R24 therefore asserts the stored
  object and the DB row locally, and defers the "does it actually render" check to deployed staging.

## Open items carried forward

- **Tracking issue is #362**, opened at `/build-notes` rather than `/propose`: the proposal was
  reviewed and approved in-conversation and the human elected to go straight to `/spec`, so Gate 1's
  artifact is this plan. The issue exists so the PR can carry `Closes #362` plus `phase:` / `gate:`
  labels and so `npm run sdd:audit` has a roadmap row to reconcile against.
- **Deferred items filed at `/build-notes`:** **#363** (vendor timezone is a hardcoded constant —
  blocks non-UK onboarding), **#364** (AI-generated images stored as PNG bytes under a `.webp` key,
  affecting the product pipeline too), **#365** (admin-editable AI prompt — needs its own
  `/propose`, since a caller-supplied prompt would undo the reason it is server-side), **#366**
  (stale agent worktree for a merged branch breaking local `format:check`).
- **Board `Phase` field still has no option past `P8`**, so this item is tagged `P8` like the rest
  of P8.5 — the same gap **#267** already records.
- **#351** (product card nests `<button>` inside `<a>`) is untouched here, but this slice puts more
  product cards on `/categories`. It does not make #351 worse per-card; it does mean the invalid
  markup now appears on two routes rather than one.
