# P7.5b — Order money provenance (validation)

Two standing notes for whoever runs this from a fresh context.

**Use `npm run preview`, never `npm run dev`, for every row below that loads a page.** Plain
`next dev` runs in real Node and cannot load `@prisma/client/wasm`, so a DB-touching route silently
renders an error state with no crash and no obvious signal (CLAUDE.md, Database).

**Before any live-DB row, diff `.env` and `.dev.vars` against `secrets/staging.vars` and
`secrets/production.vars`** and confirm the Neon host is the dev branch, not staging or production.
Two files agreeing with each other is not evidence they point at the right database — at P5a's
validation they agreed perfectly and both pointed at production.

**Stopping `npm run preview` does not stop it.** Kill the whole chain
(`npm` → `opennextjs-cloudflare` → `wrangler dev` → `workerd.exe` ×2) via
`Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='workerd.exe'"`, matching on the
repo path, or the next build fails `EBUSY` on `.open-next\assets`.

| Req | How to verify |
|-----|---------------|
| R1  | `grep -n "interface OrderSummary" -A 25 lib/repositories/orders.ts` shows both `discountCode: { code: string; amountPence: number } \| null` and `pointsEarned: number \| null` as declared members. |
| R2  | `grep -n "discountUse" lib/repositories/orders.ts` shows it inside the `select` of all three of `getByOrderNumber`, `getForUser` and `getForStaff`; `grep -n "loyaltyEntries" lib/repositories/orders.ts` shows the same three, each filtered `where: { kind: "EARN" }`. Read the three selects by eye to confirm none was missed. |
| R3  | `npx vitest run tests/orders.test.ts` exits 0 and its output names a test asserting `pointsEarned` is `null` (not `0`) for an order whose `loyaltyEntries` array comes back empty, and equals the row's `points` when one is present. |
| R4  | The same test file asserts `discountCode` is `null` when `discountUse` is null on the underlying row. |
| R5  | `grep -n "interface WebhookOrder" -A 22 lib/repositories/orders.ts` shows both fields; `grep -n "findOrderForWebhook" -A 30 lib/repositories/orders.ts` shows `discountUse` and the EARN-filtered `loyaltyEntries` in its `select`. |
| R6  | `grep -n "export async function confirmPayment" -A 4 lib/repositories/orders.ts` still shows `Promise<boolean>`. `grep -n "orders.confirm" -A 6 app/api/webhooks/stripe/route.ts` still shows the `if (confirmed)` branch calling `orders.findOrder(...)` before `sendOrderConfirmationEmail`. |
| R7  | `grep -n "discountCode" lib/order-totals.ts` shows one exported function taking `{ discountPence, discountCode }` and returning both shares. Confirm by eye that it is the only place either share is computed — `grep -rn "amountPence" components/ features/ app/` must show only *uses* of the returned values, never a second subtraction. |
| R8  | `grep -c "^import" lib/order-totals.ts` prints `0` — the file has no imports at all today and must still have none, which is what structurally prevents it reading `pencePerPointRedeemed` or any other config. **Do not grep for the absence of the word `pointsToPence`**: the function carries a comment naming it as the rejected approach, and a word-absence check would only pass by deleting that rationale (the P4a trap, `sdd-workflow.md` § Spec). |
| R9  | `npx vitest run tests/order-totals.test.ts` exits 0 and its output names four cases — code only, loyalty only, both, neither — each asserting the two shares sum to `discountPence`. |
| R10 | Under `npm run preview`, open an order that used a discount code (find one first: `npx tsx scripts/find-provenance-orders.ts`, a real file — `npx tsx -e` fails silently on this Windows setup once a script imports a package — printing order numbers joined to `DiscountRedemption` and to EARN entries; delete it afterwards). Confirm the money summary shows a row bearing the code's own string with that code's amount, and, if the order also redeemed points, a separate loyalty row. |
| R11 | Under `npm run preview`, open an order with `discountPence = 0` (the script above prints one) and confirm no discount row appears between Subtotal and Delivery. |
| R12 | `npx vitest run tests/order-items-card.test.tsx` exits 0 and includes a case rendering `OrderItemsCard` with `discountPence: 700` and no `discountCode`, asserting exactly one row whose label is `Discount` and whose value is `−£7.00`. **The file must open with `// @vitest-environment jsdom`** — `vitest.config.mts` sets `environment: "node"` globally, and the only component tests in the repo (`tests/a11y/*.test.tsx`) opt in per file with that docblock. Without it, `@testing-library/react` fails on a missing DOM. |
| R13 | The same test file asserts all three `OrderPointsNote` outcomes: a non-null positive `pointsEarned` renders the figure; `PENDING_PAYMENT` with an owning user renders a line matching `/^[^0-9]*$/` (no digits anywhere); neither condition renders nothing. |
| R14 | The same test file asserts `OrderPointsNote` renders nothing for a guest order in `PENDING_PAYMENT` **and** in `CONFIRMED`. |
| R15 | The same test file asserts `OrderPointsNote` renders nothing when status is `CANCELLED`, including when a `pointsEarned` value is (impossibly) supplied — the status guard must not depend on the data being absent. |
| R16 | `grep -n "OrderPointsNote" "app/(storefront)/checkout/[orderNumber]/page.tsx" "app/(storefront)/account/orders/[orderNumber]/page.tsx"` shows an import and a render in each. |
| R17 | `grep -n "OrderPointsNote" "app/(admin)/staff/orders/[orderNumber]/page.tsx"` prints nothing; `grep -n "discountCode" "app/(admin)/staff/orders/[orderNumber]/page.tsx"` shows it passed to `OrderItemsCard`. Then under `npm run preview`, sign in as `demo-admin@example.com`, open the same order used in R10 at `/staff/orders/{orderNumber}`, and confirm its discount breakdown matches what the customer page showed — same rows, same amounts, and no points line. |
| R18 | `grep -n "order-totals" features/checkout/send-confirmation.ts` shows it importing the R7 function; confirm by eye there is no second `−` arithmetic over `discountPence` in the file. |
| R19 | `npx vitest run tests/order-confirmation-email.test.ts` exits 0 with new cases in the existing suite, which already parses the outbound Resend request's HTML back out rather than string-matching: assert a points line appears for `pointsEarned: 34`, and that **no** points line appears for `pointsEarned: null` (guest) or `0`. Then one live confirmation: with `npm run preview` running, place a real order as a signed-in demo customer using a discount code and a Stripe test card, let the webhook confirm it, and read the rendered HTML from the preview console (`lib/email.ts` logs-and-continues). Confirm the attributed rows and the points line match what the unit test asserts. |
| R20 | `grep -n "try {" -A 3 features/checkout/send-confirmation.ts` confirms the new reads and renders are inside the existing try block; the catch still logs and returns. |
| R21 | `git diff --name-only origin/staging -- prisma/` prints nothing. |
| R22 | The ADR-004 guard is an **ESLint rule, not a test** — `no-restricted-imports` at `eslint.config.mjs:66-80` blocks `@prisma/client`, `@prisma/client/*` and `getPrisma()` in the app/UI/feature layer, including type imports. So `npm run lint` exiting 0 (R25) *is* this check; confirm the rule is still present and that no new file appears in `eslint.config.mjs:90`'s `no-restricted-imports: "off"` override. For raw SQL: `grep -rnE '\$queryRaw\|\$executeRaw' app/ features/ components/ lib/repositories/` prints nothing (single-quoted so the shell does not expand `$queryRaw`). |
| R23 | `grep -n "P7.5b" specs/decisions/ADR-005-payments-money-flow.md` shows an implementation note stating the loyalty share is derived by subtraction from `DiscountRedemption.amountPence`, and naming config drift as the reason it is not recomputed. |
| R24 | `git diff origin/staging -- CHANGELOG.md` is non-empty and describes this slice. |
| R25 | `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check` each exit 0. If `format:check` fails on files this branch never touched, it is the documented `core.autocrlf` artifact — confirm it the documented way (`git show HEAD:<file>` written out with LF, then `prettier --config .prettierrc.json --check`, run where prettier can resolve the config) and treat CI on Linux as the authority. |

## Rows that may need a fallback, pre-authorised here

**R10 and R17 need an order that used a discount code**, and R10's combined case needs one that used
a code *and* redeemed points. If `scripts/find-provenance-orders.ts` shows the dev branch has no
such order, **create one by placing a real order through `npm run preview`** with a seeded code
applied — do not hand-insert an `Order` or `DiscountRedemption` row, which would bypass the write
path that produces the `amountPence` snapshot this slice reads. If no seeded code exists, create one
through `/staff/discounts` as an admin, which is also the real write path.

**R19's guest half** requires the storefront guest checkout, not a signed-out account page.

Record which fallback was taken; a row verified by a different route than written is a finding for
`build-notes.md`, not a silent substitution.
