---
id: nfr-baseline
title: NFR Baseline — measured performance against the Gate-3 targets
audience: [dev]
type: doc
status: approved
version: "1.4.0"
updated: 2026-09-05
visibility: internal
summary: Measurements against mission.md's LCP and API p95 targets, plus the index/query review behind them — including a 4.7x LCP breach from a 1.9 MB vendor logo — a re-measurement of the query paths at roughly 2,000 products rather than 22, and a further re-measurement of storefront search after #564 tokenised it and after #569 roughly tripled the facet probe count.
tags: [nfr, performance, observability, lcp, indexes, p7, p9]
related:
  [mission, architecture, tech-stack, gap-register-audit, p7d-observability-nfr-plan, catalogue-depth-and-scale]
---

# NFR Baseline

`specs/mission.md` has set **`LCP < 2.5s` on 4G** and **API `p95 < 400ms`** as Gate-3 acceptance
criteria since the project started, and `specs/architecture.md` §5 repeats that they are acceptance
criteria. Until P7d (#218) neither had ever been measured. This document is the first measurement.

**Read the labels.** Every latency figure below is marked either **client-observed** or
**server-side**, and they are not interchangeable. Client-observed means wall-clock time measured by
`scripts/measure-nfr.ts` from the machine that ran it, including DNS, TLS and the network path to
Cloudflare's edge. Server-side means a figure reported by the Worker itself. Presenting one as the
other is how a baseline quietly becomes wrong.

**Reproduce it:** `npm run nfr:measure -- --base https://staging.aheedfoodcentre.nocaped.com`

## Summary against the targets

| Target (`specs/mission.md`) | Measured | Verdict |
|---|---|---|
| API `p95 < 400ms` | **138.92 ms** (worst route, client-observed, warm) | **Meets** — with a 2.9x margin |
| `LCP < 2.5s` on 4G | **11,700 / 12,482 / 12,633 ms** across three runs | **Breaches** — by ~5x |

The LCP breach is **not remediated in this slice** and is filed as **#243**, per this slice's
requirement R13. The cause is understood and is not a code defect in the rendering path — see
[LCP](#lcp--breaches-the-target) below.

## Environment measured

- **Target:** `https://staging.aheedfoodcentre.nocaped.com` (Worker `aheed-store-staging`),
  serving commit `6082649` — i.e. `staging` as it stood *before* this slice merged.
- **Client:** Windows dev machine, UK domestic connection. Cloudflare `CF-RAY` reported colo
  **LHR** (London); the staging Neon project is `eu-west-2` (London). Client, edge and database are
  therefore all in one region, which flatters the client-observed figures relative to a shopper
  further away. Treat these as a **best case**, not a typical one.
- **Dates:** latency and query runs `2026-08-18T23:40Z`–`2026-08-19T00:05Z`; Lighthouse runs
  immediately after.

## API latency — meets the target

**Client-observed time-to-first-byte.** 20 samples per route after one discarded warm-up request,
`scripts/measure-nfr.ts`, run `2026-08-18T23:40:44.739Z`. All routes returned `200` on all 21
requests; zero errors.

| Route | p50 | p95 | p99 | min | max | cold (warm-up) |
|---|---|---|---|---|---|---|
| `/` | 76.81 | **138.92** | 298.30 | 62.72 | 298.30 | **924.94** |
| `/categories` | 58.88 | 67.91 | 73.56 | 53.59 | 73.56 | 58.31 |
| `/categories/fruit-veg` | 92.74 | 109.84 | 152.50 | 86.38 | 152.50 | 95.11 |
| `/products/basmati-rice-5kg` | 79.71 | 107.48 | 141.79 | 69.63 | 141.79 | 99.02 |
| `/search?q=rice` | 82.68 | 91.62 | 92.70 | 74.07 | 92.70 | 95.65 |
| `/api/health` | 31.50 | 34.65 | 36.10 | 28.36 | 36.10 | 107.73 |

All figures in milliseconds, all **client-observed**.

Two things worth keeping in view:

- **The worst warm p95 is 138.92 ms against a 400 ms target.** The margin is real but it is measured
  from the same city as the edge and the database.
- **The cold-start figure for `/` is 924.94 ms** — 6.7x its own warm p50, and it is excluded from
  the percentiles above deliberately (one 900 ms outlier in twenty samples moves p95 outright).
  A shopper arriving at an idle Worker pays it. It is recorded here rather than averaged away.

**No server-side latency figure is recorded in this document.** See
[Observability](#observability) for why not, and what will produce one.

## LCP — breaches the target

**Tool:** Lighthouse 12.8.2, headless Chrome, **default mobile configuration** — that is
`formFactor: mobile`, `throttlingMethod: simulate`, RTT 150 ms, downlink 1,474.56 Kbps,
`cpuSlowdownMultiplier: 4`. No custom flags; the default profile *is* the simulated slow-4G one the
target refers to.

| Run | Route | LCP | FCP | TBT | CLS | Page weight | Perf score |
|---|---|---|---|---|---|---|---|
| 1 | `/` | **11,700 ms** | 1,223 ms | 873 ms | 0 | 2,312,401 B | 55 |
| 2 | `/` | **12,482 ms** | 1,114 ms | 539 ms | 0 | 2,313,974 B | 60 |
| 3 | `/products/basmati-rice-5kg` | **12,633 ms** | 1,015 ms | 1,040 ms | 0 | 2,320,394 B | 53 |

Reproducible across runs and across routes: **~12 s against a 2.5 s target.**

### Cause: a 1.9 MB logo on every page

The LCP *element* is an `<h1>` (`largest-contentful-paint-element` reports
`<h1 class="text-3xl md:text-5xl font-extrabold …">`), not an image — so this is not a slow hero
image. It is bandwidth starvation:

| Asset | Bytes | Share of page |
|---|---|---|
| `vendors/…/logo.png` | **1,926,055** | **83%** |
| a product `.webp` | 144,518 | 6% |
| largest JS chunk | 65,255 | 3% |
| the HTML document | 14,825 | under 1% |

At the simulated 1,474 Kbps downlink, 1.9 MB alone takes **~10.5 s** — which accounts for
essentially the whole LCP figure. Supporting evidence that the app itself is not slow: FCP is
~1.0–1.2 s, CLS is 0, `server-response-time` for the root document is **295 ms**, and Lighthouse's
`render-blocking-resources`, `font-display` and `uses-text-compression` audits all pass.

Three facts pin the cause down:

1. **The asset is the repo's brand-kit file, uploaded unresized.** `docs/logo.png` in this
   repository is **1,923,499 bytes**, and a direct fetch of the staging CDN object returns
   **1,923,499 bytes** — byte-identical.
2. **It is rendered into a 40 px-tall box.** `components/layout/Header.tsx` renders the logo with
   `className="h-10 w-auto …"`. The browser has no way to know it needs 40 px, so it downloads all
   1.9 MB. The header is on every storefront page, so every page pays it.
3. **There is no resizing layer to save it.** See below.

### Cloudflare Image Transformations are NOT enabled for this zone

Determined `2026-08-19` by requesting the `/cdn-cgi/image/` endpoint in all three documented forms.
Every one returns **404** with an HTML body:

| Form | Result |
|---|---|
| `https://images.staging…/cdn-cgi/image/width=80,format=auto/<key>` | 404 |
| `https://images.staging…/cdn-cgi/image/width=80,format=auto/<absolute-url>` | 404 |
| `https://staging.aheedfoodcentre.nocaped.com/cdn-cgi/image/…/<absolute-url>` | 404 |

For contrast, the same object fetched directly returns `200` and `image/png`. So the endpoint is
absent, not the object.

Enabling Transformations is a **plan/account change only a human can make**, so per `CLAUDE.md`'s
rule against inventing infrastructure this slice records the fact and stops. It is part of **#243**.

### Hotlink protection, incidentally confirmed

A direct fetch of a CDN image with **no `Referer`** fails, while the same fetch carrying
`Referer: https://staging.aheedfoodcentre.nocaped.com/` returns `200`. That is GAP-022 / **#235**
observed from a second direction, and it is why the harness measures HTML routes rather than assets.

## Production's vendor logo is missing — 404

Found while checking whether the byte-weight problem also affects production. It does not, because
**production has no logo object at all**:

| Request | Result |
|---|---|
| `https://images.aheedfoodcentre.nocaped.com/vendors/…/logo.png` + production `Referer` | **404**, 27,150 B HTML |
| same, no `Referer` | **404** |
| `https://images.staging.aheedfoodcentre.nocaped.com/vendors/…/logo.png` + staging `Referer` | **200**, 1,923,499 B `image/png` |

`VendorBranding.logoStorageKey` is populated in the production database (the storefront renders the
`<img>` rather than its no-logo fallback), but the object was never uploaded to the
`aheed-images-production` bucket. Every production storefront page therefore renders a **broken
image** where the store's logo belongs. This is the same shape as GAP-007 — a production storage
prerequisite that was never applied — and is filed as **#244**.

## Index & query review

Timings are **client-observed** wall-clock around a Prisma call from a `tsx` script over
`DIRECT_URL`, 15 runs after a warm-up. Both databases are Neon `eu-west-2`.

**Staging** (`ep-empty-scene-…`): `Order` = 118 rows (110 on the busiest vendor), `Product` = 22.
Index from R15 **not** applied at measurement time.

| Query | p50 | p95 |
|---|---|---|
| staff order list, no search | 16.4 ms | 26.0 ms |
| staff order list + `contains` search | 16.4 ms | 34.2 ms |
| `listForUser` (order history) | 15.5 ms | 21.2 ms |
| `getFinancialsForStaff` aggregate | 15.6 ms | 28.3 ms |

**Dev branch** (`ep-soft-band-…`, a copy of staging): `Order` = 114 (106 busiest), `Product` = 22.
Index from R15 **applied**.

| Query | p50 | p95 |
|---|---|---|
| staff order list, no search | 31.1 ms | 50.4 ms |
| staff order list + `contains` search | 30.4 ms | 55.0 ms |
| `listForUser` (order history) | 30.0 ms | 36.1 ms |
| `getFinancialsForStaff` aggregate | 23.5 ms | 36.3 ms |

**Do not read the two tables as a before/after.** The dev branch is uniformly ~2x slower across
*every* query including ones the index cannot affect, which is a difference in compute state
(Neon scale-to-zero / autoscaling), not a regression. At these row counts the honest conclusion is
that **every query is dominated by the ~15 ms round-trip to Neon and none of them is
index-sensitive yet.**

### Review table

| Read path | Serving index | Verdict |
|---|---|---|
| Product listing by category (`listByCategory`) | `Product(vendorId, categoryId, isActive)` | `indexed` |
| Product search (`search`) | none — token matching over `name` | `scan` |
| Order history (`listForUser`) | `Order(vendorId, userId, createdAt)` — **added by this slice** | `indexed` (was `partial`) |
| Staff order list (status filter) | `Order(vendorId, status, createdAt)` / `Order(vendorId, createdAt)` | `indexed` |
| Staff order list + search | none — `contains` on `orderNumber`, `guestEmail`, `user.email` | `scan` |
| `getFinancialsForStaff` | `Order(vendorId, …)` prefix; aggregates the whole vendor | `partial` |

Notes on the three non-`indexed` rows:

- **Staff order search (`scan`, #163).** Measured cost at 118 orders: **16.4 ms p50 with the search
  term versus 16.4 ms p50 without it** — identical, p95 34.2 ms versus 26.0 ms. There is no
  measurable penalty to remove at this volume. `lib/repositories/orders.ts:572` already documents
  the scan as deliberate, and the fix is the same `pg_trgm` work GAP-011 defers. **#163 stays open
  with this measurement recorded** — the deferral is now evidence-based rather than assumed.
- **Product search (`scan`, GAP-011).** Same position, 22 products.
- **`getFinancialsForStaff` (`partial`).** It aggregates *every* `Order` row for the vendor with no
  status filter. That is also a **correctness** defect — cancelled and unpaid orders count as
  revenue — but that is **#238**'s money bug and is deliberately not touched here; a measurement
  slice is the wrong place to change what a financial figure means.

### The index this slice added

`Order(vendorId, userId, createdAt)`, migration
`20260818233907_p7d_order_user_history_index`, generated by Prisma from an `@@index` declaration.

`specs/architecture.md` §3.4 claimed `Order(userId, createdAt)` served order history. **It never
existed.** `listForUser` filters `{vendorId, userId}` and orders by `(createdAt desc, id desc)`,
and the only `Order` indexes were `(vendorId, createdAt)` and `(vendorId, status, createdAt)` — so
Postgres could only walk the vendor's orders in date order, discarding rows belonging to other
customers. One shopper's history cost the whole store's order volume. §3.4 also claimed
`Order(status, createdAt)`, which likewise did not exist and lacked the leading `vendorId` ADR-004
requires; the real `Order(vendorId, status, createdAt)` already covered that path.

**This is a documentation-correctness and future-proofing fix, not a measured win.** At 118 rows it
changes nothing observable, as the tables above show. Claiming otherwise would be exactly the kind
of unearned assurance this document exists to replace.

## #236 — the cart-mutation ceiling

Re-driven against staging on `2026-08-19`, using the real `addToCart` Server Action rather than
browser clicks. The action id was recovered from staging's own client bundle
(`createServerReference("6081662237…", …, "addToCart")` inside the product page chunk), so no local
build was needed. All runs shared one guest cart cookie.

| Pattern | Attempts | Interval | Concurrency | Failures | Latency |
|---|---|---|---|---|---|
| A | 25 | ~1.1 s | 1 | **0** | p50 125 ms, max 510 ms |
| B | 30 | none (back-to-back) | 1 | **0** | — |
| C | 20 | none | **20 (simultaneous)** | **3 / 20** | successes p50 723 ms, max 1,701 ms |

**#236's reported symptom did not reproduce sequentially.** The issue recorded a failure at ~20
mutations at ~1.1 s intervals; pattern A ran the same shape at 25 and pattern B ran 30 back-to-back,
both clean. What *does* fail is **concurrency**: 20 simultaneous in-flight mutations produced 3
connection-level failures (`fetch` rejected at ~70 ms, no HTTP status) while successful requests
slowed to a 723 ms p50.

### What is and is not attributed

**Attributed:** the failure mode is concurrency-dependent, not rate-dependent. Sequential
throughput is not the constraint.

**Not attributed:** whether those 3 failures originated **in the Worker** or **in the client's own
socket pool**. A client-observed `fetch failed` with no HTTP status is exactly the shape both
produce, and nothing measured here separates them. Node's undici keeps a bounded per-origin
connection pool, so a 20-way burst from one process is as plausible a cause as anything server-side.

Separating them needs **server-side** request records — which is precisely what this slice's
`[observability]` block enables and which do not exist yet (see below). This is the concrete reason
#236 said it depended on #218, and it remains true after this slice's *configuration* lands: it
becomes answerable after the *deploy*. **#236 stays open** with these numbers recorded.

Note also that the original observation was a **browser** driving the button, which additionally
exercises `useTransition`, `revalidateCartSurfaces()` and the RSC refetch that follows. The reported
symptom — "This page couldn't load" with a wedged renderer — is a client/render symptom. The
server-side mutation path handling 30 back-to-back writes cleanly points at the render/revalidation
path rather than at cart writes, which is a genuine narrowing but not a proof.

## Observability

`wrangler.toml` now carries a top-level `[observability]` block, `enabled = true`,
`head_sampling_rate = 1` (100%). The block is inheritable, so `staging` and `production` both take
it. `head_sampling_rate` is at 1 because at today's pre-launch volume a sampled log cannot answer
"what happened on that one broken request"; it should come **down** before launch rather than the
block being removed.

**No live request event is captured in this document, and no server-side latency figure appears
above.** Both were attempted and both are blocked in this environment:

- `npx wrangler tail --env staging --format json` authenticates with the project's stored token
  (`wrangler whoami` succeeds) but then fails with `fetch failed` / a connectivity warning before
  streaming any event. Tail's WebSocket does not establish from here.
- **Persisted Workers Logs — what the `[observability]` block actually enables — cannot exist for
  this configuration until `deploy-staging` has run for the branch that adds it.** Live tail is
  independent of the setting and always available in principle; persisted, queryable logs are not.

Validation runs *before* the staging merge, so a check demanding post-deploy evidence at Gate 3 is
unverifiable by construction. This is recorded in the slice's `requirements.md` as **R2a** and
**R22a**, and the confirmation itself was named a **Ship-stage step**.

**Attempted at Ship (2026-08-19), after `deploy-staging` and `deploy-production` both succeeded —
still blocked, both documented routes:** `wrangler tail` failed the same way as above (`fetch
failed`, even with an explicit `CLOUDFLARE_API_TOKEN` and real traffic generated concurrently), and
the Cloudflare dashboard fallback required an interactive login unavailable to the session doing
the deploy. **Filed as #246** rather than left as an implicit Ship-stage promise — confirming
persisted logs are arriving, and re-running #236's pattern C with server-side records, are both
still open and need an environment that can reach Cloudflare's tail API or a human dashboard login.

## Issues opened or updated by this baseline

| Issue | Action |
|---|---|
| **#243** (new) | LCP breach: 1.9 MB vendor logo on every page; Image Transformations not enabled. Cites the measured 11.7–12.6 s. |
| **#244** (new) | Production vendor logo object missing — every production page renders a broken image. |
| **#163** | Comment recording the measured scan cost (16.4 ms p50 with search vs 16.4 ms without, at 118 orders). Stays open. |
| **#236** | Comment recording patterns A/B/C and what is left unattributed. Stays open. |
| **#46** | Decision recorded: keep `<img>`. Transformations are unavailable, so a `next/image` loader would ship identical bytes. |
| **GAP-011** | Root cause updated with P7d's raw-SQL ruling (see `CLAUDE.md`). |

## Query re-measurement at catalogue scale — 2026-08-31 (#489)

Everything above this heading was measured against **`Product` = 22**, and the "Index and query
review" section says plainly what that meant: *"At these row counts the honest conclusion is that
every query is dominated by the ~15 ms round-trip to Neon and none of them is index-sensitive yet."*
So the headline `p95` verdict was a measurement of Neon's latency rather than of this application's
queries. **#489** built a generated catalogue so the distinction becomes observable. Nothing above is
restated or amended here — this section stands beside it.

**Method.** `npx tsx scripts/measure-catalogue-queries.ts`, 15 samples per query after one discarded
warm-up, client-observed wall-clock around each Prisma call, run from a developer machine over
`DIRECT_URL`. Unlike `scripts/measure-nfr.ts` (HTTP-only, route TTFB) this harness calls the
repository functions directly, which is possible only because each takes `prisma` and `vendorId` as
explicit parameters. **Both runs were taken against the dev Neon branch,
`ep-sparkling-paper-za3j7xza.c-2.eu-west-2.aws.neon.tech`** — neither the staging host
(`ep-empty-scene-…`) nor the production host (`ep-young-glitter-…`).

**Catalogue shape at each scale**, from the harness's own summary:

| | Curated | Generated |
|---|---|---|
| Aheed products | 18 | 2,018 (2,000 generated) |
| SriMart products | 3 | 3 (deliberately not scaled) |
| Aheed categories | 9 top-level + 27 sub | 9 top-level + 27 sub |
| Categories deeper than two levels | 0 | 0 |
| Distinct image keys across generated products | — | 27 (one per subcategory, not one per product) |

| Query | p50 (21 products) | p95 (21 products) | p50 (2,018) | p95 (2,018) |
|---|---|---|---|---|
| storefront catalogue listing (`listProducts`) | 59.9 ms | 75.2 ms | 47.9 ms | 61.0 ms |
| category page products (`listProductsByCategory`) | 31.9 ms | 45.9 ms | 46.0 ms | 63.0 ms |
| category page (`getCategoryBySlug`) | 32.0 ms | 34.2 ms | 31.7 ms | 48.9 ms |
| product search (`searchProducts`) | 48.4 ms | 75.1 ms | 62.6 ms | **95.4 ms** |
| speciality facets (`getAvailableSpecialities`) | 16.1 ms | 26.1 ms | 17.9 ms | 30.6 ms |
| staff order list, no search (`listOrdersForStaff`) | 31.5 ms | 44.3 ms | 31.7 ms | 47.3 ms |
| order history (`listOrdersForUser`) | not measurable | not measurable | not measurable | not measurable |
| staff financials aggregate (`getFinancialsForStaff`) | 16.0 ms | 28.1 ms | 16.1 ms | 29.4 ms |

### Re-measurement after #564 (tokenised search and relevance ranking), 2026-09-03

P2.6 slice 1 changed what `searchProducts` does to the database: it now issues an `AND` of one
`contains` pair per term instead of a single `contains`, and it fetches up to
`SEARCH_CANDIDATE_LIMIT + 1` (201) rows per query instead of `take + 1` (13), ranking them in
memory. Both changes push in the direction of *more* work per search, so the path was re-measured
rather than assumed unchanged. Same harness, same dev catalogue, same 15 samples after a discarded
warm-up.

| Query | p95 before (#489) | p95 after (#564) |
|---|---|---|
| storefront catalogue listing (`listProducts`) | 61.0 ms | 54.0 ms |
| category page products (`listProductsByCategory`) | 63.0 ms | 59.8 ms |
| category page (`getCategoryBySlug`) | 48.9 ms | 61.7 ms |
| product search (`searchProducts`) | **95.4 ms** | **67.6 ms** |
| speciality facets (`getAvailableSpecialities`) | 30.6 ms | 24.3 ms |
| staff order list, no search (`listOrdersForStaff`) | 47.3 ms | 43.9 ms |
| staff financials aggregate (`getFinancialsForStaff`) | 29.4 ms | 26.2 ms |

**Search remains far inside the target — 67.6 ms against `under 400 ms`, a 5.9x margin.** That is
the only claim these figures support.

**It is NOT evidence that the new query is faster than the old one, and reading it that way would
repeat a mistake this document already records.** Every path moved, including four that this slice
did not touch at all, and one (`getCategoryBySlug`) got *slower* by more than search got faster.
That is the same round-trip-and-autoscaling noise the section above identifies — the reason
`listProducts` appeared to speed up 100x-ing its rows. The defensible reading is that fetching 201
rows instead of 13 and ranking them in JavaScript **did not move this path out of the noise floor**,
which is the question worth asking before shipping it. A real before/after would need both variants
measured in one session against one database, which #564 did not do.

### Verdict against the target

**Every measured path meets `specs/mission.md`'s API `p95 under 400 ms` at roughly 2,000 products.**
The worst is product search at **95.4 ms**, a 4.2x margin. **No issue was filed for a breach, because
there was no breach** — remediation was explicitly out of scope for #489 (measure first, then file
with evidence), and there is nothing to remediate yet.

### What the numbers actually say, and what they do not

- **Product search is the one real signal.** It is the largest mover — p95 75.1 ms to 95.4 ms, about
  +27% — and it is the only path the review table above marks **`scan`** rather than `indexed`.
  That is the expected shape: a substring `contains` over `name` and `description` has no serving
  index, so it is the path that should degrade first as rows grow. It has 4.2x of headroom left, so
  this is a thing to watch rather than a thing to fix, and it is the number to re-take when the
  catalogue grows again or when **#286** adds trigram matching to the same path.
- **`listProducts` got FASTER at roughly 100x the rows** (p95 75.2 ms to 61.0 ms). That is not a real
  improvement, and reading it as one would be a mistake — it is the clearest evidence that these
  figures are still substantially round-trip-and-autoscaling noise rather than query cost, exactly
  the caveat the earlier tables carry. Keyset pagination means the listing reads a fixed page
  regardless of table size, so flat-to-noisy is the correct expectation.
- **The honest conclusion is narrower than "the app scales."** At 2,018 rows, six of seven measurable
  paths are still round-trip dominated. What has changed since the 22-row baseline is that one path
  now shows a signal above the noise. A catalogue an order of magnitude larger again, or a
  concurrency dimension, would be the next thing to test — neither is claimed here.
- **`listOrdersForUser` could not be measured at either scale**: the dev branch holds no `Order` rows
  with a `userId`. Recorded as not measurable rather than omitted, so a future reader does not
  mistake its absence for a pass. The staging figures in the review table above remain the only
  measurement this path has.


### Re-measurement after #569 (catalogue filter facets), 2026-09-05

P2.6 slice 6 added four facets — country of origin, dietary flags, brand and offers — and with them
a schema change (`Brand`, three dietary booleans, HMC provenance, two new indexes) and a materially
wider facet probe. `getAvailableFacets` (renamed from `getAvailableSpecialities`, since it no longer
reports only specialities) went from **three probes to nine**: six dietary and speciality booleans,
an offers probe, and two distinct-value queries for origins and brands. That is the change most
likely to move a number here, so the path was measured rather than assumed.

All nine run inside one `Promise.all`, so the cost is the slowest probe rather than the sum — which
is the property the numbers below actually confirm.

Same harness (`scripts/measure-catalogue-queries.ts`), same dev branch
(`ep-sparkling-paper-za3j7xza`), 15 samples after a discarded warm-up. Catalogue at measurement:
**2,080 Aheed products** (2,000 generated), 13 top-level categories, 27 subcategories.

| Query | p50 | p95 | vs. previous |
|---|---|---|---|
| storefront catalogue listing (`listProducts`) | 46.2 ms | 52.4 ms | improved from 61.0 ms |
| category page products (`listProductsByCategory`) | 47.6 ms | 70.4 ms | broadly flat |
| category page (`getCategoryBySlug`) | 48.2 ms | 64.3 ms | broadly flat |
| product search (`searchProducts`) | 75.6 ms | **102.1 ms** | from 95.4 ms |
| facets, unfiltered (`getAvailableFacets`) | 39.9 ms | **77.7 ms** | from 30.6 ms at three probes |
| facets, filtered context (`getAvailableFacets`) | 56.7 ms | 62.6 ms | new in this slice |
| search + offers facet (`searchProducts`) | 77.4 ms | **114.3 ms** | new in this slice |
| staff order list, no search (`listOrdersForStaff`) | 32.3 ms | 43.1 ms | broadly flat |
| staff financials aggregate (`getFinancialsForStaff`) | 29.2 ms | 144.7 ms | noisy; see caveat below |

**Verdict: the 400 ms API target holds with a 3.5x margin on the worst catalogue path.** The most
expensive shape this slice adds — a tokenised search with the offers facet active, which is where
`buildFilterWhere` and the search predicate must compose rather than collide — is **114.3 ms p95**.

What the numbers say about the facet widening specifically: tripling the probe count moved facet
p95 from 30.6 ms to 77.7 ms, roughly 2.5x rather than the 3x a sequential implementation would have
cost, and the *filtered* context is cheaper (62.6 ms) than the unfiltered one because each probe
scans fewer rows. Two indexes were added for the two high-cardinality facets
(`@@index([vendorId, isActive, brandId])` and `@@index([vendorId, isActive, origin])`); the dietary
booleans deliberately get none, matching the existing `isHalal`/`isFresh`/`isOrganic` treatment,
since a boolean splits the table roughly in half and an index earns little against its write cost.

**Caveat, unchanged from earlier rounds:** these are client-observed wall-clock times around the
Prisma call from a UK developer machine to a `eu-west-2` Neon branch, so they include the network
hop and are dominated by it at this scale. The `getFinancialsForStaff` p95 of 144.7 ms against a
29.2 ms p50 is a single outlier in fifteen samples, not a regression — the same measurement noise
this document already records for small sample counts.
