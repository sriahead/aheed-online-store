# Storefront browse consolidation (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid
> testing the same behaviour multiple times at different levels unless doing so provides additional
> confidence.
>
> **The Main Principle:**
>
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Before you start

1. **Use `npm run preview`, never `npm run dev`.** Every live row below touches the database.
   Plain `next dev` runs in real Node and cannot load `@prisma/client/wasm`, so a DB-touching route
   silently renders an error state instead of failing loudly.
2. **Do not hardcode a vendor hostname from memory.** Which host resolves which vendor is a
   property of the seed history of the database you are pointed at, not a platform constant. Before
   any `curl -H "Host: ..."` row, query the environment actually under test:
   `npx tsx` a short script calling `prisma.vendorDomain.findMany()` against the same
   `DATABASE_URL` the preview server uses, and use the `host` values it returns. A documented
   hostname that is not seeded locally redirects to `/coming-soon` with no error, which is
   indistinguishable from the feature being broken.
3. **Exclude the generated KMS bundle from every source grep.** `app/(admin)/staff/runbook/docs.ts`
   embeds each document's full body, including this spec's own prose, so it matches searches for
   terms this slice discusses. Append `| grep -v "runbook/docs.ts"` to source-level greps.
4. **Run `npx vitest run` alone**, not alongside a build. Under load its forks pool fails to start
   workers and those files are counted as unhandled errors while the process still exits 0. The
   tell is the file/test total, not the exit code. Baseline before this slice was **115 files /
   1516 tests**; R16 adds at least one file, so expect the total to be higher, never lower.
5. **When grepping rendered HTML, grep the escaped form.** React escapes `&`, `<`, `>` and quotes,
   so a pattern written against the literal source string can return zero for a case that is
   actually working.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit         | `grep -n "export async function listCategoryTreeForStorefront" lib/repositories/categories.ts` returns one line, and reading the body shows `where` containing `vendorId` and `isActive: true`, a `select` naming `id`, `slug`, `name`, `parentId`, `isActive`, and the signature taking `prisma` as its first parameter. |
