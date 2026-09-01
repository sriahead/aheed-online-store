# Storefront subcategory navigation — validation

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

This slice is a small, additive UI fix — one new presentational component, one page wired up to
data it already fetches. No repository, service, or schema change, so the risk is narrow: does the
component render correctly in isolation, and does the real page actually show it. `npm run preview`
is the right tool since the page reads live category/product data — `npm run dev` cannot load
`@prisma/client/wasm` (see `CLAUDE.md`).

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `tests/subcategory-links.test.tsx` — `render(<SubcategoryLinks children={[]} />)` and assert `container.firstChild` is `null`. |
| R2  | Unit | Same file — render with 2-3 fixture entries, assert one `getByRole("link", { name })` per entry with the correct `href`. |
| R3  | Regression | Read `app/(storefront)/categories/[slug]/page.tsx`: `<SubcategoryLinks children={category.children} />` appears above the product grid `<div>`. |
| R4  | Regression | `git diff --name-only <base>...HEAD -- lib/repositories/categories.ts lib/categories-service.ts lib/repositories/products.ts lib/products-service.ts prisma/schema.prisma` is empty. |
| R5  | Unit | `npx vitest run tests/subcategory-links.test.tsx` passes both cases in R1/R2. |
| R6  | Integration | Under `npm run preview`, fetch `/categories/groceries` (or any Aheed department) and confirm the response HTML contains a link to `/categories/rice-grains` (or another real child slug); follow it and confirm that page's own product grid is unchanged from #489's already-verified behaviour. |
| R7  | Integration | Under `npm run preview`, fetch `/categories/rice-grains` (a subcategory — no children of its own) and confirm the response HTML contains no subcategory-navigation markup, and the page's existing layout (department scroller, filters, product grid) is otherwise identical to before this slice. |
| R8  | Regression | `git diff <base>...HEAD -- CHANGELOG.md` is non-empty and describes this slice. |
| R9  | Regression | `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run format:check` — all four pass. CI on the PR is the authority, not local output. |

## Notes for the validating context

- **No live database write is required for this slice.** #489 already seeded the subcategories and
  generated products this slice needs to exercise R6/R7 against — both dev and staging already carry
  them. Confirm which environment `npm run preview` is pointed at (`.dev.vars`) before trusting a
  live result, same as any DB-touching check.
- This slice does not touch `docs/` or `specs/*.md` prose in a way that risks the KMS MDX traps
  (only this folder's own spec files and `plan.md`'s front-matter), but running
  `npm run kms:validate` after adding `plan.md`'s front-matter is still the fast, correct check.
