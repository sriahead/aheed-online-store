---
id: p955-996-994-crawlability-plan
title: "#955, #996, #994 — Crawlability (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-05
visibility: internal
summary: Product pages become reachable from listings again, listed in a per-vendor sitemap, indexable on every vendor host rather than only Aheed's, and carry their own title, description and canonical. The Gate 2 hook stops blocking a docs-only commit that regenerates the KMS artefact. No schema change.
tags: [storefront, seo, sitemap, robots, metadata, multi-tenancy, sdd, p10]
related: [p830-quick-view-product-drawer, p979-655-storefront-finish-plan, discovery-log, app-conventions]
---

# #955, #996, #994 — Crawlability (plan)

Seventh and last slice of the mobile programme (`docs/research/discovery-log.md` 1.7.0). Gate 1 was
approved by the owner on 2026-10-04 for `#955`, and on 2026-10-05 for `#996` and `#994` folded in
alongside it. `requirements.md` holds the checkable criteria; this file holds why they say what they
say.

**Goal:** a search engine can discover, crawl and tell apart every active product and category page
on **any** vendor's storefront. Today it can reach the homepage and the category pages and nothing
below them, and only on Aheed's host at all. Three separate defects produce that one outcome, and
fixing any two of them leaves the goal unmet — which is why they ship together.

## Why these three defects are one slice

Each is individually small; the value only appears when all three are gone.

1. **Nothing links to a product page.** `#830` replaced the product card's stretched `<Link>` with a
   `<button>` that opens Quick View (`components/product/ProductCard.tsx:222`, and `#830`'s own
   plan records the removal). A listing page contains zero `href="/products/…"`, so a crawler that
   reaches `/categories/<slug>` finds no way down, and neither does a visitor without JavaScript.
2. **Nothing lists them either.** `app/sitemap.ts` returns exactly one URL, `/`, under a comment
   saying it "grows as real routes … land in P1+". It never did. `#830`'s plan asserted the product
   route stayed "accessible for deep links, SEO, direct sharing, and sitemap crawling"; the sitemap
   half of that was never true.
3. **Every vendor but Aheed is de-indexed.** `app/robots.ts:4` hardcodes
   `PRODUCTION_HOST = "aheedfoodcentre.nocaped.com"` and serves `Disallow: /` to anything else, so
   production's `https://srimart.nocaped.com/robots.txt` forbids crawling outright. That breaks
   ADR-004's rule that nothing vendor-specific lives in code.

And one more, found at `/propose` by reading the routes rather than the issue text (`#996`): neither
`/products/[slug]` nor `/categories/[slug]` has a `generateMetadata`, so both fall through to the
vendor-level metadata in `app/layout.tsx:15`. **Every product page on a vendor shares one `<title>`
and one `<meta name="description">`** — roughly 80 of them on Aheed in production. Pages that are
reachable and listed but indistinguishable still compete with each other for every query, so this is
the third leg of the same goal rather than a separate improvement.

`#994` rides along for sequencing, not because it is related: it will block this slice's own Document
pass. See its own section below.

## Scope (this slice)

### The card anchor — `#955`, owner ruling

The title in `components/product/ProductCard.tsx` becomes a real
`<a href="/products/<slug>">` whose `onClick` calls `preventDefault()` and then
`openQuickView(product.slug, product)`. A normal click therefore still opens Quick View exactly as
it does today, while a crawler, a visitor with JavaScript off, a middle-click and a ⌘/Ctrl-click all
reach the product page. This deliberately reverses part of `#830`'s markup, on the owner's ruling of
2026-10-04.

**The anchor wraps the title text only** (owner decision, 2026-10-05). `#830` removed the `<Link>`
but left the stretched-link scaffolding in place — the `relative z-10` price-and-cart sibling and the
comment explaining it are still at `ProductCard.tsx:272` — so restoring `after:absolute after:inset-0`
and making the whole card the link target would have been nearly free. It was rejected because it
re-enables card-wide hit-testing that `#830` removed and that slices 4 and 5 never measured in that
shape. Nothing in this slice adds `after:inset-0`.

Two comments in that file currently contradict each other and both are wrong after this change: the
file header (lines 29–43) still describes the title as "the only `<Link>`" covering the whole card
via `after:absolute after:inset-0`, while the inline comment above the title says "no navigation to
separate product detail page". The header's *stretched-link* claim becomes false (the anchor is
title-only) and the inline comment's claim becomes false (there is navigation again). Both are
corrected, and the header keeps its real, still-true lesson: `AddToCartButton` and
`CartQuantityStepper` render `<button>` elements and HTML forbids interactive content inside an
`<a>`, which is why they must stay siblings of the anchor rather than descendants.

