---
id: p1022-1023-public-docs-rewards-gate
title: "Public docs boundary and loyalty-gated Rewards launcher (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-10
visibility: internal
summary: Makes the public Help Centre select its shopper guide by id through one visibility-checked helper, guards that no other storefront path can import the internal docs corpus, and hides the floating Rewards launcher for vendors with loyalty off.
tags: [kms, help-centre, loyalty, storefront, multi-vendor]
related: [app-conventions]
---

# Public docs boundary and loyalty-gated Rewards launcher (plan)

Two small defects of the same class: a shopper-facing surface showing something the vendor did not
choose to publish. `#1022` is about documentation; `#1023` is about loyalty chrome. Neither touches
the schema, a server action or a migration.

**Goal:** after this slice, an internal KMS article cannot reach a public storefront page without a
test failing, the public Help Centre renders the shopper guide by construction rather than by array
order, and a vendor with loyalty off shows no loyalty launcher anywhere on its storefront.

## Background

- **`#1022`.** `app/(storefront)/help/page.tsx` imports the generated `DOC_ARTICLES`
  (`app/(admin)/staff/runbook/docs.ts`, every KMS article including internal ones) and renders
  `shopperDocs[0]`. Until PR #1024 the filter tested audience alone, and an internal operations
  document sorted first and rendered on every vendor's public `/help` (verified live in production,
  2026-10-10). PR #1024 added `visibility === "public"` to that one filter. What remains, and what
  this slice builds, is the issue's own "What is NOT fixed" list: nothing mechanical stops the next
  storefront page from importing `DOC_ARTICLES` and filtering it wrongly, and `[0]` is still
  correct only because exactly one public shopper article exists today.
- **`#1023`.** `components/layout/StorefrontChrome.tsx` mounts `RewardsLauncher` unconditionally,
  on every storefront and landing page of every vendor. With loyalty off the panel still shows
  "Loyalty Rewards", a points balance, earn/redeem guides, a referral card and a link to
  `/account/loyalty` — which calls `notFound()` when `loyaltyEnabled` is false. SriMart is seeded
  and runs in production with `loyaltyEnabled: false`. `StorefrontChrome` already awaits
  `getRewardsDataForUser(...)`, whose result carries `loyaltyEnabled` for signed-in **and**
  signed-out callers (`lib/rewards-service.ts`), so no new read is needed.

## Scope (this slice)

1. **`lib/public-docs.ts`** — a plain (non-`"use server"`) module exporting
   `getPublicShopperGuide(articles = DOC_ARTICLES)`. It returns the article whose `id` is
   exactly `docs/shopper-help/shopping-guide.md`, and only when that article's `visibility` is
   exactly `"public"`; otherwise `null`. The `articles` parameter exists so the unit test can feed
   it a crafted list; production callers pass nothing. Selection is by id, not by audience and
   not by position — the id is a platform document path, not vendor copy, so naming it here does
   not breach the vendor-neutral copy rule.
2. **`/help` uses the helper.** The page stops importing `DOC_ARTICLES` and stops filtering it; the
   "Detailed Shopping Guide" section renders the helper's article, and renders nothing when the
   helper returns `null`. The heading text is unchanged.
3. **A boundary test, `tests/public-docs-boundary.test.ts`.** It parses every `.ts`/`.tsx` file
   under `app/`, `components/`, `lib/` and `features/` with the TypeScript compiler API (the
   approach `tests/repository-purity.test.ts` uses — import-level, whole-file, not a text grep, so
   a comment naming the module cannot trip it) and fails if any file **outside `app/(admin)/`**,
   other than `lib/public-docs.ts` itself, imports the generated docs module. "Imports" covers
   static `import`, `export ... from`, `import type`, dynamic `import()` and `require()`, for both
   relative specifiers and the `@/` alias. The generated module is identified by its specifier
   ending in `staff/runbook/docs` (with or without an extension). The single exemption is the
   helper; there is no other allowlist. The test also proves its own detector on in-memory source
   strings, so it cannot pass by detecting nothing.
4. **`StorefrontChrome` renders `RewardsLauncher` only when `initialRewardsData.loyaltyEnabled` is
   `true`.** Everything else in the chrome is unchanged.
5. **Persistent doc:** `docs/developer-portal/app-conventions.md`'s existing `#1022` bullet gains
   the enforcement: the helper is the only route from a non-staff surface to the docs corpus, and
   `tests/public-docs-boundary.test.ts` enforces it.

## Accepted consequence (owner decision at Gate 1, 2026-10-10)

`RewardsLauncher` is also where a `?ref=` referral code from a shared link is written to the
`aheed_referral_code` cookie. Hiding it for a loyalty-off vendor means that vendor's storefront no
longer captures `?ref=`. This is deliberate and correct today: after this slice a loyalty-off
vendor has no surface that **shows** a shopper their referral code or link (`/account/loyalty` 404s
and the panel is gone), so there are no links of its own to capture. The account hub already treats
referrals as part of loyalty. Making referrals work independently of loyalty would be a different,
larger slice.

> **Corrected at Build (2026-10-10).** This paragraph originally said a code is only ever *created*
> from `/account/loyalty` or the Rewards panel. That is wrong: `StorefrontChrome` calls
> `getRewardsDataForUser`, which for any signed-in shopper calls `getReferralStats` and so gets or
> creates a referral code on every storefront render, loyalty on or off. The accepted consequence
> is unchanged — nothing shows the code — but the premise was overstated. The unconditional
> creation is pre-existing and out of this slice's scope (R9 changes nothing else in the chrome);
> it is recorded in `build-notes.md` and filed as its own follow-up.

## Deliberately excluded

- **Whether `shopper` belongs in the two internal articles' `audience` lists**
  (`docs/operations-research/order-fulfilment-core.md` and the KMS pilot `plan.md`). The issue names
  it a separate KMS metadata question; with the helper selecting by id it no longer affects any
  render.
- **Rendering every public shopper article.** The heading is singular, and rendering "all matches"
  reintroduces order-dependence in a new shape.
- **Splitting the generated `docs.ts` into a public-only build artefact.** It would also keep
  internal content out of the storefront's import graph, but it changes `kms:build-index`'s output
  contract and `tests/kms-generated-artifacts.test.ts` for no behaviour gain over the boundary
  test. Note that both live in one Worker bundle regardless; the risk being closed is *rendering*,
  not shipping bytes.
- **`/api/rewards` and `/account` behaviour for loyalty-off vendors.** `/account/loyalty` already
  404s and `/account` already branches on `loyaltyEnabled`; `/api/rewards` only answers the launcher
  and is not changed.
- **The cookie name `aheed_referral_code` carrying a vendor's name.** Pre-existing and harmless to
  behaviour; noted here so it is not mistaken for an oversight.
- **`#1022`'s audience-metadata question and the cookie name are not filed as new issues** unless
  Validate finds them causing a defect.

## Open items carried forward

None. Both issues close on promotion of this slice.

## Live verification plan

DB-touching renders run under `npm run preview` (never `npm run dev`). Aheed is `Host:
localhost:8787`, SriMart is `Host: srimart.localhost:8787`, against `http://127.0.0.1:8787`.
Signed-out reads are enough: the launcher renders for signed-out shoppers too, and the gate reads
the vendor's flag, not the user's.
