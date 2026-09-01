# Changelog

All notable changes to the Aheed Online Store are recorded here. Format based on
[Keep a Changelog](https://keepachangelog.com/). Per SDD Gate 4, this file is updated **before**
every branch merges.

## [Unreleased]

### Added

- **`#501` (parts 1 and 2) — a browse mode for `/search`, working "View all" links, and a
  `/bundles` page** (`specs/2026-09-01-storefront-browsing-affordances/`). Slice A of the three
  approved at Gate 1 on 2026-09-01; slice B was `#502`, slice C is `#503`. Bare `/search` ran its
  query inside `if (query)` and gated the grid on `query &&`, so it returned 200 with an empty
  content column — and `app/(storefront)/categories/page.tsx` pointed the shop page's only "View
  all" straight at it, as did the header's search box when submitted empty. The page now branches:
  no `q` calls `products.list(...)`, a `q` calls `products.search(q, ...)`, both with identical
  filter and cursor options, so price, stock and speciality filters plus keyset pagination work the
  same either way. **`#211`'s `list()`/`search()` split is preserved literally** —
  `searchProducts`'s empty-query guard is untouched and the two functions stay separate; only the
  *page's* reading of an empty box changed, and the docstring in `lib/repositories/products.ts`
  that asserted the opposite was rewritten rather than left contradicting the code beside it. A new
  `featured` param (URL-driven, no sidebar control) gives Featured Products a real destination, and
  `components/product/ProductFilterForm.tsx` carries it in a hidden field — it is a plain `GET`
  form, so without one, pressing Apply from a featured listing silently dropped the filter.
  `nextPageHref` moved to a pure, unit-tested `components/product/search-href.ts`, since a page
  file cannot export a helper for a test to import. A zero-result empty state closes the same
  blank-column dead end reached by a search that matches nothing. All three shop-page rows now
  carry a working "View all" (`BundleRow` gained the prop it lacked), the third pointing at a new
  `app/(storefront)/bundles/page.tsx` that shares `hasAvailableItems` with the row so the two
  cannot disagree about which bundles render. `/search`'s hardcoded `metadata` title, which
  rendered "Aheed Food Centre" under SriMart too (the `#239` defect class), is now derived from the
  vendor.
  **Found while writing the spec, and not mentioned in `#501`: nothing was ever featured.**
  `Product.isFeatured` is `@default(false)` and `prisma/seed.ts` never set it, so `ProductRow`
  returned `null` and the Featured Products row was absent from the shop page in every freshly
  seeded environment — a "View all" would have led to an empty listing. `seedFeaturedProducts` is
  its own idempotent pass (the pattern `seedSubcategories` already uses, so it reaches databases
  seeded before this slice rather than only new ones), marking six Aheed and two SriMart products,
  deliberately fewer than the 12-item page size so a featured listing is visibly a subset.
  **Part 3 of `#501` — horizontal scrollers on the product and bundle rows — is deliberately not
  built**, so this does not close `#501`: the rows hold four products in a four-column grid, so a
  scroller would have nothing to scroll, and delivering the department strip's affordance would
  have meant widening the rows, a page-cost change `#501` never asked for. Tracked in `#511`.

- **`#508` — a database-backed error event log, independent of Cloudflare Workers Logs**
  (`specs/2026-09-01-error-event-log/`). A live incident showed the global error boundary's
  generic "Something went wrong" page working exactly as designed (it deliberately shows a visitor
  nothing about the error, not even the digest — `components/errors/ErrorPanel.tsx`, unchanged
  here), but finding the real root cause afterward depended on `#246`, still unconfirmed whether
  Cloudflare Workers Logs are even queryable from this team's environment. `instrumentation.ts`'s
  `onRequestError` (`#480`) now also writes the real error — message, stack, digest, path, method,
  router kind/type — to a new `ErrorEvent` table, via a second, deliberately uncached Prisma client
  (`getPrismaUncached()` in `lib/db.ts`) rather than the memoized `getPrisma()`/`getPrismaWs()`,
  since whether this hook runs inside a `cache()`-compatible request scope is unconfirmed and the
  cost of guessing wrong is the exact cross-request-singleton bug this app has already hit once. The
  write is wrapped so a failure (a database outage — plausibly the very thing that caused the
  original error) degrades to today's `console.error` rather than compounding anything. A new
  `/staff/errors` page lists the most recent 50 events, gated to **platform ADMIN only** — a
  per-vendor store admin who'd otherwise pass `requireVendorRole("ADMIN")` is refused the same way a
  non-admin is, since a stack trace can reveal internal file paths a vendor-scoped account has no
  reason to see. No retention job was planned at `/propose`; added anyway during `/spec` after
  finding `lib/repositories/order-lookup-rate-limit.ts` already carries the exact sweep pattern
  needed (`#468`), so a 30-day probabilistic sweep runs on write rather than repeating that table's
  original unbounded-growth mistake.

### Documentation

- **`/document` closeout for `#508`.** Reconciles `specs/roadmap.md` with what actually shipped: a
  new change-log row cites **PR #509**, merge `d9076f9`, `staging`; records `gates` green
  (`quality`, `docs-gates`) and both `deploy-staging`/`deploy-docs-internal` completing successfully
  post-merge. Confirms the slice's one real open risk from `/propose` — whether `onRequestError` has
  a working Cloudflare Workers request context for `getPrismaUncached()` to resolve `DATABASE_URL`
  from — is resolved: a temporary throw under `npm run preview` wrote exactly one real `ErrorEvent`
  row, live. Adds a `CLAUDE.md` lesson recording that finding for future `onRequestError` work.
  `#508` moved to `In Review` on Project #2. `ARTIFACT_INDEX.md`/`docs.ts` rebuilt; `npm run
  sdd:audit` exits 0.

- **`/document` closeout for `#501` (parts 1 and 2, slice A).** Reconciles `specs/roadmap.md` with
  what actually shipped: a new change-log row cites **PR #515**, merge `38c9171`, `staging`, and
  records that `/validate` found zero defects in the slice's own diff — every obstacle hit while
  live-verifying traced to something outside it (a sandbox network timeout unrelated to the code, a
  stale local `VendorDomain` row from an earlier session, and a shared dev database carrying ~2,000
  leftover products from an unrelated earlier scale-seed). `#501` moved to `In Review` on Project #2
  (stays open — part 3 remains deferred to `#511`). **`#514`, filed at `/validate` as a possible
  `lib/tenant.ts` design gap, re-scoped smaller here**: `CLAUDE.md`'s existing SriMart branding note
  already modeled the correct local convention (a port-less `Host` value); the actual root cause was
  one earlier session's `VendorDomain` row using a port-inclusive value, not a gap in
  `lib/tenant.ts` itself. Adds a `CLAUDE.md` lesson stating the port-less constraint explicitly
  rather than leaving it implicit in one example. `ARTIFACT_INDEX.md`/`docs.ts` rebuilt; `npm run
  sdd:audit` exits 0.

### Fixed

- **`#502` — staging served 404s for every seeded product image, the button meant to fix that
  matched nothing, and Open Food Facts repeated one wrong image without ever flagging it**
  (`specs/2026-09-01-product-image-integrity/`). Four compounding defects, each confirmed against a
  live environment: (1) `prisma/seed.ts`'s `seedGeneratedCatalogue` did its placeholder uploads
  *after* its `existing >= count` early return, so once a database held the generated rows no later
  seed run uploaded the objects into that environment's bucket — dev had all of them, staging none,
  while staging's pages went on referencing them (production was unaffected: it carries no generated
  products and its curated ones have real uploaded `.webp` images). The uploads now run before the
  guard, and `scripts/restore-placeholder-images.ts` repairs databases whose rows already exist —
  it reads rows and writes only storage, takes an explicit `--env-file`, and prints the resolved
  host and bucket before acting (`#119`). (2) `getProductsWithoutImages` asked for
  `images: { none: {} }`, matching **zero** products for either vendor because both seed paths give
  every product a placeholder row; it now selects products whose images are all placeholders, which
  covers the no-image case in the same clause since Prisma's `every` is vacuously true for an empty
  relation — verified against a real database in `scripts/verify-repository-injection.ts`, not a
  mock. (3) `saveGeneratedProductImage` wrote `isPrimary: false` while every storefront read selects
  `where: { isPrimary: true }`, so a filled image would have uploaded, cost an AI call and never
  displayed; it now claims primary and removes the shared placeholder it replaces. (4)
  `lib/product-metadata.ts` returned Open Food Facts' top hit with no relevance check, so every
  product whose name shared a keyword got one identical image — a pure `isRelevantMatch` floor now
  rejects unrelated hits, `needsReview` is set on the Open Food Facts path as well as the AI one
  (it was set only on AI, flagging the source *least* likely to be wrong), and the operator can
  switch Open Food Facts off per run from a checkbox beside the Auto-fill button. Separately,
  `ProductCard` now degrades a missing object to the same grey box a product with no image gets
  rather than the browser's broken-image icon, which removes the failure mode rather than today's
  instance. **Deliberately deferred:** the 10-per-click backfill cap stays (2,026 products would be
  200+ clicks, but uncapped is an unbounded Workers AI spend from one button) — `#504`.

### Added

- **`#498` — bundle cards match the product-card design language, a neutral bundles heading,
  keyset-compatible "Previous page", and subcategory tabs on every subcategory page**
  (`specs/2026-08-31-storefront-cards-pagination-tabs/`). Four more gaps found by live review right
  after `#496` shipped: (1) `BundleCard` was the only card on the storefront with no hover/tilt
  effect — it now shares `ProductCard`'s `.skew-card` treatment (`app/globals.css`, P8.5a/`#345`);
  (2) the bundles section's hardcoded `"Meal bundles"` heading and "one meal" subtitle (wrong for
  the seeded non-food "Kitchen Pack", and would be wrong for SriMart's electronics bundles entirely)
  are now the neutral "Value Bundles"; (3) category-page pagination only ever had "Next" — a
  `back` search param now carries the comma-joined stack of prior cursors so "Previous" works too,
  with no `OFFSET` and no `COUNT` query anywhere (this app's pagination is keyset-only by
  architectural decision) — absolute page numbers are deliberately not built, since a keyset page
  never fetches the total count numbering them would need; (4) a subcategory's own page rendered no
  tabs at all (its own `children` is always empty, the tree being capped at two levels) —
  `getCategoryBySlug` now also selects the parent's own `children`, so the exact same sibling tab
  row (department + every subcategory) renders whether you're on the department's page or one of
  its subcategories', with only the active pill changing.
- **`#496` — a department page now shows everything in it, four more top-level departments, a
  persistent "Shop" link, and a bigger hero slider** (`specs/2026-08-31-storefront-browsing-ux-fixes/`).
  Four related gaps found by live review right after `#494` shipped: (1) a department's own page
  (`/categories/fruit-veg`) showed only its 2 directly-assigned curated products, none of the
  products under its subcategories, because `listProductsByCategory` matched an exact `categoryId` —
  it now takes an array and aggregates a department with every one of its children, and
  `SubcategoryLinks` gained a leading "All" pill making that aggregation visible rather than a silent
  behaviour change; (2) the top department scroller had only 9 items, not enough to overflow a
  typical viewport and actually need its scroll arrows — four more real curated departments (Frozen
  Foods, Health & Beauty, Baby & Kids, Pet Supplies) added to `prisma/seed.ts`; (3) the landing page
  had no persistent link into `/categories` at all (its "Shop List" link is deliberately hidden
  there) — a new "Shop" link in the header fixes that, visible on every non-portal route; (4) the
  landing hero's department slider was capped at a fixed 28rem regardless of viewport — now an even
  `lg:grid-cols-2` split.
