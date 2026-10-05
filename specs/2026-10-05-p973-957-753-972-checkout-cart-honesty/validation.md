# #973, #957, #753, #972 — Checkout and cart honesty (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
> 
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**
   - *When needed:* Every feature.
   - *Purpose:* Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - *When needed:* Every feature. (Includes Contract testing).
   - *Purpose:* Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - *When needed:* For critical user journeys and validation testing.
   - *Purpose:* Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - *When needed:* Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - *Purpose:* Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - *When needed:* Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - *Purpose:* Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - *When needed:* Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - *Purpose:* Ensure the system is safe and accessible to all users.

---

## Before the live rows

1. `npm run preview` (never `npm run dev`; the checkout and cart touch the database). `$BASE` is
   `http://localhost:8787`. Read `docs/developer-portal/local-dev-playbook.md` first, in particular
   "Drive a drawer, card or checkout from page JavaScript", the store-minimum note, the merge-prompt
   note and the scratch-script note.
2. **Run every live row before the full `npx vitest run`.** A full run writes fixture orders into the
   dev database (`#797`). Run the full suite last and alone (R32).
3. Live rows that change dev data (stock, product active flags, codes) restore it afterwards. Each
   row says what to restore.
4. Sign in as a dev demo shopper with `fetch('/api/auth/sign-in/email', …)` from page JavaScript, as
   the playbook describes. The checkout's minimum order is judged on the pre-discount subtotal, so
   every checkout row needs a cart above the store minimum and, where offered, a chosen slot.
5. An order's capability token is `Order.confirmationToken`. Read it with a scratch script against
   the dev database (playbook), or from the `?t=` of the URL `placeOrderAction` redirected to when
   Stripe is not configured.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | Read `lib/discounts.ts`: the union has `"OWN_REFERRAL_CODE"`, and `refusalMessage` returns R1's string for it. `git diff origin/staging -- lib/discounts.ts` shows no change to any other message. `npx vitest run tests/discounts.test.ts` passes, and its all-reasons list includes the new reason. |
