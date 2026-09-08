---
id: p9-3-panel-refusal-and-catalogue-category-filter-plan
title: "P9.3 — Panel refusal enforcement & admin catalogue category filter (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-08
visibility: internal
summary: "Closes #350 by replacing a hand-maintained prose list with a filesystem-walking test and converting the fourth refusal instance, and #503 part 1 by adding a hierarchy-aware category filter to the admin product list. No schema change."
tags: [p9, staff-panel, catalogue, admin, accessibility-adjacent, enforcement]
# related: [roadmap, architecture]
---

# P9.3 — Panel refusal enforcement & admin catalogue category filter (plan)

Two independent halves, grouped because both are small P9.3 tail items on the staff panel and
neither carries a schema change. They share no code.

**Goal:** close `#350` in a way that cannot silently recur, and close `#503` on the half that was
actually named — making the admin product list navigable by category when the catalogue is 2,026
products deep and `PAGE_SIZE` is 25.

---

## Half A — `#350`, and the fourth instance nobody was looking for

**The code fix already landed.** `app/(admin)/staff/storefront/page.tsx` renders `<PanelRefusal>`
today, with a comment explaining why. `git log -S` pins it to `e3c9642` (2026-09-06) — the
`#627`/`#628`/`#630`/`#631`/`#634` slice, which was editing that page for per-vendor panel colours
and fixed the refusal branch on the way past without closing the issue. `specs/roadmap.md` still
says "**#350** … Still open" as of roadmap `1.81.0`, and the issue's own reproduction command now
returns nothing:

```
$ grep -rn "if (!auth.ok) return null" "app/(admin)" --include=page.tsx
(zero matches)
```

So the obvious version of this half is three doc edits and a `gh issue close`. That version is
wrong, and the reason is the issue's own thesis.

**`#350` is not really about one page.** Its "part worth keeping" section says: *`CLAUDE.md`'s own
list of compliant pages does not mention `storefront` at all … so it was never audited, and the
rule reads as complete while a page it never covered sits in violation.* It then names the general
principle this repo has recorded twice before — **a rule that names its own enforcement must be
checked against that enforcement, or it becomes a rule that documents a guarantee nobody provides.**

Walking all 25 `page.tsx` files under `app/(admin)/` at `/propose` found a **fourth instance** the
issue never mentions. `app/(admin)/staff/discounts/page.tsx:23` hand-rolls refusal markup that is
byte-identical to what `PanelRefusal` renders:

```tsx
<main className="mx-auto max-w-md px-4 py-16 text-center">
  <h1 className="text-2xl font-semibold text-primary">Store admins only</h1>
  <p className="mt-3 text-primary-muted">You&apos;re signed in, but …</p>
</main>
```

This is a **consistency** instance, not the blank-shell defect — it renders a real refusal, so
there is no user-visible bug and never was. It is the same class `loyalty/page.tsx` was before
P7.5d+e (`#136`).

It was also a **known, deliberate deferral whose record has gone half-stale**.
`components/staff/PanelRefusal.tsx`'s own docstring still reads *"`/staff/loyalty` and
`/staff/discounts` keep their own copies, which this slice deliberately does not touch"* — wrong
about `loyalty` (converted in `#136`) and right about `discounts`. And `CLAUDE.md:840`'s list of
compliant pages names **neither `storefront` nor `discounts`**. The prose list has now been wrong
about two pages simultaneously, in two different directions, which is as clear a demonstration as
the rule is going to get that prose is not enforcement.

**So the deliverable is the test, and the doc edits are bookkeeping around it.** This is item 3 of
`#350`'s own suggested fix, which it filed and deferred: *"a test asserting no `page.tsx` under
`app/(admin)/` contains a bare `return null` refusal would make the third instance the last one."*

**Scope (Half A):**

- Convert `app/(admin)/staff/discounts/page.tsx`'s refusal branch to `<PanelRefusal>`. Zero visual
  change — the replaced JSX and the component's output are the same markup.
- Add `tests/panel-refusal-coverage.test.ts`: discovers `page.tsx` files under `app/(admin)/` from
  the **filesystem**, no hardcoded list and no allowlist, and fails if a file that calls
  `requireVendorRole(` does not render a `<PanelRefusal>` element. Filesystem discovery matches
  `tests/staff-nav-parity.test.ts` and `tests/operator-doc-coverage.test.ts`; the no-allowlist
  stance matches `tests/repository-purity.test.ts` (`#252`), which is the precedent `#350` itself
  named.
- **The test must be AST-based, not a grep.** This is not a stylistic preference. Several of these
  pages carry a comment reading `The refusal branch renders <PanelRefusal>, never return null`.
  A substring check for the opening tag passes on that comment alone, so a page whose comment is
  right and whose code is wrong would go undetected. That is precisely the failure the
  last slice hit and fixed in `82dbb1d` (`radius-scale.test.ts`'s token parser was comment-unaware,
  `#662`), one week ago. `tests/repository-client-injection.test.ts` is the in-repo precedent for
  parsing with `typescript` rather than matching text.
- Correct the three stale records: `PanelRefusal`'s docstring, `CLAUDE.md`'s compliant-page list,
  and `specs/roadmap.md`'s "Still open" line.

---

## Half B — `#503` part 1, the admin catalogue category filter

`app/(admin)/staff/products/page.tsx`'s GET filter form offers **Status and Search only**.
`parseStaffProductsQuery` has no category concept and `listProductsForAdmin` accepts no category
argument. With 2,026 products on one vendor and `PAGE_SIZE = 25`, reaching a product by category
means walking up to 81 cursor pages, and name search helps only when the owner already knows the
name.

