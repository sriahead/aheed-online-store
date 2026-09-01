# Storefront browsing UX fixes — validation

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

This slice is UI + a small seed content addition — no schema change, one repository function's
parameter widened (its only caller updated in the same commit). Risk is in (a) the aggregated query
actually returning the right rows and (b) the seed addition being idempotent and not colliding with
existing slugs.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Regression | Read `lib/repositories/products.ts`: `listProductsByCategory`'s third parameter is `categoryIds: string[]` and the `where` clause uses `categoryId: { in: categoryIds }`. `ProductRepository.listByCategory` and `lib/products-service.ts`'s wrapper both take `categoryIds: string[]`. |
| R2  | Integration | Under `npm run preview` (or against staging), fetch `/categories/fruit-veg` (or any department with subcategory products) and confirm the product grid includes products whose category is a **child** of `fruit-veg`, not only the department's own 2 curated products. |
| R3  | Unit | `npx vitest run tests/subcategory-links.test.tsx` — the "All" case asserts `href="/categories/{currentSlug}"` and `aria-current="page"`; the empty-list case still asserts no nav renders at all. |
| R4  | Integration | On a clean dev database run `npm run db:seed`, then `npx tsx scripts/measure-catalogue-queries.ts`; its shape summary reports Aheed `topLevelCategories = 13`. Confirm the four new slugs (`frozen-foods`, `health-beauty`, `baby-kids`, `pet-supplies`) exist and don't collide with any existing slug. |
| R5  | Integration | Under `npm run preview`, fetch `/` (the landing route) and confirm the response HTML contains a link with visible text "Shop" and `href="/categories"`. Fetch `/categories` itself and confirm the same link is present (not landing-only). |
| R6  | Regression | Read `app/(landing)/page.tsx`: the hero's outer grid div uses `lg:grid-cols-2`, not a fixed-width second column. |
| R7  | Unit | Covered by R3's test file — same command. |
| R8  | Regression | `git diff --stat <base>...HEAD -- prisma/schema.prisma` is empty; `git diff --name-only <base>...HEAD -- prisma/migrations/` lists nothing. |
| R9  | Regression | `git diff <base>...HEAD -- CHANGELOG.md` is non-empty and describes this slice. |
| R10 | Regression | `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run format:check` — all four pass. CI on the PR is the authority, not local output. |

## Notes for the validating context

- **No live database write is strictly required to prove R2** — dev and staging both already carry
  #489's generated set under the original nine departments' subcategories, so the aggregation is
  observable immediately after deploy. R4 does need a seed run (idempotent, additive) against
  whichever database is used to confirm the count.
- `npm run preview` is the right tool for R2/R5/R6 — these render pages and read live category data.