The two existing Quick View affordances are untouched: the desktop hover overlay button and `#961`'s
44px mobile corner button, which sits at `z-20` and keeps its tap target.

### The sitemap — `#955`

`app/sitemap.ts` resolves the request's vendor through the existing
`getCurrentVendorIdOrNull()` (`lib/tenant.ts:30`), which is already memoised per request with React
`cache()`, and emits, all on the **requesting** host:

- the static paths `/`, `/categories`, `/bundles`, `/help`, `/privacy`, `/terms`;
- `/categories/<slug>` for every active category of that vendor;
- `/products/<slug>` for every active product of that vendor.

Two new repository exports supply the slugs, one in `lib/repositories/products.ts` and one in
`lib/repositories/categories.ts`, each taking its Prisma client and `vendorId` as explicit
parameters and reading no request context — the rule `tests/repository-purity.test.ts` and
`tests/repository-client-injection.test.ts` enforce. `listProducts` only paginates, so no all-slugs
query exists today.

**`app/sitemap.ts`'s fallback host literal goes too.** Line 6 currently reads
`?? "aheedfoodcentre.nocaped.com"`, so a request arriving without a `Host` header would publish
Aheed's URLs in any vendor's sitemap. A host that resolves to no vendor now yields a well-formed
sitemap with **zero** URLs, which is the honest answer: the storefront layout redirects such hosts
to `/coming-soon`, so there is nothing there to crawl.

**`lastModified` is omitted everywhere, deliberately.** `Product` carries `createdAt` and **no
`updatedAt`** (`prisma/schema.prisma:729`), and `Category` carries neither, so there is no truthful
source for a product's or a category's last-modified date; `createdAt` would assert a false date
after every edit. The field is optional in the sitemap protocol, and an omitted value is better than
a wrong one that a crawler may learn to distrust. The existing `lastModified: new Date()` on `/` goes
with them — it claims the homepage changed at the moment of each fetch, which is the same lie in a
less obvious place.

Both this route and `robots.ts` read request headers, which Next treats as a request-time API; that
is what keeps these routes dynamic rather than cached at build time with one host baked in. A
requirement pins this explicitly, because removing the header read would silently break
multi-tenancy while every local check stayed green.

### robots — `#955`

The `PRODUCTION_HOST` literal goes. Indexability becomes one committed `wrangler.toml` variable,
`SEO_INDEXABLE`, declared under `[env.production.vars]` and **nowhere else**, read through
`lib/config` and never from `process.env` directly. When it is not exactly `"true"` the route serves
today's `Disallow: /`, so staging, preview and local keep their current behaviour by being
unconfigured rather than by naming a host. When it is `"true"`, **any** vendor host gets `Allow: /`
and a `Sitemap:` line pointing at that same host.

It gets its own small zod schema and getter next to the existing `emailSchema`, `paymentSchema`,
`aiSchema` and `referenceSchema` rather than joining `getEnv()`'s main schema. That main schema
requires `DATABASE_URL` and `BETTER_AUTH_SECRET`; joining it would make `/robots.txt` — a route that
touches no database — throw whenever an unrelated secret was missing. The file's own comment at
`lib/config.ts:75` records that exact reasoning for email.

Declaring the variable in `wrangler.toml` rather than adding it through the Cloudflare dashboard is
not a style preference: `wrangler deploy` rebuilds a Worker's `vars` wholesale from that file, which
is how `UK_LOCATION_REF_POSTCODE_AREAS` was silently wiped from the deployed staging Worker once
(`wrangler.toml:60` carries the note).

The indexable response also gains `Disallow:` entries for `/account`, `/cart`, `/checkout`,
`/orders/lookup` and `/dev`. Production currently allows `/` wholesale.

**A narrow guard, not a wide one.** `tests/vendor-neutral-copy.test.ts` scans `app/**/*.tsx` and
`components/**/*.tsx`; `app/robots.ts` and `app/sitemap.ts` are `.ts`, which is precisely why a
hardcoded vendor hostname could sit in `app/robots.ts` for months with that guard green. The two
files are added to that test's explicit `FILES` list, the way `lib/referrals.ts` already is, and the
new test asserts that neither file contains a `*.nocaped.com` literal. The glob is **not** widened to
`app/**/*.ts`: the generated `app/(admin)/staff/runbook/docs.ts` is deliberately outside it because
it quotes spec prose, including this slice's own, and widening would fail immediately.

### Per-page metadata — `#996`

