# Quick Shop: one name for the paste-a-list feature, and simpler page copy (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. This slice is copy only, so the weight is on rendered output, accessibility names and regression.

1. **Unit Testing** — the component's copy and the header link's name.
2. **Integration Testing** — the header renders the renamed link in both places.
3. **System / End-to-End Testing** — the real page, live, on two vendors.
4. **Regression & Acceptance Testing** — matching and the review step behave as before.
5. **Security & Accessibility Testing** — label-in-name, the textarea's accessible name, tap size.

---

## Setup for the live rows

**Reading the table:** a Markdown table cell cannot hold a bare pipe, so every `\|` in a command below
stands for a single `|` (a shell pipe or a regex alternation). Type it without the backslash.
Commands are written for Git Bash. Pass `--path` without a leading slash under Git Bash (or set
`MSYS_NO_PATHCONV=1`). **Do not use `curl -o /dev/null -w …` here**: on this Windows Git Bash it
exits 43 and prints `000`. Use `curl -s -i <url> | head -1` for a status.

1. `npm ci`, then `npm run db:generate`.
2. Confirm the target is the **dev** database: compare the host in `DATABASE_URL` in `.env` and
   `.dev.vars` with `secrets/staging.vars` and `secrets/production.vars`, by reading single keys
   (`grep '^DATABASE_URL=' <file>`). Never `source` an env file. If it is not dev, stop.