- **`#494` — storefront subcategory navigation, so a subcategory (and anything assigned to it) is
  actually reachable** (`specs/2026-08-31-storefront-subcategory-navigation/`).
  `lib/repositories/categories.ts`'s `getCategoryBySlug` has always fetched a category's `children`
  ("the only shape the storefront can render", per its own comment), but no page ever rendered them
  and nothing linked to a subcategory's URL — found live on staging right after `#489` seeded 27
  Aheed subcategories: `/categories/groceries` showed only its 2 directly-assigned products, none of
  the products under its `rice-grains`/`lentils-pulses`/`cooking-oils` children, which were only
  reachable by typing the URL directly or via search. New `components/product/SubcategoryLinks.tsx`
  (a small presentational component, matching the existing `DepartmentScroller`/`DepartmentHero`
  pattern) renders a category's children as clickable links above its product grid, and renders
  nothing when there are none — which is always true for a subcategory itself, since the tree is
  capped at two levels. No repository, service or schema change: the data was already fetched. The
  admin side already worked (`components/staff/CategoryForm.tsx`'s parent picker), so anything
  admin-created is now visible on the very next page load — the route is already `force-dynamic`
  with no caching layer to invalidate.

- **`#489` — a two-level category tree in the seed, and an env-gated ~2,000-product generated
  catalogue, so the app can be measured at realistic row counts**
  (`specs/2026-08-31-catalogue-depth-and-scale/`). `Category.parentId` has existed since P2a and
  `lib/repositories/categories.ts` caps the tree at exactly two levels, but **no fixture had ever
  created a single subcategory** — the capability was built and entirely unexercised. The seed now
  creates 31 (27 Aheed, 4 SriMart) in their own pass keyed on the child's slug, so a database seeded
  before this slice also gains them.
  - `SEED_SCALE_PRODUCTS=2000` adds 2,000 deterministic generated products (seeded PRNG, not
    `Math.random()`, so a recorded measurement is reproducible); `SEED_REMOVE_GENERATED=1` undoes it.
    Aheed-only, so SriMart stays small and cross-vendor isolation checks stay fast.
  - The generated path shares **one image object per subcategory instead of one per product** (27
    uploads, not 2,000 — and `refreshProductImages` ran unconditionally on every seed run), and uses
    `createMany` instead of 2,000 sequential nested creates. `createMany` is safe here specifically
    because the seed runs in real Node on the WebSocket adapter, **not** the HTTP adapter `#382`
    forbids it on. 2,000 products seed in ~22s.
  - The generator lives in `prisma/generate-catalogue.ts`, not in `prisma/seed.ts`, because
    `seed.ts` calls `main()` at module scope — a test importing it from there would have run the
    whole seed against a real database as a side effect of `npx vitest run`.
  - New `scripts/measure-catalogue-queries.ts` measures the Prisma read paths and prints a
    catalogue-shape summary. Kept separate from `scripts/measure-nfr.ts`, which is deliberately
    HTTP-only so it can run from a clean checkout (P7d R4/R6).
  - **Removes the precondition that has blocked `#286` since P2** ("should not be built against seed
    fixtures"), and with it the blocker on `#396`.

### Changed

- **`docs/developer-portal/nfr-baseline.md` gains a query re-measurement at catalogue scale
  (`#489`).** Everything previously recorded was measured at `Product` = 22, where that document
  itself concludes "none of them is index-sensitive yet" — so the headline `API p95 < 400ms` verdict
  was measuring Neon's round-trip, not this app's queries. Re-measured on the dev branch at 2,018
  products: **every path still meets the target**, worst 95.4 ms (4.2x margin), so **no remediation
  issue was filed because there was no breach**. Product search is the only real signal (p95 75.1 ms
  to 95.4 ms, +27%) and is the only path the review marks `scan`. `listProducts` came out *faster* at
  ~100x the rows, recorded explicitly as evidence the figures remain round-trip dominated rather than
  as an improvement. Existing tables untouched; `listOrdersForUser` recorded as not measurable (the
  dev branch holds no orders with a `userId`).
- **`docs/developer-portal/env-setup.md`** documents the two new seed vars and, for the first time, a
  **dev** `SEED_AHEED_HOST`/`SEED_SRIMART_HOST` pair — only staging and production pairs were
  documented, and neither var was set anywhere, so SriMart had never been seeded into the dev branch.

### Fixed
- **`#468`, `#469`, `#481`, `#482`, `#483` — the P9.1 auth rate limiter has never functioned, for
  three independent, compounding reasons, since it shipped on 2026-08-29**
  (`specs/2026-08-31-rate-limit-hardening/`). Started as two narrow follow-ups from P9.1
  re-validation (`#468`: `AuthenticationAttempt`/`OrderLookupAttempt` grow unbounded with no
  retention sweep; `#469`: the throttle is skipped, not refused, when no vendor resolves — a
  confirmed exploitable brute-force bypass, since `User.email` is globally unique and unscoped from
  tenant resolution). Grew to five while live-verifying `#469`'s fix, each new defect found by
  confirming the previous fix actually worked end to end:
  - **`#481`** — the sensitive-path list matched with `endsWith` against placeholder strings
    (`/sign-in`, `/forget-password`) that never equal Better Auth's real registered endpoints
    (`/sign-in/email`, `/request-password-reset`). Confirmed live: 7 wrong-password attempts against
    the real endpoint all returned `401`, never `429`. Fixed with the corrected literal suffixes —
    deliberately still `endsWith`, not Better Auth's own internal `startsWith` convention, which
    matches a basePath-*stripped* path `authOnRequest` never sees.
  - **`#482`** — `AuthenticationAttempt` never had a migration in the first place. PR `#461` added
    the model to `prisma/schema.prisma` but no migration was ever committed for it, in any branch —
    confirmed the table didn't exist in the dev database, and since `deploy-staging`/
    `deploy-production` both run `prisma migrate deploy` from the same committed migrations, almost
    certainly missing in staging and production too. Fixed by generating and applying the missing
    migration (`prisma migrate diff`, since `#378` blocks `migrate dev`).
  - **`#483`** — the root cause making `#469` and `#481` moot even once fixed individually: a bare
    top-level `onRequest` key in `betterAuth({...})`'s config is accepted by TypeScript but never
    invoked at runtime. Better Auth's router always installs its own internal `onRequest`, which only
    calls a *plugin's* `onRequest` — never a bare `ctx.options.onRequest`. Fixed by wrapping the
    unchanged rate-limit logic in a minimal plugin (`authRateLimitPlugin`) registered via
    `plugins: [...]`.
  - **Verified live, end to end, after all three fixes together**: 5 rapid wrong-password
    `POST /api/auth/sign-in/email` attempts against the real endpoint return `401`; a 6th and 7th
    return `429` with `{"error":"Too many requests"}`; exactly 5 `AuthenticationAttempt` rows are
    written (the blocked attempts write none, closing `#468` too — its opportunistic
    `deleteMany` sweep, added to both `checkAuthRateLimit` and `checkOrderLookupRateLimit`, only
    fires on allowed calls). `checkOrderLookupRateLimit` had zero prior test coverage of any kind;
    its new test file covers the pre-existing allow/block behavior as well as the sweep.
  - **Also removed, unrelated to any of the five issues**: `board.json` (616 lines, a stale
    `gh project item-list` dump) and `scratch.ts` (a 2-line exploration snippet), both accidentally
    committed by PR `#461`. No schema-language change — only the migration `#482` needed.

- **`#478`, `#479`, `#467` — the three gaps `#459`'s error-boundary slice left behind**
  (`specs/2026-08-31-error-boundary-gaps/`). Found by re-reading that artifact against the code at
  `/orient`, not against its own build notes, which recorded "Deviations from Spec: None."
  - **`app/error.tsx` preserved neither site chrome nor vendor branding (#478)**, while `#459`'s
    `plan.md` claimed it "is rendered *inside* the existing root layout, meaning the site
    navigation, header, and footer will still be visible." `app/layout.tsx` renders
    `<html><body>{children}</body></html>` and nothing else — the header and footer live one level
    down in `app/(storefront)/layout.tsx` via `StorefrontChrome`, and `brandStyle()` (ADR-004 slice
    4) is applied in exactly two places, `StorefrontChrome.tsx:30` and `app/(admin)/layout.tsx:41`.
    A root `error.tsx` is a sibling of the root layout, so it replaced the whole route-group subtree
    including both. **SriMart rendered Aheed's green on every 500**, and nothing in
    `lint`/`typecheck`/`test` sees a second vendor's output. Fixed by adding
    `app/(storefront)/error.tsx` and `app/(admin)/error.tsx`, which sit *inside* their group layouts
    and so keep header, nav, footer and the vendor's injected primitives. The root `app/error.tsx`
    is deliberately kept, not replaced: a boundary inside a layout cannot catch a throw *from* that
    layout, so it remains the outer fallback for e.g. `getCurrentVendorProfile()` failing — which is
    what makes the layering intentional rather than incidental.
  - **Both boundaries used stock Tailwind red instead of the audited danger tokens (#479)**, so R3
    ("must use the existing design system") was never met. `bg-red-100 text-red-600` became
    `bg-danger-tint text-danger`. Those token literals are not cosmetic: P7 closeout (#251/#217)
    darkened `--color-danger` off the raw brand red precisely because `#d32f2f` on the red tint
    measured 4.36:1 and failed WCAG 2.2 AA at `text-sm`, and `tests/design-tokens-contrast.test.ts`
    asserts that pair. The stock pairing sat outside that audit entirely. Every colour the new
    shared panel uses is an already-audited pair. `app/not-found.tsx` — the sibling these files were
    visibly copied from — had been using tokens all along.
  - **Neither boundary had a test, and no validation row ever rendered one (#467).** The evidence
    recorded for `#459` was a `200 OK` on a healthy page, which exercises no boundary at all: a
    boundary only renders when something throws beneath it, so that `200` was equally consistent
    with the files not existing. `tests/error-boundary.test.tsx` adds **23 tests** across all four
    boundaries. The load-bearing ones assert that an `Error` carrying a config message, a `digest`
    and a `stack` leaks none of the three into `textContent` **or** `innerHTML` — the surface
    `#430`'s fail-closed throw actually lands on — plus one `console.error` per throw, `reset()`
    wiring, and that no `red-<n>00` utility can come back.
  - **New `components/errors/ErrorPanel.tsx`** holds the branded markup once, so the four boundaries
    cannot drift apart the way the original two did. It is never passed the error object at all —
    the structural half of the no-leak requirement, since a future "show details" toggle would have
    to add a prop rather than arrive quietly.
  - **`#459`'s own spec is corrected in place**, not left to be re-read as true: `plan.md` §2's
    header/footer claim and `build-notes.md` §3's "Deviations from Spec: None" both now say what was
    actually the case, pointing at this slice. **No schema change, no migration.**
  - `#459`'s `validation.md` had also asked for `global-error.tsx` to be verified under
    `npm run dev`, where Next does not substitute it at all (the dev overlay owns the screen), so
    that step could never have observed what it claimed. This slice's `validation.md` uses
    `npm run preview` and forces real throws, per `CLAUDE.md`.
  - **`/validate` found this slice's own R7 could not be true as written, and `/fix` corrected the
    root cause.** R7 claimed a boundary's `console.error` gives `wrangler tail`/Workers Logs
    visibility; it cannot, since `error.tsx`/`global-error.tsx` are Client Components and that call
    runs inside a `useEffect`, which only ever executes in the browser after hydration — confirmed
    live by forcing a throw under `npm run preview` and finding no boundary-naming line in the
    Worker's own log store. Fixed by adding **`instrumentation.ts`** exporting `onRequestError`
    (`tests/instrumentation.test.ts`, new), which Next.js calls server-side, once, per request that
    throws, independent of which boundary displays the fallback — re-verified live, producing
    exactly one `"Unhandled request error:", { path, routerKind, routeType, error }` line per throw.
    Each boundary keeps its own `console.error` (Next's documented client-side pattern, and what
    `tests/error-boundary.test.tsx` actually proves); `requirements.md`'s R7 and `validation.md`'s L7
    are corrected to say which mechanism gives which guarantee.


### Documentation
- **`/document` closeout for `#494`, `#496`, `#498`.** Reconciles `specs/roadmap.md` with three
  staging builds `npm run sdd:audit` reported missing their change-log row: **PR #495**
  (subcategory navigation, merge `4c64ea4`), **PR #497** (category aggregation, more departments, a
  shop link, a bigger hero, merge `70c047b`), and **PR #499** (bundle card styling, a neutral
  bundles heading, keyset "Previous" pagination, and subcategory tabs everywhere, merge `d2c242a`).
  Each was a rapid live-review follow-on to the one before it — clicking through what the previous
  slice actually shipped surfaced the next layer of gaps every time, rather than one pass covering
  the whole storefront-browsing area. **A `CLAUDE.md` lesson strengthened**: the bare-`{...}`-in-MDX
  trap (previously hit twice, both times editing an *existing* doc) recurred a third time inside
  `#496`'s own brand-new `plan.md`, on its first draft — proof that writing fresh spec prose is
  exactly as exposed as editing an existing file, with no "this is new" exemption. `gates` green on
  all three PRs; `deploy-staging`/`deploy-docs-internal` confirmed green after each merge, and each
  slice's live claims were re-verified directly against staging after deploy (not just under
  `npm run preview`) — a full pagination round trip, the sibling tab row on a subcategory page, and
  the bundle section's new heading and card styling all confirmed with real HTTP fetches against
  `staging.aheedfoodcentre.nocaped.com`. `ARTIFACT_INDEX.md`/`docs.ts` rebuilt; `npm run sdd:audit`
  re-run and exits with zero gaps.
- **`/document` closeout for `#489`.** Reconciles `specs/roadmap.md` with what `/validate` and
  `/ship` actually found: a new change-log row for **PR #492** (build, merge `a6ba350`, `staging`)
  and a carry-forward row for **PR #488** (promotion, merge `5c6dca2`, `staging -> main`), which
  `npm run sdd:audit` reported pending at Orient. `gates` (`quality`, `docs-gates`) green on PR
  #492; `deploy-staging` and `deploy-docs-internal` both confirmed green post-merge. **Fresh-context
  `/validate` exercised all 22 requirements live against the dev Neon branch**, not from code
  review — removed the generated set (Aheed 18/SriMart 3, categories intact) → reseeded at
  `SEED_SCALE_PRODUCTS=2000` (Aheed 2018, 27 distinct storage keys, 2000/2000 primary-image and
  inventory counts, one generated image fetched live off the dev CDN) → reseeded a second time
  (idempotent, unchanged) — `putObject` counts 21 → 48 → 21 confirmed the shared image pool and the
  idempotent re-run. **One process note recorded in `specs/sdd-workflow.md`**: the feature branch
  had been cut from `origin/main` (post-PR-#488) rather than `origin/staging` — harmless only
  because the two were content-identical, caught by comparing `git merge-base HEAD origin/staging`
  against `git merge-base HEAD origin/main`, fixed by rebasing before pushing. **Another recorded
  there**: `prisma migrate reset --force` was refused by the coding agent's own sandbox during
  `/validate`; the seed's own `SEED_REMOVE_GENERATED`/`SEED_SCALE_PRODUCTS` toggles proved the same
  exact-count requirements without a full wipe. **`#489` moved to `In Review`** on Project #2;
  `ARTIFACT_INDEX.md`/`docs.ts` rebuilt; `npm run sdd:audit` re-run and exits with zero gaps.
- **`/document` closeout for `#434`, `#435`.** Reconciles `specs/roadmap.md` with what actually
  shipped and, unlike most prior closeouts, with what actually reached production in the same
  session: two new change-log rows cite **PR #474** (build, merge `1de4df2`, `staging`) and
  **PR #475** (promotion, merge `d7a048f`, `staging -> main`). `gates` was green on both PRs
  (`quality`/`docs-gates` as separate jobs on #474); `deploy-staging` completed in the new
  build-before-migrate order, and `deploy-production` then ran for real — the first live exercise of
  both fixes on the production path, with the new `quality` job passing all five checks before
  `Build (OpenNext)` → `Apply migrations` → `Deploy to Workers` ran in order. **R10, the row proving
  the ordering change does something rather than just that the YAML was edited, was exercised live**
  at `/validate` on a scratch branch (`scratch/verify-434`, deleted after): a deliberate build
  failure produced a real workflow run where `Build (OpenNext)` concluded `failure` and
  `Apply migrations` concluded `skipped`, confirmed afterward that no migration reached staging.
  PR #475 also carried **PR #471** (doc-encoding repair, KMS index gap, P9.1 row corrections) to
  production, since `main` was seven commits behind `staging` after PRs #464/#465/#466 bypassed it
  directly — noted in the roadmap row rather than left implicit. **`#434` and `#435` closed and
  moved to `Done`** on Project #2, auto-triggered by the promotion merge with no manual
  reconciliation needed. `ARTIFACT_INDEX.md`/`docs.ts` rebuilt; `npm run sdd:audit` re-run and
  exits 0.
- **`/document` closeout for `#478`, `#479`, `#467`, `#468`, `#469`, `#481`, `#482`, `#483`.**
  Reconciles `specs/roadmap.md` with the two staging builds and the one promotion `sdd:audit`
  reported as undocumented: **PR #480** (error boundary gaps, merge `c9170f4`, `staging`), **PR
  #485** (P9.1 auth rate limiter fix, merge `8d2bbd4`, `staging`), and **PR #486** (promotion,
  merge `b919650`, `staging -> main`) — plus **PR #477** (P9.2 closeout documentation, merge
  `a9f178c`, `staging -> main`), which had also reached production undocumented. `gates` was green
  on PR #480, PR #485 and PR #486; `deploy-staging`, `deploy-docs-internal` and `deploy-production`
  all confirmed green, with production `/api/health` reporting commit `b919650` and `db.ok: true`
  after the promotion. `deploy-staging`'s first attempt on PR #485 failed with a transient `P1001`
  against staging's direct Neon endpoint — a local `prisma migrate status` against the identical
  `DIRECT_URL` succeeded seconds later, confirming the database was reachable and the failure was a
  CI-runner network blip rather than a real outage; `gh run rerun --failed` then succeeded.
  Recorded in `CLAUDE.md`'s branch-strategy section so a future `P1001` there gets a local-check
  first, not a blind retry. **All eight issues closed and moved to `Done`** on Project #2,
  auto-triggered by the PR #486 promotion merge. `ARTIFACT_INDEX.md`/`docs.ts` rebuilt;
  `npm run sdd:audit` and `npm run kms:validate` both re-run and exit clean.

### Added
- **`#459` — Global 500 Error Boundary.**
  Added `app/global-error.tsx` and `app/error.tsx` to cleanly intercept unhandled application crashes (such as missing production configuration leading to a fail-closed crash). Instead of a raw browser 500 or generic Next.js fallback, users now see a branded, user-friendly "Something went wrong" UI that prevents leakage of sensitive error stack traces or Zod validation errors.

### Changed
- **`#434` — production and staging now build before they migrate.** (P9.2).
  Both deploy workflows ran `npx prisma migrate deploy` *before*
  `npx opennextjs-cloudflare build`, so a build failure left the database on a newly migrated schema
  while the Worker continued serving the previous bundle. The adapter build is the step most likely
  to fail — a root `proxy.ts` once passed `next build`, `lint`, `typecheck` and every test and failed
  only there. Both workflows reorder to **build → migrate → deploy**; the old combined
  "Build (OpenNext) & deploy to Workers" step is split so the migration can sit between them.
  Building first is safe because the build touches no database: the Prisma client is generated from
  `prisma/schema.prisma`. The window is narrowed, not closed — a `wrangler deploy` failure after a
  successful migrate still leaves production migrated ahead of its code, which is #438's territory.
- **`#435` — the production deploy path now runs the same checks a pull request runs.** (P9.2).
  `deploy-production.yml` ran no lint, format, typecheck or test step, because `gates.yml` triggers
  on `pull_request` only and nothing quality-related ran on a push to `main`. The five shared checks
  move into a new reusable `.github/workflows/quality.yml` (`on: workflow_call`) that both
  `gates.yml` and `deploy-production.yml` invoke, with the deploy job declaring `needs:` on it.
  Chosen over duplicating the steps into each caller, which creates two definitions that drift the
  moment a check is added to one and not the other. `gates.yml` becomes two jobs — `quality` and
  `docs-gates` — because the KMS `ARTIFACT_INDEX` staleness check and the Gate 4 CHANGELOG diff both
  need `github.base_ref`, which a push event does not have, so they cannot move into the shared
  workflow. `deploy-staging` deliberately does not get the quality job: `gates` already ran those
  checks on the PR that produced the merge.
- **`deploy-production.yml`'s `environment: production` comment corrected.** It asserted a manual
  approval gate via required reviewers that was never configured — that protection needs a paid plan
  for private repos and was rejected with a 422 on this repo. Related: verified this slice that
  **neither `main` nor `staging` has any branch protection at all** (both return
  `404 Branch not protected`), so CLAUDE.md's suggestion to "accept branch-protection-only review"
  described a fallback that does not exist. CLAUDE.md's branch-strategy section updated to say
  plainly that nothing mechanically enforces the flow, citing PRs #464/#465/#466 merging straight to
  `main` on 2026-08-30 as the live consequence.

### Fixed
- **Roadmap, changelog and build-notes encoding corruption from PowerShell backtick escapes.**
  Five documentation lines across three files were written through a PowerShell double-quoted
  string, where the backtick is the escape character. Every backtick intended as a Markdown code
  fence was consumed: `` `0 `` became a NUL byte, `` `a `` a BEL, `` `b `` a backspace and `` `f ``
  a form feed, so `` `0334f6d` `` rendered as `334f6d` and `` `app/global-error.tsx` `` as
  `pp/global-error.tsx`. One line additionally carried a raw `0x97` (cp1252 em-dash), which made
  `specs/roadmap.md` invalid UTF-8 — `grep` reported the whole file as binary and `git diff` could
  not show it as text. A sixth line, in
  `specs/2026-08-29-p9-1-fail-closed-config/build-notes.md`, had a UTF-16LE fragment appended to a
  UTF-8 file. All repaired at byte level and re-verified: zero control characters, valid UTF-8,
  `prettier --check` clean. This is the exact trap CLAUDE.md's Windows section warns about.
- **`specs/2026-08-30-global-500-error-boundary/` was invisible to the KMS index.** All four files
  carried front-matter that fails the KMS schema (`type: plan|requirements|validation|build-notes`,
  `status: active`, `audience: [frontend]` — none of which are in the enums — and no `visibility`).
  Corrected to the repo's actual convention: `plan.md` carries the single KMS artifact per slice
  (`type: spec`, `audience: [dev]`, `status: approved`, plus `visibility`/`summary`/`tags`), and the
  other three carry no front-matter, matching every other slice. `ARTIFACT_INDEX.md` rebuilt —
  118 → 119 artifacts — so `npm run sdd:audit` passes.
- **`npm run kms:validate` silently skipped those four files instead of failing.** Its escape hatch
  for non-KMS front-matter keys on the absence of `visibility`, which is exactly what a malformed
  KMS doc also looks like, so it reported `invalid front-matter (failing): 0` while skipping real
  breakage. The hatch no longer applies under `specs/` or `docs/`: those trees are KMS-owned, so a
  front-matter block there is always an attempt at this schema. Verified by reintroducing the
  original front-matter and confirming all four errors are now reported as a hard failure.
- **Roadmap accuracy, found re-validating P9.1.** The #431 row claimed the limiter coordinates
  "across Vercel/Cloudflare edge workers" — this project has never run on Vercel. The #433 row
  described the new `CHECK` constraints as "strictly positive inventory/quantity"; `Inventory.quantity`
  is `>= 0` (zero stock is legal and routine) and only `OrderItem.quantity` is `> 0`. The #459 row
  claimed validation "on staging" proving "OpenNext Edge routing" was undisrupted — the slice merged
  straight to `main`, `staging` was fast-forwarded onto it afterwards, and this app does not use
  Next's edge runtime at all. All three corrected against the code and the merge history.

### Security
- **`#340` — Cross-tenant writes prevented in reviews repository.** (P9.1).
  Added `vendorId` enforcement to `upsertReview` and `deleteReview`. Previously, these functions implicitly relied on `productId` and `userId` ownership, which failed the explicit tenancy boundary requirement. The functions now strictly filter by `vendorId`, preventing cross-tenant manipulation. Callers in `lib/reviews-service.ts` supply the current tenant via request-scoped identity. Test exceptions for `reviews.ts` in `repository-vendor-scoping.test.ts` were removed.
- **`#432` Slice 1 — Cross-tenant data integrity for Product → Category relation.** (P9.1).
  Added a composite foreign key `(categoryId, vendorId)` to `Product` referencing `Category(id, vendorId)`. Previously, a vendor's product could cite another vendor's category. This structural schema change physically prevents cross-tenant references from being persisted.
- **`#433` — Commercial CHECK constraints.** (P9.1).
  Added native PostgreSQL `CHECK` constraints via a hand-authored migration to prevent logically invalid commercial data (e.g. negative prices, negative stock, bad price tiers). Prisma cannot natively model table-level checks in `schema.prisma`. Hand-authored migration `20260829232000_p9_1_data_integrity_hardening` contains the necessary DDL. Data audit scripts were run against the shadow DB to guarantee no constraints were violated by existing records.

### Security
- **`#431` — Production authentication rate limiting.** (P9.1).
  Added a Workers-compatible abuse-control mechanism to bound credential stuffing and password-reset abuse. Better Auth's default rate limiter relies on an in-memory store (ineffective across isolates) and a database increment operation that crashes on HTTP Prisma clients. This slice explicitly disables Better Auth's limiter and instead intercepts sensitive paths (`/sign-in`, `/sign-up`, `/forget-password`, `/reset-password`, `/send-verification-email`) via Better Auth's `onRequest` hook in `lib/auth.ts`. The check reuses the proven Postgres-backed fixed-window rate-limiting pattern introduced for order lookups, enforcing a maximum of 5 attempts per IP per minute via a new `AuthenticationAttempt` table.
- **`#430` — Fail closed when Stripe production configuration is missing or invalid.** (P9.1).
  Previously, `getPaymentService()` and `getEmailService()` gracefully degraded to stub implementations if their respective API keys were missing. This allowed local development and CI to operate safely without real credentials, but posed a critical risk in production: a misconfigured environment would silently accept orders without ever processing a payment or sending an email.
  Fixed by attaching `.superRefine()` validation to `paymentSchema` and `emailSchema` in `lib/config.ts`. If `process.env.NODE_ENV === "production"`, these schemas explicitly reject missing `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL`. (This entry originally credited `schema` alongside `emailSchema`; `schema`'s `superRefine` is an empty no-op carrying only a comment, and the Stripe keys live on `paymentSchema` — corrected 2026-08-30. The dead no-op itself is tracked as `#470`.) A new test file `lib/config.test.ts` asserts that this strict enforcement only applies in production environments, fully preserving the mock capability for dev/test safely. `vi.stubEnv` was used to robustly isolate environment variables in the tests.

- **`#429` — a verified Stripe signature no longer confirms or cancels an order on its own.** Second
  slice of **P9.1**. Signature verification is sound and untouched; the gap was downstream.
  `app/api/webhooks/stripe/route.ts` acted on `metadata.orderNumber` alone, and
  `Payment.providerReference` — the Checkout Session id, written post-commit — was never read back.
  A session created in the same Stripe account with crafted metadata, or a metadata mix-up during an
  integration change, both arrive correctly signed. Both transitions now also prove correspondence
  against the stored payment, **in the `where` clause of the compare-and-set that already guarded the
  status change**, never by fetching and then comparing in application code — the P7a lesson recorded
  on `findOrderForGuestLookup`, where a missing credential *skipped* the comparison rather than
  failing it. That placement makes the nullable case free: a stored `null` cannot equal a non-null
  session id, so an order whose session write never landed is refused by the same predicate that
  refuses a wrong one, with no separate branch. **`checkout.session.expired` /
  `async_payment_failed` are bound too**, beyond the issue's literal ask — `failPayment` cancels an
  order, returns its stock, reverses a loyalty redemption and frees a discount-code use, all
  previously on an unbound order number. The two paths bind differently on purpose:
  `confirmPayment` checks provider, session id, amount and currency; `failPayment` checks session
  identity only, because cancellation asserts no money and refusing to release stock over a missing
  `amount_total` would strand inventory indefinitely. `confirmPayment`/`failPayment` return result
  unions instead of booleans — a bare `false` could not separate a duplicate delivery (normal and
  silent; Stripe retries aggressively) from a mismatch (loud), and the route logs identifiers only,
  never customer data. Every post-signature outcome still answers **200**, unchanged and deliberate.
  `features/checkout/cancel-order.ts` (#428's shopper-facing cancel) moves off the webhook service to
  a new **vendor-scoped** `cancelUnpaidOrder`: its credential is the capability token, it has no
  Stripe session to bind, and a placeholder binding would have defeated the slice. Adds
  `scripts/sign-stripe-event.ts`, committed because neither `stripe listen` nor a hand-built unit test
  can produce a genuinely-signed *mismatched* event — the only input that exercises the refusal path.
  No schema change, no migration. Deferred: **#454** (recovery for an order stranded
  `PENDING_PAYMENT` by a refused binding; #101 covers webhooks that never arrive, not ones refused).
- **`#427` / `#428` — an order number is no longer a credential.** First slice of **P9.1**.
  `app/(storefront)/checkout/[orderNumber]/page.tsx` resolved a guest's order with the order number
  alone and rendered their name, phone and delivery address; order numbers travel through emails,
  shared links, browser history and support threads. `Order` gains a nullable, unique
  `confirmationToken`, minted with `crypto.randomUUID()` inside `placeOrder`'s existing transaction
  and carried on both of Stripe's return URLs. `findOrderForViewer` takes it as a fifth explicit
  parameter: a member's order stays owner-only and ignores the token (a non-owner holding a valid one
  is still refused), a guest order needs a non-empty match against a **non-null** stored value, and
  the token is destructured out of the result beside `userId` so it never reaches `OrderSummary`.
  Every refusal — no such order, wrong token, not the owner — takes one branch to `/orders/lookup`
  instead of `notFound()`, so nothing confirms which order numbers are real. Orders placed before the
  migration keep a null token and fall back to that same lookup (order number + email); deliberately
  **not** backfilled, since minting tokens nobody was ever sent buys nothing.
  **`app/api/checkout/cancel/route.ts` is deleted.** Stripe's `cancel_url` returns the browser with a
  `GET`, so that route cancelled a live order and released its inventory for any link prefetcher,
  mail scanner, chat unfurler or crawler that touched the URL — which a token alone would not have
  fixed. The `GET` is now a non-mutating confirmation page at `/checkout/[orderNumber]/cancel`, and
  the write sits behind a POST server action that re-proves the token rather than trusting the form's
  hidden fields. The stub adapter's fallback destination in `features/checkout/place-order.ts` also
  carries the token: that branch is **every** checkout wherever `STRIPE_SECRET_KEY` is unset, so
  without it local preview and CI would refuse shoppers their own confirmation. Migration generated
  with `prisma migrate diff`, not `migrate dev`, which demands a dev-DB reset over a drifted
  checksum (**#378**); the same diff reported three `DROP INDEX` statements for the `pg_trgm`
  indexes, the false drift CLAUDE.md predicts for hand-authored DDL, deliberately excluded. Deferred:
  **#450** (a `getForStaff` comment still describing the old rule).

### Documentation
- **`CLAUDE.md` gains a note on `npm run preview`'s local observability query API**, found useful
  while validating #429's live rows: `wrangler dev` captures every `console.*` line into a queryable
  local store at `POST http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/observability/query`,
  which is what actually proved a `binding-mismatch` refusal logs exactly once and an
  `already-processed` duplicate logs nothing, rather than eyeballing an interleaved terminal.
- **`/document` closeout for `#429`.** Reconciles `specs/roadmap.md` with what actually shipped: a
  new change-log row cites **PR #455**, merge `5f7e32e`, `staging`; records `gates` green (1m10s) and
  both `deploy-staging`/`deploy-docs-internal` completing successfully post-merge, with staging's
  `/api/health` confirming commit `5f7e32e`. **All five live validation rows (R30–R34) were run for
  real**, not deferred: a genuine Stripe test-mode checkout confirmed an order through the binding;
  a signed-but-mismatched event was refused (`binding-mismatch`, order untouched); the genuine event
  replayed cleanly (`already-processed`, silent, no second email); a mismatched `expired` event left
  stock held and a genuine one released it. This is what proved the relation-filtered `updateMany` —
  untested against real Postgres until this run, per the slice's own build notes — is actually
  evaluated by the WebSocket adapter rather than silently ignored. **One gap found at Validate and
  filed rather than patched into scope**: `cancelUnpaidOrder` (the shopper-facing cancel path split
  off `failPayment` by this slice) has no unit test and no validation row reaches it — **#456**,
  tagged Phase `P8` per the board's known limitation. **#429 moved to `In Review`** on Project #2; it
  closes to `Done` only on promotion to `main`. Notes P9.1 has five issues remaining (**#430**–**#433**,
  plus the pre-existing **#340**) of its eight. `ARTIFACT_INDEX.md`/`docs.ts` rebuilt; `npm run
  sdd:audit` re-run and exits 0.
- **`/document` closeout for `#427`, `#428`.** Reconciles `specs/roadmap.md` with what actually
  shipped: a new change-log row cites **PR #451**, merge `221aea4`, `staging`; records `gates` green
  (1m6s) and both `deploy-staging`/`deploy-docs-internal` completing successfully post-merge. Notes
  P9.1 has six issues remaining (**#429**–**#433**, plus the pre-existing **#340**) of its eight.
  **Live validation surfaced a stale assumption, not a code defect**: this slice's own
  `validation.md` expected local preview to run the stub payment adapter (no `STRIPE_SECRET_KEY`
  set) for its live rows, but this repo's `.dev.vars`/`.env` both carry a real Stripe test-mode key
  by default, so checkout redirects to hosted Stripe Checkout locally the same as staging/production.
  R29–R31 were validated instead by resolving the guest order's token directly against the dev
  database and driving the confirmation/cancel pages by URL — the same authorization code the stub
  path would have exercised. Recorded in `CLAUDE.md`'s Stripe section so the next slice's
  `validation.md` doesn't repeat the assumption. **#427 and #428 moved to `In Review`** on
  Project #2; **#450** (filed at Build, a stale docstring deliberately left out of scope) tagged
  Phase `P8` per the board's known limitation, matching #427/#428. `ARTIFACT_INDEX.md`/`docs.ts`
  rebuilt (114 artifacts); `npm run sdd:audit` re-run and exits 0.
- **`/document` closeout for `#426`.** Reconciles `specs/roadmap.md`'s #426 row (written at Build,
  before the PR existed) with what actually shipped: cites **PR #447**, merge `7ab23c5`, `staging`;
  records `gates` green (1m18s on the merged commit) and both `deploy-staging`/`deploy-docs-internal`
  completing successfully post-merge. `/validate` found and fixed a genuine defect before merge — R3
  claimed `P08 — Deployment & launch` holds zero open issues, contradicting R11's requirement that
  **#420** stay open on it unchanged; the artifact was already correct (P08 shows exactly one open
  issue, #420), so `requirements.md`/`validation.md` were fixed instead, shipped in commit `96936db`
  on the same PR. `/validate` also finished R32's live check, left incomplete at Build — signed in
  live as `demo-store-admin@example.com` under `npm run preview` and confirmed `/staff/bundles/new`
  renders its create form. **#426 moved to `In Review`** on Project #2; the twenty new issues
  (**#427**–**#446**) are tagged Phase `P8` per the board's known limitation. `ARTIFACT_INDEX.md`/
  `docs.ts` rebuilt (113 artifacts); `npm run sdd:audit` re-run and exits 0.
- **`#426` — P8 closed as a historical record; P9 and P10 created.** The `P8 — Deployment & launch`
  milestone held **39 open issues** that were four different kinds of thing at once: genuine launch
  gates, post-launch enhancements, bookkeeping, and unresolved security work that nothing marked as
  such (**#340**, a cross-tenant write path). All 39 were redistributed with an explicit destination
  each — **#340** to P9.1; **#113, #104, #227, #246, #175, #219, #101, #94, #236** to P9.2;
  **#174, #350, #351, #398** to P9.3; twenty-three to P10; **#91** (the P8 epic) and **#408** (fully
  sequenced by #420) closed with reasons; **#420** left open to close on its own promotion.
  **P8.6 and P8.7 folded into P10** and their milestones closed one day after #420 created them,
  with #420's gate analysis (#363 gating #401/#402, ADR-006 gating #402 and #400's per-store half,
  #398's variant model gating #399 and #397's Pack Size facet, #399's second gate amending ADR-005)
  **preserved in the P10 prose rather than discarded**. P8.1/P8.2/P8.3/P8.5/P8.6/P8.7 keep their
  numbers and original text, marked with where their work went — renumbering would falsify
  `specs/2026-08-23-p8.1b-closeout/plan.md` and the change-log rows citing them. Six milestones
  created (`P9`, `P9.1`–`P9.4`, `P10`) and **twenty issues filed**: **#427**–**#433** (guest order
  PII, cancellation authorization, Stripe session binding, payment fail-closed, auth rate limiting,
  cross-tenant DB integrity, commercial CHECK constraints), **#434**–**#438** (migration-safe
  deploy, release quality gates, backup/PITR restore, alerting, rollback), **#439**–**#442** (LCP
  re-measurement, Playwright smoke suite, UAT, accessibility), **#443**–**#445** (game day, exact
  release-candidate verification, GO/NO-GO), **#446** (CSP hardening). Seven P10 themes are recorded
  as **prose, deliberately not filed as issues**. **Two claims were checked against the code and
  not filed as written:** **#243** was already closed and was **not** reopened (#439 measures the
  release candidate instead), and `/staff/bundles/new` proved not to be a broken journey —
  `[bundleId]/page.tsx` branches on `bundleId === "new"`. Six other claims were confirmed true
  against the code first, each cited to a file and line in `plan.md`. Extends the #267 board note to
  cover P9 and P10, which Project #2's Phase field cannot express either. Sequencing and decision
  work only — **no application code, including no fix for any security item filed**.
  `specs/2026-08-28-p9-launch-readiness-restructure/`, roadmap v1.53.0.
- **`/document` closeout for `#420`.** Reconciles `specs/roadmap.md`'s #420 row (written at Build,
  before the PR existed) with what actually shipped: cites **PR #424**, merge `be57b26`, `staging`;
  records `gates` green (1m20s) and both `deploy-staging`/`deploy-docs-internal` completing
  successfully post-merge. Names the three follow-up issues filed at Build and confirms their board
  placement (Backlog, Phase `P8`): **#421** (build the pre-launch set), **#422** (the business
  question ADR-006 left open), **#423** (`kms/site-internal/next-env.d.ts` dirtying `sdd:preclear`
  on every internal docs build). **#420 moved to `In Review`** on Project #2. `ARTIFACT_INDEX.md`/
  `docs.ts` rebuilt (112 artifacts); `npm run sdd:audit` re-run and exits 0.
