# #955, #996, #994 — Crawlability (build notes)

Written at the end of Build, before the Clear. Two commits on
`feature/955-996-994-crawlability`: `1c40673` (the spec) and `1f6f055` (the implementation).
No schema change and no migration.

Local results at Build: `npm run lint`, `npm run typecheck` and `npm run format:check` clean;
`npx vitest run` on its own **213 files / 2785 tests passing, 1 pre-existing failure** (see
Known-shaky areas); `npm run build` compiled successfully.

## What changed and why

### The card anchor (`#955`)

`components/product/ProductCard.tsx` — the title is a `<Link href={`/products/${product.slug}`}>`
whose `onClick` calls `e.preventDefault()` and then `openQuickView(product.slug, product)`. The
shape matters more than it looks: the drawer is still what a left-click does, so nothing a shopper
sees changed, while every path that does **not** run React's handler — a crawler, a visitor with
JavaScript off, a middle-click, a ⌘/Ctrl-click — follows the real `href`. Between `#830` and this
commit a listing page contained **zero** `href="/products/…"`, so the product route existed and
nothing on the site pointed at it.

Title-only: no `after:absolute after:inset-0`. The stretched variant was considered at `/propose`
and rejected by the owner, because it re-enables card-wide hit-testing that `#830` removed and that
`#964`/`#979` never measured in that shape. `tests/product-card-anchor.test.tsx` asserts the
absence of those classes, so a later slice that wants the stretched card has to change a stated
expectation rather than drift into it.

**Three comments in that file were lying and are corrected.** The file header described the title as
"the only `<Link>`" covering the whole card via `after:inset-0` — `#351`/`#656`'s design, which
`#830` deleted without touching the prose. Twelve lines above the markup, a second comment said
"no navigation to separate product detail page". And the price/cart row's comment explained
`relative z-10` as lifting it "above the link's `after:inset-0` overlay", an overlay that no longer
existed. The header now records the whole sequence (`#351`/`#656` → `#830` → `#955`) precisely
because this comment has been wrong before, and keeps the one claim that was always true and still
is: `AddToCartButton`/`CartQuantityStepper` render real `<button>` elements, HTML forbids
interactive content inside an `<a>`, so they must stay siblings of the anchor.

### The sitemap (`#955`)

`app/sitemap.ts` was rewritten. It returned one URL, `/`, under a comment promising it would grow
"as real routes … land in P1+"; it never did, through every catalogue slice, while `#830`'s plan
asserted the product route stayed "accessible for deep links, SEO, direct sharing, and sitemap
crawling".

It now emits six static paths (`/`, `/categories`, `/bundles`, `/help`, `/privacy`, `/terms`) plus
every active category and every active product for the vendor the request host resolves to, with
every URL built on **the requesting host**. The old `?? "aheedfoodcentre.nocaped.com"` fallback is
gone: a request with no `Host` header would have published one vendor's URLs in any vendor's
sitemap.

`listActiveProductSlugs` (new, `lib/repositories/products.ts`) is slug-only, unpaginated, and
skips the `listActiveTiersForProducts` follow-up query every other listing pays for because it
renders a card. Categories needed nothing new — `listCategoryTreeForStorefront` (`#681`) already
returns every active category taking `(prisma, vendorId)`.

**No `lastModified` anywhere, including on `/`.** `Product` has `createdAt` and no `updatedAt`, and
`Category` has neither, so there is no truthful last-modified date; `createdAt` would assert a false
one after any edit. The previous `lastModified: new Date()` on `/` claimed the homepage changed at
the instant of each fetch, which is the same lie somewhere less visible.

### robots (`#955`)

`app/robots.ts` no longer compares the request host to a hardcoded `PRODUCTION_HOST`. That
mechanism made "is this production?" and "is this the first vendor?" one question, so production
served `Disallow: /` at `https://srimart.nocaped.com/robots.txt` — every vendor but one de-indexed,
against ADR-004. `isIndexable()` now answers the environment question from `SEO_INDEXABLE` and the
request's own host answers the other. The indexable response also gained `Disallow` entries for
`/account`, `/cart`, `/checkout`, `/orders/lookup` and `/dev`; `/` was previously allowed wholesale.

`SEO_INDEXABLE` is declared **only** under `[env.production.vars]` in `wrangler.toml`. That
asymmetry is the feature: staging, preview and local stay non-indexable by being unconfigured
rather than by naming a host, so this change cannot accidentally open an environment that was
closed. It is a committed var and not a secret, which also means `wrangler deploy` carries it —
there is no second store to populate.

`seoSchema`/`getSeoEnv()`/`isIndexable()` live in `lib/config.ts` beside `emailSchema`,
`paymentSchema`, `aiSchema` and `referenceSchema`, deliberately **outside** `getEnv()`'s main
schema. That schema requires `DATABASE_URL` and `BETTER_AUTH_SECRET`; `/robots.txt` touches
neither, and joining it would have meant an unrelated missing secret turning a crawler's request
into an uncaught `ZodError`. `tests/config-seo.test.ts`'s first case fails if someone later moves
the key into the main schema for tidiness.

