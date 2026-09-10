# Bundles page layout parity (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
>
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

---

## Before you start

**Use `npm run preview`, never `npm run dev`.** Every row below that fetches a page touches Prisma
(see `CLAUDE.md`, Database).

This slice is a page-layout change with no new logic — no pure function needs a unit test the way
the browse-discovery-completion slice's pack-size parser did. Every row below is Integration or E2E
against real rendered HTML, plus the standard release gates.

Resolve at least one bundle's existence from Prisma before fetching `/bundles`, so the non-empty
grid case (R4) is provable rather than accidentally exercising the empty-case branch (R5).

---

## Validation Steps

| Req | Testing Area  | How to verify |
| --- | ------------- | -------------- |
| R1  | Integration   | `grep -n -A2 'flex flex-col gap-6 md:flex-row' "app/(storefront)/bundles/page.tsx"` shows the wrapper, and reading the file confirms exactly two child `<div>`s inside it — one `md:w-60 md:shrink-0`, one `flex-1`. |
| R2  | Integration   | Read the `md:w-60 md:shrink-0` column's JSX: it renders `<CollectionNav ... />` and nothing else. `grep -c "FilterPanel" "app/(storefront)/bundles/page.tsx"` prints `0`. |
| R3  | Integration   | `grep -n "DepartmentScroller" "app/(storefront)/bundles/page.tsx"` shows it above and outside the two-column wrapper, same props (`categories`, `activeSlug={null}`) as before. |
| R4  | E2E           | With at least one available bundle in the database, `curl -s -H "Host: $AHEED_HOST" http://127.0.0.1:8787/bundles -o bundles.html`, then `grep -oE '<ul class="[^"]*"' bundles.html` (the non-empty-case grid) shows `grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4` and not `grid-cols-1`/`lg:grid-cols-3`. |
| R5  | E2E           | Confirm behaviour is unchanged when no bundle is available: temporarily deactivate every bundle (or filter to a vendor/state with none) and confirm `bundles.html` still renders "No bundles are available right now." inside the right column. Revert any DB change made to force this. |
| R6  | Regression    | `git diff origin/staging -- components/bundle/BundleCard.tsx components/bundle/BundleRow.tsx` is empty. |
| R7  | Regression    | `git diff origin/staging -- lib/bundles-service.ts lib/repositories/bundles.ts lib/bundle-pricing.ts prisma/schema.prisma` is empty. |
| R8  | Accessibility | Against `bundles.html`: `grep -c 'aria-label="Collections"' bundles.html` prints exactly `1`. |
| R9  | Regression    | `git diff --name-only origin/staging` contains no `prisma/schema.prisma` and no path under `prisma/migrations/`, and `git status --porcelain prisma/` is empty. |
| R10 | Release       | `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run format:check` each exit 0. |
| R11 | Release       | `git diff origin/staging -- CHANGELOG.md` is non-empty and names `#701`. |
