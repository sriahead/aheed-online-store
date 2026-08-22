# P8.x Shop Your List Improvements (validation)

| Req | How to verify |
|-----|---------------|
| R1  | Run `npm test` and verify that new unit tests for partial-match fallback pass in `tests/shopping-list.test.ts`. Specifically, a line like "chicken breast 500g" should result in an ambiguous resolution containing "Halal Chicken Breast". |
| R2  | Run `npm run dev`, open the browser to the home page, and visually confirm there is a "Shop your list" option beside the search bar in the header. |
| R3  | Run `npm run dev`, open the cart popover, add an item if empty, click "View full cart" or "Proceed to checkout". Verify the cart popover closes and doesn't obscure the newly loaded page. |
| R4  | `git diff CHANGELOG.md` shows the new entry. |
| R5  | `npm run sdd:preclear` exits 0. |