### Per-page metadata (`#996`)

New `lib/page-metadata.ts` holds `buildProductMetadata`, `buildCategoryMetadata` and
`truncateForDescription`, all pure and taking the host, the record and the vendor name explicitly,
so every rule is testable without a request context or a database. Both detail routes gained a
`generateMetadata` that resolves its record and `getCurrentVendorProfile()`, then calls the
builder.

The canonical URL is **absolute**, and that is a hard constraint rather than taste: no
`metadataBase` is configured anywhere in this app, and in this version of Next a relative value in
a URL-based metadata field without `metadataBase` is a **build error**. `node_modules/next/dist/
docs/01-app/03-api-reference/04-functions/generate-metadata.md` is the source.

`Category` has no description column, so a category's description is composed from its own name and
the vendor's. Product descriptions come from `Product.description` (non-null), collapsed and
truncated at a word boundary to 160 characters with the ellipsis inside the budget.

### The Gate 2 hook (`#994`)

`hooks/pre-commit` gained `GENERATED_PATHS`, filtered out of the `SOURCE_DIRS` test. It is a list
of exact paths, not a pattern like "any `.ts` under `app/`", so a commit staging a hand-authored
file alongside a generated one is still judged on that file.

**This was proven with real runs, in a throwaway git worktree checked out at `origin/staging`** —
the only place the `#994` condition actually exists, because that is where
`git diff --diff-filter=A <merge-base>...HEAD -- 'specs/*/requirements.md'` returns **0** (verified
in the probe). Results: the **old** hook exits 1 with `Gate 2 failed` on the regenerated artefact
staged alone, reproducing the bug; the new hook exits 0 on the same state; and the new hook still
exits 1 when `lib/__gate2-probe.ts` is staged alongside it. The worktree was removed afterwards.

## Decisions taken during the build

- **`app/sitemap.ts` reads through the service facades, not `getPrisma()`.** My first version called
  `getPrisma()` directly and `npm run lint` rejected it: a `no-restricted-imports` rule forbids
  `@/lib/db` in the app layer because a repository is what enforces `vendorId` scoping (ADR-004
  slice 2). It now calls `getProductRepository().listActiveSlugs()` and
  `getCategoryRepository().listTree()`. Better than what I wrote first — `listTree()` is memoised
  per request, so it costs one query shared with any other reader on the same request. This added
  `listActiveSlugs()` to the `ProductRepository` interface and the `lib/products-service.ts`
  factory, which the spec did not anticipate.
- **`getCurrentVendorIdOrNull()` is still called in the route, even though the facades resolve the
  vendor themselves.** The facades use `getCurrentVendorId()`, which **throws** on an unresolvable
  host. A sitemap must degrade to an empty document there, not 500, so the route decides whether to
  answer at all before touching a facade.
- **Both `generateMetadata` implementations return `{}` on any failure rather than using the
  sanctioned `profile?.name ?? "Aheed Food Centre"` fallback** that
  `app/(storefront)/categories/page.tsx` uses and `docs/developer-portal/app-conventions.md`
  explicitly permits in page metadata. `{}` satisfies both R30 (degrade to the route's inherited
  metadata) and R31 (no vendor literal) at once, and a host that resolves to no vendor is
  redirected to `/coming-soon`, so the fallback would never be read by a shopper. Naming one vendor
  on another's host is the defect this slice removes elsewhere.
- **`tests/product-card-stretched-link.test.tsx` was rewritten and renamed, not left beside a new
  file.** Its first case was literally named *"renders no link navigating to a separate product
  detail page"* and passed because of the `#830` regression. Two files disagreeing about the card's
  contract is worse than either one being wrong, so it is now
  `tests/product-card-anchor.test.tsx` with that expectation inverted and the `#351`/`#656` nesting
  cases kept verbatim — they matter **more** now, because there is an `<a>` in the card again.
- **The vendor-neutral guard gained the two SEO files explicitly, and a scoped assertion, rather
  than a widened glob or a new denylist entry.** `tests/vendor-neutral-copy.test.ts` walks
  `app/**/*.tsx`; `app/robots.ts` is `.ts`, which is exactly how it carried a hardcoded vendor host
  for months with that guard green. Widening to all `.ts` under `app/` fails immediately on the
  generated `app/(admin)/staff/runbook/docs.ts`, which quotes spec prose by design. Adding a bare
  `nocaped.com` to `FORBIDDEN` fails on `components/layout/StorefrontChrome.tsx` — a real defect,
  now `#997`. So the check is a separate case scoped to the two files this slice fixed.
