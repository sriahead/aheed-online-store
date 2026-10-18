# Quick Shop: one name for the paste-a-list feature, and simpler page copy (requirements / acceptance criteria)

Closes `#1145`. The reasoning is in `plan.md`; the owner's decisions are on the issue. Copy only: no
change to parsing, matching, saving or adding to the cart.

Terms. **Aheed** is `aheed-food-centre` at `http://localhost:8787`; **SriMart** is `srimart` at
`http://srimart.localhost:8787`. Live checks run under `npm run preview` against the dev database,
never `npm run dev`. **Rendered text** means the HTML a request returns, with tags stripped and
`&amp;`/`&#x27;` decoded. **The page** is `/shop-your-list`.

## A. The name

R1. `components/layout/ShoppingListLink.tsx` renders the visible text `Quick Shop` (still hidden
    below `sm`) and `aria-label="Quick Shop"`. Its `href` (`/shop-your-list`), its icon, its classes
    and its position in `Header` (directly after each search bar) are unchanged from
    `origin/staging`, except for the label and text.

R2. The page's `h1` reads exactly `Quick Shop`, and its `metadata.title` is `"Quick Shop"`. Live,
    `curl -s http://localhost:8787/shop-your-list` contains a `<title>` beginning `Quick Shop`.

R3. The `/cart` link to `/shop-your-list` reads `Quick Shop`. The `/account/lists` empty-state link
    to `/shop-your-list` reads `Quick Shop`, and the sentence around it reads
    `Paste a list on Quick Shop, or save your cart or a past order as a list.`

R4. No shopper-visible `Shop your list`, `Shopping List` or `Shopping list` remains. Live, the
    rendered text of each of `/`, `/search`, `/cart` and `/shop-your-list`, on both Aheed and
    SriMart, contains none of those three strings (case-sensitive), and the header link is named
    `Quick Shop`. In source, every hit of `grep -rnE "Shop your list|Shopping [Ll]ist"` over
    `app/(storefront)`, `app/(landing)` and `components` lies inside a comment (`//`, `/* … */` or
    `{/* … */}`, including the continuation lines of a multi-line comment), never in a string literal,
    a JSX text node or an attribute value. The validator reads each hit in its file to decide.

R5. The route is unchanged: `app/(storefront)/shop-your-list/page.tsx` exists at the same path,
    `curl -s -i http://localhost:8787/shop-your-list | head -1` shows status `200`, and
    `/shop-your-list` is still deliberately absent from `app/sitemap.ts` (a comment there says so;
    this slice did not touch the file). Corrected on 2026-10-18 under `#1149`: this line first
    claimed the sitemap listed the route, which it never did.

## B. The page copy

R6. The page renders no intro paragraph between the `h1` and the form. The sentences
    `Paste your shopping list and we'll find each item.` and
    `Nothing goes in your cart until you say so.` do not appear on the page. The second sentence is
    unchanged where it appears on `/account/lists/[listId]`.

R7. The textarea's label is a `<label for="list">` whose text is exactly
    `Paste your list, one item per line.`, so the textarea's accessible name is that sentence.

R8. The quantity hint is one `<p>` authored above the `<textarea>` in
    `components/cart/ShopYourList.tsx`.
    - With an example name `X`, its whitespace-normalised text is exactly
      `Add a number for more than one: 2 X (up to 100 items)`.
    - With no example name, it is exactly
      `Add a number for more than one, like 2 before the item (up to 100 items)`.
    - The `100` is rendered from `MAX_LIST_LINES`, not written as a literal in the component.
    - The strings `Quantities are understood`, `2x` and `x3` no longer appear in the hint.

R9. The submit button reads `Find my items`, and `Finding…` while the match is pending. Nothing
    else in `ShopYourList` changes: the textarea's `placeholder` stays `LIST_PLACEHOLDER`
    (unchanged), and the review step, the save form and its prompt are unchanged.