`generateMetadata` on `/products/[slug]` and `/categories/[slug]`, each returning a title built from
the product's or category's own name together with the vendor's name from
`getCurrentVendorProfile()`, a description, and an **absolute** canonical URL on the requesting host.

Absolute is not a preference either: no `metadataBase` is configured anywhere, and in this version of
Next a relative value in a URL-based metadata field without `metadataBase` is a **build error**, not
a silent fallback. The product description comes from `Product.description`, which is a non-null
column; `Category` has no description column at all (`prisma/schema.prisma:585`), so a category's
description is composed from its name and the vendor's, naming no product category — the
vendor-neutral copy rule in `docs/developer-portal/app-conventions.md` forbids writing a grocery
example or a vendor's name into either builder.

Both builders degrade the way `app/layout.tsx` already does: a failure resolving the vendor or the
record leaves the inherited metadata in place rather than throwing, so a database hiccup cannot take
a product page from 200 to 500.

### The Gate 2 hook — `#994`

`hooks/pre-commit` blocks a commit touching `SOURCE_DIRS` unless a `specs/*/requirements.md` is new
on the branch relative to `origin/main`. A Document-stage branch that records a **promotion** has no
new spec to show — the promotion is what put the spec on `main` — and it must commit the regenerated
`app/(admin)/staff/runbook/docs.ts`, which matches `^(app|…)/`, because CI's
`npm run kms:check-generated` fails the PR when that artefact is stale. Commit it and the hook
refuses; leave it out and CI goes red. That dead end cost a one-off owner-authorised `--no-verify`
for `f7b118b` earlier today.

The fix exempts the generated artefacts from the hook's source-path test, so a commit whose only
`SOURCE_DIRS` paths are machine-written files is not treated as hand-authored source. A commit
staging a genuine source file with no new spec must still be refused, and a requirement pins that
direction too, so the exemption cannot quietly become a hole in Gate 2. `hooks/` is itself outside
`SOURCE_DIRS`, so changing the hook does not trip the hook.

This does **not** affect this slice's Build: slice 7 creates a new `requirements.md`, which is what
the hook looks for. It affects the Document pass that records slice 7's promotion.

## Deliberately excluded

- **The stretched card-wide link.** Decided against above; the scaffolding stays unused.
- **A "View full details" link inside the Quick View drawer.** `#830` removed it on the owner's
  instruction and this slice does not reinstate it. The card anchor is the route back to the product
  page.
- **`Product.updatedAt`.** A schema change, and the honest `lastModified` omission above does not
  need it. Raise it as its own issue if trustworthy `lastmod` values are ever wanted.
- **Structured data / JSON-LD** (`Product`, `BreadcrumbList`, `Offer`). A separate body of work with
  its own correctness risk — a price or availability claim in markup is a claim, and `#239` is this
  codebase's own precedent for asserting something it could not back.
- **Open Graph and Twitter card images per product.** Needs an OG image route and a decision about
  the CDN; unrelated to being crawlable.
- **`/feedback`, `/shop-your-list`, `/search` and the auth pages in the sitemap.** The static list
  stays minimal and deterministic for a first honest sitemap. `/shop-your-list` is a defensible
  future addition; `/search` and the auth pages are not.
- **Pagination URLs** (`/categories/<slug>?page=2`). A crawler reaching every product directly from
  the sitemap does not need them, and parameterised URLs invite duplicate-content handling this
  slice has no evidence about.
- **Anything gated on `#113` or `#104`.** The platform has never traded; none of this is validated
  against real search-engine behaviour, only against what the routes emit.

## Open items carried forward

- **`components/layout/StorefrontChrome.tsx:33` holds the same class of defect and is NOT fixed
  here.** Its `?? "staging.aheedfoodcentre.nocaped.com"` fallback feeds `baseUrl` into
  `getRewardsDataForUser`, so a request arriving without a `Host` header would mint **referral share
  links pointing at Aheed's staging host for every vendor**. It is a `.tsx` file already inside the
  copy guard's glob, and the guard still misses it because its denylist carries no host literal.
  Found at this slice's `/propose`; out of scope because it is referral behaviour, not crawlability,
  and it sits in the area `#991` and `#987` already concern. **Filed as `#997`** — it is the
  reason the bare host literal is not simply added to `FORBIDDEN`, which would fail the guard on
  that file.
- **No live search-engine verification is possible.** Validation proves what `/robots.txt`,
  `/sitemap.xml` and each page's `<head>` contain. Whether Google then indexes them is post-deploy
  evidence measured in weeks, and `#113` means the storefront has no real traffic to learn from yet.
- **`#991` remains unverified in production** and is untouched by this slice.