Every piece this needs already exists and is tested:

| need | existing thing to reuse |
|---|---|
| the vendor's categories, parents before their own children | `listCategoriesForAdmin` (`#627` ordering) — already called by both product form pages |
| `optgroup`-per-department shape | `toCategoryOptionGroups()` in `lib/catalogue-form.ts` (`#630`) — already renders this exact control in `ProductForm` |
| filter parsing that survives pagination | `parseStaffProductsQuery` / `staffProductsHref` — pure, no I/O, unit-tested |
| a vendor-scoped admin product query | `listProductsForAdmin(prisma, vendorId, …)` — already takes both explicitly |

**Scope (Half B):**

- A `<select name="category">` on the existing GET form, grouped by department via
  `toCategoryOptionGroups`, with an "All categories" default and each department selectable in its
  own right.
- `parseStaffProductsQuery` gains a `category` field; `staffProductsHref` carries it so the filter
  survives pagination, exactly as `status` and `q` already do.
- `listProductsForAdmin` gains one optional `categoryIds` argument, threaded into the existing
  `where` as `categoryId: { in: … }`.

### Three decisions worth stating, because each had a defensible alternative

**1. Selecting a department includes its subcategories. Selecting a subcategory is exact.**

The alternative — exact `categoryId` equality only — loses on evidence already written down in
this repo. `toCategoryOptionGroups`' own docstring records that **both tiers are genuinely
assignable and both are genuinely in use**: `prisma/seed.ts` assigns hand-curated products to a
*top-level* category, while `seedGeneratedCatalogue` assigns generated ones to *subcategories*, and
`prisma/schema.prisma` constrains neither. So an exact-match department filter would show the
hand-curated products and hide every generated one underneath, which reads as a broken filter
rather than a narrow one. Expansion is one level deep because `Category`'s hierarchy is capped at
two tiers (`parentId` self-relation, and `listCategoriesForAdmin`'s docstring states the cap).

**2. The category list is fetched *before* the product query, not alongside it.**

This was proposed at `/propose` as a `Promise.all`, and that was wrong — the two are not
independent. Validating and expanding the selected id requires knowing the vendor's real category
ids, and the product query's `where` depends on the result, so the calls are inherently ordered.
The cost is one extra sequential round-trip on this page (`#503` measured Neon at roughly 69 ms per
round-trip).

The way to avoid it would be to push expansion into a Prisma relation filter that matches a
product whose category either is the selected one or has it as parent — which needs no knowledge
of the children and so could run in parallel. It is rejected deliberately: it moves the one rule worth testing out of a
pure function that runs with no database and into a query shape that cannot be asserted without
one, and it still would not supply the forged-id guard, which needs the real id list regardless.
Trading a unit-testable rule for 69 ms on an **admin** list page is the wrong trade, and the
round-trip economics of this app are `#670`'s subject, not this slice's.

**3. `parseStaffProductsQuery` takes the category list as a *required* second argument.**

Making it optional would be less churn — three existing call sites in
`tests/staff-products-query.test.ts` would keep compiling. It is rejected because an optional
argument that silently disables the filter when omitted is exactly the quiet-failure shape this
repo keeps paying for. Requiring it makes "the caller forgot the categories" a compile error rather
than a filter that renders and does nothing.

The module stays **pure** — it takes the categories as data and performs no I/O — so the whole
filter rule surface remains unit-testable with no database, which is the property its own docstring
claims and the reason it exists as a separate module at all.

---

## Deliberately excluded

- **`#503`'s parts 2 and 3** — unmemoised vendor resolution plus the double `getSession`, and the
  missing ordered `@@index([vendorId, createdAt, id])`. Split out to **`#670`** at `/propose` so
  `#503` can close on what actually ships. Part 3 needs a migration, and `CLAUDE.md` records a
  spurious `DROP INDEX` against the three hand-authored `pg_trgm` indexes on **every** migration
  this project has generated since `#508` — six occurrences — so importing that risk into a slice
  that otherwise needs no schema change at all is a poor trade. Part 2 should follow `#439`, whose
  own rule is to remediate only the current dominant contributor.
- **Better Auth `session.cookieCache`.** Recorded as excluded by `#503` itself and carried to
  `#670`: it caches role claims in a signed cookie for a TTL, so a revoked staff role stays live
  until expiry. That is an RBAC trade-off deserving its own decision.
- **A category filter on the storefront product list.** `#397`/`#601` own storefront faceting. This
  slice touches the **admin** list only.
- **Category filtering on `/staff/inventory`.** Same argument would apply, but it is not what
  `#503` describes and no issue covers it. Left alone rather than quietly widened.
- **Any change to the refusal *copy* or the `PanelRefusal` component's markup.** Half A converts a
  call site and adds a test; the rendered output is unchanged everywhere.
- **A schema change or migration of any kind.** This slice adds none, and R17 asserts it.

## Open items carried forward

- **`#670`** — `#503`'s parts 2 and 3, milestone P09.3, sequenced behind `#439`.
- **`#513`** — the delivery board's Phase field has no P9/P10 options, so `#350` and `#503` both
  record `Phase=P8` and cannot be corrected. `#670` was added with **no** Phase rather than a
  knowingly wrong one. Unchanged by this slice; noted so the next reader does not re-diagnose it.
- **PR `#669`** has no roadmap change-log row yet — it merged after the last roadmap edit. Per the
  carry-forward rule it rides this branch, at this slice's Document (final).
