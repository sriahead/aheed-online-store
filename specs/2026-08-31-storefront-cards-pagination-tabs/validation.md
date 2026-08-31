# Storefront cards, bundles heading, keyset pagination and subcategory tabs — validation

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

This slice is UI-only — one repository query widened to select one more relation (`parent`), no
schema change, no new write path. Risk is in the pagination cursor-stack logic actually round-
tripping correctly (Next then Previous must return to the same page) and the tab computation picking
the right branch (department vs subcategory).

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Regression | Read `components/bundle/BundleCard.tsx`: its root and image/content regions carry `skew-card-wrap`/`skew-card`/`skew-card-inner` classes matching `ProductCard.tsx`'s structure. |
| R2  | Regression | `grep -rn "Meal bundles\|one meal" app/ components/` returns no hits. |
| R3  | Regression | Read `lib/repositories/categories.ts`: `getCategoryBySlug`'s `select` includes a `parent` relation selecting `id`/`slug`/`name`/`children`. |
| R4  | Unit | `npx vitest run tests/subcategory-links.test.tsx` — covers the "All"-active and tab-active cases and asserts only one `aria-current="page"` link exists at a time. |
| R5  | Integration | Under `npm run preview`, fetch `/categories/rice-grains` (a subcategory of `groceries`) and confirm the response HTML contains the SAME tab row as `/categories/groceries` (links to `rice-grains`/`lentils-pulses`/`cooking-oils` plus "All"), with `rice-grains`'s own link carrying `aria-current="page"` and no other link carrying it. |
| R6  | Integration | Same fetch: confirm the department-scroller markup highlights `groceries`, not `rice-grains` (no top-level entry for `rice-grains` exists to highlight in the first place — confirm the scroller's active-styling classes land on the `groceries` entry). |
| R7  | Integration | Under `npm run preview`, fetch `/categories/fruit-veg`, follow its "Next page" link, confirm the resulting page shows a "Previous page" link; follow that link and confirm the product grid matches the original first page. |
| R8  | Integration | From `/categories/fruit-veg` (no `cursor`/`back`), confirm no "Previous page" link renders. Follow Next then Previous twice in a row and confirm the URL has no `cursor`/`back` param again (back to page 1). |
| R9  | Unit | Covered by R4's test file — same command. |
| R10 | Regression | `git diff --stat <base>...HEAD -- prisma/schema.prisma` is empty; `git diff --name-only <base>...HEAD -- prisma/migrations/` lists nothing. |
| R11 | Regression | `git diff <base>...HEAD -- CHANGELOG.md` is non-empty and describes this slice. |
| R12 | Regression | `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run format:check` — all four pass. CI on the PR is the authority, not local output. |

## Notes for the validating context

- **No live database write is needed.** Dev and staging both already carry #489's seeded
  subcategories and #496's four extra departments, so R5-R8 are observable immediately under
  `npm run preview` or against staging with no seed run.
- `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` is the real
  check for this slice's new spec files, per `CLAUDE.md`'s KMS docs section.