| R2  | Unit | Read `previewCode`: `description` is selected; the three conditions use `extractReferralPrefix`, `extractReferrerUserId` and `isSelfReferral` from `lib/referrals.ts`; the check sits between the `if (!row)` return and `evaluateCode`. `npx vitest run tests/discounts-preview.test.ts` passes, with cases for: own code refused by `previewCode`; own code refused by `claimCode` with no `updateMany` call; own code that is also inactive still reported as `OWN_REFERRAL_CODE`. |
| R3  | Unit | The same test file has one passing case for each of R3 (a), (b) and (c), each asserting the result is not `OWN_REFERRAL_CODE`. |
| R4  | Regression | `git diff --stat origin/staging -- prisma/` prints nothing. |
| R5  | Unit | Read the new module. It is not under `lib/repositories/`, and it calls `getShopperDeliveryRules`, `computeTotals(…, 0, …)` and `getDiscountRepository().preview`. The blank-code and empty or merge-pending cart paths return `null`. The `catch` logs with `console.error` and returns R5's exact message. `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` passes. |
| R6  | Unit | `grep -rn "previewPrefilledCode" app features components lib` prints nothing. `grep -rn "\.preview(" app features components` prints nothing (only R5's module calls it). Read the page: the pre-filled preview comes from R5's function. The throw case is proven by R5's `catch` (read). |
| R7  | Unit | `head -1 features/checkout/preview-code.ts` is `"use server";`. `grep -n "^export" features/checkout/preview-code.ts` prints exactly one line, `export async function previewDiscountCode(code: string)…`. Read it: it calls R5's function with `code` and reads nothing else from the client. The result type is imported from a file with no `"use server"` line. |
| R8  | Component | R13's test file passes, including the Enter and blank-field cases. Read the form for `type="button"`, `data-discount-code-apply`, `aria-label="Apply discount code"`, `disabled` while pending and the text `Checking…`. |
| R9  | Component | R13's test file passes. Read it for an assertion on each note state's exact text and class, and on `aria-describedby` both present and absent. Read the form: the `aria-live="polite"` container renders unconditionally. |
| R10 | Component | R13's test file passes, with one assertion for each of the three note strings. Read the form: the requested value is parsed by the same rule as `redeemPointsIntent`, and `clampRedemption` gets the current code's discount as `existingDiscountPence`. Read the page: `redeemable` carries `pencePerPointRedeemed`. |
| R11 | Component | R13's test file passes, asserting that `[data-checkout-summary-total]` and `[data-checkout-total]` hold the same figure after Apply and after points. Read the page: one provider wraps both `CheckoutForm` and `CheckoutSummary`. Read the summary for the two conditional rows. `git diff origin/staging -- components/checkout/CheckoutSummary.tsx`: the item list and the Subtotal and delivery rows are unchanged in markup and text. |
| R12 | Component | R13's test file asserts each of the three notes. `grep -rn "comes off before payment\|come off before payment" components` prints nothing. |
| R13 | Component | `npx vitest run <the R13 test file>` passes. Read it for each listed case. |
| R14 | Component | The same file has the re-render case: the mock is called twice, and the shown total uses the second answer. |
| R15 | Regression | `git diff origin/staging -- features/checkout/place-order.ts` prints nothing. Read `git diff origin/staging -- lib/repositories/discounts.ts lib/repositories/loyalty.ts`: no hunk falls inside `claimCode` or `spendPoints`. |
| R16 | Unit | Read `addCartItems`: the return type; classification inside `$transaction` from the quantity read there; the `next <= existing` skip. `git diff origin/staging -- features/cart/add-bundle-to-cart.ts features/cart/add-list-to-cart.ts` prints nothing. R21's tests pass. |
| R17 | Unit | Read `lib/restore-notice.ts` (no `"use server"` line, no `lib/db` import). R21's tests pass. |
| R18 | Unit | Read `features/orders/reorder-items.ts`: deleted lines become `u` with `productName`; the redirect uses R17's builder with `reorder`; every export is `export async function`. Live proof is R25. |
| R19 | Unit | Read `features/checkout/cancel-order.ts`: the builder is called only inside the `PENDING_PAYMENT` branch, and every other path still redirects to `/cart`. Every export is `export async function`. Live proof is R26. |
| R20 | Unit | Read `app/(storefront)/cart/page.tsx`: it renders `RestoreNotice` from R17's parser, and the bundle notice block is unchanged in `git diff`. R21's component case passes. In preview, open `$BASE/cart?restored=reorder&of=3&lines=u~0~2~Alpha%7Cp~1~3~Beta`. `[data-restore-notice]` reads `2 of 3 items from your past order couldn't be added in full:`, `Alpha: not available right now`, `Beta: only 1 of 3 added, limited stock`, then `Everything else is in your cart.` Open `$BASE/cart?restored=bogus&lines=u~0~1~X`: no `[data-restore-notice]`. |
| R21 | Unit | `npx vitest run <the addCartItems report test> <the restore-notice test> <the RestoreNotice test>` passes. Read them for each case R21 lists. |
| R22 | E2E | **Real browser only.** (a) Sign in, build a cart above the minimum, and create code `SPEC973A` at `/staff/discounts` (fixed £3.00, minimum 0, max per customer blank, remaining redemptions 5). On `/checkout` type a name, a phone and `spec973a`, then click Apply. The applied note reads `Code SPEC973A applied: −£3.00.` Click Click & Collect and wait for the summary's delivery row to read `Click & Collect`. Name, phone and code still hold the typed values, the applied note shows again, and `[data-checkout-summary-total]` equals subtotal − £3.00. Switch back to Delivery: the same holds, with the delivery fee added. (b) In the header, choose Click & Collect, open the postcode control, and submit a deliverable dev postcode different from the current one. After it settles, the header shows Click & Collect, and `/checkout` has the Click & Collect radio checked. Record the browser used and what each step showed. Any failure is a fail, to be fixed by `/fix`. |
| R23 | E2E | Continue R22's session (Delivery selected, `SPEC973A` applied). Read both totals: each equals subtotal − £3.00 + delivery. Change the field to `SPEC973` (drop the last letter): the summary has no `Discount (` row, `[data-checkout-total]` shows the pre-discount total and `Your code isn't included until you press Apply.` Type the `A` back and click Apply. Note the total, fill a deliverable dev address and submit. The Stripe test amount (or, without Stripe, the order page) equals the noted total, and the new order at `/staff/orders` shows that total. Then deactivate `SPEC973A`. |
| R24 | E2E | As the demo shopper, open `/account/loyalty` (it creates the shopper's `REF-` code) and note the code. Visit `$BASE/?ref={that code}`, then `/checkout`: `[data-discount-code-note]` reads `You can't use your own referral code.`, and the summary has no `Discount (` row. Clear the field, type the code and click Apply: the same note. Submit a complete form: the form's alert reads `You can't use your own referral code.` Then sign in as a second dev shopper, type the first shopper's code and click Apply: the note is not R1's message. |
| R25 | E2E | As the demo shopper, empty the cart. Add product A ×1 and product B ×3 (both in stock, cart above the minimum), and place the order (it may stay unpaid). At `/staff/products` deactivate A. At `/staff/inventory` set B's stock to 2. Empty the cart. On `/account/orders/{order}` click Reorder. `/cart` shows `[data-restore-notice]` reading `2 of 2 items from your past order couldn't be added in full:`, `{A}: not available right now` and `{B}: only 2 of 3 added, limited stock`, with no `Everything else` line. The cart holds B ×2 and no A. Restore A's active flag and B's stock. |
| R26 | E2E | Empty the cart. Add product C ×1 (plus enough else to clear the minimum) and place the order without paying. At `/staff/products` deactivate C. Open `$BASE/checkout/{order}/cancel?t={token}` (step 5 above) and confirm the cancel. `/cart` shows `[data-restore-notice]` with `… from your cancelled order couldn't be put back in full:`, `{C}: not available right now` and `Everything else is in your cart.` Restore C. |
| R27 | E2E | As the demo shopper, read the balance on `/account/loyalty` and the minimum on `/staff/loyalty`. If balance < minimum: record **R27 unverified** with both figures, and do not count it as a pass. Otherwise, on `/checkout` enter the minimum in "Points to spend". `[data-points-note]` reads `{n} points: −£x.xx`, and both totals drop by that amount. Submit: the charged amount equals the shown total. |
| R28 | Docs | Read `docs/shopper-help/shopping-guide.md`: statements (a)–(d) are each present, and the "Referral links" bullet is still accurate. |
| R29 | Unit | `npx vitest run tests/vendor-neutral-copy.test.ts` passes. Read the new strings listed in R29: none names a vendor or a grocery item. |
| R30 | Docs | `npm run kms:validate` and `npm run kms:check-generated` exit 0. Run `npm run kms:assemble:internal`, then `cd kms/site-internal && npx next build --webpack; echo "exit=$?"`. Read the printed exit directly (not through `tail`): it is 0. |
| R31 | Process | `git diff origin/staging -- CHANGELOG.md` adds an entry naming all four issues. |
| R32 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run build` each exit 0. Then run `npx vitest run` alone, not beside or straight after the build. It exits 0, and its summary's file count equals the number of test files, with no "failed to start" or worker error. CI on the PR (`gates`, `quality/quality`, `quality/kms`) is green, and CI is ground truth. |
