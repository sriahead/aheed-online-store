---
id: p2-6-search-autocomplete-and-filter-panel-plan
title: "P2.6 slice 5 — search autocomplete and filter panel with chips and drill-down (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-04
visibility: internal
summary: Search autocomplete behind a new bounded JSON route, plus a mobile filter disclosure with removable chips, clear-all, context-aware facets and category drill-down that composes with the query. No migration; every form stays no-JS.
tags: [p2-6, search, filters, autocomplete, accessibility]
---

# P2.6 slice 5 — search autocomplete and filter panel with chips and drill-down (plan)

**Goal:** make the storefront's filter surface something a shopper can actually steer — see what is
applied, remove one thing without starting over, narrow into a department without losing their
query, and get suggestions while typing — without giving up the no-JS forms the storefront has had
since P2.5b2.

Slices 1–4 all improved what search *returns* for a given query. This slice is the first to improve
how a shopper **changes** the query. That distinction is the whole framing: nothing here alters
`searchProducts`'s matching, its ranking, or its zero-result ladder.

## What exists today, verified in the code

`components/product/ProductFilterForm.tsx` (136 lines) renders six controls plus a hidden `featured`
passthrough, as a plain GET form. It is consumed by **two** pages, not one —
`app/(storefront)/search/page.tsx:128` and `app/(storefront)/categories/[slug]/page.tsx:138` — so
every change here is a two-page change. The issue text does not mention the second consumer.

`getAvailableSpecialities` (`lib/repositories/products.ts:875`) already hides a toggle the vendor has
no products for, via three `findFirst` probes. That is the precedent this slice extends.

`Category` is properly nested (`prisma/schema.prisma:293-295` — `parentId`, `parent`, `children`),
and `/categories/[slug]` already drills down through `SubcategoryLinks`. What does **not** exist is
any way to narrow *within search results*: `ProductFilters` (`lib/repositories/products.ts:194`)
carries no category predicate at all. **Drill-down from within results is therefore a repository
change, not a presentation change** — the issue frames it as the latter.

There is no search API route of any kind. `app/api` holds `admin`, `auth`, `health` and `webhooks`.

## Scope (this slice)

### 1. A mobile filter disclosure — and why it is NOT a JS drawer

The approved proposal said this would be a near-copy of `CartDrawerShell`'s modal contract. **Writing
the spec changed that decision, and the reason matters more than the outcome.**

Today the filter sidebar is an `aside` in a `flex-col md:flex-row` layout, so on a narrow viewport it
simply stacks above the results. A shopper with JavaScript disabled has filters. If the mobile
surface became a client-only drawer behind a button, that shopper would have **none** — a straight
regression on exactly the axis this storefront has protected since P2.5b2. The cart drawer gets away
with being client-only because `/cart` exists as a real page behind it; filters have no such second
door.

So the mobile surface is a native `details` disclosure, styled as a panel. It needs **zero client
JavaScript**: `details` opens and closes on its own, and because every filter interaction here is a
real navigation (a GET submit or a link), the next page arrives with the disclosure closed by
default — the "close on navigate" behaviour `CartDrawerShell` needs a `usePathname` effect for comes
free. It is a disclosure, not a modal, so it correctly gets no `aria-modal`, no focus trap and no
Escape handler; those belong to dialogs that trap the page behind them, and this does not.

`FilterPanel` renders `ProductFilterForm` **twice** — once inside the `md:hidden` disclosure, once
inside the `hidden md:block` sidebar — because CSS cannot move one DOM node between two containers.
Exactly one is ever visible. Two GET forms in one document is safe here specifically because
`ProductFilterForm` uses no `id` attributes and labels by wrapping, so nothing is duplicated that the
accessibility tree or a `form=` reference could confuse.

### 2. Applied-filter chips and clear-all

One chip per active filter, each a plain anchor whose href is the current URL minus that one
parameter. Clear-all is a link to the same path with every filter dropped. No JavaScript, no new
state — the URL already **is** the state.

Two rulings a numbered requirement cannot carry on its own:

- **Removing a filter also drops pagination** (`cursor`, and `back` on the category page). Landing on
  page 4 of a result set that just changed size is meaningless, and the existing form already
  restarts pagination on Apply for the same reason.
- **`q` is not a chip.** It is already the page heading (`Results for …`), and clear-all
  **preserves** it. A shopper clearing filters wants their search back unfiltered, not a blank
  catalogue — and a chip that removed the query would be indistinguishable from clear-all at a
  glance.

The two pages build URLs differently (`searchPageHref` versus the category page's local `buildHref`
with its `back` stack), so the chip helper takes a base path and the params it must preserve rather
than assuming either shape.

### 3. Category drill-down that composes with the query

`ProductFilters` gains `categoryIds`, emitted by `buildFilterWhere`. Then
`/search?q=rice&category=world-foods` narrows to that department **and its children** while keeping
the query — the point of drilling down from within results rather than navigating away to the
category page and losing the search.

One ordering hazard is real, and is specified rather than left to be discovered:
`listProductsByCategory` already sets its own `categoryId` and then spreads `buildFilterWhere(filters)`
over it (`lib/repositories/products.ts:445`). Once the helper can emit `categoryId` too, whichever key
is spread last silently wins. The page's own category must always win, so the explicit clause moves
after the spread and a unit test pins that order.

