# #958, #959 — Mobile checkout (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice is UI and accessibility work with no schema or server change. Unit tests cover the two
pieces of logic that can regress silently: the token list (R6) and the section numbering (R12).
Everything about layout is measured live at real phone widths with
`scripts/verify-mobile-layout.ts` (headless Chrome, `mobile: true`). The street-suggestion
interaction is checked once by hand in desktop Chrome, because it needs typing and a server lookup.

## Before you start

1. `npm run preview` is running, with no stale `node`/`workerd` chain from an earlier run (see
   CLAUDE.md, "Windows shell & local development"). Both `http://localhost:8787` and
   `http://srimart.localhost:8787` load.
2. Run the script from **Git Bash** or PowerShell. In Git Bash, pass paths without a leading slash
   (`categories/fruit-veg`, `checkout`).
3. Shorthands from `requirements.md`: **`M`**, **Aheed checkout run** and **SriMart checkout run**.
   For example, an Aheed checkout run at 390 is:
   `npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path categories/fruit-veg --add-first --then checkout --widths 390`
4. Each script run starts a fresh guest profile, so it never sees a postcode cookie, a signed-in
   session or loyalty points.
5. For a vendor's `offerCollection` and `offerDeliverySlots` (R14, R15), read them from the page
   itself: the Fulfilment Method section appears only when collection is offered, and "Choose a
   Time" appears under Delivery only when slots are on. If unsure, query `VendorConfig` for that
   vendor through `npx prisma studio` against the dev database.
