# #729 — Vendor-neutral UI copy, slice 1 (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

Branch `feature/729-vendor-neutral-ui-copy`, cut from `origin/staging` at `786649f`. Commits: spec
`c6a97db`, build `a05e589`, then this build-notes commit (CHANGELOG, KMS index, this file).

## What changed and why

The rule applied everywhere is `plan.md`'s: copy comes from the vendor (its name, its products,
its settings) or is neutral, and no component names a vendor. This makes a third vendor work with
no code change.

- **A1, page titles.** Seven pages swapped a static `metadata` for `generateMetadata()` reading
  `getCurrentVendorProfile()`, copying `app/(storefront)/search/page.tsx:32-36` exactly, including
  its `?? "Aheed Food Centre"` no-vendor fallback. That profile read is `React.cache`d and the
  storefront layout already makes it, so this adds no query.
- **A2/A3, rewards.** `vendorName` travels `StorefrontChrome` (`profile.name`) → `RewardsLauncher` →
  `RewardsPanel` → `ReferralCard` (as `storeName`). All of these are required props, so a missed
  caller is a type error, not a silent fallback. The loyalty page adds `getCurrentVendorProfile()`
  to its existing `Promise.all`. `buildShareLinks` lost its `storeName = "Aheed Food Centre"`
  default, which was the root cause: every caller that omitted the name advertised Aheed.
- **B1, Shop your list.**
  - New pure module `lib/shopping-list-examples.ts` (`buildListExamples`, `MAX_EXAMPLE_NAMES = 3`,
    `NEUTRAL_LIST_PLACEHOLDER`).
  - The page fetches with the existing `getProductRepository().list({ take: MAX_EXAMPLE_NAMES,
    inStockOnly: true })`, which is vendor-scoped, active only and newest first. It runs in
    parallel with the saved-lists read.
  - `ShopYourList` renders one of two hint branches.
- **C3, search box text.**
  - The input sits inside the **branding** form only.
  - `parseBrandColourForm` trims it. Empty or absent becomes `null`, and more than 80 characters is
    refused, with the field highlighted through the existing `brandingState.field` mechanism.
  - `VendorStorefrontConfigInput.searchPlaceholder` is optional and written by direct assignment,
    so the delivery-rules and social-links actions, which never set the key, leave it unchanged.
  - `updateStorefrontConfig` is its only caller; checked with a grep.
- **D1.** The fallback icon is lucide `Tag`. All nine slug mappings are untouched.
- **Everything else** is a literal string swap exactly as `requirements.md` R6–R8 and R12–R16
  list them.
- **R23 guard** (`tests/vendor-neutral-copy.test.ts`). It strips comments with the TypeScript
  printer (`ts.createPrinter({ removeComments: true })`), not a regex, so `//` inside a URL string
  can't truncate a line and hide a literal. It asserts it scanned more than 100 files, so a broken
  glob can't make it pass vacuously. **Proven to bite during Build:** inserting
  `placeholder="halal lamb"` into `CategoryForm.tsx` made it fail with
  `"components/staff/CategoryForm.tsx: halal lamb"`.
- **R21.** Admin guide bumped to 2.4.0.
- **R25.** Roadmap row for PR #904 added. Production `/api/health` was verified at Build: serving
  `a156039`, `db.ok: true`, `reference.drift: false`. `deploy-production` run `36246861084`
  succeeded, and `#900` is CLOSED.

## Decisions taken during the build

- **`forgot-password` and `reset-password` became `export const dynamic = "force-dynamic"`.** They
  were statically prerendered before. A title that names the request's vendor only exists per
  request, and Prisma's `@prisma/client/wasm` can't load during `next build`'s static prerender.
  That second reason is why `/search`, `/categories` and `/shop-your-list` are already
  force-dynamic. The other five A1 pages were already dynamic.
- **The loyalty page's `storeName` falls back to `"Aheed Food Centre"`** when the profile is null,
  the same fallback R1 sanctions for titles. It is unreachable in practice, since the layout
  redirects vendorless hosts.
- **Guard implementation:** the TypeScript printer rather than regex comment-stripping (see above).
  This matches `tests/repository-purity.test.ts`, which already imports `typescript`.
- **`buildListExamples` keeps product names in their original case** (`2x Basmati Rice 5kg`)
  rather than lower-casing them. They're the vendor's real catalogue names, and the list matcher
  is case-insensitive anyway.
- **Shop-your-list examples are the vendor's newest in-stock products**, because `list()` sorts by
  `createdAt desc`. For Aheed in dev that may be generated scale-seed rows rather than "nice"
  staples. That's accepted: they're real products the vendor sells, and choosing a "best"
  example would need a setting, which is #905 territory.
- **R25 row wording** mirrors the PR #898 promotion row's structure.

## Deviations from the spec

- **R11 literal:** the page calls `list({ take: MAX_EXAMPLE_NAMES, inStockOnly: true })` rather than
  the literal `take: 3`. `MAX_EXAMPLE_NAMES` is `3`, exported from `lib/shopping-list-examples.ts`,
  so the fetch and the builder's cap can't drift apart. The behaviour is identical to R11. A
  validator grepping for `take: 3` will not find it; read the constant instead.
- **R24 extra assertion:** the `RewardsLauncher` test now also asserts `Aheed Food Centre Club`
  appears. This adds coverage and changes no required behaviour.

Nothing else deviates.

## Known-shaky areas

- **R23's validation row reverts with `git checkout -- components/staff/CategoryForm.tsx`.** That
  is only safe because everything is committed by validation time. During Build it silently
  discarded an **uncommitted** placeholder edit in that same file, which was caught and re-applied
  (`category-name` is correct in `a05e589`). If you run it with anything uncommitted in that file,
  save first.
- **B1 and R2 are unproven live.** Every B1 and A1 check so far is unit-level or a read-through.
  No `npm run preview` run happened at Build. R2 (SriMart `<title>`), R11 (SriMart placeholder shows
  a real SriMart product name) and R20 (save → header placeholder → clear → "Search products…")
  are the rows that prove the vendor-scoping end to end. Run them against **both** hosts.
  SriMart's local host is `srimart.localhost` with a `Host:` header (`local-dev-playbook.md`),
  and a curl cookie jar does not persist for it, so pass cookies explicitly.
- **R20 needs a signed-in store admin** on the Aheed host and a server-action drive
  (`local-dev-playbook.md` documents the techniques and their traps). Restore the stored
  `searchPlaceholder` afterwards; Aheed's seeded value is "Search halal lamb, basmati, lentils…".
- **The `force-dynamic` change on forgot/reset-password** was only checked by `typecheck`. A real
  `next build` / `npm run preview` is the proof that neither page tries to prerender with Prisma.
- **Full local suite at Build:** 175 files / 2331 tests passed. `vitest` was run alone, and 175 is
  at least the 174 files under `tests/`, so none were skipped. `typecheck`, `lint` and
  `format:check` were green. CI is ground truth.
- **Not scanned by the guard:** `app/(admin)/staff/runbook/docs.ts` (generated, `.ts`) and any
  `lib/` file other than `lib/referrals.ts`. The grocery wording in `lib/` AI prompts is #905's
  scope, not a miss.

## Deferred items (tracked)

- **#905:** per-vendor product labels and HMC on the staff form, and vendor context in AI prompts
  (slice 2, needs `/propose`).
- **#906:** Open Food Facts lookup offered to every vendor (Deferred milestone).
- **#907:** `buildShareLinks` hardcodes "£5" regardless of the configured referral discount.
