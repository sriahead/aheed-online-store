---
id: p9-2-admin-panel-operability-plan
title: "P9.2 — Admin panel operability, category hierarchy and report drill-down (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-06
visibility: internal
summary: Closes six Admin/Staff panel findings in one slice — category grouping in the repository, an optgroup product picker, a revenue-filtered report drill-down, vendor-aware panel colours, admin-editable delivery rules, and the unmerged Discover pass that filed them.
tags: [p9-2, admin-panel, categories, reports, design-tokens, discovery]
---

# P9.2 — Admin panel operability, category hierarchy and report drill-down (plan)

**Goal:** close the six remaining findings from the 2026-09-06 Admin/Staff portal Discover pass that
are not launch-readiness work, and land the Discover pass itself. Five of the six are defects a
store operator meets on a normal working day; the sixth is the evidence record that filed them,
still sitting unmerged on a conflicted branch.

## Why these six travel together

They were found by one pass over one surface, and three of them are causally linked rather than
merely adjacent: `#630`'s product-category picker and any expand/collapse on `/staff/categories`
both read `listCategoriesForAdmin`, so `#627`'s ordering fix is a **prerequisite** for `#630` and
not a parallel task. Shipping `#630` first would produce a grouped control built on an ordering that
cannot support grouping. `#631` and `#634` are independent and small; `#628` is independent and is
the largest single piece.

The user approved this as one combined slice at `/propose` rather than five, with the trade-off
understood: a failed `/validate` row anywhere blocks the whole batch.

## Scope (this slice)

