# Search category select removal (validation)

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

Resolve at least one real category slug from Prisma before fetching R7/R4's rows, so the "still
narrows results" and "survives Apply" claims are checked against a real predicate rather than a
guess.

---

## Validation Steps

| Req | Testing Area  | How to verify |
| --- | ------------- | -------------- |
| R1  | Integration   | `grep -c 'name="category"' components/product/ProductFilterForm.tsx` — expect `1` (the hidden input, not a `<select>`). `grep -c '<select name="category"'` prints `0`. Live: fetch `/search`, confirm no `<select name="category"` anywhere in the saved HTML. |
| R2  | Integration   | `grep -c "toCategoryOptionGroups\|StorefrontCategoryNode" components/product/ProductFilterForm.tsx` prints `0`. `npx tsc --noEmit` exits 0. |
| R3  | Integration + E2E | Read the hidden-field JSX directly. Live: `curl -H "Host: $AHEED_HOST" "http://127.0.0.1:8787/search?category=<slug>"` → saved HTML contains `<input type="hidden" name="category" value="<slug>"` (both form renders); a plain `/search` fetch (no `category` param) contains no such hidden input at all. |
| R4  | E2E           | Resolve a real category slug. Using the curl-driven form-submission technique (`CLAUDE.md`, "Live-testing staff panel server actions without a browser" — though this is a plain GET form, not a server action, so a direct `curl -G` reproducing the form's own field set is enough): submit the panel's GET form with `category=<slug>` and `minPrice=1` both present, confirm the resulting fetch still narrows to that category **and** applies the price filter — not just one or the other. |
| R5  | Integration   | `grep -n "listTopLevel\|listTree" "app/(storefront)/search/page.tsx"` shows `listTopLevel()`, not `listTree()`. `grep -c "categories={categoryTree}" "app/(storefront)/search/page.tsx"` prints `0`. |
| R6  | E2E           | Fetch `/search` under `npm run preview`; the department strip renders the same top-level department set as `categoryRepo.listTopLevel()` run directly against the same `DATABASE_URL`. If a recovery/suggestions notice is reachable in this dataset (a zero- or weak-result query), confirm its category links resolve the same way. |
| R7  | E2E           | Resolve a real category slug from Prisma, then `curl -s -o cat.html -w "%{http_code}\n" -H "Host: $AHEED_HOST" "http://127.0.0.1:8787/search?category=<slug>"` prints `200`; cross-check every returned product's `categoryId` against Prisma; `grep -oE 'aria-label="Remove filter: [^"]*"' cat.html` shows a category chip present. |
| R8  | Regression    | `git diff origin/staging -- "app/(storefront)/categories/[slug]/page.tsx"` is empty. |
| R9  | Regression    | `git diff origin/staging -- lib/catalogue-form.ts components/staff/ProductForm.tsx "app/(admin)/staff/products/page.tsx"` is empty. |
| R10 | Regression    | `git diff --name-only origin/staging` contains no `prisma/schema.prisma` and no path under `prisma/migrations/`, and `git status --porcelain prisma/` is empty. |
| R11 | Release       | `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run format:check` each exit 0. |
| R12 | Release       | `git diff origin/staging -- CHANGELOG.md` is non-empty and names `#704`. |