| R2  | Unit         | `grep -n "listCategoryTreeForStorefront\|listTree" lib/categories-service.ts` shows the import and a member on the object returned by `getCategoryRepository()`. |
| R3  | Unit         | `npm run typecheck` exits 0 with the storefront call site passing rows that carry `slug` and reading `group.parent.slug` **without** a cast — confirm by `grep -n "as CategoryOption\|as unknown as" app/(storefront)/search/page.tsx components/product/ProductFilterForm.tsx` returning nothing. |
| R4  | Integration  | Against `npm run preview`, `curl -s -H "Host: <seeded host>" "http://127.0.0.1:8787/search" > search.html`. Then `grep -c 'name="category"' search.html` is at least 1, `grep -c '<optgroup' search.html` is at least 1, and `grep -o 'value="[a-z0-9-]*"' search.html` includes real category slugs (cross-check two against `prisma.category.findMany()`). `grep -c 'All categories' search.html` is at least 1. The accessible name is present: the `select` is wrapped in a `label` whose visible text renders — confirm the label text appears immediately before the `select` in the markup, the same shape the Price and Search controls already use in that form. |
| R5  | Integration  | Pick a real active department slug `S`. `curl -s -H "Host: <seeded host>" "http://127.0.0.1:8787/search?category=S" > sel.html`, then `grep -o 'value="S"[^>]*selected\|selected[^>]*value="S"' sel.html` matches at least once (React may emit either attribute order; check both). |
| R6  | Unit         | `grep -n 'type="hidden"' components/product/ProductFilterForm.tsx` — no line mentions `name="category"`, and at least one line mentions `name="featured"`. |
| R7  | Regression   | `test ! -f components/product/CategoryDrillDown.tsx` exits 0, and **anchored to code, not to the bare name**: `grep -rn 'from "@/components/product/CategoryDrillDown"\|from "./CategoryDrillDown"\|<CategoryDrillDown' app components features lib \| grep -v "runbook/docs.ts"` returns nothing. **Corrected at Build:** the original row grepped the bare substring and matched `ProductFilterForm.tsx`'s own comment explaining why the component is gone — the grep-trap class `CLAUDE.md` documents. The comment is worth keeping; the check is what was wrong. |
| R8  | Integration  | **Anchored to the call, not the name:** `grep -c "categoryRepo\.listTopLevel()\|await.*listTopLevel()" "app/(storefront)/search/page.tsx"` returns `0`, and `grep -n "categoryRepo.listTree()"` on the same file returns one line. Then compare category call counts against the base branch: `grep -c "categoryRepo\.\|getCategoryRepository()" "app/(storefront)/search/page.tsx"` is less than or equal to `git show origin/staging:"app/(storefront)/search/page.tsx" \| grep -c "categoryRepo\.\|getCategoryRepository()"` (both were **3** at Build — unchanged, as required). **Corrected at Build** for the same reason as R7: the bare `listTopLevel()` pattern matched this slice's own explanatory comment. |
| R9  | Integration  | In `search.html` from R4, the department strip lists only top-level departments — cross-check its entries against `prisma.category.findMany({ where: { parentId: null, isActive: true } })`; no subcategory name appears in the scroller markup. |
| R10 | Integration  | In `search.html`: `grep -c 'href="/bundles"' search.html` is at least 1, `grep -c 'featured=1' search.html` is at least 1 (grep the escaped form — React renders `&` as `&amp;`, so a raw `?featured=1&` pattern can miss a URL that is present and correct), and all four labels are present. The shared component is used by both pages, not copied: `grep -rln "<the collection nav component>" app \| grep -v "runbook/docs.ts"` lists both `app/(storefront)/search/page.tsx` and `app/(storefront)/bundles/page.tsx`. |
| R10a | Integration | **Count the landmark, not the labels:** `grep -o 'aria-label="Collections"' search.html \| wc -l` prints `1`, and the same on `bundles.html` prints `1`. A count of `2` means the nav was placed inside `FilterPanel`'s duplicated branches. **Corrected at Build:** the original row counted the four label strings and expected `1` each. That can never hold against real output — Next embeds an RSC hydration payload carrying the same strings, so the labels legitimately appear 3-5 times on a working page (`All products` is also the `h1`). This is the same "an absence-check against live output can false-positive on the mechanism proving the fix works" class `CLAUDE.md` records for retired hex literals. The `nav` landmark is the thing R10a is actually about, and it appears once. |
| R11 | Integration  | `curl -s -H "Host: <seeded host>" "http://127.0.0.1:8787/bundles" > bundles.html`. The four collection labels from R10 are present, the department strip is present, and `grep -c 'name="minPrice"' bundles.html` is `0` — the product filter form is not rendered there. |
| R12 | Integration  | `grep -ic 'newest' search.html` is at least 1 and the match sits in the page heading area, not only in a product name — confirm by eye in the surrounding markup. `grep -rn "collection=" app components lib \| grep -v "runbook/docs.ts"` returns nothing. |
| R13 | E2E          | Two parts. **Shape:** in `search.html`, `grep -o 'name="category"' search.html \| wc -l` equals the number of rendered form copies (2 — the mobile disclosure and the desktop sidebar), and `grep -c 'type="hidden"[^>]*name="category"' search.html` is `0`. **Behaviour:** request `"http://127.0.0.1:8787/search?category=S"` for the department slug `S` from R5, collect the rendered product ids, and confirm via `prisma.product.findMany` (selecting `categoryId`) that every one belongs to `S`'s own id or one of its children's ids. If the department spans more than one page of results, cross-check the ids actually rendered rather than assuming the whole department fits. |
| R14 | E2E          | Request `"http://127.0.0.1:8787/search"` with no `category`. Confirm the returned product set spans **more than one** `categoryId` (same Prisma cross-reference as R13), proving no category predicate is applied. |
| R15 | Security     | `curl -s -o bad.html -w "%{http_code}" -H "Host: <seeded host>" "http://127.0.0.1:8787/search?category=definitely-not-a-real-slug"` prints `200` (no 404). **Then assert the absence of a CHIP, not the absence of the string:** `grep -o 'Clear all' bad.html \| wc -l` prints `0` — no chips rendered at all — while the same command against a page filtered by a **real** slug prints non-zero, which is the control proving the check can distinguish the two. **Corrected at Build:** the original row expected the slug itself to be absent. It is legitimately present on a correctly-working page — in the "Next page" href (`CARRIED` passes it through, applying nothing), in the RSC payload, and as the `select`'s `defaultValue` (which matches no option, so the control falls back to "All categories"). Counting occurrences would fail a page that is behaving exactly as designed. |
| R16 | Unit         | `npx vitest run <the new test file>` exits 0 and its cases cover: departments returned in input order; each department's children grouped beneath it; and an orphan child (its `parentId` naming a category absent from the list) promoted to its own group rather than dropped. |
| R17 | Regression   | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0. |
| R18 | Acceptance   | `git diff origin/staging -- CHANGELOG.md` is non-empty and describes this slice under `[Unreleased]`. |
| R19 | Regression   | `npm run kms:validate` exits 0 with `invalid front-matter (failing): 0`. `npm run kms:check-generated` exits 0. If it fails on this slice's new `plan.md`, run `npm run kms:build-index` and commit **both** generated files. |
| R20 | Regression   | `npm run lint`, `npm run typecheck` and `npm run format:check` each exit 0, and `npx vitest run` (alone — see note 4) exits 0 with no `Failed to start forks worker` line and a file/test total at or above the recorded baseline. |

## Two-vendor check (mandatory)

Nothing in `lint`, `typecheck` or the test suite renders a second vendor's output, and SriMart's
branding primitives are real, live-differentiated values. Repeat **R4 and R10** against the second
seeded vendor's host — read both hosts from `VendorDomain` per note 2 rather than assuming — and
confirm the category select is populated from **that vendor's own** categories, with no category
belonging to the first vendor appearing in it.

## What this validation deliberately does not do

**It does not verify a bundle category filter, because none exists.** `Bundle` has no `categoryId`
and no facet column, so there is nothing to assert. `plan.md` records why the owner's ask cannot be
satisfied without a schema change. If a future reader is looking for that row, its absence is the
finding, not an omission.

**It does not assert that New Arrivals differs from All products.** They are the same query by
design (`findPage` orders every browse listing newest-first), and R12 checks the page says so
truthfully rather than checking for a difference that would not exist.
