# Orders grid, Quick Shop orders tile and cart Continue shopping (validation)

Run from the repo root on branch `feature/1302-orders-grid-quickshop-cart`. Run `npx vitest run` alone
with `--maxWorkers=4` (CLAUDE.md, "Windows shell"). A storefront render check needs
`npm run preview`, not `npm run dev`; stop the whole `node`/`workerd` chain afterwards.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/quick-shop-hub.test.tsx --maxWorkers=4` passes; its tile test asserts five hrefs, the first four in the old order, the fifth `/account/orders`, label "Your orders". |
| R2  | Unit | Same file: a test asserts the heading paragraph text equals the R2 sentence exactly and does not match `/Four\|Five/`. |
| R3  | Unit | `grep -n "package" components/icons/registry.ts` shows the key; `git diff origin/staging --stat -- components/icons` prints nothing; `npm run icons:build` leaves `git status` clean. |
| R4  | Unit | `npx vitest run tests/orders-list-grid.test.tsx --maxWorkers=4` passes; its test renders the page with 3 orders and asserts the `<ul>` className contains `grid`, `sm:grid-cols-2`, `xl:grid-cols-3`. |
| R5  | Unit | `npx vitest run tests/page-container.test.ts --maxWorkers=4` passes; `grep -n "account/orders/page.tsx" tests/page-container.test.ts` shows `width: "wide"`. |
| R6  | Unit | Same new test: for each rendered card, the anchor with href `/account/orders/<n>` has text including the order number, date, status badge, preview, item count and total. |
| R7  | Unit | Same test: each card has two forms; the first has a hidden `orderNumber` and a button "Reorder items", the second hidden `orderNumber`, hidden `from`=`orders-list` and a button "Save as list". |
| R8  | Unit | Same test: `container.querySelectorAll("a form, a button")` has length 0. |
| R9  | Unit | `npx vitest run tests/save-list-actions.test.ts --maxWorkers=4` passes; new cases call the action with `from=orders-list` and assert the three redirect targets. |
| R10 | Unit | Same file: the existing `/account/orders/AH-1001?list=saved` case still passes, plus a case with `from=anything-else` asserting the detail-page target. |
| R11 | Unit | New orders-list test renders `?list=saved`, `capped`, `empty`, `bogus` and asserts the three `role="status"` texts and none for `bogus`. |
| R12 | Unit | New orders-list test asserts `<li>` has `flex`, the card `flex-1`, the action row `mt-auto`, the preview `line-clamp-2` and not `truncate`. Visual: in `npm run preview`, at widths 390, 800 and 1400 px the page shows 1, 2 and 3 columns, with buttons aligned along each row's bottom edge. |
| R13 | Unit | `npx vitest run tests/cart-continue-shopping.test.tsx --maxWorkers=4` passes; it renders the page with an empty summary and one with lines and asserts an anchor `href="/categories"` with text "Continue shopping" in both. |
| R14 | Diff | `git diff origin/staging --stat -- components/cart` prints nothing. |
| R15 | Diff | `git diff origin/staging --stat -- features/orders/reorder-items.ts "app/(storefront)/account/orders/[orderNumber]/page.tsx"` prints nothing. |
| R16 | Diff | `git diff origin/staging --stat -- prisma package.json package-lock.json` prints nothing. |
| R17 | Unit | `npx vitest run tests/vendor-neutral-copy.test.ts --maxWorkers=4` passes; read the diff of the five source files and confirm no vendor or grocery word was added. |
| R18 | Unit | Temporarily revert one source change at a time (tile, grid class, `from` branch, cart link) and confirm the matching test fails; restore afterwards and confirm `git status` is clean. |
| R19 | Docs | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1302`. |
| R20 | CI | `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4`, `npm run format:check`, `npm run kms:validate`, `npm run kms:coverage`, `npm run kms:check-generated` all exit 0. |