- **`hooks/pre-commit`'s header comment was corrected as part of `#994`.** It read "local fast
  feedback; gates.yml is the real enforcement". That is false: **no workflow in
  `.github/workflows/` references `requirements.md` at all** (verified 2026-10-05). This hook is
  the only Gate 2 enforcement, which is what makes R33 load-bearing rather than belt-and-braces.
  Recorded in `docs/developer-portal/sdd/operator-runbook.md` as durable truth, and the CI gap
  itself is filed rather than fixed here (see Deviations).
- **`scripts/verify-crawlability.ts` counts expected rows from the database, not from the document
  it is checking**, and reports shared slugs between vendors instead of asserting they are disjoint
  — two vendors may legitimately carry the same slug, and the script cannot know the seed's intent.
  Per-host correctness is asserted against row counts instead.

## Deviations from the spec

- **R17 is satisfied by one new repository export, not two.** `requirements.md` says the slugs come
  from "exported functions in `lib/repositories/products.ts` **and**
  `lib/repositories/categories.ts`". Products got `listActiveProductSlugs`; categories reuse the
  existing `listCategoryTreeForStorefront`, which already has the required signature and semantics.
  Build step 2 is "reuse before create", and a second categories export would have duplicated it.
  The requirement's substance — explicit `(prisma, vendorId)`, no request context — holds for both,
  and `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts` pass.
- **R17's path now runs through the service facades, which the spec did not describe.** Forced by
  the ESLint layering rule; see Decisions. The repositories are still where the queries live.
- **`tests/product-card-anchor.test.tsx` is `.tsx`, not `.ts`.** `validation.md`'s R1, R2, R4 and
  R35 rows name `tests/product-card-anchor.test.ts`. It renders JSX, so it must be `.tsx` —
  `validation.md` has been corrected on this branch to match, since a fresh context running the row
  verbatim would otherwise get "no test files found".
- **The spec named four new test files; there are five.** `tests/config-seo.test.ts` was added for
  R19, which `validation.md` already referenced by that name but `requirements.md` R35 did not list
  among its four.

Nothing was built that `requirements.md` does not ask for. Two gaps noticed and **not** built are
filed as issues rather than absorbed: `#997` and the CI Gate 2 gap (see below).

## Known-shaky areas

- **Every live row is unproven.** This stage ran no `npm run preview` and no
  `scripts/verify-crawlability.ts`. R3, R5, R8–R13, R16, R20–R22, R25–R29 and R36 are all
  `/validate`'s work from a fresh context. What Build does know: `npm run build` lists
  `/robots.txt` and `/sitemap.xml` as **`ƒ (Dynamic) server-rendered on demand`**, which is R15's
  load-bearing property — a sitemap Next evaluated once at build time would bake in one vendor's
  host, and neither `typecheck` nor a unit test can see that.
- **`SEO_INDEXABLE` has never been set anywhere.** It is in `wrangler.toml` for production only and
  in no local env file, so **`/robots.txt` currently serves `Disallow: /` on every environment
  including local preview** — correct by design, but it means R20 fails until the validator puts
  `SEO_INDEXABLE="true"` in `.dev.vars` and restarts preview. Config precedence is per key and
  `.dev.vars` wins under preview, so simulating the unset state needs it removed from **both**
  `.dev.vars` and `.env`. `validation.md`'s preamble says this; it is the most likely cause of a
  confusing R20/R21 result.
- **Production's binding is not proven by anything here.** `wrangler deploy` rebuilds a Worker's
  `vars` from `wrangler.toml`, so the only proof is a real `deploy-production` run followed by
  reading `https://srimart.nocaped.com/robots.txt` and seeing `Allow: /`. That host returning
  `Allow` is the single clearest signal the slice worked; it is also the thing most worth checking
  after the promotion, not before.
- **`tests/slot-capacity.test.ts` fails in a full `npx vitest run` and it is not this slice.** It
  timed out at 5s under full-suite contention against live Neon; it passes alone in 2.9s. It is the
  `#797` live-DB-fixture class and touches none of this slice's files. A validator seeing 1 failure
  in 213 files should check it is this one before treating it as a defect. Noted on `#797`.
- **The second vendor is where the robots fix actually shows.** `#955`'s defect was invisible on the
  first vendor's host by construction, which is how it reached production. A validation run against
  `localhost:8787` alone proves nothing about it; `srimart.localhost:8787` is required, and
  `scripts/verify-crawlability.ts` checks both by default.
- **`truncateForDescription`'s word-boundary behaviour is the fiddliest logic added.** One of my own
  test expectations was wrong on the first run (I miscalculated the ellipsis budget; the code was
  right). It has six unit cases including a single word longer than the budget, but a real product
  description with unusual whitespace is the thing I would feed it first.
- **Not exercised: a category with more than 12 active products.** R3's expected link count is
  `min(12, active products)` because the category page's `PAGE_SIZE` is 12. If every seeded
  category holds fewer than 12, the `min` branch is never taken and a pagination-related mistake in
  that row would pass unnoticed.
