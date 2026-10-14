---
id: p1096-1030-department-spotlights
title: "Departments show what they actually sell: hero spotlights and the banner prompt (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-14
visibility: internal
summary: "Club B from the owner's 2026-10-13 user-testing pass: every homepage department panel gets a spotlight product drawn from the department and its subcategories, chosen fairly per department, and the AI campaign-banner prompt uses the vendor's own description instead of assuming a UK grocer."
tags: [storefront, landing, hero, ai, vendor-neutral, p10, user-testing]
related: [user-testing-feedback-2026-10-13, roadmap, app-conventions]
---

# Departments show what they actually sell: hero spotlights and the banner prompt (plan)

**Goal:** close "Club B" from the owner's 2026-10-13 user-testing pass
(`docs/business-analysis/user-testing-feedback-2026-10-13.md`, status register of 2026-10-14):
item 10's code half, filed as `#1096`, and its sibling `#1030`. The owner's words were "the image
carousel needs to match the products that are listed". After this slice, every homepage department
panel that has products names one of **that department's** products, and an AI-generated banner for
a department is prompted as **this vendor's** shop, not a generic UK grocer.

The two halves share one surface, the homepage `DepartmentHero`, and nothing else in the code: two
independent files plus tests. **No schema change, no migration, no new dependency.** Approved at
Gate 1 on 2026-10-14 (comments on `#1096` and `#1030`). At Spec, the owner declined a production
catalogue measurement, so the slice is proven against the dev database's seeded catalogue and a
throwaway fixture, not against production's own distribution.

## Scope (this slice)

### `#1096`: every department with products gets a spotlight

`listCategorySpotlights` (`lib/repositories/products.ts`, P8.5b `#346`) feeds the price callout on
each `DepartmentHero` panel (`app/(landing)/page.tsx` calls it through
`getProductRepository().categorySpotlights`). Today it has two defects:

1. **Starvation.** It runs one `findMany` with `take: departments × 4` under a single store-wide
   `isFeatured desc, createdAt desc` order. If one department holds more featured or newer
   products than the window, it fills the whole window, and every other department gets no
   spotlight and shows the "Browse the full range." fallback.
2. **Subcategories are invisible.** It matches only top-level category ids. The department page
   (`getCategoryBySlug` in `lib/repositories/categories.ts`) lists the department **plus its active
   direct subcategories**. A catalogue organised into subcategories, which is how the `#489` seed
   organises dev, gets few or no spotlights, and the hero disagrees with the page its panel links
   to.

**The fix (approved shape: a fixed number of queries, at most three):**

1. **Subcategory lookup.** Read the active direct children of the requested departments
   (`Category` filtered on `vendorId`, `isActive: true` and `parentId` in the departments), and
   build a map from each category id to its department id. A department maps to itself.
2. **Per-category best candidates.** `product.groupBy` by `categoryId` and `isFeatured` over this
   vendor's active products in all those categories, with the maximum `createdAt` per group. The
   result has at most two rows per category.
3. **Choose in memory, then fetch the winners.** A pure function picks, for each department, the
   best group across the department and its subcategories, using the **same rule as today**:
   featured beats non-featured, then the latest `createdAt`. One `findMany` then fetches the
   winning products, matched on the `(categoryId, isFeatured, createdAt)` triple. If several
   products tie on that exact triple, the lowest `id` wins, so the result is deterministic. That
   tie-break is new; the old query had no tie-break.

Every department is judged independently, so starvation cannot happen. The number of queries does
not grow with the number of departments, and the rows read are bounded by roughly two per category
plus ties. Ties are a real case: rows inserted in one statement (a seed or bulk import) share one
`createdAt`, so the third query can return a whole batch for a category. That is bounded by the size
of the winning categories, not the catalogue, and the query selects only the callout's fields. The selection logic is a **pure exported function** so a unit test can prove it without
a database, and the repository function stays a thin wrapper.

`CategorySpotlight.categoryId` keeps its meaning as the product's **own** category, which may now
be a subcategory. The returned `Map` stays keyed by the **department** id, which is what
`app/(landing)/page.tsx` looks up. `DepartmentHero` reads only `name`, `basePrice`,
`originalPrice` and `unitLabel`, so the component needs no change. Only its fallback comment, which
blames "the spotlight query's bounded window", becomes false and is reworded to say the department
has no active products.

**Why three queries rather than the alternatives (decided at Gate 1):**

- *One `take: 1` query per department, in parallel:* the simplest code, but the query count grows
  with the number of departments, and every Neon HTTP query on a Worker is a subrequest. The
  per-request limit depends on the plan, which is still unknown (`#1028`).
- *Prisma `distinct` on `categoryId`:* without the `nativeDistinct` preview feature, Prisma
  de-duplicates in memory after reading **every** matching row, so it is unbounded.
- *Raw SQL `DISTINCT ON`:* banned in application code (`CLAUDE.md`).

This **supersedes `#346`'s R5** ("one query for all departments"). R5's single query is exactly the
mechanism that causes starvation, and its own comment admitted that one-per-group "is not
expressible in a single Prisma query without raw SQL". The new bound is a fixed three.

### `#1030`: the campaign banner prompt uses the vendor's own description

`buildPrompt` in `app/api/admin/campaign-images/generate/route.ts` sends every vendor's banner
request as "Photographic marketing banner for a UK grocery store's …" with "Appetising" lighting.
SriMart sells electronics. This is the defect class `#905` fixed for the three text prompts, and
the image prompt was missed.

- The prompt builder moves to a pure, exported function in `lib/campaign-image.ts`. A Next route
  file may export only its HTTP handlers and route config, so the builder cannot be exported from
  the route for a test to import.
- The prompt becomes three newline-separated lines, matching the shape `#905`'s builders already
  use:
  1. A neutral subject line naming the department and campaign copy, with no grocery wording, no
     country and no store type.
  2. `storeDescriptionPromptLine(storeDescription)` when the vendor has a description, so it is the
     prompt's **second line**, exactly as in `#905`. With no description, this line is absent.
  3. A neutral photographic style line: natural light, uncluttered, space for text, no text, words
     or logos. No food adjectives.
- The route reads `storeDescription` with `getVendorConfig(auth.vendorId)` from
  `lib/vendor-service.ts`, after the role check and before the AI-budget check, alongside the
  existing category and campaign reads.
- `tests/store-description-prompts.test.ts`'s `BUILDERS` table gains a "campaign banner" row, so
  the same four assertions that guard the other three prompts guard this one too.

## Deliberately excluded

- **Swapping the actual banner images.** The other half of item 10 is owner-configurable on
  `/staff/promotions` today and needs no deploy.
- **A production catalogue measurement.** The owner declined it at Spec on 2026-10-14. So no
  requirement claims a production before/after; the dev seed and a throwaway fixture carry the
  proof.
- **Grandchild categories.** The department page shows the department and its **direct** children
  only (`getCategoryBySlug`), so the spotlight matches that. If deeper nesting becomes real, both
  should change together.
- **Showing a spotlight product's image or linking the callout to the product.** `DepartmentHero`'s
  markup and behaviour are untouched apart from the one fallback comment.
- **The product-image prompt** (`lib/product-image-pipeline.ts`). `#1030` itself records that it
  is already neutral.
- **`#1028`** (Workers plan confirmation) is owner work. This slice's query shape no longer depends
  on its answer.

## Open items carried forward

- Whether production Aheed's departments actually starve today is unmeasured (declined). The fix
  does not depend on the answer.
