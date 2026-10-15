# Departments show what they actually sell: hero spotlights and the banner prompt (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice uses three levels:

- **Unit:** the pure selection function and the pure prompt builder.
- **Integration:** a stub-client test of the query shape and a mocked-dependency route test. A real-database script on the runtime HTTP adapter carries the proof a stub cannot give, because a stub only reproduces its author's guess (`CLAUDE.md`).
- **System:** the homepage under `npm run preview` for **two** vendors, because Aheed alone false-positives several checks (`CLAUDE.md`, "Design tokens & per-vendor branding").

Preconditions for the DB rows:

- `.env`'s `DATABASE_URL` is the **dev** database. Diff it against `secrets/staging.vars` and `secrets/production.vars` first; it must match neither.
- The dev database is seeded (`npx prisma db seed`), so `aheed-food-centre` and `srimart` exist with their `#489` subcategories.

Under `npm run preview`:

- Aheed is `http://localhost:8787/`.
- SriMart is `curl -s -H "Host: srimart.localhost:8787" http://127.0.0.1:8787/`. The port in the `Host` header is required; see `docs/developer-portal/local-dev-playbook.md`.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `graft grep "pickDepartmentSpotlights"` (or a text search) shows an `export function pickDepartmentSpotlights` in `lib/repositories/products.ts` and a call to it inside `listCategorySpotlights`. Read the function body: it calls no `prisma`, `fetch` or other I/O. The new test file (`tests/department-spotlights.test.ts`) imports it directly, and `npx vitest run tests/department-spotlights.test.ts` passes. |
| R2  | Integration | `npx vitest run tests/department-spotlights.test.ts` passes. The file must contain a stub-client test that counts calls per method for **1** and for **20** departments (each at most 1 `category.findMany`, 1 `product.groupBy`, 1 `product.findMany`), and a test that an empty department list makes **zero** calls and returns an empty `Map`. Read the test to confirm it asserts those counts, not just "returns a Map". |
| R3  | Integration | In the same test file, a test captures every stub call's arguments and asserts `where.vendorId` equals the caller's vendor on all of them, and `where.isActive === true` on the category lookup and both product queries. Read it, then run it. |
| R4  | Unit + Integration | (1) The unit test for `pickDepartmentSpotlights` has the 10-featured-versus-1-non-featured case and asserts both departments win an entry; it passes. (2) A text search of `lib/` for `SPOTLIGHT_ROWS_PER_CATEGORY` returns nothing. (3) Read `listCategorySpotlights`: no `take:` in any `product.findMany` it issues. (4) R9's script prints `PASS` for its starvation case. |
| R5  | Unit + Integration | The unit test has a department with products only in an active child and asserts the entry is keyed by the department's id with `categoryId` equal to the child's id. R9's script prints `PASS` for its subcategory-only case. |
| R6  | Unit + Integration | Unit or stub tests cover (a) inactive child, (c) inactive product, (d) other vendor (via R3's captured `where`) and the absent-department case. R9's script prints `PASS` for its inactive-child, grandchild and inactive-product cases, each on a **real** database where the filter is executed rather than assumed. |
| R7  | Unit | The unit test asserts: a featured product with an older `createdAt` beats a newer non-featured product in a sibling category of the same department; among two featured products the later `createdAt` wins; and on an exact triple tie the lexicographically lowest `id` wins. R9's script prints `PASS` for its featured-beats-newer case. |
| R8  | Unit | The unit test asserts the `Map`'s keys equal exactly the set of departments with eligible products, and that no child id is a key. `git diff origin/staging -- lib/repositories/products.ts` shows the `CategorySpotlight` interface unchanged. |
| R9  | Integration (real DB) | Check the precondition first: `.env`'s database is dev. Run `npx tsx scripts/verify-department-spotlights.ts fixture` → exit code 0, one `PASS` line per case (starvation, subcategory-only, inactive child, grandchild, inactive product, featured-beats-newer), no `FAIL`. Run it a **second** time → exit 0 again. Read the script: its client is built with `PrismaNeonHttp`, and the cleanup runs in a `finally`. |
| R10 | Integration (real DB) | `npx tsx scripts/verify-department-spotlights.ts expected aheed-food-centre` and `... expected srimart` each exit 0 and print one line per active department. Read the script: the `expected` path has no `create`, `update`, `upsert` or `delete` call. |
| R11 | System | `npm run preview`, then save `curl -s http://localhost:8787/` and `curl -s -H "Host: srimart.localhost:8787" http://127.0.0.1:8787/`. For each vendor, every product name R10 printed appears in the HTML. **HTML-unescape the page first or escape the name**, because `&` and `'` are entity-encoded. Count `Browse the full range.` occurrences in each page: it equals that vendor's number of `(none)` lines from R10. Stop the whole `node`/`workerd` chain afterwards (`CLAUDE.md`). |
| R12 | Unit (read) | `git diff origin/staging -- components/layout/DepartmentHero.tsx` changes only lines inside the fallback branch's `/* … */` comment. Read the new comment: it does not attribute the fallback to a bounded or fetched window. `npx vitest run tests/department-hero.test.tsx` passes unchanged. |
| R13 | Unit (read) | `lib/campaign-image.ts` exports `buildCampaignImagePrompt` with the four parameters in that order. `app/api/admin/campaign-images/generate/route.ts` has no `function buildPrompt` and imports and calls `buildCampaignImagePrompt`. |
| R14 | Unit | `npx vitest run tests/store-description-prompts.test.ts` passes, and its output lists the four `describe.each` cases for a campaign-banner row in addition to the existing three builders. |
| R15 | Unit | A test in `tests/store-description-prompts.test.ts` (or `tests/campaign-image.test.ts`) asserts R15's three negative regexes and the positive assertions (category name, headline, subtitle, `No text`) for `buildCampaignImagePrompt(…, null)`. It passes. |
| R16 | Integration | A route test (for example `tests/campaign-image-generate-route.test.ts`) mocks `requireVendorRole`, the category/campaign reads, `getVendorConfig`, the AI meter, `getImageGenerationService`, `getStorage` and `revalidatePath`. It asserts the `generateImage` prompt's second line for `"Phones & chargers"`, asserts no `The shop describes itself as` line when `getVendorConfig` resolves `null`, and asserts status 200 in both cases. It also asserts `getVendorConfig` was called with the authenticated vendor's id. `npx vitest run <that file>` passes. |
| R17 | Regression | `git diff origin/staging --stat -- prisma/` prints nothing. |
| R18 | Gate 4 | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1096` and `#1030`. |
| R19 | Regression | Each of `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` and `npm run kms:validate` exits 0. Then, **alone** and not straight after the build, run `npx vitest run`: it exits 0 and its summary shows no failed files. Then `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` exits 0. CI (`quality / quality`, `quality / kms`, `docs-gates`) is the ground truth at Validate. |
