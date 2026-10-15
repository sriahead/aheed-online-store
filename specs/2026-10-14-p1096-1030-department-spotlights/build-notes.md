# Departments show what they actually sell: hero spotlights and the banner prompt (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

Built in the main checkout (`E:\GitRepositories\aheed-online-store`), not a worktree. Branch
`feature/p1096-1030-department-spotlights`, cut from `origin/staging` at `795f5ed`. Commits: spec
`f96826e`, implementation `e2bc57a`, then this file plus `CHANGELOG.md`. Both issues are
`In Progress` on Project #2.

## What changed and why

**`#1096`: `lib/repositories/products.ts`**

- `SPOTLIGHT_ROWS_PER_CATEGORY` and `#346`'s single global-`take` query are gone.
  `listCategorySpotlights` now makes three calls, at most one each, and none when it is given no
  departments:
  1. `category.findMany` for the active direct children of the departments.
  2. `product.groupBy` by `categoryId` and `isFeatured`, with the maximum `createdAt` per group.
  3. `product.findMany` for the winners' exact `(categoryId, isFeatured, createdAt)` triples,
     ordered by `id` ascending, so the first row per department wins an exact tie.
- All three calls carry `vendorId` and `isActive: true`.
- The selection rule is the new exported pure `pickDepartmentSpotlights(groups, departmentOf)`,
  along with the exported `SpotlightGroup` type. `CategorySpotlight` is unchanged.
- The doc comment on `listCategorySpotlights` records why three queries replace `#346`'s one.
- `components/layout/DepartmentHero.tsx`: only the fallback branch's comment changed. Markup is
  untouched.

**`#1030`: banner prompt**

- `lib/campaign-image.ts` gains `buildCampaignImagePrompt(categoryName, headline, subtitle,
  storeDescription)`, which returns three lines, or two with no description:
  1. "Photographic marketing banner for a shop's `<subject>`."
  2. `storeDescriptionPromptLine(...)`, present only when the vendor has a description.
  3. A neutral style line ending "No text, no words, no logos."
- `app/api/admin/campaign-images/generate/route.ts`:
  - drops its private `buildPrompt`;
  - adds `getVendorConfig(auth.vendorId)` (from `lib/vendor-service.ts`) to the existing
    `Promise.all` of category and campaign reads, after the role check and before the budget check;
  - passes `config?.storeDescription ?? null` to the new builder.

**Tests and script**

- `tests/department-spotlights.test.ts` (new) has two parts:
  - unit tests of `pickDepartmentSpotlights` (R4, R5, R7, R8 and the ineligible-group case);
  - `listCategorySpotlights` against an in-memory double that applies the queries' filters
    (R2 call counts for 0, 1 and 20 departments; R3 scoping; no `take` on `product.findMany`), plus
    one end-to-end case combining starvation, subcategory, grandchild, inactive child, inactive
    product, other vendor and exact tie.
- `tests/store-description-prompts.test.ts`: a "campaign banner" `BUILDERS` row (R14), plus an
  R15 block with the negative regexes and the positive content checks.
- `tests/campaign-image-prompt-route.test.ts` (new): R16. The description appears as line 2 for
  `"Phones & chargers"`, there is no description line for a `null` config, the status is 200 both
  times, and `getVendorConfig` is called with the session vendor.
- `tests/ai-image-routes-budget.test.ts`: added a `vi.mock("@/lib/vendor-service")`. That test
  imports the same campaign route, which now reads vendor config; without the mock it would reach a
  real `getPrisma()`.
- `scripts/verify-department-spotlights.ts` (new) has two modes:
  - `fixture` (R9): HTTP adapter for the code under test, WebSocket adapter for fixture writes.
    It removes leftovers whose slug starts with `p1096-fixture-` both before and after the checks,
    the latter in `finally`.
  - `expected <vendor-slug>` (R10): read-only.

## Decisions taken during the build

- **Two sibling categories tie on both flag and instant:** `pickDepartmentSpotlights` keeps the
  group with the lexicographically lower `categoryId`. The spec's R7 tie-break (lowest product
  `id`) applies only to products sharing one exact triple. A cross-sibling tie needed a stable rule
  too, and this one costs no extra query.
- **`groupBy` rows with a null `_max.createdAt` are dropped before picking.** That cannot happen
  for a non-empty group; the guard exists only to satisfy the type.
- **The fixture uses 7 departments and 30 featured products in department A.** The old window was
  `7 × 4 = 28`, so the fixture genuinely starves under the old code, not just in theory.
- **`expected` mode reads `.env` only and has no `--env-file` flag.** The owner declined a
  production measurement at Spec, so the script has no read path to staging or production.
- **Debatable choice:** the route test gives the mocked `getVendorConfig` a deliberately loose
  return type (`Promise<unknown>`), so the test can resolve a config row or `null` without building
  a full `VendorConfig`.

## Deviations from the spec

None. The fixture script prints one more `PASS` line than R9 lists ("keys are departments only",
R8's property on a real database). That is additive, not a change.

## Known-shaky areas

- **Timestamp equality across the adapter.** Query 3 matches `createdAt` against the value
  `_max.createdAt` returned from query 2. That works only if both round-trip at the same precision.
  It was proven on dev over `PrismaNeonHttp` (the `fixture` run below), but only there. Prisma's
  default `DateTime` is `timestamp(3)`, so this should hold anywhere, but no other environment has
  been exercised.
- **Dev data does not reproduce the starvation.** Running `expected aheed-food-centre` against the
  **old** `products.ts` (swapped in temporarily and then restored, never committed) gave every one
  of the 13 dev departments a spotlight. Only **Beverages** differs between old and new: "Mint Tea,
  box of 40" becomes "Sparkling Water 6 x 1L", because a subcategory product now counts. SriMart's
  two departments are identical old and new. **The starvation fix is proven only by the `fixture`
  run**, which fails 5 of 7 checks on the old code: starvation, subcategory-only, grandchild,
  inactive product and featured-beats-newer.
- **R11's name check could be fooled.** It checks that a product name appears anywhere in the
  homepage HTML. The landing page renders only the hero and trust strip (P8.5f), so a name should
  not appear elsewhere, but confirm the names sit inside the `Department spotlight` region if in
  doubt.
- **Local full-suite runs flake (`#1037`).** Two consecutive `npx vitest run` calls on this branch:
  - The first reported 10 failed files and 12 failed tests, and I did not capture which.
  - The second reported only `tests/storefront-chrome-rewards-gate.test.tsx` (2 tests, "Test timed
    out in 5000ms"). That file passes alone, both on this branch and with the changes stashed. This
    slice does not touch it.

  CI is the ground truth. If CI is red, check which files failed before assuming flake.
- **Measured at Build (dev database, `.env` and `.dev.vars` both `ep-dry-morning`, which matches
  neither `secrets/staging.vars` nor `secrets/production.vars`):**
  - `fixture` printed 7 `PASS` lines and exited 0; a second run also exited 0.
  - Under `npm run preview`, the Aheed (`localhost:8787`) and SriMart
    (`Host: srimart.localhost:8787`) homepages contained every name `expected` printed: 13 for
    Aheed, 2 for SriMart. Both had zero `Browse the full range.` fallbacks, matching `expected`'s
    zero `(none)` lines.

  Validate must repeat these rather than trust them.
- **Stopping preview with `Stop-Process` on all `node` processes also kills the graft MCP server**
  for the Claude Code session. Reconnect it with `/mcp` afterwards.
