# Departments show what they actually sell: hero spotlights and the banner prompt (requirements / acceptance criteria)

This closes `#1096` (the homepage department spotlight starves and ignores subcategories) and
`#1030` (the AI campaign-banner prompt hardcodes "UK grocery store"). These are "Club B" from the
owner's 2026-10-13 user-testing pass, approved at Gate 1 on 2026-10-14. One-line version of
`plan.md`: each department is judged on its own products and its active direct subcategories'
products, in a fixed three queries, and the banner prompt quotes the vendor's own description.
No schema change. Where this file says **department**, it means a top-level `Category` (one with
`parentId` null) passed to `listCategorySpotlights`. **Its categories** means that department plus
its **active direct children** (`isActive: true`, `parentId` equal to the department's id).

## `#1096`: department spotlights

R1. `lib/repositories/products.ts` exports a pure function `pickDepartmentSpotlights` that takes
    the per-category group rows and the category-to-department map and returns, for each
    department, the winning `(categoryId, isFeatured, createdAt)` triple. The function performs no
    I/O. `listCategorySpotlights` uses it to decide winners.

R2. `listCategorySpotlights` issues **at most three** Prisma calls per invocation: at most one
    `category.findMany`, at most one `product.groupBy` and at most one `product.findMany`. This
    holds identically for 1 department and for 20 departments. It issues **zero** calls when
    given an empty list of departments, and then returns an empty `Map`.

R3. Every Prisma call `listCategorySpotlights` issues carries the caller's `vendorId` in its
    `where`. Every product query also carries `isActive: true`. The category lookup also carries
    `isActive: true`.

R4. **No starvation.** Department A has 10 active featured products and department B has exactly
    1 active non-featured product, all with `createdAt` later than B's. The returned `Map` then has
    an entry for **both** A and B. `SPOTLIGHT_ROWS_PER_CATEGORY` no longer exists, and no
    `product.findMany` in `listCategorySpotlights` passes `take`.

R5. **Subcategory products count.** A department with no active products of its own, but at least
    one active product in an active direct child, gets an entry in the `Map`. That entry is a
    product from the child, keyed by the **department's** id. Its `categoryId` field is the
    child's id.

R6. **Exclusions.** These are never returned as any department's spotlight:
    (a) a product in an **inactive** child category;
    (b) a product in a grandchild category, whether that grandchild is active or not;
    (c) an inactive product;
    (d) a product belonging to another vendor.
    A department whose categories hold none of the eligible products is **absent** from the `Map`.

R7. **Ordering rule, unchanged from P8.5b.** Within a department's categories, a featured product
    beats any non-featured one regardless of `createdAt`. Among equally featured candidates, the
    latest `createdAt` wins. If several products share the winning `(categoryId, isFeatured,
    createdAt)` exactly, the one with the lexicographically lowest `id` wins.

R8. The returned `Map`'s keys are department ids only. A child category's id is never a key. The
    `CategorySpotlight` interface's fields are unchanged.

R9. **Real-database proof on the runtime adapter.** `npx tsx scripts/verify-department-spotlights.ts fixture`
    exits 0. The script uses `.env`'s database, which must be DEV, through a client built with
    `PrismaNeonHttp` (the adapter `getPrisma()` uses at runtime). It creates a throwaway vendor
    whose fixtures reproduce R4, R5, R6(a), R6(b) and R6(c), plus an R7 featured-beats-newer case,
    calls the real `listCategorySpotlights` against it, and prints one `PASS` line per case. It
    deletes every row it created before exiting, including when a check fails, and a second
    consecutive run also exits 0.

R10. **Read-only expectation mode.** `npx tsx scripts/verify-department-spotlights.ts expected <vendor-slug>`
     writes nothing. It prints, for each active department of that vendor in `sortOrder`, either
     the spotlight product name `listCategorySpotlights` returns or `(none)`.

R11. **Live page, two vendors.** Under `npm run preview`, the homepage HTML of the Aheed dev vendor
     and of the SriMart dev vendor each contains the spotlight product name of every department
     that R10's `expected` mode lists with a product. Each also contains exactly as many
     `Browse the full range.` fallbacks as R10 lists `(none)` departments for that vendor.

R12. `components/layout/DepartmentHero.tsx`'s fallback-branch comment no longer says the department
     fell outside a "bounded window". The component's rendered markup is otherwise unchanged:
     `git diff origin/staging -- components/layout/DepartmentHero.tsx` touches only comment lines.

## `#1030`: campaign banner prompt

R13. `lib/campaign-image.ts` exports a pure function `buildCampaignImagePrompt(categoryName,
     headline, subtitle, storeDescription)` that returns newline-separated lines.
     `app/api/admin/campaign-images/generate/route.ts` no longer defines its own prompt builder and
     calls `buildCampaignImagePrompt` instead.

R14. `tests/store-description-prompts.test.ts`'s `BUILDERS` table contains a campaign-banner row
     built from `buildCampaignImagePrompt`. All four existing per-builder assertions pass for it:
     (a) with no description, the prompt says nothing about groceries or South Asian food;
     (a) with no description, it adds no description line;
     (b) a description is quoted as the second line;
     (c) a multi-line, quoted description stays on one line.

R15. For a `null` description, `buildCampaignImagePrompt`'s output matches none of
     `/grocer/i`, `/\bUK\b/` or `/appetis/i`. It still contains the category name and every
     non-blank headline and subtitle, and still instructs no text, words or logos (the substring
     `No text`).

R16. The route passes the requesting vendor's own `VendorConfig.storeDescription`, read with
     `getVendorConfig(auth.vendorId)`, into `buildCampaignImagePrompt`. A route test with mocked
     dependencies shows that a vendor whose description is `"Phones & chargers"` produces a
     `generateImage` call whose prompt's second line is
     `The shop describes itself as: "Phones & chargers"`. A vendor with no config row
     (`getVendorConfig` returns `null`) produces a prompt with no description line. In both
     cases the status is 200.

## Gates

R17. No schema or migration change: `git diff origin/staging --stat -- prisma/` prints nothing.

R18. `CHANGELOG.md` updated (Gate 4).

R19. `npm run lint`, `npm run typecheck`, `npx vitest run` (run alone), `npm run format:check`,
     `npm run build` and `npm run kms:validate` all remain green after this slice. So do
     `npm run kms:assemble:internal` and a real Next build in `kms/site-internal`.