R10. The example name is still vendor data. Live, Aheed's page hint names one of Aheed's in-stock
     products, and SriMart's names one of SriMart's (or uses the neutral sentence if it has none).
     Neither page contains the other vendor's example. No vendor name or fixed product name is
     added to `components/cart/ShopYourList.tsx`, `components/layout/ShoppingListLink.tsx` or the
     page. `git diff origin/staging` over those three files adds no line matching
     `aheed|srimart|chicken|nugget|grocer|halal` (case-insensitive). A pre-existing comment in the
     page ("fixed grocery list") is not an added line.

## C. Preserving what works

R11. Behaviour is unchanged.
     - `git diff origin/staging --stat` shows no change to `lib/shopping-list.ts`,
       `lib/shopping-list-examples.ts`, `features/cart/match-list.ts`,
       `features/cart/add-list-to-cart.ts`, `features/lists/save-list-from-match.ts`,
       `components/cart/ListReview.tsx` or `lib/list-normalisation.ts`.
     - Live on Aheed in a real browser: pasting two lines, one with a leading quantity (for example
       `2 <an in-stock product name>`), and pressing `Find my items` shows the review step with that
       line at quantity 2. Nothing is added to the cart until the review step's own add button is
       pressed.

R12. The header still fits. Measured with
     `npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path search --widths 360,390,768,1024,1280`:
     - at 1280 the `[data-header-search]` form is at least 603px wide (`#1142`'s measurement);
     - `shoppingList` is at least 44 by 44 at 360 and 390;
     - its `top` is within 2px of `headerSearch.button.top` at every width;
     - `documentScrollWidth <= viewportWidth` at every width.

## D. Tests and the delivery gates

R13. Tests:
     - `tests/header-shopping-list.test.tsx` is edited only to change the expected name from
       `Shopping list` to `Quick Shop`. Every assertion stays, including position, two links and no
       link in the portal.
     - `tests/shop-list-review-copy.test.tsx`'s hint-placement case is edited only to anchor on
       `Add a number for more than one` instead of `Quantities are understood`, and still asserts
       that the hint comes before `<textarea`.
     - A new `tests/quick-shop-copy.test.tsx` mounts `ShopYourList` and asserts R7, both R8 branches
       (with `exampleNames={["Desk Lamp"]}` and `exampleNames={[]}`) and R9's button text.
     - No other file under `tests/` is modified. `tests/shopping-list-examples.test.ts` and
       `tests/shop-your-list-save-prompt.test.tsx` pass unmodified.

R14. `package.json` and `package-lock.json` are byte-identical to `origin/staging`'s. No file under
     `app/`, `components/`, `lib/` or `features/` contains `runtime = "edge"`, and the diff adds no
     `$queryRaw`, `$executeRaw` or `Prisma.sql`, excluding the generated `docs.ts` embed.

R15. Docs:
     - `docs/developer-portal/app-conventions.md`'s sentence listing "the header's Shop, Shop List,
       account and Sign In links" is corrected to the current header: the Quick Shop link sits
       beside the search bar and carries an `aria-label`.
     - Any shopper or staff guide under `docs/shopper-help/`, `docs/staff-playbook/` or
       `docs/store-admin-guide/` that names the feature uses `Quick Shop`
       (`grep -rnE "Shop your list|Shopping List"` over those three folders prints nothing).
     - `npm run kms:validate` prints `invalid front-matter (failing): 0`.
     - `npm run kms:build-index`, `npm run kms:check-generated`, `npm run kms:assemble:internal`
       and a real Next build in `kms/site-internal` exit 0.
     - This slice's `plan.md` contains no bare `<` directly before a digit, and no `{` outside a
       code span.

R16. `CHANGELOG.md` is updated on the branch (Gate 4), naming `#1145`, the new name, the copy, and
     that the URL and behaviour are unchanged. The pull request base is `staging` and its body says
     `Closes #1145`.

R17. `npm run lint`, `npm run typecheck`, `npx vitest run` (alone), `npm run format:check` and
     `npm run build` all exit 0, and CI on the pull request is green.