3. Kill any running `node`/`workerd`, then `npm run preview`. Aheed is `http://localhost:8787`, and
   SriMart is `http://srimart.localhost:8787` (curl resolves it; Node's `fetch` does not).
4. Browser rows use a real browser (Claude in Chrome or desktop Chrome). A result inferred from HTML
   does not satisfy a row that says "in a browser".
5. Nothing in this slice writes to any database. Do not run anything against staging or production.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/header-shopping-list.test.tsx` exits 0. Its cases find two links named `Quick Shop`, each with `aria-label="Quick Shop"` and `href="/shop-your-list"`, each the next sibling of a `role="search"` form, none inside the main nav, and none in the portal. `git diff origin/staging -- components/layout/ShoppingListLink.tsx` changes only the `aria-label` value, the visible text and comments. |
| R2  | Unit + Live | `grep -n "Quick Shop" "app/(storefront)/shop-your-list/page.tsx"` shows the `h1` and `metadata = { title: "Quick Shop" }`. Live: `curl -s http://localhost:8787/shop-your-list \| grep -o '<title>[^<]*</title>'` begins `<title>Quick Shop`. |
| R3  | Unit + Live | `grep -n "Quick Shop" "app/(storefront)/cart/page.tsx" "app/(storefront)/account/lists/page.tsx"` shows the cart link and the lists empty-state link. Read the empty-state JSX: its rendered sentence is `Paste a list on Quick Shop, or save your cart or a past order as a list.` Live: `curl -s http://localhost:8787/cart \| grep -c "Quick Shop"` is at least 1. (The lists page needs a signed-in shopper with no saved lists; if one is not available, the source read is the check, reported as such.) |
| R4  | Live + Source | For each of `/`, `/search`, `/cart`, `/shop-your-list` on `http://localhost:8787` and `http://srimart.localhost:8787`: `curl -s <url> \| grep -cE "Shop your list\|Shopping [Ll]ist"` prints `0` (the raw HTML is a superset of the rendered text, so 0 there is sufficient). Then `grep -rnE "Shop your list\|Shopping [Ll]ist" "app/(storefront)" "app/(landing)" components`, and for each hit open the file at that line and confirm it is inside a comment, including a continuation line of a multi-line `/* */` or `{/* */}`. Any hit in a string, JSX text or attribute fails. |
| R5  | Live | `ls "app/(storefront)/shop-your-list/page.tsx"` succeeds. `curl -s -i http://localhost:8787/shop-your-list \| head -1` shows `200`. `grep -n "shop-your-list" app/sitemap.ts` prints a line. |
| R6  | Unit + Live | `curl -s http://localhost:8787/shop-your-list \| grep -cE "we(&#x27;\|')ll find each item\|Nothing goes in your cart"` prints `0`. Read `app/(storefront)/shop-your-list/page.tsx`: no `<p>` sits between the `h1` and the saved-lists block or `ShopYourList`. `grep -n "Nothing goes in your cart until you say so" "app/(storefront)/account/lists/[listId]/page.tsx"` still prints its line, unchanged (`git diff origin/staging --stat` lists that file as unchanged). |
| R7  | Unit + Browser | `tests/quick-shop-copy.test.tsx` asserts `getByLabelText("Paste your list, one item per line.")` returns the `textarea#list`. In a browser on Aheed's `/shop-your-list`, the accessibility tree (Chrome DevTools, or `read_page`) names the textarea `Paste your list, one item per line.` |
| R8  | Unit + Live | `tests/quick-shop-copy.test.tsx` asserts both exact hint strings (with `exampleNames={["Desk Lamp"]}`: `Add a number for more than one: 2 Desk Lamp (up to 100 items)`; with `[]`: `Add a number for more than one, like 2 before the item (up to 100 items)`), comparing whitespace-normalised `textContent`. `grep -n "MAX_LIST_LINES" components/cart/ShopYourList.tsx` shows it used in the hint, and `grep -nE "\b100\b" components/cart/ShopYourList.tsx` prints nothing. `grep -cE "Quantities are understood\|2x \|x3" components/cart/ShopYourList.tsx` prints `0`. `npx vitest run tests/shop-list-review-copy.test.tsx` exits 0 (the hint precedes `<textarea`). Live: `curl -s http://localhost:8787/shop-your-list \| grep -o "Add a number for more than one[^<]*"` prints the hint's first segment. |
| R9  | Unit | `tests/quick-shop-copy.test.tsx` asserts a submit button named `Find my items`. `grep -n "Finding…" components/cart/ShopYourList.tsx` shows the pending label. `git diff origin/staging -- components/cart/ShopYourList.tsx`: the only changed lines are the label, the hint, the button text and comments. The `placeholder={placeholder}` line, the save form and `ListReview` usage are untouched. `npx vitest run tests/shop-your-list-save-prompt.test.tsx tests/shopping-list-examples.test.ts` exits 0, and neither file appears in `git diff origin/staging --stat`. |
| R10 | Live + Source | `curl -s http://localhost:8787/shop-your-list \| grep -o "Add a number for more than one: 2 [^(]*"` names a product. Confirm it is Aheed's: `curl -s "http://localhost:8787/search?q=<that name>" \| grep -c "<that name>"` is at least 1. Repeat on `http://srimart.localhost:8787/shop-your-list`: the hint names a SriMart product or is the neutral sentence, and contains Aheed's example name 0 times. `git diff origin/staging -- components/cart/ShopYourList.tsx components/layout/ShoppingListLink.tsx "app/(storefront)/shop-your-list/page.tsx" \| grep -iE "^\+.*(aheed\|srimart\|chicken\|nugget\|grocer\|halal)"` prints nothing. |
| R11 | Regression + Browser | `git diff origin/staging --stat -- lib/shopping-list.ts lib/shopping-list-examples.ts features/cart/match-list.ts features/cart/add-list-to-cart.ts features/lists/save-list-from-match.ts components/cart/ListReview.tsx lib/list-normalisation.ts` prints nothing. In a browser on Aheed's `/shop-your-list`: note the header cart count, paste two lines, the first `2 <an in-stock product name from /search>`, press `Find my items`, and confirm the review step lists that product at quantity 2 and the cart count is unchanged. Then press the review step's add button and confirm the count rises. Record the cart you leave behind. |
| R12 | Live | `npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path search --widths 360,390,768,1024,1280` (read the JSON; the script measures and does not judge): at 1280, `headerSearch.form.width >= 603`; at 360 and 390, `shoppingList.width >= 44` and `shoppingList.height >= 44`; at every width, `abs(shoppingList.top - headerSearch.button.top) <= 2` and `documentScrollWidth <= viewportWidth`. Record every number. |
| R13 | Regression | `git diff origin/staging --name-status -- tests/` shows exactly `M tests/header-shopping-list.test.tsx`, `M tests/shop-list-review-copy.test.tsx` and `A tests/quick-shop-copy.test.tsx`. Read the two `M` diffs: the header one changes only the expected name literal and comments; the review-copy one changes only the hint anchor string and comments, and keeps both `toBeGreaterThan(-1)` checks and the `toBeLessThan` ordering check. |
| R14 | Regression | `git diff --quiet origin/staging -- package.json package-lock.json` exits 0. `grep -rnE "runtime *= *.edge." app components lib features` prints nothing. For each file in `git diff origin/staging --name-only -- app components lib features`, except `app/(admin)/staff/runbook/docs.ts`, `git diff origin/staging -- <file> \| grep -cE '^\+.*(queryRaw\|executeRaw\|Prisma\.sql)'` prints `0`. |
| R15 | Docs | `grep -n "Shop List" docs/developer-portal/app-conventions.md` prints nothing, and the corrected sentence names the Quick Shop link beside the search bar with its `aria-label`. `grep -rnE "Shop your list\|Shopping List" docs/shopper-help docs/staff-playbook docs/store-admin-guide` prints nothing. `npm run kms:validate` prints `invalid front-matter (failing): 0`. `npm run kms:build-index`, `npm run kms:check-generated` (after committing), `npm run kms:assemble:internal` and `(cd kms/site-internal && npx next build --webpack)` each exit 0. `grep -nE "<[0-9]" specs/2026-10-18-p1145-quick-shop/plan.md` prints nothing. |
| R16 | Gate 4 | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1145`, `Quick Shop`, the copy change, and that the URL and behaviour are unchanged. Once the PR is open, `GH_TOKEN=$(gh auth token -u sriahead) gh pr view <n> --json baseRefName,body` shows base `staging` and `Closes #1145`. |
| R17 | Gate 3 | Stop preview first. One at a time, each alone: `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check`, `npm run build`. A single `.tsx` file that fails under full-suite load but passes alone is the known `#1125` forks-pool flakiness: rerun it alone, record it, and do not count it against this slice unless it is one of this slice's three test files. CI on the PR (`quality.yml`) is the ground truth. |

<!--
  Final step for the validator: record the cart left behind by R11 and the browser's stored
  postcode/fulfilment choice, if any. This slice writes no database rows.
-->
