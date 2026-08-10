# P3d — Shop your list (validation)

Parsing, matching and ranking are pure, so R1–R11 and R17 are proven by
`npx vitest run tests/shopping-list.test.ts` with **no database**. Anything touching Prisma or the
cart runs on **`npm run preview`** (OpenNext + local Workers/Miniflare) — **never `npm run dev`**,
which runs in real Node, cannot load `@prisma/client/wasm`, and silently renders an error state
instead of failing (see `CLAUDE.md`).

Seeded catalogue names this slice's fixtures and live checks rely on (`prisma/seed.ts`):
*Apples*, *Bananas*, *Sourdough Loaf*, *Croissants*, *Whole Milk*, *Free Range Eggs*,
*Halal Chicken Breast*, *Halal Lamb Mince*, *Basmati Rice 5kg*, *Sunflower Oil 2L*,
*Coconut Milk*, *Harissa Paste*, *Orange Juice 1L*, *Mint Tea, box of 40*, *Mixed Nuts 500g*,
*Date Bites, pack of 6*.

**Reference list** used by the live checks below — paste this verbatim into `/shop-your-list`:

```
2x chicken breast
5kg basmati rice
milk
bannanas
apples x 3
```

Expected review: *Halal Chicken Breast* qty 2 (matched) · *Basmati Rice 5kg* qty 1 (matched,
**not** qty 5) · `milk` ambiguous offering *Whole Milk* and *Coconut Milk* · `bannanas` unmatched ·
*Apples* qty 3 (matched).