6. **Do not run `npx vitest run` beside a build or the preview build.** Run it alone (CLAUDE.md).

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `git diff origin/staging -- package.json package-lock.json` shows no added dependency. Run an Aheed checkout run at 390: it exits 0 and its object's `checkout` is non-null, which proves `--then` reached `/checkout`, since an empty cart there redirects to `/cart`. Run `M --base http://localhost:8787 --path categories/fruit-veg --then checkout --widths 390` (no `--add-first`): it exits 2 with a usage message. Run `M --base http://localhost:8787 --path categories/fruit-veg --widths 390`: it exits 0 and still prints slice 1's keys (`headerHeightAfterScroll`, `gridColumns`, `controls`). Read the script: it prints measurements only, with no PASS/FAIL logic. |
| R2  | Unit | In the R1 checkout output, `formInputs` is an array of objects with exactly the keys `id`, `name`, `type`, `autocomplete`, and no entry has `type` `hidden`. Read the `MEASURE` source and confirm it reads `getAttribute("autocomplete")` (so an absent attribute is `null`) and selects `form input`. |
| R3  | Unit | In the R1 checkout output, `checkout` has the keys `headings`, `totalRow`, `submit`, `summaryTop`, `summaryTotal`. In the plain category output (R1's third command), `checkout` is `null`. Read the `MEASURE` source and confirm that positions add `scrollY` and that `displayed` uses the same rule as slice 1's `shown` helper. |
| R4  | Unit | Read `components/checkout/CheckoutForm.tsx`. Each of the eight named inputs has the listed `autoComplete`. `grep -o 'autoComplete="[^"]*"' components/checkout/CheckoutForm.tsx` prints exactly nine values: the eight tokens plus `discountCode`'s `off`. |
| R5  | Unit | For each of the four auth files, run `grep -c '<input' <file>` (2, 3, 1, 1) and `grep -o 'autoComplete="[^"]*"' <file>`. The tokens print in the order R5 lists. |
| R6  | Unit | `npx vitest run tests/autocomplete-tokens.test.ts` passes. **Mutation check:** delete `autoComplete="postal-code"` from `CheckoutForm.tsx` and re-run: it fails. Restore it (`git checkout -- components/checkout/CheckoutForm.tsx`). Repeat with `autoComplete="current-password"` in `LoginForm.tsx`: it fails; restore. `git status` is clean for both files afterwards. |
| R7  | E2E | Aheed checkout run at 390. In `formInputs`, `recipientName`, `email` and `phone` are present with `name`, `email` and `tel`. Every other R4 input that is present carries its R4 token. Record whether the address inputs were present and which method rendered. The address tokens are confirmed in R9 either way. |
| R8  | E2E | Run `M --base http://localhost:8787 --path login --widths 390`, then the same with `--path register` and `--path forgot-password`. The `autocomplete` values in `formInputs`, in order, are `email,current-password` / `name,email,new-password` / `email`. If a page has another form (for example a header search form), use only the entries belonging to the auth form, identified by `type` (`email`, `password`) or the order R5 gives. |
| R9  | E2E | Desktop Chrome, signed out. Add any Aheed product to the cart at `http://localhost:8787`, then open `/checkout`. If Fulfilment Method is shown, choose **Delivery**. Type `MK17 8NL` in Postcode and press **Find Address**. The text "Streets near this postcode:" appears with at least one street name. In DevTools Console run `['line1','line2','city','county','postcode'].map(i=>[i,document.getElementById(i).getAttribute('autocomplete')])`. The result is `address-line1, address-line2, address-level2, address-level1, postal-code`, and `document.getElementById('line1').getAttribute('list')` is `line1-street-suggestions`. Read the diff of `CheckoutForm.tsx`: the datalist block and hint paragraph are unchanged apart from the added attribute. If no street appears, report the row **blocked by environment**, not passed. |
| R10 | Integration | Run `git diff --name-only origin/staging -- features/checkout lib/delivery-pricing.ts lib/fulfilment-service.ts prisma`: it prints nothing. |
| R11 | Unit | `head -3 lib/checkout-sections.ts` shows no `"use server"`. Read the function: its conditions and order match `plan.md` §2's table, it takes the four named inputs, it does no I/O, and it exports the six heading titles as written in that table. |
| R12 | Unit | `npx vitest run tests/checkout-sections.test.ts` passes. Read the test: it loops or tabulates all 16 combinations with an exact expected list for each, and contains the four named cases with the exact lists R12 gives. |
| R13 | Unit | Run `grep -nE '\? "[0-9]" : "[0-9]"' components/checkout/CheckoutForm.tsx`: it prints nothing. Read the six `h2` elements: each renders its number from the R11 function, and the Fulfilment Method heading is numbered. |
| R14 | E2E | Run an Aheed checkout run and a SriMart checkout run at 390. In each `checkout.headings`, entry *n* starts with `n. ` for every *n*. Work out the expected list using the R11 table, with that vendor's configuration (Before you start, step 5), the rendered method and `hasRedeemable` false. The titles match it in order. |
| R15 | E2E | If Aheed shows a Fulfilment Method section, then in desktop Chrome on its `/checkout` choose **Click & Collect**. After the page re-renders, the headings read `1. Fulfilment Method`, `2. Contact information`, `3. Choose a Time`, `4. Discount code`. Choose **Delivery** again before leaving. If no Fulfilment Method section is shown, record "offerCollection false on Aheed dev" and rely on R12. |
| R16 | Unit | Read `app/(storefront)/checkout/page.tsx`: `CheckoutForm` receives `totalPence={totals.totalPence}`, `CheckoutSummary` receives the same `totals`, and there is exactly one `computeTotals(` call in the file (`grep -c 'computeTotals(' 'app/(storefront)/checkout/page.tsx'` prints `1`). |
| R17 | Unit | Read `CheckoutForm.tsx`. The `data-checkout-total` element's `className` contains `md:hidden`, it is the sibling immediately before the submit `<button>`, and it renders `Total` and `formatPrice(totalPence)`. The two note strings match R17 exactly, chosen on `redeemable`. Confirm `data-checkout-form` is on the `<form>`. Read `components/checkout/CheckoutSummary.tsx`: `data-checkout-summary` is on the `<aside>`, and `data-checkout-summary-total` on the Total `<dd>`. |
| R18 | E2E | Aheed checkout run and SriMart checkout run, each at `--widths 360,390`. In all four objects: `checkout.totalRow.displayed` is `true`, `totalRow.bottom` ≤ `submit.top`, `submit.bottom` ≤ `summaryTop`, and the `£` amount in `totalRow.text` equals `summaryTotal`. Any one failure fails the row. |
| R19 | E2E | Aheed checkout run and SriMart checkout run, each at `--widths 768,1280`. In all four objects `checkout.totalRow.displayed` is `false` and `summaryTop` is a number. |
| R20 | Unit + E2E | Run `grep -rnF '"Place order"' components app features --include=*.tsx` and `grep -rnF '"Placing order' components app features --include=*.tsx`: both print nothing. Read the button: idle `Continue to payment`, pending `Continuing to payment…`. In the R18 Aheed output at 390, `checkout.submit.text` is `Continue to payment`. |
| R21 | Acceptance | `git diff origin/staging -- docs/developer-portal/app-conventions.md` shows a new section with the rule, "1.3.5", and `tests/autocomplete-tokens.test.ts`, plus a bumped `version` and a changed `updated`. |
| R22 | Acceptance | `git diff origin/staging -- docs/shopper-help/shopping-guide.md` shows the new "Cart & Checkout" bullet covering all three points in R22, plus a bumped `version` and a changed `updated`. Its wording matches the real button label from R20. |
| R23 | Unit | `npx vitest run tests/vendor-neutral-copy.test.ts` passes, run alone. Read the two note strings and the two button labels: none names a vendor, a product or a trade. |
| R24 | Acceptance | `git diff origin/staging -- CHANGELOG.md` shows an entry naming #958 and #959. |
| R25 | Regression | `npm run lint`, `npm run typecheck` and `npm run format:check` each exit 0. `npx vitest run`, run alone with nothing building, exits 0 with no file reported as failed to start. `npm run build` exits 0. `npm run kms:validate` reports 0 failing. `npm run kms:assemble:internal`, then `npx next build --webpack` in `kms/site-internal`, both exit 0; read the real exit status, not a piped `tail`. CI on the PR (`quality / quality`, `quality / kms`, `docs-gates`) is green. CI, not local output, is ground truth. |