An unknown or inactive `category` slug is **ignored** — no filter, no chip, no `notFound()`. A stray
query parameter should never turn a working search page into a 404.

### 4. Context-aware facets, with the facet-counting trap designed out

`getAvailableSpecialities` becomes context-aware: a toggle is offered only when the *current* result
context has a product carrying it.

The trap this must avoid is well known and easy to ship by accident. If each facet were computed
against the full current filter state, ticking "Halal" would make "Organic" vanish the moment no
product is both — and, worse, a facet could hide the very control needed to untick it. So **each
speciality's availability is computed with all three speciality filters excluded** from the context,
leaving search terms, category, price and in-stock. An active facet therefore always stays visible,
because its own filter never participates in its own probe.

For the search predicate to be identical in the facet probe and in the search itself, the direct
search's `where` builder is extracted into an exported pure function — the same reasoning that
already keeps `buildFilterWhere` exported so `tests/search-repository.test.ts` compares against the
helper's real output instead of a hand-written copy that can drift.

### 5. Autocomplete, deliberately not the search pipeline

A new `app/api/search/suggest/route.ts` returns products, categories and approved synonym terms.

It is **not** `searchProducts`. It runs no zero-result ladder, no 200-candidate window, and writes no
`SearchQueryLog` row. That last one is not a performance nicety: a row per keystroke would flood the
exact table `#566`'s synonym proposals read, so autocomplete would silently corrupt the input to a
neighbouring feature. It does reuse `rankSearchCandidates` over a small bounded window, so the
in-stock and relevance ordering `#564` established still holds.

**Bounding it, decided at `/propose`.** This is a public, unauthenticated endpoint taking one request
per keystroke. The existing throttles (`order-lookup-rate-limit`, `list-normalisation-rate-limit`,
`auth-rate-limit`) all write a row per attempt, and copying them here would make the throttle a
heavier write than the read it protects — the guard becoming the load. Instead: a minimum term length
(`parseSearchQuery` already drops sub-two-character tokens since `#572`, so a bare `e` never reaches
the database), hard `take` caps, a client-side debounce, and a short public `Cache-Control` so
repeats are served at Cloudflare's edge.

**The caching decision carries the one genuinely unverified assumption in this slice.** Cloudflare's
cache key includes the hostname by default, which is what keeps a multi-tenant response from leaking
between vendors — but "by default" is precisely the class of assumption this repo has been burned by
before, and `#502` is the standing lesson that a key can behave differently per environment. It is
therefore verified on a **deployed** environment against both vendor hosts, not under local preview.

Client-side, `components/layout/SearchSuggest.tsx` is a small island inside the header's existing
`form method="GET" action="/search"`. The form is untouched and still submits normally with
JavaScript off; suggestions are additive. It implements the ARIA combobox pattern properly —
`aria-expanded`, `aria-controls`, `aria-autocomplete`, `aria-activedescendant`, arrow-key traversal,
Enter to choose, Escape to dismiss — because a suggestion list only a mouse can reach is not finished
work.

### 6. `#512` — the raw hex

`ProductFilterForm`'s Apply button hardcodes `bg-[#2E7D32]` and `hover:bg-[#1b5e20]`
(`ProductFilterForm.tsx:130`) instead of the action token. Folded in because this slice is editing
that file anyway. Note what the token buys beyond consistency: per `CLAUDE.md`'s design-token
section, a raw hex also bypasses `brandStyle()`, so SriMart renders Aheed's green on that button
today.

### 7. No migration

Every column this slice needs already exists. `prisma/schema.prisma` is untouched and no migration is
generated — stated explicitly because GAP-011's `DROP INDEX` drift has now fired **five** times on
generated migrations, and the cheapest way to not hit it a sixth is to not generate one.

## Deliberately excluded

- **Instant client-side filter re-query.** `#397` raises it; the `/propose` ruling stands — the forms
  submit. Abandoning progressive enhancement across the search surface is its own decision.
- **New filter facets** (brand, dietary flags, country of origin, offers) — `#569`, the next slice.
  This slice changes how filters are *presented* and adds exactly one new dimension (category),
  because drill-down cannot exist without it.
- **The mega-menu (`#394`) and mobile bottom nav (`#395`)** — both P10.
- **Autocomplete over descriptions.** Name, category name and approved alias only. A suggestion
  matching prose reads as a confident wrong answer — the same reasoning that already keeps
  `matchProductListTerms` name-only.
- **Suggestion telemetry.** No logging of what was suggested or chosen. That is analytics, it is
  genuinely unowned (`docs/research/discovery-log.md`, 2026-09-02), and it would reopen the
  personal-data question `#570` settled for search logging.
- **A dialog-style modal filter panel**, for the reasoning in scope item 1.
- **Bulk approve/reject on the synonym queue** (`#582`) and the unverified AI proposal call (`#583`)
  — neighbouring `#566` surface, not this slice.

## Open items carried forward

- **`#583`** — `lib/search-synonym-proposals.ts` still carries the Workers AI `result.response` string
  assumption `#567` fixed in its sibling. This slice reads **approved rows**, never that module, so it
  is unaffected; but the alias vocabulary autocomplete suggests from has never been populated by a
  working proposal run.
- **`#584`** — the vitest baseline count in `CLAUDE.md` has gone stale six times. This slice adds test
  files, so it moves again; Build updates that line rather than leaving it for Document.
- **`#569`** depends on this slice's chip and facet plumbing, and will add dimensions to both.