| Req | How to verify |
|-----|---------------|
| R1  | `grep -nE "getPrisma\|@prisma/client\|fetch\(\|cookies\(\|headers\(" lib/shopping-list.ts` returns nothing (exit 1). `npx vitest run tests/shopping-list.test.ts` exits 0 with no `DATABASE_URL` set in the environment. |
| R2  | Unit test: `parseListLine("apples")` returns `{ quantity: 1, terms: ["apples"] }`; `parseListLine("")`, `parseListLine("   ")` and `parseListLine(",,,")` each return `null`. |
| R3  | Unit test asserts `quantity === 2` for all five forms: `"2 apples"`, `"2x apples"`, `"2 x apples"`, `"apples x2"`, `"apples x 2"`, plus `"2X apples"` for case-insensitivity. `parseListLine("apples")` asserts `quantity === 1`. |
| R4  | Unit test: `parseListLine("5kg basmati rice")` → `quantity === 1` and `terms` includes `"5kg"`; `parseListLine("2 apples")` → `quantity === 2`; `parseListLine("2x 5kg basmati rice")` → `quantity === 2` and `terms` includes `"5kg"`. Also `parseListLine("2L sunflower oil")` → `quantity === 1`. |
| R5  | Unit test: `parseListLine("Mint Tea, box of 40").terms` deep-equals `["mint","tea","box","of","40"]` — asserting exact array equality proves no empty tokens and no trailing comma survived. |
| R6  | Unit test: `parseListLine("1000 apples").quantity === 99`; `parseListLine("0 apples").quantity === 1`; `parseListLine("99 apples").quantity === 99`. |
| R7  | Unit test: `parseList("a\n\n b \n\nc").length === 3`; `parseList(Array(150).fill("apples").join("\n")).length === 100`; each returned line exposes its original text (assert the first line's original text equals `"2x chicken breast"` for the reference list). |
| R8  | Code inspection of the new method in `lib/repositories/products.ts`: a single `prisma.product.findMany` (no loop, no `Promise.all` over terms) whose `where` contains `vendorId`, `isActive: true`, and an `OR` of `{ name: { contains, mode: "insensitive" } }`, with `take: 200`. `grep -n "description" ` within that method returns nothing. That it is one query for the whole list (not one per line) is proven structurally: the method's signature takes the terms for **all** lines at once, and `grep -rn "<method name>" app/ features/ components/` shows exactly one call site, not a call inside a loop or `Promise.all`. |
| R9  | Unit test against a fixture candidate set of the seeded names: each line resolves to exactly one of `matched`/`ambiguous`/`unmatched`, and a line whose terms are `["chicken","breast"]` does **not** match *Halal Lamb Mince* (proving all-terms AND, not any-term OR). |
| R10 | Unit test: shuffling the candidate array and re-running produces an identical result (determinism); a fixture containing both *Milk* and *Whole Milk* with the line `milk` resolves `matched` to *Milk* by exact-name equality despite *Whole Milk* also containing the term; an ambiguous line given 9 containing candidates returns exactly 5. |
| R11 | Unit test asserts precisely: `chicken breast` → `matched` *Halal Chicken Breast*; `milk` → `ambiguous` with candidates containing both *Whole Milk* and *Coconut Milk*; `bannanas` → `unmatched`. |
| R12 | `npm run preview`, open `/shop-your-list` → the entry control renders (HTTP 200). From `/cart`, a visible link navigates to `/shop-your-list` without typing the URL. |
| R13 | `npm run preview` in a browser profile with **no** `aheed_cart` cookie (clear site data first). Paste the reference list, submit for matching, stop at the review screen. Then: `document.cookie` in DevTools contains no `aheed_cart`, and `npx prisma studio` (or a `tsx` script) shows **no** new `Cart` row for this vendor. Re-check after a page refresh. |
| R14 | On the review screen for the reference list, confirm visually against the "Expected review" block above — five rows in input order, each showing its original text and parsed quantity, `milk` offering a chooser, `bannanas` explicitly flagged as no match. For the unavailable case: set one matched product's `Inventory.quantity` to 0, re-submit, and confirm that line renders as unavailable and is excluded from the add count. |
| R15 | `grep -n "addItems" lib/repositories/cart.ts` shows the method on the `CartRepository` interface and its implementation; code inspection confirms one `ensureCart` call and one `$transaction` wrapping all writes. `grep -rn "addItem(" features/cart/add-list-to-cart.ts` returns nothing (no per-line loop in the feature layer). |
| R16 | `grep -n "effectiveStock\|clampQuantity" lib/repositories/cart.ts` shows both used inside `addItems`; reading the `addItems` body shows no independent `Math.min`/comparison arithmetic on quantity outside those helpers. |
| R17 | Unit test on the pure helpers plus a live check on `npm run preview`: add *Apples* to the cart normally (qty 1), then submit a list containing `apples x 2` and complete the add → the cart shows *Apples* at qty **3**. Set a product's `Inventory.quantity` to 0, include it in a list, complete the add → no `CartItem` row exists for it (not a row at quantity 0). Set a product's stock to 2 and submit `x 5` → the line lands at qty 2, not 5. |
| R18 | `head -1 features/cart/add-list-to-cart.ts` is `"use server";`. `grep -n "revalidateCartSurfaces" features/cart/add-list-to-cart.ts` matches. Live on `npm run preview`: from a browser with no cart cookie, completing the add sets `aheed_cart` **and** updates the header badge count without a manual refresh. |
| R19 | `grep -rn "getPrisma\|@prisma/client" features/cart/ "app/(storefront)/shop-your-list/"` returns nothing (exit 1). `npm run lint` exits 0. |
| R20 | On `npm run preview` with SriMart's host mapped (see `docs/env-setup.md`), submit a list of Aheed-only product names on the SriMart host → every line resolves `unmatched`; submit SriMart product names → they match. Confirm the resulting `Cart`/`CartItem` rows carry SriMart's `vendorId`. `grep -n "getCurrentVendorId" lib/repositories/products.ts` shows the existing seam in use, and no literal vendor UUID appears in the new method. |
| R21 | Unit test on the pure reducer: lines `apples` + `2x apples` produce one entry `{ productId: <apples>, quantity: 3 }`, not two entries. Live on `npm run preview`: submit a list containing both lines, complete the add, and confirm the cart shows *Apples* once at qty 3 and that exactly one `CartItem` row exists for it. |
| R22 | On `npm run preview`, intercept the review form submission in DevTools and replace a `productId` with (a) a valid product id belonging to the **other** vendor and (b) a random UUID. In both cases the add completes without error and **no** `CartItem` row is created for that id — verify in the DB, not just the UI. `grep -n "stockMap" lib/repositories/cart.ts` shows `addItems` resolving stock through it, and that `stockMap`'s `where` still carries `vendorId: vid`. |
| R23 | `npm run kms:validate` exits 0. `npm run kms:build-index` then `git status --porcelain ARTIFACT_INDEX.md` produces no output (index unchanged by a rebuild), and `grep -n "p3d-shop-your-list" ARTIFACT_INDEX.md` matches. |
| R24 | `git diff origin/staging -- CHANGELOG.md` shows a new entry for this slice referencing #114. `npm run sdd:preclear` exits 0 (it checks the CHANGELOG diff vs base, all four spec files, and a clean tree). |
| R25 | `npm run lint`, `npm run typecheck`, `npm run test`, `npm run format:check` each exit 0; `npm run build` completes. **CI on the PR is ground truth, not local output** — the `gates` check must be green before this slice is considered validated. |