- **`#420` — the `#408` storefront and fulfilment brief sequenced into the roadmap.** Fourteen
  issues (**#394**–**#407**, filed 2026-08-27) moved off their stated `P8` holding position.
  Before this slice `specs/roadmap.md` contained none of the strings `#408`, `#394` or `#407` —
  the issues existed, sat on Project #2, and were sequenced nowhere, while the roadmap said P8.2
  was next and the store is not live. Two phases **appended, not renumbered** (P8.1/P8.2/P8.3/P8.5
  keep their numbers, P8.3 stays the unscheduled catch-all): **P8.6 — Storefront discovery &
  conversion** (#394, #395, #396 paired with #286, #406, #405's link-only half, #400's
  async-loading half, #397's three boolean certification facets, and a **gated** #404) and
  **P8.7 — Fulfilment & merchandising data models** (#398's variant model, #399, #401, #402,
  #397's Pack Size and Brand facets, #400's per-store half). A **pre-launch set inside P8.2** —
  #407, #397's Country-of-Origin facet, the #403 investigation, #398's unit-price derivation half
  — is sequenced here and built by a separate later slice under its own issue; **no feature from
  the brief is built by this slice**. Also records the #397/#398/#400 phase splits, six gating
  relationships, the earliest-phase milestone rule (a GitHub issue carries one milestone; three of
  these are split), and the #267 board Phase-field limitation. GitHub milestones **P8.6** and
  **P8.7** created and ten issues re-milestoned; all fourteen stay open.
  **Three findings from checking the brief against the code rather than trusting it:** #407 is not
  schema-free (no social field exists on `VendorConfig` or `VendorBranding`, so it needs an
  additive migration); #403 is expected to ship no application code (`lib/payments.ts` uses hosted
  Stripe Checkout with `mode: "payment"` and pins no `payment_method_types`, so wallets are
  Dashboard-controlled — only Apple Pay domain registration is real work, and the live half waits
  on #113); and #399 is gated **twice**, the second gate being a payments-capture decision amending
  ADR-005, because `lib/payments.ts` sets no `capture_method` and the integration therefore captures
  immediately. Carry-forward change-log row for **PR #419** added, which `npm run sdd:audit` had
  reported as the one pending promotion.
- **`ADR-006 — Store locations (multi-branch shape)` added**, settling the question that gated
  #400's per-store half and #402. A store location is a child of `Vendor`, **never a second tenancy
  axis and never a second mandatory filter in `lib/repositories/*`** — `vendorId` stays the sole
  isolation axis, so adopting locations later is an additive migration rather than a rewrite of
  every repository query and of `tests/repository-vendor-scoping.test.ts`'s premise. Resolves a
  naming collision the brief never raised: **ADR-004 decision 1 already anticipates
  `Region`/`Location` reference tables**, which are *geography reference data* and a different
  concept from a trading site with stock and a collection counter — a trading site takes the more
  specific name `VendorLocation`. **The business question — whether Aheed trades from more than one
  site — is deliberately left open**; ADR-006 rules shape, not commerce, and `specs/mission.md`'s
  out-of-scope line on multi-branch management is **not** amended. `ADR-004` (1.9.0 → 1.10.0) gains
  a cross-reference on decision 1 so a reader with a locations question, who would open ADR-004
  rather than ADR-006, finds the ruling.
- **`/document` closeout for `#409`/`#411`/`#412`/`#415` (repository client injection, slices 2+3
  of 3 — #409 fully closed out).** `specs/roadmap.md` gets a full closure row for **PR #417**
  (merge `1cf7fd3`), recording `gates` green (1m15s), post-merge `deploy-staging` and
  `deploy-docs-internal` both completing, and the #415 smoke check (10/10 sequential requests to
  `https://staging.aheedfoodcentre.nocaped.com/` returning HTTP 200 with no Error 1102). Project
  #2's **#409, #410, #411, #412, #415** all moved to **In Review** (stay open; each closes only on
  promotion to `main`). Two lessons from this loop recorded where future sessions will actually
  read them: `CLAUDE.md` gains a note that piping a live-writing script (e.g.
  `scripts/verify-repository-injection.ts`) through `head` risks SIGPIPE killing it before its own
  cleanup runs — hit at `/validate`, left one product/two images/one category behind in the dev
  database until found and removed by hand; `specs/sdd-workflow.md` gains a note that a
  `validation.md` row checking `sdd:audit` reports zero gaps cannot pass at `/validate` if it means
  the *current* slice's own roadmap row, since that row is Document (final)'s job and can't exist
  yet — write such a row pinned to a specific already-landed PR instead, the way slice 1's own R19
  did. `ARTIFACT_INDEX.md`/`docs.ts` rebuilt (110 artifacts); `npm run sdd:audit` and
  `npm run kms:validate` both confirmed clean after the edits.

### Changed
- **`#409`/`#411`/`#412` — repository client injection, slices 2+3, completing `#409`.** The
  enforcement `#410` added could only cover four of the eight non-compliant files, so it shipped
  scoped to a `FILES_IN_SCOPE` list. **That list is deleted**: `tests/repository-client-injection.test.ts`
  now enumerates `lib/repositories/` from the filesystem and checks every file, so a newly added
  repository module is covered the moment it exists. Slices 2 and 3 were merged into one because that
  scoping window was slice 1's own declared weakness and two more loops would have kept it open.
  - **Converted (26):** `categories.ts` (4), `loyalty.ts` (3), `vendor.ts` (5), `products.ts` (14).
    All four now import `@/lib/db` with `import type` only. Resolution moved into the four existing
    sibling services — **no new service files**.
  - **Call sites keep the function names.** Each service imports the repository original under a
    `…Repo` alias and re-exports a same-named wrapper, so 29 call sites changed only their import
    path. `features/admin/storefront.ts` imported `updateVendorStorefrontConfig` under an alias, so
    the sweep was by symbol, not by name — a name grep reported it as dead code.
  - **Three dead Prisma clients removed.** `updateProductForVendor`, `setPrimaryProductImage` and
    `quickUpdateInventory` each constructed an HTTP-adapter client and **never read it**. So no
    `products.ts` export needs two clients — correcting "four of which need both clients", a figure
    carried through `#409`'s plan and both issue bodies. ESLint enables no `no-unused-vars` rule of
    any kind (verified empirically), which is why nothing caught it: filed as **`#416`**.
  - **`updateVendorStorefrontConfig`'s `data: any`** replaced with a named
    `VendorStorefrontConfigInput`, and its eight `brand*` writes iterated from a tuple instead of
    sixteen hand-written identifiers — a typo in one had been enough to silently stop writing a colour.
  - **Tests got simpler.** `tests/vendor-profile.test.ts` drops `vi.mock("@/lib/db")` and its dynamic
    import for a stub client passed as an argument; the two email tests re-point their mock at
    `@/lib/vendor-service`. Both email suites had been failing to load — 695 → 709 passing.
  - `scripts/verify-repository-injection.ts` extended to 14 checks spanning reads and writes across
    all four files, including the WebSocket `$transaction` path, with cleanup verified by re-count.
    It now **refuses to run** against any host named in `secrets/staging.vars` or
    `secrets/production.vars`, before constructing a client, with no override flag.
- **`#415` — Worker `cpu_ms` raised 50 → 300.** Error 1102 ("Worker exceeded resource limits") kept
  recurring on staging at 50, observed live at `2026-08-27T12:46:36Z` (Ray ID `a31b2e161d0a63c5`).
  React SSR plus Prisma's WASM query-compiler instantiation on a cold isolate is genuinely CPU-bound;
  Workers bills CPU actually used, not the ceiling, so the raise carries no cost on its own.
  Confirmation on deployed staging is a Ship-stage check, not a pre-merge one.

### Documentation
- **`/document` closeout for `#409`/`#410` (repository client injection, slice 1 of 3).** The
  `specs/roadmap.md` row this slice's own branch added is now updated with **PR #413**
  (merge `464b59d`) — unknown at Build/Ship time. Records that `gates` was green on the PR,
  `deploy-staging`/`deploy-docs-internal` both completed, and Project #2's **#410** moved to
  **In Review** (stays open; only closes on promotion to `main`). No reconciliation was needed
  against `/validate`'s findings — nothing surfaced there beyond what `build-notes.md` already
  recorded. `ARTIFACT_INDEX.md`/`docs.ts` rebuilt (109 artifacts); `npm run sdd:audit` and
  `npm run kms:validate` both confirmed clean after the edit.

### Changed
- **`#409`/`#410` — repository client injection, slice 1 of 3.** `CLAUDE.md` requires every
  `lib/repositories/*` export to take its Prisma client as an explicit parameter, so a plain `tsx`
  script can exercise it against a real database. **32 of 109 exports across 8 files did not**, and
  nothing checked it: `tests/repository-purity.test.ts` covers only the request-context half of the
  rule, and its docstring actively declared internal `getPrisma()` calls "compliant". They are not —
  `lib/db.ts` builds its client from `@prisma/client/wasm` (mandatory on Workers), whose query
  compiler **Node cannot load**, so a self-resolving export cannot run in a script at all. Measured
  against the dev Neon branch, not argued: an injected-client call passed, the self-resolving
  equivalent failed with `ERR_UNKNOWN_FILE_EXTENSION`, and the same query through the script's own
  client passed.
  - **New:** `tests/repository-client-injection.test.ts` — AST call-expression check (not a grep:
    these files legitimately name `getPrisma()` in prose and in `ReturnType<typeof getPrisma>` type
    positions). No function-level allowlist; temporarily scoped by a **file** list that #412 deletes.
    Proven to fire by reintroducing the defect and watching it fail.
  - **Converted (6):** `listCustomersForAdmin`, `checkOrderLookupRateLimit`, `getCatalogueHealth`,
    `getLoyaltyLiability` now take `prisma` explicitly; `createCodeForVendor`/`deactivateCodeForVendor`
    **relocated** to `lib/discounts-service.ts` rather than parameterised — they are pure facades over
    functions that already take a client, so a parameter would have left two identical entry points.
  - **New services:** `lib/customers-service.ts`, `lib/reports-service.ts`,
    `lib/order-lookup-rate-limit-service.ts`. Resolution has to live in `lib/` because ADR-004 slice
    2's `no-restricted-imports` rule forbids `@/lib/db` in `app/`/`features/`/`components/` — a caller
    there physically cannot hand a client in.
  - **New:** `scripts/verify-repository-injection.ts`, proving all five converted paths run against a
    real database with a Node-native client. The **guest order-lookup rate limiter** — a security
    control that could not be exercised outside a live request — now demonstrably refuses past its
    5-per-minute threshold.
  - Which client each path uses is unchanged; `deactivateCodeForVendor` still resolves `getPrismaWs()`
    for its `updateMany` (#382), and `tests/repository-transaction-safety.test.ts` is untouched.
  - Slices 2 (**#411** — `categories`, `loyalty`, `vendor`) and 3 (**#412** — `products.ts`, then
    delete the file scoping) remain open. The rule is not fully enforced until #412 lands.

### Documentation
- **Roadmap row for the `#382` production promotion (PR #393)** — carry-forward from the previous
  slice, the one gap `npm run sdd:audit` reported at this Orient.
- **`CLAUDE.md`'s repository-layer section rewritten** to state the rule once, name **both** enforcing
  tests, and record the `@prisma/client/wasm` finding. Adds the third instance of this rule claiming a
  false enforcement — and its distinct lesson: *a test that correctly enforces its own invariant can
  still launder a second, unenforced invariant if its comments opine on one.*
- **Roadmap change-log rows for P8.5d, the P8.5c+P8.5d production promotion, and the full `#382`
  saga** (`specs/roadmap.md`) — the three gaps `npm run sdd:audit` reported at this pass:
  `specs/2026-08-25-p8.5d-multi-buy-tier-pricing/` (PR #380, staging), the PR #381 promotion
  (`staging -> main`, closing #347/#348), `specs/2026-08-26-auth-http-transaction-fix/` (PRs #383,
  #384 — two real, independently-correct fixes that were still insufficient), and
  `specs/2026-08-27-prisma-many-http-transaction-fix/` (PR #391 — the fix that actually closed the
  bug). **Correction against issue #382's own write-up, found writing this pass's roadmap row**:
  its "corrected root cause" section named `restoreCartFromOrder` as a 4th broken call site: traced
  by hand and found already safe (its `prisma` parameter always resolves to `getPrismaWs()` via
  `placeOrder`); the real 4th site, `updateVendorStorefrontConfig`, was omitted from the issue
  entirely. Corrected via an issue comment rather than silently left stale. `#390` (nominal/branded
  `getPrisma()`/`getPrismaWs()` types, filed at Build) tagged Phase P8 on the delivery board — it
  had none. `ARTIFACT_INDEX.md`/`docs.ts` rebuilt (108 artifacts). `npm run sdd:audit` confirmed
  exiting 0 after this pass.

### Fixed
- **#382, corrected root cause**: four writes could 500 intermittently or unconditionally with
  `Transactions are not supported in HTTP mode` — never Better Auth, despite the identical error
  message and throw site. Prisma 6's client-side query compiler (`engineType = "client"`) wraps
  `updateMany`/`createMany` in an internal transaction the HTTP-mode adapter can't execute,
  regardless of `where`-clause shape or match count (confirmed empirically against a live Neon DB);
  a direct `.$transaction()` call on the HTTP client fails the same way unconditionally.
  `upsertBundle`/`setBundleImage` (bundle save/image upload), `deactivateCode` (discount
  deactivation), and `updateVendorStorefrontConfig` (`/staff/storefront` save) all now route
  through `getPrismaWs()` instead of `getPrisma()`. A new regression test,
  `tests/repository-transaction-safety.test.ts` (same no-allowlist AST pattern as
  `tests/repository-purity.test.ts`), statically enforces that no `updateMany`/`createMany` call
  site in the repository layer passes `getPrisma()` to a function that needs a transaction-capable
  client, and that no repository file calls `.$transaction(` directly on `getPrisma()`. Verified
  the test actually catches the bug by temporarily reverting the fix and confirming it fails on
  exactly these four sites and no others. See
  `specs/2026-08-27-prisma-many-http-transaction-fix/` for the full investigation and
  `specs/2026-08-26-auth-http-transaction-fix/build-notes.md`'s "RESUMED" section for how the
  original (correct-but-insufficient) diagnosis led here. The diagnostic instrumentation from that
  earlier investigation (see below) is fully reverted.

### Diagnostic (temporary — not a real change, will be reverted)
- **RESOLVED — all instrumentation below has been reverted; kept for history.**
- **#382 investigation**: two live fix attempts (`authDb()` Proxy wrapper, then also disabling
  Better Auth's rate limiter) both still crashed identically on staging. Temporary `console.log`
  instrumentation added to `lib/auth.ts` to observe via `wrangler tail` whether Better Auth's
  adapter is actually reading `$transaction` from the wrapped client at runtime, since local Node
  testing against a real Prisma client with real staging credentials shows the wrapping working
  correctly in isolation. This commit exists only to get a live answer; it will be reverted.
  **Update**: the `authDb()` diagnostic confirmed the wrapped client is NOT the crash source —
  live logs show `typeof wrappedDb.$transaction === "undefined"` on every access, including on the
  exact request that still crashes immediately afterward. A second, more direct diagnostic now
  patches every `getPrisma()` instance to log a stack trace the moment its real (unwrapped)
  `$transaction` is actually called, to find the true caller.
  **Update 2**: that diagnostic *also* never fired, live, on the exact request that still crashed —
  neither the `authDb()`-wrapped client nor `getPrisma()`'s own instance-level `$transaction` is
  ever called. The throw (`PrismaNeonHttpAdapter.startTransaction`, confirmed via `wrangler tail`)
  is a **prototype** method on a class `@prisma/adapter-neon` never exports directly (created
  internally by `PrismaNeonHttp.connect()`), so it's shared across every instance regardless of
  which `PrismaClient` wrapper called it. Patched via `connect()` instead, to reach that prototype
  directly and catch the call regardless of which client instance is actually involved.
  **Update 3**: the prototype patch *did* fire, but its captured stack trace bottoms out entirely
  inside Prisma's own query-plan interpreter (`interpretNode`/`execute`/`singleLoader`) — Prisma 6's
  client-engine-runtime doesn't preserve the original application call site across its internal
  async dispatch, so no amount of logging at the throw site can attribute this to a specific
  caller. Reoriented: instrumenting `attachBundleImage`'s own sequential steps directly (before/after
  each `await`) to find which of *its* operations is running when the crash happens, since Prisma's
  own internals can't say.
  **Update 4**: the step-logging diagnostic merged to `staging` (PR #388, `fe1ed5d`), but its
  `deploy-staging` run never acquired a runner — a GitHub Actions outage, confirmed via
  `githubstatus.com`. This PR carries no code change; it exists only to retrigger that stuck deploy
  via a fresh push (rerunning/cancelling the stuck run directly failed with contradictory API
  errors, itself a symptom of the same outage) and to land the prior session's pause notes, which
  were pushed to the already-merged `fix/auth-diag-382d` branch and never actually reached
  `staging`.

### Fixed
- **Any authenticated action could intermittently 500** with a generic "This page couldn't load —
  a server error occurred" page, on both staging and production. Root cause: `lib/auth.ts`'s
  `getAuth()` handed Better Auth's Prisma adapter the app's HTTP-mode client (`getPrisma()`), which
  has a `$transaction` method that throws `Transactions are not supported in HTTP mode` instead of
  being absent. Better Auth's own Prisma adapter (`@better-auth/prisma-adapter`) already falls back
  to a non-transactional path for exactly this case, but only when `typeof db.$transaction !==
  "function"` — since the HTTP client's `$transaction` genuinely is a function (just one that
  throws), that guard never tripped and the adapter called the throwing method instead. Fixed by
  wrapping the client passed to `prismaAdapter()` in a `Proxy` that hides `$transaction`, so the
  adapter's own fallback engages — deliberately not switching to `getPrismaWs()`, which would have
  fixed the crash at the cost of a new WebSocket connection on every authenticated request. Found
  live while shipping and validating P8.5d (#348, PR #380/#381), tracked and fixed as its own issue
  (#382) per this repo's SDD gates rather than folded into that unrelated slice. **This alone was
  not sufficient** — re-verified live, the crash persisted with an identical error digest, which
  turned out to be a second, independent trigger for the same underlying throw rather than proof the
  first fix failed (Next.js's `digest` hashes a stack trace that Prisma's shared transaction
  dispatcher makes caller-agnostic). The second cause: Better Auth's **built-in rate limiter
  defaults to enabled whenever `NODE_ENV=production`** — never a deliberate choice in this app — and
  its storage wrapper hits the identical `db.$transaction` fallback pattern via `incrementOne`. Fixed
  by explicitly disabling it (`rateLimit: { enabled: false }`); re-verified live with 5+ consecutive
  attempts, not a single clean run, given the bug's own intermittency.

### Added
- **P8.5d — multi-buy tier pricing** (#348). A vendor can run "3 for £10.00" on a product; it applies
  automatically with nothing typed, shows on the card and the cart line, and the checkout charges it.
  **Modelled as a PRICE, not a discount** — nothing here touches `DiscountCode`, no
  `DiscountRedemption` is written and no `remainingRedemptions` consumed. The codeless-`DiscountCode`
  route was rejected at `/propose` on three counts: `DiscountRedemption`'s `@@unique([orderId])`
  allows one redemption per order (so a tier plus a typed code could not both be recorded),
  `evaluateCode` is subtotal-scoped and cannot express a per-line quantity predicate, and #273 exists
  because redemption rows were once written around `placeOrder`'s transaction.
  **A group price, not a reduced unit price**: whole groups charge `groupPricePence`, remainder units
  charge `basePrice`. Exact integer pence at every quantity — a per-unit model cannot express "3 for
  the price of 2" (`1000 / 3` charges £9.99, a penny short, on every group forever). A tier that
  would cost more than buying singly is clamped away, so a staff typo cannot overcharge for buying
  more. New `ProductPriceTier` model, one row per product (migration
  `20260825190000_p8_5d_product_price_tier`, generated by datamodel diff), pure `lib/tier-pricing.ts`,
  `lib/repositories/product-tiers.ts` with explicit vendor-scoped reads, tier configuration on the
  existing `/staff/products` form, and seed tiers for both Aheed and SriMart.
  **`OrderItem` needed no schema change** — it already stored `unitPricePence` and `lineTotalPence`
  separately, the second redundantly. `unitPricePence` stays the base price and `lineTotalPence`
  becomes the tiered total, so the multi-buy is auditable per order without a redemption row.
  `computeTotals` gained an *optional* explicit line total, so every pre-existing caller behaves
  identically and no existing `tests/order-totals.test.ts` case changed.
  **Consequence worth knowing:** a tier sits *inside* the subtotal, so the vendor's
  `minimumOrderPence` and the free-delivery threshold are judged on the tier-reduced figure — the
  opposite of how discount codes and loyalty redemption behave, and deliberate. Codes stack with
  tiers and apply to the tier-reduced subtotal.
  Scoped to **product** tiers only; bundle-scoped tiers are #377, so P8.5c's bundle cards continue to
  claim no saving. Tier scheduling is #379, blocked on #363's hardcoded vendor timezone.
  **This slice does not discharge #147** — that is an order-level, discovery-based promotion inside
  the discounts engine; #147, #146, #148 and #149 all remain open, and `specs/roadmap.md`'s claim to
  the contrary is corrected on this branch.
- **P8.5c — curated bundles** (#347). A `Bundle` is a vendor-curated list of products already in the
  catalogue; "Add all N to basket" expands it into ordinary `CartItem` rows through the existing
  `addCartItems` transaction, so checkout, stock decrement, Stripe, loyalty and discounts are all
  untouched. Deliberately **not** a purchasable SKU — that shape would need its own inventory, its
  own decrement inside `placeOrder`'s transaction and its own cases in four other subsystems, to
  sell things the catalogue already holds. New `Bundle`/`BundleItem` models (migration
  `20260825140000_p8_5c_bundles`, generated by datamodel diff, no hand-authored DDL),
  `lib/repositories/bundles.ts` pure with `lib/bundles-service.ts` as its sibling facade, a section
  on `/categories` between the departments and the product rows, `/staff/bundles` CRUD with image
  upload, and seed bundles for both Aheed and SriMart.
  **There is no stored price and no savings claim, deliberately.** A bundle's total is summed from
  its constituents' live `basePrice` at read time, so it cannot drift; but nothing in the current
  discounts engine reduces what a bundle actually charges (`DiscountCode.code` is required, so there
  is no codeless-discount path at all). That mechanism is **P8.5d (#348)**, and until it ships the
  card shows the derived total and claims no saving rather than rendering a figure the checkout
  would not honour. `app/(landing)/page.tsx` is untouched, so P8.5f's landing slim-down stands.

### Fixed
- **Creating a bundle (or, more broadly, anything going through `isUniqueViolation()` and the
  `getPrisma()` HTTP adapter) with a duplicate slug crashed with an unhandled `500`** instead of
  returning the intended form error. `lib/repositories/prisma-errors.ts`'s `isUniqueViolation()`
  checked only Prisma's normalised `P2002` code; `getPrisma()`'s HTTP adapter (`PrismaNeonHttp`,
  used for the large majority of writes app-wide) throws the same underlying error but with the raw
  Postgres SQLSTATE `23505` instead, which the predicate missed. Fixed at the shared helper so every
  caller benefits, not just bundles — `lib/repositories/categories.ts` had the identical latent
  exposure. Found live at `/validate` for P8.5c (#347); regression-tested in
  `tests/prisma-errors.test.ts`.

### Documentation
- **P8.5c closeout** — `specs/roadmap.md`'s P8.5c row (added at Gate 4, before `/validate`) is
  reconciled with what actually shipped: cites **PR #374** (it previously cited no PR at all), and
  replaces "R14 left uncorrected on purpose" with how `/validate` actually resolved it, plus the two
  live defects `/validate` found and `/fix` corrected (seed fixture, `isUniqueViolation`). `CLAUDE.md`
  gains a permanent note on the `PrismaNeonHttp`/`PrismaNeon` error-code discrepancy (`23505` vs
  `P2002`) that caused the duplicate-slug crash, under the Database section's existing hybrid-strategy
  explanation. Filed **#375** — auditing `categories.ts`/`discounts.ts`/`loyalty.ts`/`products.ts`'s
  own `isUniqueViolation` call sites for the same exposure, deferred rather than done here since it
  needs live reproduction per call site, not a guess. Issue #347 moved to **In Review** (merged to
  `staging`, not yet promoted — deliberately batching with P8.5d rather than promoting solo, matching
  the a/b/e/f precedent); #372/#373 (already-filed P8.5c follow-ups) and #375 tagged Phase `P8` on the
  delivery board.

- **P8.5 (slices a, b, e, f) closeout** — `specs/roadmap.md` gained the four build rows and the
  promotion row `npm run sdd:audit` flagged as missing (P8.5a/b/e had shipped to `staging` across
  earlier sessions with no roadmap citation; P8.5f's own build and its `/fix` pivot away from
  `proxy.ts` are recorded together with the PR #369 promotion that shipped all four to production).
  `CLAUDE.md` gained a permanent note on why no `proxy.ts`/`middleware.ts` can currently be built on
  this project's pinned `@opennextjs/cloudflare` (Next 16 forces Proxy files onto the Node.js
  runtime and forbids opting out; the adapter rejects any Node-runtime middleware outright) and what
  to reach for instead (an explicit prop from the rendering layout, same pattern as `isPortal`).
  Issue #362 (P8.5f's own tracking issue, missed from PR #369's `Closes` list because its
  `requirements.md` still read a stale "no issue opened yet") and #279 (superseded by
  `DepartmentCampaign`'s shipped staff UI) closed manually with explanation. A stale, merged
  sub-agent worktree (`feature/p8.5a-product-card-upgrade`) found and removed, closing #366.

### Fixed
- **Campaign and discount schedules were stored an hour from what staff typed** (P8.5f). An
  `<input type="datetime-local">` submits a naked wall-clock string with no offset, and ECMAScript
  reads such a string in **the runtime's own** timezone — so `lib/campaign-form.ts`'s
  `new Date("2026-08-25T07:25")` meant `07:25Z` on the Worker, while `CampaignForm.tsx` rendered it
  back with `date.getHours()` in the admin's browser and showed `08:25`. Write and read assumed
  different zones and the gap was exactly the BST offset; the database held an instant nobody chose.
  `features/admin/discount-codes.ts` carried the same defect independently, where it decided when a
  code starts being redeemable. New pure `lib/local-datetime.ts` pins `STORE_TIMEZONE =
  "Europe/London"` and reads offsets from `Intl.DateTimeFormat` rather than the process clock, so
  conversion is identical on the Worker, in CI and in the browser — asserted by running its tests
  under both `TZ=UTC` and `TZ=America/New_York`. Nothing in `lint`/`typecheck`/`test` caught this:
  each runs in a single process where the two wrong assumptions cancel, and the existing test
  asserted only `toBeInstanceOf(Date)` — a `Date` built from the wrong instant is still a `Date`.
  Rows written before this fix still hold the old instants; correcting them is deliberately out of
  scope. Per-vendor timezones are **not** introduced (both vendors are UK) — see ADR-004 1.9.0.
- **`/categories` was titled "Categories — Aheed Food Centre" for every vendor**, so SriMart's shop
  page advertised Aheed's trading name. Now vendor-derived, matching the landing page. Same defect
  class #239 removed elsewhere; fixed here because this slice rewrote the page.
- **`DepartmentHero`'s carousel `aria-label` still read "Shop by department"** (P8.5b), which is now
  the literal heading of `/categories`' own section of the same name — the landing page's own hero
  carried the phrase this slice requires be absent from `/` entirely. Renamed to "Department
  spotlight", which is a more accurate name in its own right (one department at a time, not the full
  list `/categories` shows) rather than merely a dodge.

### Changed
- **The landing page is hero-first** (P8.5f). The department scroller and the New Arrivals /
  Featured Products rows moved to `/categories`, rebuilt from a bare `<ul>` of links into the shop
  page; the landing page keeps its hero and trust strip. The search box and "Shop List" link are
  hidden on `/` only.
- **The postcode delivery checker moved from the homepage hero into the header** and now persists.
  It was a `method="GET"` form whose answer lived in `?postcode=` and vanished on the first
  navigation; it is now a server-action form (no client JS) storing a `delivery-postcode` cookie,
  attributes mirroring `lib/cart-identity.ts`. **Only the postcode is stored, never the verdict** —
  that is recomputed each render against the vendor's current prefixes, so widening a delivery area
  cannot leave a shopper holding a stale refusal. Consent posture unchanged: a functional store
  preference, inside the essential set the cookie banner already describes, written only on
  deliberate submission.

### Added
- **`app/(landing)/` route group** (P8.5f) — a second route group holding only the `/` page, so the
  header can differ on `/` from every other route (a layout cannot see which page it wraps) without
  a root-level routing file. Both `app/(storefront)/layout.tsx` and `app/(landing)/layout.tsx` render
  the shared `components/layout/StorefrontChrome.tsx`, passing an explicit `isLanding` boolean into
  `Header` — the same pattern `isPortal` already used. **Superseded a root `proxy.ts`** (Next 16's
  rename of `middleware.js`) within the same day: Next 16 forces every Proxy file onto the Node.js
  runtime and forbids opting out, while this project's pinned `@opennextjs/cloudflare` (latest
  published, `1.20.2`) unconditionally rejects any Node-runtime middleware it detects
  (`process.exit(1)`, confirmed identically under local `npm run preview` and on a real `staging`
  deploy, PR #367 — the push never went live). Documented in `specs/architecture.md` 1.20.0.
- **AI-generated campaign banners** — `POST /api/admin/campaign-images/generate` plus an
  "Auto-Generate" button on the campaign banner panel. Reuses the existing `lib/image-generation.ts`
  port (Cloudflare Workers AI, `flux-1-schnell`) that has backed product images since P8; no new
  infrastructure. The request body carries only a `categoryId` — prompt and storage key are built
  server-side, so a caller can neither steer the model under this store's branding nor aim a write
  at another vendor's object.

### Documentation
- **New SDD Operator Runbook** (`docs/developer-portal/sdd/operator-runbook.md`, `id:
  sdd-operator-runbook`, `type: runbook`) — a human-executable manual for the Orient/Propose/Spec/
  Build/Document/Validate/Fix/Ship/Document loop, written so a human with no Claude Code session
  could run the same commands, read the same files, and recognize the same failure modes the
  assistant would. Per stage: purpose, inputs, what happens behind the scenes, a manual procedure,
  expected results, a troubleshooting table, where to investigate, and decision points requiring a
  human call — plus a consolidated troubleshooting table and decision-point summary at the end.
  Derived from `specs/sdd-workflow.md`, `.claude/commands/*.md`, `scripts/sdd-check.ts`'s actual
  source, and the git hooks/CI workflows — not invented — with two things it observed live in the
  same session: a stray sub-agent worktree at `.claude/worktrees/` and the delivery board showing
  `Backlog`/`In Progress` for three issues (#345, #346, #356) already merged to staging. First drafted
  at `.claude/onboarding.md` (never committed) then moved into the KMS-indexed `docs/developer-portal/`
  tree at the user's request, since `docs/developer-portal/onboarding.md` already exists for a
  different purpose (new-developer setup) and this needed its own name. Verified against the real
  pipeline, not just assumed: `npm run kms:validate` (0 invalid front-matter), `npm run
  kms:build-index` (102 -> 103 artifacts), and `npm run kms:assemble:internal && (cd
  kms/site-internal && npx next build --webpack)` (107 pages built, including
  `/dev/sdd-operator-runbook`). Went through Build only — no `/propose`/`/spec` — scaled down per
  `specs/sdd-workflow.md`'s own "scale the loop to the change" rule: a single new doc file, no
  `app`/`lib`/`prisma` code touched, no tracked issue, so `specs/roadmap.md` and the delivery board
  have nothing to reconcile against once this merges.

### Fixed
- **`specs/2026-08-25-p8.5e-hero-campaigns/plan.md` broke `deploy-docs-internal` on merge** — a bare
  `"Shop {name}"` in prose (not backtick-quoted) parses as a JSX expression referencing an undefined
  `name` in the assembled MDX, crashing the internal docs site's build with `ReferenceError: name is
  not defined` (`deploy-docs-internal` run `32810911550`, PR #359's merge). Same class of trap
  CLAUDE.md's "KMS docs" section already documents for a bare `<1%` — nothing in `lint`/`typecheck`/
  `test`/`build` catches it, only the separate `kms:assemble:internal` + Nextra build pipeline does,
  on the next push. Fixed as its own follow-up (not amending the already-merged PR, matching #218's
  precedent) by wrapping the reference in backticks: `` "Shop `{name}`" ``. Same text in
  `requirements.md` R11 fixed too, though it isn't part of the assembled site (no front-matter).
  Verified with the actual check — `npm run kms:assemble:internal && (cd kms/site-internal && npx
  next build --webpack)` — not just the root build.

### Documentation
- **`specs/sdd-workflow.md` 2.22.0 -> 2.23.0 gains worktree awareness** (#357). The workflow had no
  concept of a sub-agent building in an isolated git worktree (`.claude/worktrees/agent-<id>/`, the
  Agent tool's `isolation: "worktree"`) — live-hit the same session this line was written, when a
  fresh `/validate` context found nothing wrong because it never knew to run `git worktree list`,
  and the P8.5e (#356) artifact lived only in one. Orient now runs `git worktree list` on re-entry;
  Document (build notes) and Clear's checklist require the worktree's path/branch to be named in
  `build-notes.md` rather than left for `git worktree list` to rediscover later; Validate checks for
  a named worktree and runs every check against that path, not the main checkout; Ship gains a step
  to remove a worktree once its branch merges, since nothing does that automatically.
- **`kms/schema/repo.ts`'s `EXCLUDE_DIRS` gains `.claude`** (#357). Its file walk had no exclusion
  for `.claude/worktrees/*` — a full, separate checkout each sub-agent builds in — so
  `npm run kms:build-index`, run while three sub-agent worktrees sat on disk, indexed their entire
  `specs/`/`docs/` trees as belonging to the main repo (99 -> 599 "artifacts", live-caught and
  reverted before commit). Confirmed nothing under `.claude/` was legitimately indexed before this
  change, so the exclusion loses no coverage.
- **`vitest.config.mts` gains an `exclude` for `.claude`** (#357), same root cause a second place:
  vitest's own default excludes (`node_modules`, `.git`) don't cover it either, so `npx vitest run`
  with any sub-agent worktree on disk picked up and executed *that worktree's* test files against
  *its own* `node_modules` — a real crash (`react-dom`/jsdom internals failing to resolve), not a
  false pass, caught live while re-verifying this same fix. `[...configDefaults.exclude,
  "**/.claude/**"]` keeps vitest's own defaults rather than silently dropping them.
- **`specs/decisions/ADR-004-multi-tenancy.md` 1.7.0 -> 1.8.0** (P8.5e, #356). Decision 5 amended again: the "general campaign surface" the 2026-08-24 amendment deferred is this slice, built with the staff UI that amendment named as the prerequisite. Names the accepted risk explicitly — a campaign's `headline`/`subtitle` are free text, not derived from product or discount data, a deliberate narrow exception the human approved at `/propose` having been shown it — and what stays structured regardless: `imageKey`/`linkUrl`/the schedule, and the panel's real product-price callout, which renders unconditionally whether or not a campaign is active.
- **Spec for P8.5e — staff-editable hero campaigns** (#356, `specs/2026-08-25-p8.5e-hero-campaigns/`). Gate 2: `plan.md`, `requirements.md` (R1–R25), `validation.md`. A new `DepartmentCampaign` model (one row per top-level department) plus a staff CRUD UI at `/staff/promotions`, layered onto `DepartmentHero` (#346) without changing its output for a department with no live campaign. Triggered by a human review of the live P8.5b hero against the AI Studio prototype it was drawn from, which found the data-only hero can't produce photographic, benefit-led copy.
- **Build notes** at `specs/2026-08-25-p8.5e-hero-campaigns/build-notes.md`, naming six known-shaky areas — the unrun migration first (same situation P8.5a/b's were before merge), then the never-browser-tested upload path, per-vendor rendering, the newly-enforced `linkUrl` convention, the untested staff status labels, and the untested image-attach refusal path.
- **#352 closed as superseded**, with a named gap in the closing comment rather than a clean supersession: this slice's banner upload requires a headline alongside the photo, where #352 asked for artwork with no other change. The underlying need (real vendor artwork reaching the hero) is met; the literal "icon swaps for a photo, nothing else changes" shape is not.

### Changed
- **P8.5e — staff-editable hero campaigns built** (#356, `specs/2026-08-25-p8.5e-hero-campaigns/`). New `DepartmentCampaign` model (one row per top-level `Category`) and staff CRUD at `/staff/promotions`, gated `requireVendorRole("ADMIN")` and following `/staff/categories`' exact `<PanelRefusal>` pattern. `DepartmentHero` (#346) gains an optional per-panel override: a **live** campaign (`isCampaignLive` — `isActive` plus an optional `startsAt`/`endsAt` window) swaps the heading for the campaign's headline/subtitle and, when it has a banner, renders it full-bleed with a gradient scrim in place of the icon-corner layout, dropping the chevron cutout for that panel only. **A department with no live campaign renders byte-for-byte identically to before this slice** — proven by a test that diffs rendered HTML rather than asserting shape. **The real product-price spotlight callout is never suppressed by a campaign** — the one part of every panel that stays data-derived regardless, which is what keeps this from reintroducing #233's unbacked-claim failure. The CTA button's visible label is likewise never campaign text (`Shop {name}`, always), a deliberate narrowing of the approved direction recorded in `plan.md`. Banner upload (`components/staff/CampaignBannerUploader.tsx`) is a near-direct copy of `VendorLogoUploader.tsx`'s presign/PUT/attach flow, scoped to a category; `lib/campaign-image.ts` reuses every image constant from `lib/product-image.ts` (R18) and adds only the `categories/{categoryId}/{uuid}.webp` key-shape rules. `isCampaignLive` lives in a new dependency-free `lib/campaign-liveness.ts`, not in the repository file, so a unit test (or a future client component) can reach it without pulling in `@prisma/client/wasm` — the same reason `lib/product-image.ts` stays import-free. `lib/campaigns-service.ts` carries four thin `getPrisma()`-wrapping exports that exist only because `app/**`/`features/**`/`components/**` are ESLint-forbidden from importing `@/lib/db` at all (ADR-004 slice 2, found at Build, not anticipated when the spec's R3 asked for `prisma` as an explicit repository parameter). 39 new tests (594 total, up from 555).

### Documentation
- **`specs/design-system.md` 1.8.0 -> 1.9.0 gains a Motion subsection** (P8.5a, #345). Three rules that until now lived only in `CLAUDE.md`, which is an assistant guardrail file rather than the doc a human opens before writing a component: a transition names its properties (never `transition-all`, never a global element-selector rule — #324 and #326 are the two defects behind that); animate only properties that cannot move layout; and every motion effect has a reduced-motion opt-out, CSS effects via `@media (prefers-reduced-motion: reduce)` and JS timers via `matchMedia`. States plainly that no lint rule checks any of it and that WCAG SC 2.2.2 is only ever verified in a browser.
- **Build notes** for the slice at `specs/2026-08-24-p8.5a-product-card-upgrade/build-notes.md`, naming five known-shaky areas for validation to target first — per-vendor rendering above all, since `tests/vendor-theme.test.ts` passing is not evidence for it (#251's precedent).
- **#351 filed**: the product card nests `<button>` inside `<a>`, which HTML's content model for `<a>` forbids. **Pre-existing** — `AddToCartButton` has always done it and P8.5a did not widen it — but recorded rather than left as folklore, since `jsx-a11y` has no rule for it and the correctness currently rests on every handler calling `preventDefault()`.

### Changed
- **P8.5a — product card upgrade built** (#345, `specs/2026-08-24-p8.5a-product-card-upgrade/`). Three parts. **Skew geometry** lives in `app/globals.css` as `.skew-card*` rather than Tailwind utilities, because the counter-skew is a parent/child relationship (the card skews `-2deg`, every `.skew-card-inner` skews back `+2deg`) that utilities cannot express. Transitions name `transform` and `box-shadow` explicitly — both banned alternatives (`transition-all`, a global element-selector rule) are the documented causes of #324's layout thrashing and #326's broken carousel dot — and neither property affects layout, so nothing here can shift the page. The hover shadow is `color-mix(in srgb, var(--color-primary) 22%, transparent)`, **not** the reference's hardcoded `rgba(27,94,32,.18)`, which is Aheed's green and would have rendered wrong for SriMart's blue. This also adds the **repo's first CSS `@media (prefers-reduced-motion: reduce)` block**; `PromoCarousel.tsx` handles the preference in JS because it governs a timer, and this one governs a pure CSS effect. **Cart-aware stepper**: `components/cart/CartQuantityStepper.tsx` replaces the pre-add quantity picker for products already in the cart, and its writes are coalesced by `components/cart/quantity-coalescer.ts` — a plain, non-React module precisely so the "N clicks in the window produce one flush carrying the last value" behaviour is testable with fake timers and no DOM (8 new tests; 546 total, up from 538). **That coalescing is load-bearing, not a refinement**: `revalidateCartSurfaces()` calls `revalidatePath("/", "layout")` on every write, so a per-click stepper across a twenty-card grid would reproduce #236's measured ~20-mutation failure by design — and client-side coalescing is the mitigation #236's own text names. #236 stays open and is no longer aggravated. State adopts a new server value **during render** via React's documented prop-change pattern rather than an effect, so no `react-hooks/set-state-in-effect` suppression was needed. **Low-stock badge**: `ProductSummary` now carries `stockQuantity` and `lowStockThreshold`, read from the `Inventory` row that was already joined for `inStock` — no new query, no migration. `lib/cart-summary.ts` memoises the cart read with React `cache()` so the header and a product grid on the same page share one `getSummary()` call; the file documents why that is request-scoped memoisation and not the cross-request Prisma caching `CLAUDE.md` forbids.

### Documentation
- **Spec for P8.5a — product card upgrade** (#345, `specs/2026-08-24-p8.5a-product-card-upgrade/`). Gate 2: `plan.md`, `requirements.md` (R1–R17), `validation.md`. Three parts — skew geometry with every colour resolved through a semantic token (the reference's hover shadow is `rgba(27,94,32,.18)`, Aheed's own green, against a platform where SriMart renders blue/purple/red); a cart-mutating quantity stepper replacing today's pre-add picker; and a low-stock badge from the `Inventory` join that already exists. No schema migration. **The coalescing requirement (R8) is the substance of the spec**: `features/cart/shared.ts`'s `revalidateCartSurfaces()` calls `revalidatePath("/", "layout")` on every cart mutation, so a stepper firing one server action per click across a twenty-card grid reproduces #236's measured pathology by design — and client-side coalescing is the mitigation **#236 itself names** in its "worth checking when picked up" section. #236 stays open, no longer aggravated. Also recorded: `Header.tsx:83-86` already loads the cart on every storefront page, so the grid needs no new data, only a memoised read (R9); and this slice introduces the repo's **first CSS `@media (prefers-reduced-motion)` block** (R4) — `PromoCarousel.tsx:55`'s JS `matchMedia` check is currently the only instance anywhere. `ARTIFACT_INDEX.md`/`docs.ts` rebuilt (99 -> 100 artifacts).

### Documentation
- **`specs/decisions/ADR-004-multi-tenancy.md` 1.6.0 -> 1.7.0** (P8.5b, #346). Decision 5 said promotional content is data "— `VendorPromotion` rows". The **principle survives and is now satisfied more strictly**; the mechanism named in the ADR does not. Amended in place with the reason rather than deleted: the hero is generated from the vendor's own categories and real product prices, so a panel cannot advertise something the catalogue does not contain — which is exactly the failure (`PromoSlider`'s unbacked "20% off all fresh produce") that #233 existed to stop. The amendment also records that a future general campaign surface must include a staff UI in its scope, since that absence is what made the first attempt inert: `VendorPromotion` rows were seed-only and no vendor could ever edit one.
- **Build notes** at `specs/2026-08-24-p8.5b-department-hero/build-notes.md`, naming six known-shaky areas — the unrun destructive migration first, then the un-rerun seed, then every WCAG SC 2.2.2 obligation, which the jsdom test deliberately does **not** cover because a jsdom assertion there would look like coverage without being it.
- **#352 filed**: `Category.imageKey` plus a staff upload, to swap the hero's icon for real artwork. Genuinely additive — the component already accepts an optional `imageKey` and both branches are tested, so nothing in the hero changes when it lands.

### Changed
- **P8.5b — department hero built, and `VendorPromotion` deleted** (#346, `specs/2026-08-24-p8.5b-department-hero/`). `components/layout/DepartmentHero.tsx` replaces `PromoCarousel` in the homepage hero slot. Departments, names and order come from `listTopLevel()`; each panel's price callout names a real product at its real price via a **single** new query, `listCategorySpotlights()` — one bounded read for every department rather than one per department, since "one row per group" is not expressible in Prisma without the raw SQL `CLAUDE.md` bans in application code. Nothing is hardcoded copy: #239 is the precedent, where a hero literal was accidentally true for one vendor and wrong for the other. **Image-optional by design**: `Category` has no image column and #279 records that no vendor artwork exists, so each panel falls back to `categoryIcon()`'s existing slug-to-lucide mapping and accepts an `imageKey` that nothing supplies yet — which is what makes a future `Category.imageKey` purely additive. The chevron cutout is a `clip-path` polygon in `app/globals.css`, expanding on hover; it lives in CSS rather than as a Tailwind `group-hover:` variant because an inline `clipPath` cannot be overridden by a utility — an earlier draft had a `group-hover:` with no `group` ancestor, so it never fired, caught while checking the build against R8 rather than by any tool. **Accessibility is carried from `PromoCarousel`, not from the prototype**, whose hero auto-advances every 5.5s with hover-pause only: an always-visible pause control with an accessible name, rotation paused on hover *and* keyboard focus, and no rotation under `prefers-reduced-motion`. 9 new tests (547 total, up from 538); the rotation and focus behaviour is deliberately left to a browser check in `validation.md` rather than asserted in jsdom, where it would look like coverage without being it. One of those tests corrected its own wrong assumption — off-screen panels carry `aria-hidden`, so only the current heading is in the accessibility tree.
- **`VendorPromotion` dropped** (migration `20260824190000_p8_5b_drop_vendor_promotion`), along with `components/layout/PromoCarousel.tsx`, `lib/repositories/promotions.ts`, `lib/promotions-service.ts` and its seed data. **Superseded, not unused** — the two leave different records for whoever later asks why a campaign model disappeared. It was one generic banner that never gained a staff UI, so its rows stayed seed-only and no vendor could edit a campaign; what replaces it models the actual merchandising concept and is derived from real data. #279 and #280 describe gaps in that model and are commented as superseded, closing when this reaches production per the `Done` = in production rule. Six unrelated files carried doc comments citing `lib/promotions-service.ts` or `lib/repositories/promotions.ts` as the pattern to copy; all six now point at living examples, since a reference to a deleted file is the "ruling nobody can follow" failure `CLAUDE.md` already records twice.

### Documentation
- **Spec for P8.5b — department hero** (#346, `specs/2026-08-24-p8.5b-department-hero/`). Gate 2: `plan.md`, `requirements.md` (R1–R21), `validation.md`. An icon-led, **image-optional** department hero with 1-click filtered routing, replacing `PromoCarousel` in the homepage hero slot. **The shape is dictated by a schema fact, checked rather than assumed: `Category` has no image field at all**, and #279 records that no vendor artwork exists (`VendorPromotion.imageKey` is null for both seeded vendors) — so a photographic hero needs both a migration and photography, and all 39 images in the prototype are unsplash URLs the CSP blocks outright. The hero therefore draws chevron `clip-path` geometry in the vendor's palette with `categoryIcon()`'s existing slug-to-lucide mapping, and the panel component takes an **optional** image so adding `Category.imageKey` later is purely additive. Departments come from `listTopLevel()`, never the prototype's five hardcoded Aheed departments — #239's precedent, where a hardcoded hero claim was accidentally true for one vendor and wrong for the other. R10–R13 carry `PromoCarousel`'s **WCAG SC 2.2.2** contract (pause control with an accessible name, pause on hover *and keyboard focus*, no rotation under `prefers-reduced-motion`) rather than the prototype's hover-only pause; `validation.md` states plainly that no lint rule checks SC 2.2.2, so those rows need a real browser. Retiring `VendorPromotion` (R14–R16) is smaller than it looks: **there is no staff UI for promotions** — the rows are seed-only — so nothing editable breaks. **The model is deleted because it is superseded, not because it is unused** — confirmed 2026-08-24, and recorded that way because the two leave very different records for whoever later asks why a campaign model disappeared. `VendorPromotion` was one generic banner (title, description, optional image, link); the surfaces replacing it model the actual merchandising concept and are derived from real data — the department hero itself, curated bundles (#347), multi-buy tiers (#348), with offers and clearance anticipated on the same principle but deliberately not yet tracked as issues. The precedent for preferring that is in this repo already: `PromoSlider` advertised "20% off all fresh produce" that no discount in the engine backed, which is what #233 replaced it to stop, so keeping an unbacked banner alongside data-derived promotions would reintroduce the same class of claim. #279 and #280 are therefore closed as **superseded**, not deferred — both describe gaps in a model that ceases to exist. `ARTIFACT_INDEX.md`/`docs.ts` rebuilt (99 -> 100 artifacts).

### Documentation
- **CLAUDE.md gains a Storage (ADR-003) note: raster images cannot be validated visually under `npm run preview`, accept it and check on a deployed environment instead** (#235). Live-reverified 2026-08-24 against both the staging and dev CDN zones: a `Referer: http://localhost:8787/` request gets **403** on both — Cloudflare hotlink protection at the CDN edge, not a CSP or application defect, and not fixable in code. Two things this reverification adds to the record: **`.svg` is not covered by the rule at all**, so every seeded *product* image (all `.svg`) already loads fine locally — only raster assets are blocked, which today means just the vendor logo; and **provisioning the dev CDN host (#277) did not incidentally fix this**, since the restriction is zone-level and the dev zone carries the identical rule. Decided, rather than fixed: the human chose "accept and document" over allow-listing local origins or disabling the rule on the dev zone, since either infra change widens what can hotlink real images for a defect whose actual blast radius (one PNG) is now known to be small. #235 stays open pending that documentation landing; closes with this PR.
- **P8.5 — Storefront Conversion Overhaul proposed, decomposed and placed on the roadmap** (umbrella #344; slices #345 product card upgrade, #346 department hero, #347 curated bundles, #348 multi-buy tier pricing). Gate 1 only — no spec, no code. Inserted **before P8.2** so the storefront that goes live is the new one; the number is out of sequence deliberately, because renumbering P8.2/P8.3 into the sequential slot would falsify `specs/2026-08-23-p8.1b-closeout/plan.md`, which cites P8.2 by name as a shipped record. Origin is a revised AI Studio prototype (`docs/ui-ref-revised/`, untracked) and a written brief — the same kind of event that inserted P2.5. **The grounding pass is the substance of this entry.** The prototype is a look-and-behaviour reference, not portable code: 39 `images.unsplash.com` URLs against `next.config`'s `img-src 'self' data: https://*.nocaped.com`, ~200 hardcoded `#1B5E20` literals against a platform where SriMart renders blue/purple/red, a cart in `useState`, and a bundle-to-cart handler that fuzzy-matches products by first word with a `products[0]` fallback. Its hero auto-flips every 5.5s with hover-pause only and no `prefers-reduced-motion`, failing WCAG SC 2.2.2 — `components/layout/PromoCarousel.tsx` already solved that and its contract is the one the slice carries. **Three rows of the brief's competitor matrix are wrong about this repo**, recorded because the ranking rests on them: inline quantity steppers are ranked #6 "low effort / high priority" but `AddToCartButton` `variant="card"` has shipped them since P3a; the postcode delivery checker is marked absent but the homepage hero has had one backed by `lib/delivery.ts` since P7.5c; dietary facet filtering is marked absent but `ProductFilters`/`ProductFilterForm` already expose halal/fresh/organic. The other 23 rows are unverified — a full re-baseline was offered and deliberately deferred. **Two prerequisites are already-tracked open issues**: #279 (no vendor promo artwork exists) blocks #346, and #236 (rapid cart mutations reach "This page couldn't load" at ~20) blocks #345's cart-aware stepper, which multiplies that exact mutation rate. Bundles are modelled as a curated list expanding into ordinary cart lines rather than a purchasable SKU, on the human's decision — reusing `features/cart/add-list-to-cart.ts` and leaving checkout, stock decrement, refunds and loyalty untouched, at the accepted cost of a derived rather than stored bundle price.
- **Roadmap change-log row for the P8.1 production promotion** (PR #343, merge `a8ee54a`) — the promotion half of `npm run sdd:audit`, which reported it as *pending carry-forward* at this Orient because it merged after the roadmap was last edited. Records that #235, #269 and #277 stay open and In Review by deliberate choice: all three are checks that need a deployed site, and P8.1b's validating sandbox had no outbound network, so what is missing is the observation, not the code.
- **Roadmap change-log row for P8.1b** (#335, #336, #337, PR #341, `specs/2026-08-23-p8.1b-closeout/`) — the row `npm run sdd:audit` checks for at the next Orient, covering all ten issues the slice closed through (#335, #336, #337, #252, #269, #273, #276, #277, #235, #253) and their move to **In Review** on the delivery board. **Correction against `plan.md`'s own closure claim, found at `/document` rather than repeated**: `plan.md` said this slice empties P8.1's "Core Debt & Compliance" bucket; four originally-listed issues (`#137`/`#151` — blocked on ADR-005's undecided refund policy, already recorded as unscheduled under P7.5's carry-forward note; `#104`/`#221` — an operational Resend domain-verification prerequisite no code slice can close) remain open and untouched by either P8.1a or P8.1b, carried forward in the roadmap rather than silently dropped. Two process lessons added to `specs/sdd-workflow.md`'s Validate-stage trap catalogue: a `validation.md` row demanding a function's "first two parameters" be `prisma`/`vendorId` failed for a function whose real second parameter is a second Prisma client the transaction needs — the requirement's own text made no ordering claim; and a row grepping `ARTIFACT_INDEX.md` for a slice's front-matter `id` could never have passed for any slice, since the generated index never renders that field. `ARTIFACT_INDEX.md`/`docs.ts` rebuilt (99 artifacts, unchanged count).

### Changed
- **P8.1b — every request-scoped facade relocated out of `lib/repositories/`, behind a gate that actually enforces it** (#335, closing #252). Thirteen exports moved into sibling `lib/<name>-service.ts` modules — `cart`, `categories`, `discounts`, `loyalty`, `orders` (`getOrderRepository`, `getWebhookOrderService`, `getGuestOrderLookupService`), `products`, `reviews`, `roles`, `vendor` — so every export left in `lib/repositories/` takes its client and `vendorId` explicitly and reads no request context, which is what lets a plain `tsx` script exercise `placeOrder`'s atomicity, the stock/points/discount concurrency guards and the order-lookup credential pair against a real database. Facades that inlined query bodies (cart, products, reviews, loyalty's ledger, seven of `getOrderRepository`'s methods) were **split** rather than moved: the queries stay in `lib/repositories/` as pure functions, so more code is now under `tests/repository-vendor-scoping.test.ts` than before, not less. No behaviour change — 529 existing tests pass with only import paths edited. **`tests/repository-purity.test.ts` is the actual deliverable**: an import-level, whole-file check with **no allowlist**, verified to fail by introducing a violation and observing it named. `lib/repositories/roles.ts` was never on #252's list and was the hardest case — it had no pure functions at all, so it needed a split written rather than a move, with `requireVendorRole` now running in `lib/roles-service.ts` and the resulting actor passed to the repository as data; that is what makes its hierarchy rules (who may grant ADMIN, the last-admin self-demotion guard) testable at all. `lib/repositories/vendor.ts`'s two request-scoped accessors moved for the same reason, which is what let the gate land with zero exceptions. Also corrects **CLAUDE.md's false claim** that `tests/repository-vendor-scoping.test.ts` "allowlists all nine by name … so the list cannot quietly grow" — that test checks vendor *scoping*, not facade *location*, held six of the nine plus two functions never on the list, and was structurally blind to the three facades that delegate rather than inline queries. `lib/repositories/promotions.ts` carried a copy of the same wrong claim; both fixed.
- **CLAUDE.md's `core.autocrlf` guidance marked as fixed rather than live.** PR #328's `.gitattributes` resolved it; the section said otherwise, so a `format:check` failure on untouched files now reads as real drift instead of the expected artifact.

### Added
- **Guest machine-readable data export** (#337, closing #253). Guests had erasure (Art. 17) since the P7 closeout but no Art. 15 export, despite `/orders/lookup` already rendering the whole order in human-readable form — a format gap, not an unmet right. `exportGuestOrderData` sits beside `eraseGuestOrderData` in `lib/repositories/data-rights.ts` and verifies the same order-number/email pair inside its `WHERE` (`userId: null` included), returning `null` for both "no such order" and "wrong email" so the route cannot leak which. Served from `app/(storefront)/orders/lookup/export/route.ts` with `Content-Disposition: attachment` and `Cache-Control: no-store`, rate-limited with the same throttle as the lookup page — an export endpoint returns a whole order in one request, so leaving it off would have widened the surface #123 closed. `GuestOrderExport` is deliberately narrower than `PersonalDataExport` rather than a reuse of it: that shape is built around a `User` identity, linked accounts and sessions, none of which a guest has, and emitting them as empty arrays would assert "we hold nothing of this kind about you" when the question does not apply. The document states its own household-mailbox scope limit rather than leaving a recipient to assume it covers every order on that email.

### Fixed
- **P8.1b — dev/staging environment hygiene** (#336, closing #273, #276, #277). **#273:** the dev Neon branch carried two hand-inserted `DiscountRedemption` rows (`seq` 888888/999999) that bypassed `placeOrder` and rendered a discount line on orders that were never discounted. Removed by `scripts/remove-fixture-redemptions.ts`, run against the dev branch: both rows gone, and the two affected orders (`AHE-20260811-XCVTT3`, `AHE-20260810-UQG827`) now read `discountPence=0` with no `discountUse`. Its target guard is a **pure, unit-tested module** (`lib/db-target-guard.ts`) rather than something proven by pointing a deletion script at staging to watch it refuse — that demonstration deletes staging rows if the guard is broken. It compares Neon *endpoints* with the `-pooler` suffix normalised away, since a guard holding only a direct URL would wave through the pooled URL for the same database, and fails closed on a missing or unparseable target. **#276:** `prisma/seed.ts` warns loudly on its one silent path (`SEED_AHEED_HOST` set, `SEED_SRIMART_HOST` unset), which produced a database that looked correctly seeded while holding one vendor — so every multi-tenant check against it silently proved nothing. **#277/#235:** `.env.example` and `docs/developer-portal/env-setup.md` now pair `aheed-images-dev` with the dev CDN host and carry an explicit table of all three bucket/host pairs, naming the dev host as the only one without a hotlink rule — the mispairing meant anything written locally was unreachable from the URL the app composes for it, with a correct-looking key in the DB and no error anywhere.

### Documentation
- **Roadmap change-log row for P8.1a frontend & accessibility debt** (#334, PR #338, `specs/2026-08-23-p8.1a-frontend-a11y-debt/`) — the row `npm run sdd:audit` checks for at the next Orient. Two process lessons recorded in `CLAUDE.md`/`specs/sdd-workflow.md` while still cheap to write down: a spec's front-matter `id` cannot contain a literal `.` (`kms/schema/frontmatter.ts`'s regex is `^[a-z0-9-]+$`), caught only by `gates`' KMS front-matter check on push rather than any local command — `plan.md`'s `id` was fixed to follow the existing dotted-phase convention (dash instead of dot, `-plan` suffix); and a fourth instance of the established `validation.md` literal-check trap, where a bare `grep -n "overflow-clip"` matched the fix's own explanatory code comment, not just the className it was meant to prove was unique.

### Fixed
- **P8.1a — frontend & accessibility debt** (#334, closing #254, #287, #333, #281). Four independent fixes: (1) `/orders/lookup` skipped heading ranks (`h1` -> `h4` -> `h3`, no `h2`) — fixed with two visually-hidden `sr-only` `h2`s ("Delivery Status", "Order Items") and promoting the pipeline step labels from `h4` to `h3`. (2) `/staff/reports`'s `<h1>` read "Sales & Pence Financials", stale since P7.5d+e added three non-sales sections below it — renamed to "Store reports", with the three revenue tiles moved under a new `<h2>Sales</h2>` and their own headings demoted to `h3`. (3) `lib/repositories/loyalty.ts`'s `saveLoyaltySettings` dropped an unused `const prisma = getPrisma()` left over from P5a — the write already went through `getPrismaWs()`. (4) `components/layout/Header.tsx`'s brand/logo container gains `h-10 overflow-clip`, capping it at the logo's own height so a browser extension's content script (confirmed: Coupert) injecting an element inside it can't stretch the row — deliberately scoped to that container alone, not the whole row, because `ViewSwitcher`'s dropdown lives in the same row and an ancestor `overflow-clip` there would have clipped it. Separately, `lib/vendor-theme.ts`'s `brandStyle()` widened `--color-action`/`-accent`/`-danger`'s contrast clamp to include each colour's own matching tint, closing a real unguarded pairing (`text-danger` on `bg-danger-tint`, found by grepping actual component usage) — `--color-primary` already covered every tint/cream pairing the app renders `text-primary` on, so this is narrower than clamping the raw tint/cream backgrounds themselves, which stay untouched. `tests/vendor-theme.test.ts` gains a regression test for the three same-tint pairings across both seeded vendors.

### Documentation
- **Roadmap change-log rows for the header logo fix (#329, PR #330), the `.gitattributes` LF policy (#327, PR #328), and the staging→main promotion (PR #331).** The promotion row is what `npm run sdd:audit`'s promotion half requires — it is the only SDD gate that fires *after* Ship, which is exactly how PRs #118/#121/#134 once sat undocumented. Recorded before the promotion merges, so the row rides the promotion itself rather than trailing it.

### Changed
- **Added `.gitattributes`, pinning all text files to LF in both the repository and the working tree** (#327). The repo ran `core.autocrlf=true` with no `.gitattributes` and had CRLF stored in some blobs, which caused two long-standing problems. First, any commit touching `CHANGELOG.md` or `specs/roadmap.md` renormalised the whole file — a nine-line entry staged as 2289 insertions / 2280 deletions, which is why PR #326 had to isolate its normalisation into a separate commit just to stay reviewable. Second, `npm run format:check` failed locally against dozens of untouched files, because Prettier defaults to `endOfLine: "lf"` and the checkout was CRLF; CLAUDE.md documented that artifact along with a multi-step ritual for distinguishing it from real drift. `eol=lf` rather than a bare `text=auto` is the operative part — it pins the working tree, which is what makes local Prettier agree with CI. Verified: `git add --renormalize .` produces zero changes (every blob was already LF after PR #326), and `npx prettier --check .` now reports "All matched files use Prettier code style!" across the whole repo. Image and font types are marked `binary` explicitly; no tracked `.bat`/`.cmd`/`.ps1` files exist, so LF everywhere is safe.

### Fixed
- **UI — the header logo caused a visible layout jerk on every page refresh** (`components/layout/Header.tsx`). The logo was `h-10 w-auto` with no reserved box and no `width`/`height`, so it occupied **zero width** until its bytes decoded, then snapped to ~72px and shoved the entire header row — search bar and nav included — sideways. This is a layout shift, not an animation, which is why the `transition-all` sweeps in #323/#324 could not have caught it, and why it survived them. It is made far worse by the logo being 1.9 MB (83% of page weight, already tracked as #243): the larger the payload, the later and more jarring the jolt. Fixed by pinning `aspect-9/5` (1.8, matching both seeded logos at 298x160 and 1664x928) alongside the existing `h-10`, which reserves the 72x40 box before the image loads, plus `object-contain` so a vendor whose logo is a different shape is letterboxed rather than distorted — and still never shifts. Dimensions cannot come from the database: `VendorBranding` stores only `logoStorageKey`, with no width/height. Audited the other four storefront images while here — `ProductCard` (`aspect-4/3` + intrinsic `width`/`height`), `ProductImageGallery` (`width`/`height`), `PromoCarousel` (`h-32 w-32`) and `CartContents` (`h-16 w-16`) all reserve their boxes correctly; the header logo was the sole outlier, and the only one positioned above the whole page.

### Fixed
- **UI — carousel pagination dot stopped animating** (`components/layout/PromoCarousel.tsx`). The `transition-all` -> `transition` sweep in PR #324 correctly stopped the layout thrashing, but over-corrected at one site: Tailwind v4's `transition` property list contains no `width`, so the active promo dot's `w-2` -> `w-4` expand began snapping instead of animating. Restored with an explicit `transition-[width,background-color]`. Safe at this site specifically because the dot row is `absolute bottom-3 left-1/2`, i.e. out of document flow, so animating its width cannot move page layout. Verified by compiling Tailwind 4.3.3 directly rather than relying on documentation; the same check confirms `translate`, `scale` and `rotate` **are** in the default list, so the `ProductCard` hover-lift and `DepartmentScroller` hover-scale were never affected by the sweep.

### Documentation
- **UI polish & docs integration slice: specs corrected and completed** (`specs/2026-08-22-ui-polish-docs-integration/`). `requirements.md` R1 and `validation.md` V1 described a global transition rule in `app/globals.css` (`200ms cubic-bezier` on interactive elements, plus a `button:active` scale-down) — and V1 was ticked `[x]` against it — but that rule was removed in `a9d886c` precisely because it was the cause of the page-refresh layout thrashing. Both rewritten to state the rule that actually holds (per-component transitions naming their properties; never `transition-all`, never a global element-selector rule), with the superseded text preserved and attributed rather than deleted. `build-notes.md` updated for the same reason.
- **Added the slice's missing `plan.md`.** It was the one required spec file never written, which is also why the slice never appeared in `ARTIFACT_INDEX.md` — the KMS index keys artifacts on `specs/<slice>/plan.md`. Index rebuilt (`npm run kms:build-index`, 97 artifacts). This closes both failures reported by `npm run sdd:audit`.
- **`specs/roadmap.md`:** added the missing change-log row citing the slice, and repaired PowerShell backtick damage in the two 2026-08-22 rows, where a literal CR byte (`0x0D`) sat mid-line inside `resolveLines` and four pairs of backticks had become backslashes.
- **`CHANGELOG.md`:** removed two stray NUL bytes (`0x00`) at end of file. They made every tool treat this file as binary — ripgrep refused to search past them, and `git diff` could not produce a text diff — which is a good way for a changelog defect to hide.

### Changed
- **Documentation Architecture:** Restructured the entire docs/ directory into a role-based architecture (Shopper, Staff, Admin, Marketing, BA, Ops, Dev). Rewrote end-user documentation to hide technical implementations and focus entirely on user workflows.

### Added
- **Shop Your List Partial Matches** (Issue #115): Implemented partial-match fallback in `resolveLines` (lib/shopping-list.ts). When a pasted list line contains terms that don't all match a single product, the candidates with the most matched terms are returned as "ambiguous" for user review, instead of discarding the line completely.

### Changed
- **Header UI**: Added a "Shop List" button to the main navigation (beside the search input) for better discoverability.
- **Cart UI**: The Cart popover now automatically closes when navigating away (e.g. to checkout or the full cart view).

### Added
- **P8.1 — Unified Role-Aware Help Centre** (#318, `specs/2026-08-21-p8-help-centre/`). Replaced the dead 'Help Guide' link in the global storefront header with a unified `/help` page. The page statically renders delivery, loyalty, discount, and privacy FAQs for shoppers. For authenticated `STAFF` and `ADMIN` users, it dynamically renders an 'Internal Staff Resources' section containing instructions on using the View Switcher and a direct link to the Operational Runbook.

### Fixed
- **UI:** Replaced `transition-all` with `transition` across storefront components (`ProductCard`, `Header`, `PromoCarousel`, etc.) to prevent jarring layout thrashing/animations on page refresh when components dynamically mount and adjust dimensions.
- **Vendor repository exports** (#318 follow-up): Exported `getVendorConfig`, `getVendorBranding`, `updateVendorLogoKey`, and `updateVendorStorefrontConfig` from `lib/repositories/vendor.ts` — these were referenced by the storefront page and server actions but missing from the module. Resolved build failure on staging.
- **Prettier formatting**: Re-ran Prettier across 9 files touched by the Storefront Branding UI (PR #315) and Help Centre (PR #319) that had not been auto-formatted before merging.

### Changed
- **Cart UI**: Converted the top-header Shopping Cart into a bottom-right Floating Action Button (FAB). This completely decouples the cart from the header layout, providing a stable, jump-free header when toggling between Shopper and Staff views, and improves mobile accessibility.

### Changed
- **Header UI**: Replaced the disjointed 'Staff Panel' button and 'Tier Toggle' with a unified 'View Switcher' dropdown in the main Header. Staff and Admin views correctly configure the header layout to hide the shopper search bar and cart drawer. The View Switcher respects role-gating so STAFF users only see Shopper and Staff views.


### Changed
- **Admin UI**: Unify admin Operations Portal layout with storefront theme. Removed custom PortalHeader in favor of standard `<Header />`, moved TierToggle to PanelNav, added horizontal scrolling to PanelNav tabs, and configured `app/(admin)/staff/page.tsx` to read the tier cookie so Admin users can successfully preview the limited staff layout.

### Fixed
- **CI**: Injected missing Cloudflare AI secrets (CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN) into the production worker runtime in .github/workflows/deploy-production.yml.

### Added
- **Documentation**: Added missing roadmap change-log entry for P8 smart image generation (and PR #292 carry-forward) to satisfy the SDD audit.
- **P8 — Smart Product Image Generation** (#293 + hotfixes #301–#304, `specs/2026-08-20-p8-smart-image-generation/`). Added AI image generation and barcode lookup fallback to automate product image creation. Integrates Open Food Facts API and Cloudflare Workers AI `flux-1-schnell`. Added manual generation button in the Admin UI (`ProductImageManager`) and a batch **"Auto-fill Missing Images"** button on the products list page that triggers the backfill API job. Added `imageNeedsReview` flag with an **"Approve Image"** banner so staff can review and clear AI-generated images. Staging validation surfaced and resolved: worker secrets not bound to runtime, edge `require()` incompatibility, Prisma HTTP transaction incompatibility, Cloudflare AI `429` rate-limit bursts (retry backoff added), missing Approve UI, invalid design-system class names in the banner, and a Cloudflare NSFW false-positive on food-photography prompt language (prompt simplified to neutral form).
- **P7.5d+e — staff panel completion: order-search index, product filters, tier CRUD, customer
  directory & non-sales reports** (#264, closing #265, #160, #161, #169, #163, #136,
  `specs/2026-08-20-p7.5de-staff-panel-completion/`). **P7.5's final slice** (epic #260), combining
  slices d and e because all five underlying issues live on the same `/staff/*` surface behind the
  same demo-admin `npm run preview` rig, and standing that rig up twice is the real cost — the same
  reasoning that combined c+f. Built #163 first, since it was the only item carrying
  production-migration risk and must not gate the four pure-assembly items.
  **The staff order search stops being a sequential scan** (#163): the repo's **first
  `CREATE EXTENSION`** installs `pg_trgm` and adds three GIN trigram indexes over
  `Order.orderNumber`, `Order.guestEmail` and `User.email`. No application code changed —
  `staffOrderWhere()` was already correct, only slow, because a leading-wildcard `ILIKE` cannot use
  any of `Order`'s three B-tree indexes. Taken as a **deliberate hand-authored-DDL exception** under
  the P7d (#218) ruling, which costs a disclosure in the migration naming what Prisma's schema
  language cannot express (an index's access method or operator class) and a pointer comment on
  `model Order`; both are present, as is the standing consequence that `schema.prisma` no longer
  fully describes the database. The `User.email` arm the plan left open **is** index-servable.
  **`/staff/products` gains search and a status filter** (#169): a plain GET form mirroring
  `/staff/orders`, with pagination that carries the filter. New pure `lib/staff-products-query.ts`
  deliberately inverts the orders module's default — an absent or unrecognised status applies **no**
  `isActive` filter, because P6b1 shipped this list showing hidden products on purpose so an owner
  can find what they switched off; three of its twelve tests exist only to pin that.
  **Loyalty tiers become creatable and deletable** (#136): duplicate keys are refused by
  `@@unique([vendorId, key])` through the existing `isUniqueViolation` helper rather than
  check-then-insert, so concurrent creates cannot race and the same key stays creatable for another
  vendor. Delete deliberately leaves `LoyaltyLedgerEntry` alone — `tierKey` is a snapshot with no
  foreign key, so a ledger row naming a removed tier is correct, not dangling. The per-row Remove
  control binds to a separate top-level form via `form="delete-tier"` and carries the key as its own
  name/value, since HTML forbids the nested form the single-form layout would otherwise need (P7a,
  #162 pattern).
  **A customer directory exists** (#160, new `/staff/customers`): a customer is derived from
  vendor-scoped `Order`, never from the global `User` table, which makes the tenant boundary
  structural rather than a filter someone must remember. Guests appear by email; P7b-erased orders
  (both `userId` and `guestEmail` nulled) collapse into one honest "Erased customers" aggregate
  rather than being dropped, so the directory still reconciles against `/staff/reports`.
  **Non-sales reports** (#161): catalogue and stock health, loyalty liability, and discount
  redemption config. **No sales analytics** — production still runs Stripe test keys (#113), so
  there is no real trading data to design it against. Liability calls `visibleBalance()` per account
  rather than `SUM(balancePoints)`, which would overstate it by every lapsed balance still sitting in
  the table — the same class of knowably-wrong aggregate as #238, the defect P7.5a exists to fix.
  Also on the branch: the **PR #285** roadmap promotion row `sdd:audit` reported as pending
  carry-forward, and a `CLAUDE.md` correction — its staff-panel rule pointed at
  `app/(admin)/staff/layout.tsx`, a file that has never existed (the shell is
  `app/(admin)/layout.tsx`), and it now also records `loyalty/page.tsx` as a second `PanelRefusal`
  instance, converted here.
- **P7.5c+f — per-vendor storefront identity: copy, promotions & contrast-clamped colour** (#263,
  closing #239, #233, #255, and #266 which was folded in at Propose,
  `specs/2026-08-20-p7.5cf-vendor-storefront-identity/`). Third slice of **P7.5** (epic #260),
  combining slices c and f because neither can be proven by the test suite — `brandStyle()` injects
  per-vendor tokens as an inline style that outranks `tokens.css`, so both halves are only
  observable in live rendered HTML for two hosts, and that rig is the expensive part.
  **The storefront stops speaking in Aheed's voice** (#239): ~12 hardcoded strings were classified
  rather than columnised. The hero's "Free Delivery Over £30" now reads
  `freeDeliveryThresholdPence` — Aheed's threshold *is* £30, so the literal was accidentally true for
  the vendor it was written for and wrong for SriMart at £50; it was hiding a data bug, not just a
  copy one. A minimum-order badge follows the same rule and both hide when the rule doesn't apply.
  Unverifiable claims ("100% Certified Halal Meat", "Same-Day Local Dispatch") are deleted rather
  than made configurable; the four trust tiles become three statements true of the *platform* and
  checkable against this repo (locality delivery, Stripe payment, order-status email). Only genuine
  vendor identity became columns — `VendorConfig.bannerNote` and `.heroSubtitle`, both hiding when
  null, since platform-written filler is still a claim made on a vendor's behalf. Three surfaces #239
  never listed were found during Build: the search-placeholder fallback, the hero `h1`'s tagline
  fallback (the one slot that keeps a fallback — an empty `h1` is an accessibility defect), and
  `{localityName} Groceries` in the logo-fallback wordmark, which rendered "Reading Groceries" under
  SriMart's name and survived because Aheed has a logo so nobody ever saw it.
  **Promotions become real vendor data** (#233): new 1:N `VendorPromotion` model
  (`lib/repositories/promotions.ts` + request-scoped `lib/promotions-service.ts`, so the #252
  allowlist gains no tenth facade) driving a new `PromoCarousel` in the hero's image slot. It replaces
  `PromoSlider`, a hardcoded array of three invented offers that rendered for every vendor and
  advertised discounts nothing in the engine backed — SriMart has no discount codes at all.
  `imageKey` is **nullable on purpose**: a promo with no artwork renders as a token-styled card, so
  both vendors ship live-verifiable promotions with zero uploads, and seeding keys for objects nobody
  uploaded is how #244 happened. The carousel carries a real pause control, pauses on hover/focus and
  honours `prefers-reduced-motion` — `PromoSlider` auto-advanced every 5s with no way to stop it,
  failing WCAG 2.2 SC 2.2.2.
  **Per-vendor colour returns with a guarantee** (#255): new zero-import `lib/color-contrast.ts`
  converts sRGB to OKLCH, lowers lightness until the value clears AA against every surface it renders
  on, and preserves hue and chroma (reducing chroma rather than clipping channels when out of gamut,
  because clipping shifts hue — the one property the module exists to protect). `brandStyle()` now
  derives `--color-primary`/`-action`/`-accent`/`-danger` and the two hover shades per vendor through
  that clamp. Measured: Aheed `#4caf50` 2.78:1 → `#1e8929` 4.50:1 and `#f57c00` 2.70:1 → `#ba5d00`
  4.51:1; SriMart `#1e88e5` 3.68:1 → `#0078d3` 4.54:1. Aheed's `#d32f2f` already measures 4.98:1 and
  comes back untouched, which `tests/color-contrast.test.ts` pins — the clamp must not damage a
  compliant colour. **The clamp is load-bearing, not a safety net:** Aheed's own primitives fail
  hardest of anything in the repo, so an unclamped restoration would have re-broken the vendor that
  has been live longest. Backgrounds (`--color-surface-muted`, the three tints) stay plain aliases —
  clamping them would move the surface rather than the foreground (#281).
- **P7.5b — order money provenance: points earned and discount code on order pages** (#262, closing
  #138, #150, `specs/2026-08-20-p7.5b-order-money-provenance/`). Second slice of **P7.5** (epic
  #260). An order's money summary now explains itself, with no schema change — both relations
  already existed.
  **The discount says which code produced it** (#150): `Order.discountPence` is one generic figure
  that since P5b can combine a loyalty redemption *and* a code, so labelling the whole amount with a
  code's name would state something false. New `splitDiscount` (`lib/order-totals.ts`) divides it —
  code share from the stored `DiscountRedemption.amountPence` snapshot, loyalty share by
  **subtraction**. Deliberately not recomputed from `pointsToPence(points, pencePerPointRedeemed)`:
  the ledger stores redemptions in points and that config can change after an order, so a recomputed
  share would drift from the figure beside it. `lib/order-totals.ts` keeps **zero imports**, which is
  what structurally prevents it reaching vendor config.
  **Orders show the points they earned** (#138): read from the EARN ledger row `confirmPayment`
  writes inside its own transaction, so the figure is a settled fact. An order still awaiting payment
  shows a line carrying **no digits** rather than an estimate — the tier multiplier is snapshotted
  onto the EARN row precisely because it moves. A guest order says nothing at all, in any status.
  New `OrderPointsNote` is a separate component rather than part of the money card, because
  `OrderItemsCard` is shared with `/staff/orders/{n}`: the staff view gets the same attributed
  discount rows (deliberately — two stories about one order is the defect this phase removes) while
  points, an account fact, stay off it. The confirmation email uses the same `splitDiscount`, not a
  second arithmetic.
- **`/document` closeout for P7.5b (#262, PR #272, merged to staging) — P7.5's second slice.**
  Roadmap (v1.39.0) gains the build/validate/merge row, plus a backfilled row for **P7.5a's
  promotion to production** (PR #271, `staging → main`, merge `b8066e2`) that `npm run sdd:audit`
  reported as pending carry-forward. `/validate` closed R19/R20 with a full live Stripe test-card
  checkout → webhook → confirmation round-trip via the Stripe CLI, not unit tests alone; `CLAUDE.md`
  gains a new "Local Stripe webhook testing" section recording the `stripe listen` signing-secret
  and Resend sandbox traps hit along the way. Delivery board reconciled: #262 confirmed **In
  Review**. New issue **#273** filed (Phase P8, Backlog) for two hand-inserted dev-DB
  `DiscountRedemption` fixture rows found during validation, unrelated to this slice's code.
  `ARTIFACT_INDEX.md` rebuilt; `npm run sdd:audit` and `npm run kms:validate` both clean; the
  internal KMS docs site (`kms/site-internal`) rebuilds and compiles cleanly.

### Changed
- **`specs/roadmap.md` (v1.42.0)** — P7.5d+e's `/document` closeout (#264). Roadmap gains the
  slice's build/merge row (PR #289) and the production-promotion row (PR #290, which also carries
  **P7.5 — Pre-launch closeout of P3/P5/P6 deferred debt is closed** — fourteen carried-forward
  P3/P5/P6 issues resolved across the phase's six slices, and "safe to start P8" is now a statement
  the roadmap can point at). The promotion row records that `deploy-production`'s migration step
  (`CREATE EXTENSION pg_trgm` + three trigram indexes) applied cleanly, confirmed directly from the
  workflow's own log, and the post-promotion issue-state check confirming no accidental closure
  among the nine issues explicitly carried into P8.
- **`specs/2026-08-20-p7.5de-staff-panel-completion/requirements.md`** — R27 and R36 corrected at
  `/validate` after being found genuinely broken (R27 demanded an impossible keyset pagination for
  a `groupBy` aggregate with no stable key; R36 directly contradicted R25's own per-customer-spend
  requirement) — both amended rather than shipped disclosed-but-unreconciled. Detail in
  `build-notes.md`'s "Deviations from the spec" section.
- **`specs/decisions/ADR-004-multi-tenancy.md` (v1.5.0)** — decision 5 amended by P7.5c+f (#263).
  It said per-vendor primitives are injected and "the **semantic** layer and every component stay
  unchanged." Components still are; the semantic *layer* no longer is, because `brandStyle()` now
  derives the foreground tokens per vendor through `clampForContrast`. The original wording was
  written when "semantic layer unchanged" and "vendors are differentiated" were compatible — #251
  broke that tie by decoupling three tokens into audited constants, and the clamp resolves it
  properly rather than picking a side. Also records that promotional content is vendor data on the
  same principle (#233).
- **`specs/design-system.md` (v1.8.0)** — the "do not restore the brand hex into the semantic layer"
  rule now says **raw** brand hex, and explains why the word matters: writing a primitive straight
  into the semantic layer stays forbidden (Aheed's `#4caf50` and `#f57c00` measure 2.78:1 and 2.70:1,
  the worst in the repo), while deriving one through the clamp is the opposite operation — it cannot
  return a value below the ratio it was given — and is how per-vendor colour is now delivered. A
  reader applying the old wording literally would have rejected the mechanism that enforces it.
- **`specs/decisions/ADR-005-payments-money-flow.md` (v1.5.0)** gains a P7.5b implementation note
  recording the subtraction rule and the two upstream clamps that make it safe (`lib/discounts.ts`
  bounds a code's face value; `clampRedemption` fills only the headroom it left), so `splitDiscount`
  needs no defensive cap — and stating that recomputing the loyalty share from vendor config must not
  be "fixed" back in later.
- **`specs/roadmap.md` (v1.41.0)** and **`specs/sdd-workflow.md` (v2.20.0)** — P7.5c+f's `/document`
  closeout (#263). Roadmap gains the slice's build/merge and production-promotion rows, including the
  live-verification detail (four DB-mutation rows and the carousel's pause control all closed live,
  not left disclosed-but-unverified) and an honest note that this session's sandboxed network egress
  couldn't reach either deployed domain directly, so "production is serving this commit" rests on the
  `deploy-production` workflow's own log rather than an independent curl. `sdd-workflow.md` gains two
  process lessons this loop surfaced: a generalisation of the `PromoSlider`/P4a bare-word-match trap
  to `validation.md` rows whose literal grep command is a stricter or looser proxy for its own
  requirement's actual wording (three instances found this pass, none real defects); and the root
  cause of PR #283's `mergeable: CONFLICTING` — PR #275's squash-merge had left `origin/main` without
  P7.5b's original commits as ancestors, which broke the *next* regular-merge promotion with a
  spurious conflict in the shared log files, resolved with a content-identical reconciliation merge
  pushed to `staging` rather than a forced rewrite. Promotion PRs should use a regular merge, never
  squash, to avoid recreating this.

### Fixed
- **P7.5a — staff reports correctness & checkout cart preservation** (#261, closing #238, #237,
  #234, `specs/2026-08-19-p7.5a-reports-cart-integrity/`). First slice of **P7.5**, the pre-launch
  closeout of P3/P5/P6 deferred debt (epic #260). The three places this system asserted something
  false to the person acting on it.
  **Revenue no longer counts orders that were never paid for** (#238): `getFinancialsForStaff`
  aggregated on `vendorId` alone, so abandoned checkouts and cancelled orders were reported as money
  taken — **39% overstated**, measured on staging. New `REVENUE_STATUSES` in `lib/order-status.ts`
  (`CONFIRMED`/`OUT_FOR_DELIVERY`/`DELIVERED`), written as a literal and deliberately **not** derived
  from `STAFF_QUEUE_STATUSES`, which is a worklist and omits `DELIVERED`. Avg Basket Value derives
  from the same two figures, so one filter corrects all three tiles.
  **The admin panel is no longer edge-cached** (#237): `/staff/reports` served a signed-in admin
  stale financials despite `force-dynamic` — so Next was not the cache. The app emitted no
  `Cache-Control` on any HTML route, leaving an intermediary free to invent a policy. Every
  `/staff/:path*` response now carries `private, no-store, must-revalidate`; storefront routes are
  deliberately untouched.
  **A failed payment no longer destroys the basket** (#234): `placeOrder` clears the cart inside the
  order transaction (load-bearing for double-submit safety), and when `createPayment` threw, the
  compensation returned stock, points and the discount-code use but not the cart — so "please try
  again" left the shopper an empty basket. New `restoreCartFromOrder` refills the originating cart,
  called from `placeOrder`'s `catch` rather than `releaseOrder` (which the Stripe webhook shares for
  sessions that expired hours earlier), and **only when `releaseOrder` actually cancelled**, so a
  racing confirmation cannot hand the shopper a duplicate basket for an order they paid for.

### Changed
- **`specs/architecture.md` (v1.16.0) — Cloudflare's edge cache is documented as active, not
  optional.** Its caching section listed "Cloudflare's own edge cache in front of the Worker" as
  something that *could* be added; #237 proves it is already there and was caching authenticated
  admin pages. Now states the rule: a per-session or role-gated route must declare its cacheability
  explicitly, because `force-dynamic` governs Next's rendering and not what sits in front of the
  Worker — two different things with an identical symptom.
- **`specs/decisions/ADR-005-payments-money-flow.md` (v1.4.0)** gains a P7.5a implementation note.
  Its P3c note described the payment-failure compensation as releasing stock, which understated it
  after this slice; the note records both constraints on `restoreCartFromOrder` (called outside
  `releaseOrder`; only on a real cancellation) that a later consolidation would otherwise undo.
- **`specs/roadmap.md` (v1.37.0)** gains the **P7.5** phase entry — six slices covering fourteen
  issues, with eleven others explicitly deferred to P8 and **#137/#151 explicitly not scheduled**
  (structurally unreachable until refunds exist) — plus the PR #259 promotion row that
  `npm run sdd:audit` reported as pending carry-forward.
- **`/document` closeout for P7.5a (#261, PR #268, merged to staging) — P7.5's first slice.**
  Roadmap (v1.38.0) gains the build/validate/merge row, including the real dev-Neon-branch
  credential failure `/validate` hit mid-run (handled per `CLAUDE.md`'s hard stop — recreated, not
  guessed) and the two live rows it unblocked (R5, R13) once the branch was recreated. Delivery
  board reconciled: #261 confirmed **In Review**. New issue **#269** filed (Phase P7, Backlog) for
  R8 — confirming the new `/staff/*` cache header actually stops staleness on the real Cloudflare
  edge, deliberately deferred past Ship rather than exercised for its own sake once
  `deploy-staging` was already green. `ARTIFACT_INDEX.md` rebuilt; `npm run sdd:audit` and
  `npm run kms:validate` both clean.
- **`/document` closeout for P7 closeout (#251, PRs #256/#257, now in production) — P7 is closed.**
  Roadmap gains the build/validate/fix, staging-merge and promotion rows, plus a phase-closure
  summary. `CLAUDE.md` gains a new "Design tokens & per-vendor branding" section recording the
  `brandStyle()` trap `/validate` found (a jsdom test that parses `tokens.css` directly proves
  nothing about what a browser renders when a parallel per-vendor CSS-injection mechanism can
  silently override the same tokens). `specs/design-system.md`'s per-vendor-theming note corrected
  to match verified reality — it previously said both the primitive and semantic layers are
  overridden per vendor; only primitives, `--color-primary`/`--color-surface-muted` and the three
  semantic tints are, since the `/fix` that landed with #251. Delivery board reconciled: #251/#217/
  #220/#222/#90 confirmed `Done`; #252/#253/#254/#255 (all filed during this slice or its `/fix`)
  given **Phase P8** so they don't sit unscheduled and un-phased. `ARTIFACT_INDEX.md` rebuilt;
  `npm run sdd:audit` and `npm run kms:validate` both clean.

### Added
- **P7 closeout — accessibility gate, RLS determination, guest data rights** (#251, closing #217,
  #220, #222 and the phase epic #90, `specs/2026-08-19-p7-closeout/`). One combined slice, decided
  at `/propose`.
  **Accessibility:** `eslint-plugin-jsx-a11y`'s recommended set now runs at `error` across `app/`,
  `components/` and `features/` — `eslint-config-next` already activated six of its rules but all at
  severity 1, so `npm run lint` exited 0 with real defects present. `CartDrawerShell` (the live cart
  drawer) gains the keyboard half of the dialog contract it lacked: focus moved into the panel on
  open, a `Tab`/`Shift+Tab` trap, focus restored to the cart button on close, `Escape`, and
  `aria-labelledby` naming its own heading. Key handling sits on `document` rather than the dialog
  container, because a container handler stops firing the moment focus leaves — which is when
  `Escape` matters most. New `tests/a11y/*` assert all of it in jsdom.
  **Guest UK GDPR erasure:** P7b gave account holders export, erasure and rectification; a guest who
  checked out without an account had no route to any of them. `/orders/lookup` now offers erasure
  behind the same order-number/email pair, rate-limited by the same limiter and budget (a fast "no
  such order" is an oracle for guessing pairs). `eraseGuestOrderData` verifies the pair itself, at
  the query level, inside the transaction — there is no window between proving ownership and
  erasing. One order per request, stated up front in both the form and the confirmation.
- **`tests/repository-vendor-scoping.test.ts`** — the compensating control for RLS. Walks each
  repository's TypeScript AST and asserts every exported function querying a `vendorId`-bearing
  model takes a vendor id, and that a function given one actually references it. Twelve exceptions
  allowlisted with reasons.

### Changed
- **Three semantic colour tokens darkened for WCAG 2.2 AA** — `--color-action` `#4caf50` →
  `#2e7d32`, `--color-accent` `#f57c00` → `#a85400`, `--color-danger` `#d32f2f` → `#c82d2d`, plus
  both derived hover shades. The `--color-brand-*` primitives keep their exact brand-kit values;
  only the semantic layer moved, which corrected **45-plus call sites across 20-plus files with no
  component edits**. The brand values fail AA in combinations the UI actually renders: action and
  accent on white at 2.78:1 and 2.70:1 (both under even the 3:1 UI threshold), and `--color-danger`
  on `--color-danger-tint` at 4.36:1 — the standard error-message treatment at `text-sm` in
  checkout, every account form and `OrderStatusBadge`. `tests/design-tokens-contrast.test.ts` reads
  `tokens.css` directly and asserts 17 pairs, so a future "restore the brand colours" edit fails.
  `specs/design-system.md` records why, and its Accessibility section — which already mandated
  icon-only `aria-label`s, no heading skips and non-brand-green button contrast — now notes that
  `CartDrawer.tsx` broke three of those rules while the doc stated them. Rules nobody executes are
  not controls.
- **ADR-004: row-level security determined NOT adoptable** (v1.4.0). Decision 2 deferred RLS to P7
  on the guess that per-request session vars on Workers isolates would be "fiddly". Measured, it is
  unavailable: `PrismaNeonHttp` has no session for a `SET LOCAL` GUC to live on, and the adapter
  refuses transactions in HTTP mode outright (`Transactions are not supported in HTTP mode`) — so
  the batched escape hatch does not exist at the adapter layer either. Adopting RLS would mean
  routing every read through WebSockets, the configuration that caused #187. Evidence in
  `specs/2026-08-19-p7-closeout/rls-experiment.md`, re-runnable via `scripts/rls-experiment.ts`.
  Neon's JWT-on-connection RLS would sidestep it but is gated behind Neon Auth, which `CLAUDE.md`
  keeps off. ADR-004 states the residual gap rather than implying parity.
- **`CLAUDE.md`'s repository-facade rule no longer contradicts itself.** It directed facades into a
  sibling `lib/<name>-service.ts`, then held up `getCartRepository` as the thing to match — while
  that function's own *location* is the violation, so a reader following it literally reproduced the
  defect. Now says to copy the shape, not the address, and names all nine non-compliant factories
  (#252).

### Fixed
- **The WCAG AA contrast fix above never reached a real rendered page — found at `/validate`,
  fixed at `/fix`** (#251). `lib/vendor-theme.ts`'s `brandStyle()` injects per-vendor branding as an
  inline style on every page's root element, and was re-declaring `--color-action`, `--color-accent`,
  `--color-danger` and their hover shades straight from each vendor's raw primitive colour — the
  same 1:1 mapping `tokens.css` used *before* this slice darkened those five independently of the
  primitives. An inline style always beats a stylesheet rule, so every real page kept rendering the
  pre-slice, AA-*failing* hex regardless of `tokens.css`; the jsdom contrast test never caught it
  because it reads `tokens.css` directly rather than rendering through the real layout. Fixed by no
  longer re-declaring those five tokens per vendor — they now resolve to the platform's fixed,
  audited default everywhere. `--color-primary`, `--color-surface-muted` and the three semantic
  tints are unaffected and still vary per vendor, since `tokens.css` still defines those as plain
  primitive aliases. **Consequence:** SriMart's own action/accent/danger primitives (never
  contrast-audited) no longer drive those three roles — SriMart now renders the same audited colours
  as every vendor there, trading its prior, unaudited differentiation for a real AA guarantee. Filed
  as **#255**: whether/how to bring back per-vendor differentiation for these three tokens with a
  real contrast guarantee is its own decision.

### Removed
- **`components/cart/CartDrawer.tsx`** — dead code. Added by P7a (`624a842`) and never imported by
  anything, as `git log -S` confirms across all branches; the live drawer is `CartDrawerShell.tsx`,
  rendered by `Header.tsx`. It held both violations the new accessibility gate found. #251's spec
  originally targeted it for the dialog-semantics work, which would have asserted accessibility
  properties of a component no user can reach.

### Added
- **P7d — Workers observability and the first NFR measurement** (#218,
  `specs/2026-08-19-p7d-observability-nfr/`). `wrangler.toml` gains a top-level `[observability]`
  block (`enabled = true`, `head_sampling_rate = 1`, inheritable by both envs) — until now there was
  no way to take a server-side latency measurement at all, while `specs/mission.md` had set
  `LCP < 2.5s` and API `p95 < 400ms` as Gate-3 criteria from the start. `scripts/measure-nfr.ts`
  (+ `npm run nfr:measure`) measures client-observed TTFB percentiles over public routes with no
  database credential or session, so the numbers are reproducible from a clean checkout. Results are
  recorded in the new `docs/nfr-baseline.md`, which labels every figure client-observed or
  server-side rather than blurring the two.
  **API p95 meets its target** (worst warm route 138.92 ms vs 400 ms; cold start 924.94 ms recorded
  separately rather than averaged away). **LCP breaches it by ~5x** — 11,700 / 12,482 / 12,633 ms
  across three Lighthouse runs. The cause is one asset: the vendor logo is **1,926,055 bytes, 83% of
  page weight**, rendered into a 40 px-tall box on every storefront page, and it is `docs/logo.png`
  uploaded unresized. Filed as **#243**; not remediated here because the fix is an account/plan
  decision plus asset ops, not repo code.
- **`Order(vendorId, userId, createdAt)` index** (migration
  `20260818233907_p7d_order_user_history_index`). `specs/architecture.md` §3.4 claimed an
  `Order(userId, createdAt)` index served order history; **it never existed**, so `listForUser`
  (which filters `{vendorId, userId}`) could only walk the *vendor's* orders and discard other
  customers' rows — one shopper's history costing the whole store's order volume. At 118 rows the
  fix is not observable, and the baseline says so rather than claiming a speed-up.

### Fixed
- **Two persistent docs corrected against the artifact rather than against each other.**
  `specs/architecture.md` §3.4 named two indexes that did not exist and both omitted the leading
  `vendorId` ADR-004 requires; the paragraph is now reconciled to `prisma/schema.prisma`.
  `specs/tech-stack.md` still presented Next.js Data Cache / ISR as the catalogue caching strategy,
  which `specs/architecture.md` has documented as unworkable on this stack since P2a — whichever
  document a reader opened first decided what they believed.
- **A `<1%` table cell in `docs/nfr-baseline.md` broke the internal KMS docs site build.** MDX
  parses a bare `<` followed by a digit as the start of an invalid JSX tag name, which failed
  `deploy-docs-internal`'s Nextra build the moment this doc was assembled into the site. Reworded
  to "under 1%"; the app's own `gates`/`build` never touch this pipeline, so the app-level slice
  PR's CI stayed green while this broke on the next push. Found and fixed at `/ship` for #218
  (PR #245/#247).

### Changed
- **#46 settled: keep plain `<img>`.** Cloudflare Image Transformations are **not enabled** on this
  zone (`/cdn-cgi/image/…` returns 404 in all three URL forms), so a `next/image` custom loader
  would ship byte-for-byte identical images. `ProductCard` and `ProductImageGallery` gain intrinsic
  `width`/`height`, and the gallery's first image loads eagerly at high priority;
  `@next/next/no-img-element` is now off repo-wide with the reasoning inline, replacing a mix of
  inline disables that made the warning meaningless. Admin and staff surfaces untouched.
- **`CLAUDE.md` now states that "no raw SQL" governs application code, not migrations.** This was
  never actually undecided — `specs/architecture.md` §3.1 has said it since the schema was written —
  but it was absent from the file read at decision time, which is why GAP-011 sat deferred behind an
  answer that already existed one document over. Unblocks the `pg_trgm` question (#163/GAP-011) and
  the same question in #220 (RLS).

### Documentation
- **#236 re-driven with real Server Action calls** (25 sequential at ~1.1 s and 30 back-to-back both
  clean; **20 concurrent produced 3 connection-level failures**). The reported sequential ceiling did
  not reproduce — the constraint is concurrency, not rate. Whether those failures are server-side or
  the client's own socket pool is **deliberately not asserted**: separating them needs the persisted
  Workers Logs that only exist after `deploy-staging`. **#163** and **#236** stay open with their
  measurements recorded; **#244** is new — production's vendor logo object was never uploaded, so
  every production page renders a broken image (verified with and without a `Referer`, ruling out
  hotlink protection).
- **`/document` closeout for the validation debt bucket (#231, PRs #240/#241).** Roadmap gains the
  `/fix` and Ship-time rows (PR #240 to staging, PR #241 promotion to production, post-promotion
  issue-state check confirming no accidental closure). `docs/gap-register.md` gains GAP-024 (the
  `/staff/runbook` `PanelRefusal` gap `/fix` corrected). Two lessons recorded while still cheap:
  `CLAUDE.md` gets a new "Staff panel pages" section (every `/staff/*` refusal branch must render
  `PanelRefusal`, never `return null`, since the layout shell still renders around a `null` page);
  `specs/sdd-workflow.md` gets a third instance of the grep-matches-the-explanation trap, this time
  in a requirement's own literal text (R40 was broader than its own `validation.md` row).
  `ARTIFACT_INDEX.md` rebuilt; `npm run sdd:audit` and `npm run kms:validate` both clean.
- **`/document` closeout for P7d (#218, PRs #245/#248/#247, now in production).** Roadmap gains the
  build/validate, staging-merge, `deploy-docs-internal` fix, and promotion rows. `CLAUDE.md` gains a
  new "KMS docs" section and `specs/sdd-workflow.md`'s Validate pre-flight names the real check for
  any slice touching `docs/`/`specs/` — the app's own `lint`/`build` never build the internal KMS
  site, so a defect there (this slice's MDX-breaking `<1%` table cell) merges clean and only fails
  on the next push. `docs/nfr-baseline.md`'s Observability section reconciled with what Ship actually
  found: persisted-Workers-Logs confirmation stayed blocked in that environment even after deploy
  (both `wrangler tail` and the Cloudflare dashboard), filed as **#246** rather than left as an
  implicit promise. `ARTIFACT_INDEX.md` rebuilt; `npm run sdd:audit` and `npm run kms:validate` both
  clean.

### Added
- **`sdd:audit` now checks promotions, not just slices** (#207,
  `specs/2026-08-18-validation-debt-bucket/`). A merged `staging → main` PR with no
  `specs/roadmap.md` change-log row was structurally invisible to the audit, which is how the same
  gap recurred five consecutive times, each caught by eye at a later `/orient` while the check
  reported green. `scripts/sdd-promotions.ts` holds the matcher as a pure, importable module —
  `sdd-check.ts` calls `process.exit()` at module scope, so importing *it* from a test would kill
  the run. A row must cite `PR #NNN` or the merge SHA; a bare `#NNN` deliberately does not count,
  since issues and PRs share one number space here. The check **skips rather than fails** when `gh`
  is unavailable, and reports a promotion merged after the last roadmap edit as a *pending
  carry-forward* rather than a gap, so it can't fire falsely on every branch cut after a promotion.
  **On its first real run it found three promotions nobody knew were undocumented — PRs #118, #121
  and #134** — whose rows are backfilled here.
- **Test coverage for `reverseRedemption`'s null-owner path** (#224). P7b made
  `LoyaltyLedgerEntry.userId` nullable, forcing a behaviour change that `/validate` called the
  highest-risk edit in that diff and that shipped verified by code reading alone: when the
  redeeming user has been erased, the `LoyaltyAccount` credit is skipped while the `REVERSAL` row
  is still written. Five cases in `tests/loyalty-repository.test.ts`, including a live-owner
  contrast case so the null assertions prove a real branch.

### Fixed
- **The homepage hero no longer loads a CSP-blocked external image.**
  `app/(storefront)/page.tsx` hardcoded an `images.unsplash.com` photo — the only external image
  URL in the codebase — while P7a's `Content-Security-Policy` allows
  `img-src 'self' data: https://*.nocaped.com`. It had been failing its CSP check in production
  since PR #206 promoted the CSP on 2026-08-17, and rendered identically for every vendor, which
  P6.6's own R12 forbids. Confirmed still live and blocked on staging at `64e4a46`
  (`unsplashLoaded: false`). The hero keeps its token-driven brand panel and glow; a real
  per-vendor hero image needs a `VendorConfig` field and a migration (**#233**).
- **`/staff/runbook` now refuses a signed-in non-staff visitor the same way every other staff page
  does.** Its role check returned `null` on refusal instead of rendering `<PanelRefusal>`, so a
  signed-in customer got a blank content area inside the admin shell (HTTP 200, no message) rather
  than "Staff only — this area is restricted to store staff." Found at `/validate` by exercising the
  exact row `build-notes.md` had disclosed as never fired; fixed to match the other 8 `/staff/*`
  pages' pattern.

### Changed
- **P6.6's and P6.6c's exit gates rewritten so they can be walked** (#192 item 4). Six of P6.6's
  eight validation rows asked a reader to confirm the UI "matches the prototype" — unfalsifiable,
  the same defect P6.5's gate was rewritten to remove. P6.6c had never used the Gate-2 format at
  all: checkbox bullets on both sides, so no numbering to map one onto the other. Now `R1..R14` and
  `R1..R17` respectively, every row naming a command, a file property or an observable behaviour.
  P6.6c's navigation requirement states a required **subset** rather than "all 9 tabs", which P6.7
  falsified by legitimately adding a tenth. **Neither rewrite was edited to match the code**: where
  the artifact fails an obligation, the obligation stands and the gap is tracked.
- **`docs/gap-register.md` 2.4.0** — GAP-016..GAP-023, six of them found by actually walking the
  rewritten gates and by #103's live window rather than by reading anything.
  `specs/sdd-workflow.md` 2.17.0 and `CLAUDE.md` updated: both described `sdd:audit` in terms the
  promotion check made incomplete.

### Validated
- **P3c's R7 payment-failure path proven live for the first time** (#103), in a deliberate,
  separately-confirmed window against staging's Worker (13:21:05Z → 13:25:00Z). With an invalid
  `STRIPE_SECRET_KEY`, order `AHE-20260818-U82BM2` was left `CANCELLED` with two `OrderStatusEvent`
  rows (`PENDING_PAYMENT` → `CANCELLED`, *"Payment provider unavailable; order cancelled and stock
  released."*) and `Inventory.quantity` restored to **exactly** its pre-order value. The key was
  restored from `secrets/staging.vars` and the restore proven by a new Stripe Checkout session
  created through the real app — not by the write's exit code, since Cloudflare secrets cannot be
  read back.
- **P6.6 and P6.6c walked against their rewritten gates**, which found two defects no amount of
  reading would have caught: **SriMart, an electronics store in Reading, advertises certified halal
  meat** because `Header.tsx`/`page.tsx` hardcode Aheed grocery copy (**#239**), and the staff
  financial report **counts cancelled and unpaid orders as revenue** — £1,162.64 of a £3,003.49
  headline, 39%, never collected (**#238**). Both were reachable only by exercising the artifact
  against a second tenant and against real order data.
- Deferred with issues filed, not remembered: **#232** (wishlist link never built), **#233**
  (per-vendor hero image), **#234** (payment failure destroys the cart while telling the shopper to
  try again), **#235** (CDN hotlink 403s local preview, so no image renders there), **#236** (rapid
  cart mutations still reach a failure ceiling), **#237** (admin financial report served stale from
  cache despite `force-dynamic`).

### Docs
- **`/document` pass reconciling P7b (#216) + the local dev environment tier (#226) with their
  live promotion to production** (PR #229, `staging → main`, merge `6a6f51d`). `specs/roadmap.md`
  gains the dev-environment slice's first-ever roadmap entry (build through staging merge, PR #228,
  never recorded until now) and a promotion row covering both slices together — staging was 13
  commits ahead of `main` at promotion time, so a docs-only slice and a GDPR feature carrying a
  real migration went out in the same PR. `npm run sdd:audit` confirms all slices documented.
  `CLAUDE.md` gains a new Windows-shell lesson: `npx tsx -e "<script>"` fails **silently** (no
  stdout, no stderr, exit 0) the moment the inline script imports an installed package, hit three
  times during `/validate`'s live R10 isolation check before switching to a real `.ts` file — write
  ad hoc DB scripts to a file inside the repo, not `-e`, for anything beyond a trivial one-liner.
- **Local `dev` environment tier** (`specs/2026-08-18-dev-environment/`, closes #226). `docs/
  env-setup.md` gains a "Local development (dev)" section: one disposable Neon **branch** per
  developer (not a project, unlike staging/production — a personal branch holds no real vendor
  data, so ADR-004's "separate projects, not branches" ruling doesn't apply), branched off
  **staging** so it inherits current schema + seed/demo data with no `db:seed` step, and reset by
  delete-and-recreate. Deliberately **local-only**: no `wrangler.toml` env block, no deploy, no CI,
  no GitHub environment, not routed through `scripts/configure-env.mjs` — both files are untouched
  by this slice. Object storage is one **shared** `aheed-images-dev` R2 bucket across every
  developer, not per-developer. Fixes the actual behaviour this replaces: `.env`/`.dev.vars`
  previously pointed local `next dev`/`npm run preview` straight at the **staging** database and
  bucket, so every local validation pass either risked staging data or needed scratch infra stood
  up by hand — `.env.example`/`.dev.vars.example`'s `S3_BUCKET` placeholder is corrected from
  `aheed-images-staging` to `aheed-images-dev` accordingly. Docs-only; no application code, no
  schema change. Live-branch proof (a personal branch boots with seed data intact and is provably
  isolated from staging) is deferred to `/validate`, once a developer has created their own branch
  by hand per the new doc section.
- **`/document` pass reconciling P7b's staging merge (PR #223) with what `/validate` actually
  found.** `specs/roadmap.md` now records the real `/validate` → `/fix` cycle: a genuine spec
  contract violation (`getDataRightsRepository()` had been added to `lib/repositories/data-rights.ts`
  and called `getCurrentVendorId()` with no explicit `vendorId`, breaking that file's own "every
  export takes prisma/vendor explicitly, no request context" property) and a `validation.md` gap
  (the slice's migration was never instructed to be applied to staging before the write-path
  harness, unlike the catalogue-debt-bucket slice's own `validation.md`). Both fixed before shipping;
  R15's coverage gap (harness never exercised `DiscountRedemption`) closed in the same pass.
  `CLAUDE.md` gained a new "Repository layer" section recording the facade-placement rule generally
  (`lib/auth-rbac.ts`'s pattern — a request-context wrapper beside, not inside, `lib/repositories/`)
  so future slices don't rediscover it; `specs/sdd-workflow.md` gained the missing-migration-step
  trap so it's written into every slice's `validation.md` that ships a migration, not left to be
  rediscovered per-slice. Filed **#224** (untested `reverseRedemption` null-owner refund path,
  a real behaviour change reached sideways through this slice's migration) rather than leaving it
  as an unverified `/validate` note. Issue #216 moved to **In Review** (staging only, not promoted).

### Added
- **UK GDPR data-subject rights — download, correct and erase your data** (P7b, issue #216,
  `specs/2026-08-18-p7b-data-rights/`). `/privacy` §5 already told customers they could "access,
  rectify, or request deletion" by contacting a "privacy compliance team" that exists nowhere in
  the app, and none of the three had a mechanism behind it: no export path anywhere in the
  codebase, no account deletion, and `/account` rendering name/email/role as static text with no
  edit control. New `/account/data` offers all three. **Export** (Art. 15) is a JSON download
  served by a route handler, covering account details, orders, addresses, reviews, basket, loyalty
  and discount redemptions — and deliberately no credential material: linked accounts disclose the
  provider name only, sessions their metadata but never the token. **Erasure** (Art. 17) keeps the
  money and drops the person — orders are tombstoned with totals and items untouched, addresses
  redacted in place (`Order.addressId` is not nullable, so the row cannot go), reviews/basket/
  loyalty balance deleted, and the loyalty ledger and discount redemptions retained but detached.
  **Rectification** (Art. 16) is name-only for now; email change needs verification mail and is
  deferred to #221 behind #104.
- Everything is **vendor-scoped** (ADR-004 global identity + row-level `vendorId`): erasing at one
  store leaves your account at another untouched, and the shared sign-in is deleted only when no
  other vendor still holds data. The platform-wide alternative was rejected because it needs
  un-scoped repository methods, and this repo's one existing un-scoped read is what became P7a's
  order-disclosure defect. `countOtherVendorData` is the single permitted cross-vendor query,
  contracted to return an integer and never rows — recorded in ADR-004 so it doesn't read as
  precedent.

### Changed
- **`LoyaltyLedgerEntry.userId` is now nullable with `ON DELETE SET NULL`** (additive migration
  `20260818021500_p7b_loyalty_ledger_user_nullable`). It was non-null with `Cascade`, so deleting a
  `User` destroyed the ledger rows that are the only explanation of a surviving order's
  `discountPence` — a financial audit trail the order must retain, and a violation of that model's
  own documented append-only invariant. Consequently `reverseRedemption` now skips the
  `LoyaltyAccount` balance update when the owner has been erased (there is no balance left to
  credit) while still writing the `REVERSAL` row, so the trail balances and the idempotency guard
  still holds.
- **`specs/roadmap.md`'s P7 and P8 lines no longer both claim backups and monitoring.** P7 said
  "backups + monitoring" while P8 said "backups/PITR, monitoring", so each phase could assume the
  other owned them — the same shape that let GAP-010 sit unbuilt behind an accounted-for row.
  Resolved at `/propose`: **P8 owns them**; P7 stops at what lives in the repo. P7's remainder is
  now four tracked slices — #216 (this), #217 accessibility, #218 observability + index/query
  review, and #220 row-level security, the last being an already-approved ADR-004 obligation the
  first decomposition had missed entirely.

### Fixed
- **Production R2 bucket CORS applied** (#180, GAP-007 → `Fixed`) — owner action, no code change.
  `aheed-images-production` had never had a CORS policy, so every browser-direct presigned `PUT`
  failed preflight. This stopped being a dormant P6 leftover the moment PR #214 promoted the
  multi-image manager: **every admin image operation in production was failing**. Absence confirmed
  first (`The CORS configuration does not exist [code: 10059]`), then verified by live `OPTIONS`
  preflight in both directions — both production origins return `204` with the origin echoed, while
  the staging origin and an unknown origin both return `403` with no `Access-Control-Allow-Origin`,
  proving the policy discriminates rather than being permissive.

### Docs
- **`/document` pass reconciling both promotions to production (PR #214) and a real
  closing-keyword incident.** `specs/roadmap.md` now records the catalogue-debt-bucket slice's
  actual staging outcome (both R2/R15 blockers found and resolved before Ship — one was a test-
  harness bug, the other a local-only R2 CORS limitation, not app defects) and the combined
  production promotion. **Issue #174 was closed by accident during that promotion** — a `/fix`
  commit message quoting the exact wrong text it was correcting (`"closes #174"`, inside a sentence
  saying the opposite) still matched GitHub's closing-keyword scanner, which reads every commit in
  the merged set, not just the PR body. Caught within minutes via the routine post-promotion
  issue-state check, reopened with an explanatory comment, board status corrected. Recorded a
  sharper version of this trap in `specs/sdd-workflow.md`'s Ship section: `closingIssuesReferences`
  doesn't see every commit message, so it isn't sufficient on its own — the literal string
  `closes #NNN` (or any closing-keyword variant) must never appear anywhere near an issue number
  that must stay open, including inside a quotation.

### Fixed
- **The homepage's "New Arrivals" and "Featured Halal Deals" rows rendered nothing at all**
  (issue #211, closes #208's remainder). Both fetched products via
  `productsRepo.search("", {...})`; `search()`'s empty-query guard — correct for its real caller,
  the `/search` page — unconditionally returns zero results, and `ProductRow` renders `null` for
  zero products. Neither row's title appeared anywhere in `npm run preview`'s rendered homepage
  before this fix. Added `ProductRepository.list()` for filtered listing without search text;
  `search()` itself is unchanged.

### Added
- **Real `Product.isFeatured` flag** (additive migration), replacing the `isHalal` proxy the
  homepage's featured rail ran on (GAP-013, #208). Admin checkbox in `ProductForm`, rail retitled
  "Featured Products". Deliberately independent of `originalPrice`'s existing discount-badge
  derivation — featured and "on offer" stay two separate concepts.
- **Multi-image admin management** (GAP-014, #173): add a second (or third...) image, set which one
  is primary, remove one, reorder them — `lib/repositories/products.ts`'s `addProductImage`/
  `promoteProductImage`/`removeProductImage`/`reorderProductImages`, four new server actions, and
  `components/staff/ProductImageManager.tsx`. The real gap was bigger than "remove and reorder are
  missing": no code path had ever created a second `ProductImage` row — `attachProductImage` only
  ever repointed the single primary, unchanged by this slice.
- **`StorageService.deleteObject`** (GAP-015, #174 partial): removing or replacing a product image
  now deletes the superseded object from storage. Decided inline delete over a scheduled sweep — no
  new infrastructure, `wrangler.toml` still has no cron triggers. Doesn't cover an abandoned upload
  (object written, `ProductImage` row never created) — #174 stays open for that narrower remainder.
  `specs/architecture.md` and ADR-003 updated; both previously documented delete as "deliberately
  absent".

### Docs
- **`/document` pass for the P6.5 residual-validation `/validate` + `/fix` + `/ship` cycle
  (PR #209).** Added the roadmap row recording the actual merge (`74b6d02`) and the `/fix` pass
  that preceded it — the Build-time row predicted the outcome before Ship ran, matching the pattern
  already seen for PR #205/#206. Rebuilt `ARTIFACT_INDEX.md`. Confirmed issue #192's board item is
  `In Review` (not `Done` — merged to `staging` only) and that #208/#176 are correctly placed.
  Recorded a lesson in `specs/sdd-workflow.md`'s Ship section: a PR body referencing an issue that
  must stay open is a closing-keyword trap even in prose that isn't the canonical `Closes #NN`
  form — verify with `gh pr view <N> --json closingIssuesReferences` before merging.

### Fixed
- **Gap-register reconciliation: the registers were wrong on seven of fifteen rows**
  (specs/2026-08-17-p6.5-residual-validation/, issue #192). Two `status: approved` registers were
  sharing one GAP-ID space with no cross-reference — `docs/sdd/self-review/GAP-REGISTER.md` held
  GAP-001..004, `docs/gap-register.md` held GAP-005..015. Consolidated into `docs/gap-register.md`
  as the single master; the P6.5 file keeps its narrative and points there. Every row was then
  re-derived from the code rather than from what the row claimed about itself: GAP-007 cited the
  closed P6b2 upload issue (#167) instead of the open CORS prerequisite (#180); GAP-008, GAP-009,
  GAP-010, GAP-012 and GAP-013 all still read `Deferred` after the work had shipped. **GAP-012 was
  fully built and nobody knew** — `features/orders/reorder-items.ts` is a complete server action
  wired into the order detail page while both the register and issue #124 reported it outstanding.
  GAP-013's rail ships but is populated by an `isHalal` proxy rather than a real featured flag
  (**#208** filed). GAP-014's wording understated what exists (add and set-primary are built;
  remove and reorder are not). The register's "0 P0 (Critical Code/Security) gaps" and "100%
  functionally complete, fully tested, and verified" claims are removed — both were false on the
  day they were written, given P7a's unlisted unauthenticated cross-vendor order-disclosure hole.
- **P6.5's exit gate certified a document instead of the code.** Its `validation.md` R1/R2 asked
  only that the gap register exist and *claim* zero unresolved Critical/High gaps, and its six rows
  were labelled `R1..R6` against a `requirements.md` that had no numbered requirements at all.
  That is the mechanism that let GAP-010 sit as an accounted-for `Deferred` row while staff bulk
  transitions had never been built. Both files rewritten: numbered `R1..R11`, every row now naming
  a command, a file property, or a behaviour to exercise against the artifact.
- **#176 verified fixed and closed**, and `specs/sdd-workflow.md`'s Validate-stage guidance for it
  corrected. The fix had landed as GAP-002 of P6.5, but its only evidence was 26 unit tests — the
  reported symptom was never re-fired, so the issue stayed open and the workflow doc kept telling
  future sessions that local-preview browser sign-in 403s and needed a temporary **uncommitted**
  patch to `lib/auth-origin.ts`. Live-verified against `npm run preview`: `Origin:
  http://localhost:8787` reaches credential checking (`401` on a wrong password) while `Origin:
  http://localhost` correctly returns `403 INVALID_ORIGIN` — **the inverse of what the doc
  documented**, so a validator following it would have called a working app broken. Confirmed from
  a real Chrome session as well (`POST /api/auth/sign-in/email` → `401`). Because the origin check
  runs before credential validation, a deliberately wrong password proves this with no real
  credential involved.

### Docs
- **Backfilled the PR #206 promotion row in `specs/roadmap.md`** (`staging → main`, merge
  `081f618`) — the fifth consecutive promotion to reach production without a change-log row.
  `sdd:audit` checks for a missing *slice* row and structurally cannot see a missing *promotion*
  row; rather than record that observation for a fifth time, it is now tracked as **#207**.
- **`/document` pass for the P7a `/validate`+`/fix`+`/ship` cycle (PR #204).** Backfilled two
  missing promotion rows in `specs/roadmap.md`'s change log — PR #203 (`staging → main`, closing
  P8 operational-debt issues #98/#156/#197) and today's P7a fix (PR #204, merged to `staging`) —
  the same recurring "`sdd:audit` catches a missing slice row, not a missing promotion row" gap
  #144 first named. Corrected the 2026-08-13 P7a-closure row's claim that staff bulk transitions
  had shipped (they hadn't; #162, now actually built). Recorded that issue #123 was closed
  prematurely on 2026-08-13 — accurate now that the guest-lookup fix landed, but the underlying
  feature was broken/insecure at the time it was marked done. Rebuilt `ARTIFACT_INDEX.md`.

### Fixed
- **P7a compliance/hardening: three defects found and fixed at its first-ever `/validate` pass**
  (specs/2026-08-13-p7a-compliance-hardening/). P7a shipped ungated (direct push, no PR, no
  `gates`) on 2026-08-13; this is the first time it was checked against its own spec. Missing
  `Content-Security-Policy` header added to `next.config.mjs`, scoped to the app's actual external
  hosts (per-vendor CDN, R2's presigned-upload endpoint) so image upload wasn't silently broken.
  Staff bulk order transitions (`requirements.md` §4.3/GAP-010, issue #162) were never built
  despite the roadmap claiming otherwise — added `advanceOrderStatusBulk` (one `$transaction` per
  batch, legality re-checked per order against its own persisted status) and wired multi-select
  checkboxes into `/staff/orders` via HTML5's `form=` attribute rather than nested `<form>`s. Guest
  order lookup (`/orders/lookup`) reused `findOrderForWebhook` — documented in its own file as the
  one deliberately un-scoped read in the codebase, meant for Stripe's server calls only — with an
  optional email field, so an order number alone disclosed any order's contents, any vendor, no
  auth, no throttle; this is exactly the gap issue #123 deferred pending a real credential-pair/
  rate-limiting decision, which P7a's own `requirements.md` §4.1 had already settled (Order Number
  + Email) without the implementation enforcing it. Fixed with a vendor-scoped, email-matched query
  (`findOrderForGuestLookup`) and a new Postgres-backed 5/minute rate limiter
  (`OrderLookupAttempt`, additive migration `20260817120702_p7a_order_lookup_rate_limit`) — no
  Cloudflare rate-limiting binding is provisioned, so this reuses existing Neon/Prisma rather than
  inventing infrastructure. All three verified live against real Postgres on staging.

### Docs
- **Backfilled `specs/roadmap.md`'s missing PR #200 promotion row.** `sdd:audit` only checks that a
  roadmap entry cites a `specs/<slice>/` path, so a missing *promotion* row (as opposed to a missing
  *slice* row) goes uncaught — the same class of gap **#144** recorded for P5a. PR #200 (`staging →
  main`, merge `399ecef`) carried PR #195's doc reconciliation plus buckets A/C and the demo-accounts
  fix (#199) to production with no migration; production `/api/health` reconfirmed at `399ecef`.

### Fixed
- **SriMart's `VendorConfig` delivery values re-seeded on staging** (#98): `npm run db:seed` had
  never run with both `SEED_AHEED_HOST` and `SEED_SRIMART_HOST` set against staging, so SriMart's
  delivery fee/threshold/minimum sat on `VendorConfig`'s schema defaults (£3.49) instead of the
  vendor-specific values already written in `prisma/seed.ts` (£2.99, free over £50, £10 minimum).
  Re-ran the seed with both host vars set; verified live against staging Postgres —
  `deliveryFeePence: 299, freeDeliveryThresholdPence: 5000, minimumOrderPence: 1000` — confirming
  SriMart's checkout now renders its own values, not Aheed's/the schema default's. No code change;
  a live data operation, recorded here per Gate 4.

### Docs
- **ADR-004 schema-drift check closed** (#197, split from #65): `prisma migrate diff
  --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma` run against a
  throwaway local Postgres shadow database (Docker, discarded after) reported "No difference
  detected" — the hand-authored `20260808130000_multitenancy_vendor_scope` migration exactly
  matches `schema.prisma`. No reconciling migration needed. Recorded in ADR-004's implementation
  breadcrumb.

### Added
- **`demo-srimart-admin@example.com` in the demo-accounts roster** (#141): a store admin on the
  platform's second vendor (SriMart), needed to close P5a's R56 gap — every other vendor-role demo
  account attaches to the same (first ACTIVE) vendor, so a cross-vendor write could only ever be
  tested in one direction. `DemoAccount` gains an optional `vendorSlug` field (omitted = existing
  "first ACTIVE vendor" default) so an account can target a specific second vendor.
  R56's reverse leg verified live against staging with a repository-level check
  (`vendorConfig.update({ where: { vendorId: <srimart-id> }, ... })` leaves Aheed's row's
  `updatedAt` untouched) rather than an interactive browser sign-in, which isn't something the
  assistant can do itself even for a non-sensitive demo account — see
  `specs/2026-08-11-p5a-loyalty-points/validation.md`'s R56 row.

### Added
- **`sdd:preclear` now checks `ARTIFACT_INDEX.md` staleness** (#132), mirroring `gates.yml`'s own
  check so it can't surface for the first time on an open PR — P4b lost a CI run and a fix commit to
  exactly that. Rebuilds the index into memory, diffs it against what's on disk with the generated
  timestamp/commit footer normalised out, and restores the original bytes when the only difference
  is that footer, so a footer-only rebuild doesn't masquerade as real uncommitted work for the
  clean-tree check. Found and fixed a bug in its own first version while testing on Windows: a
  `core.autocrlf` checkout holds `\r\n` on disk while `kms:build-index` always writes `\n`, so the
  raw byte compare needs line endings normalised too, not just the footer text.

### Docs
- **The multi-issue `Closes #a, #b, #c` GitHub limitation** (#112): GitHub only honours the closing
  keyword for the first issue in a comma-separated list, silently leaving the rest open on merge.
  Documented in `specs/sdd-workflow.md`'s Ship section and `.claude/commands/ship.md` — promotion
  PRs are exactly where this bites, since slice PRs merge into `staging` (never the default branch),
  deferring every issue closure to the promotion PR.

### Removed
- **Eleven orphaned debug scripts** (#191): five ad-hoc Puppeteer scripts at the repo root
  (`parse-logs.js`, `test-action.js`, `test-checkout.js`, `test-local.js`, `test-staging.js`) and six
  more under `tests/regression/`, none referenced by any workflow, `package.json` script, test
  config, or source import. The two regression scenarios they exercised (rapid cart mutation,
  checkout-cancel cart restoration) are already covered as a manual register in
  `docs/regression-tests.md`, verified live on staging during P6.7's closeout. `puppeteer` removed
  from `package.json` — these scripts were its only consumer in the repo.

### Docs
- **ADR-004**: added an implementation-status breadcrumb for slices 0–1 (Neon environment isolation,
  the `Vendor` aggregate + `vendorId` migration), both shipped to production 2026-08-08. One
  follow-up item from #65 remains open and un-narrowed to just that: independently verifying the
  hand-authored migration has no Prisma schema drift.

### Added
- **`demo-store-admin@example.com` in the demo-accounts roster** (#190): a store admin — vendor
  `ADMIN`, platform `CUSTOMER`. This role was previously impossible to represent:
  `requireVendorRole()` short-circuits to `via: "platform-admin"` for any platform `ADMIN`
  (`lib/auth-rbac.ts`), so `demo-admin`'s `vendorRole` is never read, and the three guards that only
  fire for `via: "ADMIN"` (`roles.ts:42`, `roles.ts:64`, the self-lockout branch) had unit coverage
  but had never run against a real session. `tests/demo-accounts.test.ts`'s roster assertions now
  derive from `DEMO_ACCOUNTS` instead of hardcoding its size and shape.

### Docs
- **P6.7 closed out** (#186, `specs/2026-08-17-p6.7-closeout-promotion/`): walked `validation.md`
  §1.1–§1.4 and §2 live on staging across four accounts — all 29 rows now checked off with the
  observed result recorded against each. Both hierarchy refusals, the STAFF denial and both
  self-lockout variants hold; the store admin's role selector omits `ADMIN` from the DOM entirely,
  and injecting the option server-side is still refused. The audit trail wrote **6 rows for 6
  successful writes and 0 rows for the 4 refusals**, confirming the guards run inside the
  `$transaction`. Smoke-checked P6.6/P6.6c/P7a and the #187 cart/checkout paths ahead of promotion;
  P6.5 and a live order status transition are recorded as deliberately not covered.
- **`specs/Validation.md` → `docs/regression-tests.md`**: given KMS front-matter and moved out of
  `specs/`, where it had no front-matter, never reached `ARTIFACT_INDEX.md`, and collided by name
  with every slice-local `validation.md`. Both of its regression scenarios were re-verified on
  staging and are annotated with the result.
- **Roadmap corrections**: the P6.5 row cited "Issue #180" (an unrelated CORS issue) and the P7a row
  cited "PR #183" (an issue number, and no PR carried P7a). Both now record that the slice shipped
  by direct push with no anchoring issue, naming the actual commits `982eafb` and `624a842`.
- **Board reconciliation**: #183/#184/#187 → In Review; **#185 corrected from Done → In Review**
  (its fix was never promoted, so it was not in production); #176 → Backlog; added a draft item for
  P6.6, which shipped via PR #182 with no issue and no board presence.
- Filed **#191** — eleven orphaned debug scripts still tracked from the ungated period.

### Docs
- **P6.7 closeout — Document (final)**: corrected `specs/roadmap.md`'s 2026-08-17 closeout row,
  which had recorded promotion to production as already done — it was written during Build, before
  the promotion PR existed. Added the real promotion row: **PR #194**, merge `7c9409c`, 56 commits
  (not the 51 `plan.md` estimated pre-Ship), `deploy-production` green, production `/api/health`
  confirmed `db.ok: true`. Board reconciled to match: #183/#184/#185/#187 and the P6.6 (PR #182)
  draft item moved to **Done** — all four fixes were confirmed inside the promoted commit range, so
  "In Review" (PR #193's placeholder, written before promotion) was no longer accurate. #186/#190
  closed on the `main` merge. **Process lesson recorded in `specs/sdd-workflow.md`**: a slice's own
  `validation.md` should never check `ARTIFACT_INDEX.md` staleness with a bare
  `git diff --exit-code` — the footer embeds `git rev-parse HEAD` at generation time, so a committed
  index can only ever cite its own parent commit, and a bare diff will show that one-commit gap
  forever, by construction. CI's `gates.yml` normalizes the footer away before comparing; P6.7's
  `validation.md` didn't, so `/validate` reported a false failure and `/fix` spent a harmless-but-
  unnecessary commit chasing it.

### Docs
- **P6.7 Document (final)**: rebuilt `ARTIFACT_INDEX.md` (P6.7's `plan.md` was missing KMS
  front-matter, so the slice was invisible to `sdd:audit`'s index check — added it); added the
  2026-08-17 roadmap closure/status row recording what PR #188 actually verified vs. what's still
  open (live multi-role validation, promotion to `main`); reconciled `validation.md` to check off
  §3's now-real automated coverage while leaving §1/§2 explicitly unverified rather than silently
  passing; reopened issue #186 (closed prematurely on staging, before review) and set its board
  status to In Review; recorded the ungated-direct-push pattern in `specs/sdd-workflow.md`'s Orient
  section so the next session checks `gh pr list` against the commit range, not just divergence
  counts.

### Fixed
- **P6.7 Validate pass — self-lockout race, missing test coverage, and branch-wide gate breakage**:
  - `lib/repositories/roles.ts`: closed a TOCTOU race in the last-admin self-lockout guard — the
    admin count and the demoting write now run inside the same `$transaction` at `Serializable`
    isolation, so two concurrent self-demotions can no longer both pass the check and leave a
    vendor with zero admins.
  - Added `tests/roles.test.ts` (12 tests) covering the role-transition matrix `validation.md` §3
    asked for, plus the self-lockout guard.
  - Corrected `validation.md`'s "403 Forbidden" wording to match how a Next.js Server Action
    actually reports a refusal (`{success:false, error}` on a normal response, not a route
    handler's HTTP status).
  - Removed the leftover diagnostic try/catch wrapper in `checkout/page.tsx` and
    `categories/page.tsx` (23 lint errors) now that the connection-exhaustion bug it was added to
    diagnose is fixed elsewhere; deleted a stray UTF-16-encoded scratch file (`test-cart.ts`) that
    broke `lint`/`format:check` outright; fixed a stale `tests/payments.test.ts` assertion left
    over from the checkout-cancel-routing fix; reformatted the remaining root-level scratch
    scripts flagged by `format:check`.

### Added
- **Promo Slider & UI Animations**: Added a new `PromoSlider` component to the homepage to showcase the latest offers. Enhanced the overall visual impact with subtle animations (hover translations, shadows, and scaling) across the `ProductCard`, `DepartmentScroller`, and homepage trust sections.
- **Validation Guidelines**: Added a manual regression register tracking test cases for critical system logic including the hybrid Prisma driver architecture and cart persistence, preventing regressions. (Originally added as `specs/Validation.md`; moved to `docs/regression-tests.md` with front-matter during P6.7's closeout.)
- **P6.7 — Staff Team & Role Management**:
  - Built a new `/staff/team` interface for managing staff members within a vendor organization.
  - Added a backend integration allowing STORE_ADMIN users to assign `STAFF` and `STORE_ADMIN` roles to existing users.
  - Created `VendorRoleAuditLog` to persistently track all role elevation actions with attribution (`grantedBy`).
  - Implemented `lib/repositories/roles.ts` to enforce RBAC and safe role updates.

### Fixed
- **Checkout Form Persistence**: Contact details on the checkout form now persist using local storage to survive the navigation flow when returning from payment.

### Fixed
- **Cloudflare Staging React Error #441 / Intermittent 500s (Connection Exhaustion / HTTP Transaction Error)**:
  - Deployed a hybrid Prisma driver strategy in `lib/db.ts` to solve both WebSocket connection exhaustion on Cloudflare isolates AND the "Transactions are not supported in HTTP mode" error.
  - `getPrisma()` now uses the fetch-based `PrismaNeonHttp` adapter for 99% of read operations, bypassing Cloudflare's WebSocket limit.
  - `getPrismaWs()` uses the WebSocket-based `PrismaNeon` adapter strictly for operations requiring `$transaction` (e.g. checkout, add to cart). This ensures we only open a WebSocket exactly when an interactive transaction is required, keeping the concurrent socket count well below Cloudflare's strict 50-per-isolate limit.
- **Cloudflare Staging React Error #441 (Tag Cache)**:
  - Fixed `addToCart` Server Action crashing during OpenNext revalidation phase.
  - Replaced `revalidateTag("cart")` with `revalidatePath("/", "layout")` in `features/cart/shared.ts` to bypass OpenNext tag cache missing binding issues on Cloudflare Workers.

### Fixed
- **Storefront & Admin Accessibility / Contrast Audit**:
  - Restored WCAG 4.5:1 text color contrast on product unit labels (`text-black/60`), original prices (`text-black/60`), and the 'Filters' side navigation title (`text-primary`).
  - Darkened dashboard notification text and card descriptions in the staff portal (`app/(admin)/staff/page.tsx`) from `/60` and `/70` to `/80` opacity.
  - Increased footer contrast on all storefront pages by removing `/70` opacity on the footer element.
  - Swapped the 'Apply' button background on the filtering form from `#4CAF50` (which failed contrast ratios against white text) to `#2E7D32`.
  - Added a visually hidden `<h2>Products</h2>` inside the product grid to establish a semantic heading sequence for the category pages (`H1` -> `H2` -> `H3`), preventing skipped heading levels.
  - Added explicit `aria-label`s to the quantity increment/decrement buttons in `AddToCartButton.tsx`.
  - Wrapped main action controls and navigational links in the `<Header>` component inside a `<nav aria-label="Main Navigation">` landmark.
- **Navigation RSC 404 Pre-fetch Error**: The 'Help Guide' link in the top navigation bar was pre-fetching `/help` in the background, which does not exist, triggering a fatal `404 (Not Found)` RSC error that halted client-side navigation. Re-pointed the link to `#` until the help page is implemented.
- **Next.js 15 Client Transition 500 Errors (#184)**: Resolved `ERROR 2745569299` hard crashes in the Admin/Staff portal when toggling tiers or navigating client-side. Next.js 15 enforces strict rules that were previously warnings:
  - Missing `<Suspense>` bounds around `useSearchParams()` now throw fatal server errors on RSC fetches. Wrapped `InventoryTable` at `/staff/inventory` in `<Suspense>`.
  - `params` and `searchParams` are now asynchronous Promises. Components returning early (e.g. `requireVendorRole` failing and returning `<PanelRefusal>`) without awaiting these promises triggered unhandled serialization errors. Systematically moved `await params` and `await searchParams` to the top of all `app/(admin)/staff/...` pages.
  - Implemented systematic null-safety across `lib/repositories/products.ts` resolving intermittent 500 errors.
- **Cloudflare Worker CPU Execution Limit**: Set `[limits] cpu_ms = 50` in `wrangler.toml` to prevent Error 1102 ("Worker exceeded resource limits") during Next.js RSC cold starts on category pages.
- **Transactional Email Strategy (GAP-005)**: Flagged migration to native Cloudflare Email Sending (outbound) and Email Routing (inbound) under Workers Paid ($5/mo) for Phase 8, replacing Resend and expanding CPU execution headroom.

### Added
- **P6.6c — Staff/Admin Operations Views Completion**:
  - Refactored `PanelNav` to include all missing tabs (Reports, Inventory, Categories, Discounts, etc.) and enabled horizontal scrolling for mobile devices.
  - Injected missing dashboard portal cards for "Live Inventory", "Runbook", and "Reports" (Admin only) on the main Operations dashboard.
  - Built a zero-trust, static Operations Runbook (`/staff/runbook`) based on the UI-ref spec.
  - Built an Admin-only financial Reports dashboard (`/staff/reports`) computing live metrics (Total Revenue, Total Orders, Average Basket Value) via a new Prisma aggregate query in `OrderRepository`.
- **P6 Missing Gap (Issue #168)**: Shipped a dedicated "Live Inventory & Availability" view tailored for shop-floor staff. This includes dynamic tier toggling between Staff and Admin views, tabbed navigation, client-side filtering, and optimistic mutations for quick stock adjustments and availability toggles. Resolves a previously deferred P6 requirement and aligns perfectly with the AI Studio mockup.
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