**`#632` — land the Discover pass.** Branch `docs/discover-admin-staff-portal-ux` holds one commit
(`d21eaaa`) whose real content is a 373-line addition to `docs/research/discovery-log.md`. It went
`CONFLICTING` when `#633` merged, because both touched `ARTIFACT_INDEX.md`, `CHANGELOG.md` and
`app/(admin)/staff/runbook/docs.ts`. Recovery re-applies the commit onto current `staging`; the two
generated files are rebuilt with `npm run kms:build-index` rather than merged by hand. The findings
are additionally **reconciled to present reality**: `#625`, `#626` and `#629` were closed by `#633`
(promoted in PR #637), and `#627`, `#628`, `#630`, `#631` are closed by this slice — a discovery log
that still presents all seven as open findings is a stale record, and stale records are what this
repo's own `/orient` keeps paying for.

**`#627` — group the category list in the repository.** `lib/repositories/categories.ts:167`'s
`listCategoriesForAdmin` orders by `sortOrder` then `name` as a single **global** ordering with no
`parentId` grouping. Because `prisma/seed.ts` gives top-level categories no `sortOrder` (they take
the schema default `0`) while children get `0,1,2` within each parent, the `sortOrder: 0` bucket
holds all 13 departments plus 9 first-children, sorted by name alone — so an indented Household
subcategory renders directly beneath Beverages. The fix regroups after the fetch, in the
**repository**, so every consumer is fixed at once. The list is unpaginated by deliberate design
(the function's own docstring: a two-level cap keeps it in the dozens), so an in-memory regroup is
honest rather than a hidden scaling problem.

**`#630` — make the product form's category picker express the hierarchy.** `ProductForm.tsx:128`
renders one flat `select` over every tier. Both tiers are genuinely assignable and **both are in
active use**: `prisma/seed.ts` assigns hand-curated products to top-level categories and
`seedGeneratedCatalogue` assigns generated ones to subcategories. The fix is the issue's second
option — one `optgroup` per department, the department itself kept selectable inside its own group.
No client state, no cascade, and the direct-to-department capability survives.

**`#628` — make the report drill-down able to add up.** `getFinancialsForStaff` aggregates over
`REVENUE_STATUSES` (`CONFIRMED`, `OUT_FOR_DELIVERY`, `DELIVERED`), a set
`lib/staff-orders-query.ts` cannot express: it resolves a status to the default queue, the `all`
sentinel, or exactly one `OrderStatus`. So a Total Orders link to `?status=all` overcounts and a
link to bare `/staff/orders` undercounts. This adds a **`revenue` sentinel** alongside `all`, and a
by-status breakdown tier on `/staff/reports` built from one `groupBy` over the same `where` clause
the tiles already use. The tile then links to precisely its own dataset, and each breakdown row
links to its single status, which `?status=` already expresses correctly.

**`#631` — remove Aheed's brand hexes from the shared panel.** Three Tailwind arbitrary-value
literals hardcode Aheed's primitives on pages every vendor's staff open:
`InventoryTable.tsx:131` (`text-[#2e7d32]`), `InventoryTable.tsx:159`
(`bg-[#e8f5e9] text-[#2e7d32] hover:bg-[#c8e6c9]`) and `errors/page.tsx:49` (`bg-[#f5f5f0]`).
`brandStyle()` re-declares `--color-action`, `--color-action-tint` and `--color-surface-muted` per
vendor, so replacing the literals with `text-action`, `bg-action-tint` and `bg-surface-muted` makes
these genuinely follow the viewing vendor's brand rather than merely reading tidier. A guard test is
added, because the issue's own "why nothing catches it" section is correct: arbitrary values are
invisible to `lint` and `format:check`.

**Three further occurrences, found by this spec's own adversarial pass, are included.** `#631` names
three literals; a repo-wide grep of the panel found **six**. The unnamed three are
`app/(admin)/staff/team/page.tsx:41` (`bg-[#f5f5f0]`, Aheed's cream) and
`components/staff/team/AssignRoleForm.tsx:65` and `:67` (`text-[#d32f2f]` and `text-[#2e7d32]`,
Aheed's brand red and green). They are the identical defect on identically vendor-scoped pages, and
including them is not optional: the guard test in R23 is scoped to the whole staff panel, so leaving
them would make a test this slice adds fail on its own branch. Narrowing the test to only the two
files the issue names was rejected — a guard that exempts the cases it did not happen to be told
about is the shape of defect this repo has already paid for twice. Note the `#d32f2f` to
`text-danger` swap changes the rendered value slightly (`--color-danger` is `#c82d2d`, the
AA-darkened figure from `#251`); that is the correction, not a regression.

`components/product/ProductFilterForm.tsx` carries the same class on the **storefront** side and is
tracked separately as `#512`. The guard test's scope is deliberately `app/(admin)/` plus
`components/staff/`, which excludes it, so this slice does not silently take on a file it is not
fixing.

**`#634` — make delivery rules editable.** `VendorConfig.deliveryFeePence`,
`freeDeliveryThresholdPence` and `minimumOrderPence` are written by `prisma/seed.ts` and nothing
else, so changing a store's delivery fee needs a developer with database access. This adds them to
`/staff/storefront` through the existing `updateStorefrontConfig` action and
`updateVendorStorefrontConfig` repository write, following the shape `#612` used for delivery areas.
`docs/store-admin-guide/admin-tabs-guide.md` regains the delivery-rules capability sentence that
`#633` correctly removed as false — it becomes true in the same commit that makes it true.

**One incidental fix, deliberately included.** `app/(admin)/staff/storefront/page.tsx:11`'s refusal
branch is `if (!auth.ok) return null;`, which `CLAUDE.md`'s staff-panel section names as a standing
defect: `app/(admin)/layout.tsx` still renders the portal shell around it, so a refused user gets a
`200` with a blank content area and no "Staff only" message. It is on a page this slice is already
editing, and the repo has an established `PanelRefusal` pattern to copy. Fixed here rather than
filed, and called out in `build-notes.md` as a deviation from the five approved issue numbers.

## Deliberately excluded

- **`#113`, `#104`, `#436`, `#437`, `#438`** — launch-readiness work, excluded by the user at
  `/propose`.
- **Expand/collapse on `/staff/categories`.** `#627` is titled as the thing that *blocks* it; this
  slice delivers the ordering prerequisite and the corrected indentation, not the disclosure
  interaction. Building the interaction is a separate proposal now that its foundation exists.
- **Backfilling `sortOrder` on top-level categories** via seed and migration. The issue lists it as
  an option and correctly notes it does not group parents with children, so it does not fix this. It
  would also generate a migration, and every migration this repo has generated since `#508` has
  produced spurious `DROP INDEX` statements against the `pg_trgm` indexes (GAP-011). Not worth
  taking on for an ordering fix that works without it.
- **A cascade (two dependent selects) for `#630`.** The issue offers it as the first option; the
  `optgroup` form is chosen because it needs no client state and cannot silently drop the
  direct-to-department case.
- **Aggregate revenue drill-down beyond order count.** The Total Revenue and Avg Basket tiles are
  not linked. Only Total Orders gets a link, because only a count reconciles against a list of
  orders — a revenue figure drilling into a list the reader must sum by hand is a worse claim than
  no link.
- **`#512`** (the storefront-side `ProductFilterForm` hex literal). Same class as `#631`, different
  surface; the new guard test is scoped to the staff panel so it does not fail on a file this slice
  is not fixing. Noted in the issue as a follow-up.
- **The `red-100`/`red-700` Tailwind palette classes** in `InventoryTable`'s inactive branch. They
  are not brand hexes and `#631` does not name them; changing them is a design decision, not a
  multi-tenancy fix.
- **Refunds, and removing a refunded order from `REVENUE_STATUSES`.** ADR-005 territory, still
  undecided (`#606`).
- **Typing `StorefrontConfigForm`'s `initialConfig: any` / `initialBranding: any`.** Real debt on a
  file this slice edits, but widening it pulls in the six brand fields the form renders no input for.
  Filed rather than fixed.

## Open items carried forward

- **`JOB_INVOCATION_TOKEN` is set on no Worker in either environment**, verified with
  `wrangler secret list` against `staging`, `production` and the separate `workers/scheduler`
  Worker (whose secret list is empty) — while that scheduler **is deployed to production with a
  live Cron Trigger**. `#618`'s sweep is therefore inert, and its route's config accessor throws
  rather than returning empty (the `#621` shape). This slice cannot fix it: the secret must be set
  by a human with the credentials. Flagged, not invented.
- **`#634`'s sibling gap** — the six brand primitives `VendorBranding` carries that
  `StorefrontConfigForm` renders no input for. Same "seed-only" class this slice closes for delivery
  rules.
