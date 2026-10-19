# Custom item notes and the AI allowance plan mode (build notes)

Issues `#1135` (item notes), `#1028` (Workers plan mode), `#1029` (staff AI allowance page) and
`#1031` (backfill refusal tone). Spec commit `09b2fec`, build commit `68ce77e`, branch
`feature/p1135-custom-notes-ai-allowance`. Built on Opus 5.5.

## What changed and why

**Item notes (`#1135`).** One additive migration
(`20261019120000_p1135_custom_item_notes`): four `ADD COLUMN`s and nothing else.
`Category.allowsCustomNote` and `Product.allowsCustomNote` are booleans, `false` by default.
`CartItem.customNote` and `OrderItem.customNote` are nullable text.

- **One rule, one module.** `lib/custom-note.ts` holds both the acceptance rule and normalisation.
  - `productAcceptsNote` is true if the product, its category, or that category's parent allows
    notes. `NOTE_ACCEPTANCE_SELECT` is the Prisma select that feeds it.
  - `normaliseCustomNote` trims, folds whitespace, strips control characters, and caps at 200 code
    points. It returns `null` when nothing is left.
  - Every write path calls these two, so the product page, order-again, cart merge and the basket
    action can't disagree. The write paths are `addCartItem`, `addCartItems`, `setCartNote` and
    `placeOrder`.
- **Checked at both ends.** `placeOrder` re-checks acceptance when the order is placed. A note in
  the basket for a product that no longer accepts notes is written to the order as `null`. The
  basket shows R9's sentence in that case (`components/cart/CartLineNote.tsx`, the "dropped"
  state), so the shopper is told before checkout, not after.
- **Add semantics** (`lib/repositories/cart.ts`, `addCartItem`):
  - a non-empty, accepted note replaces the line's note;
  - an empty or absent note leaves the existing note alone (the update writes quantity only);
  - a new line gets the note, or `null`.

  This is why the product-card "+" (which sends no note) can't wipe a note typed on the product
  page.
- **Merge** (`lib/cart-rules.ts`). When a guest and a saved basket combine, a non-null guest note
  wins; otherwise the saved note is kept. `sumLinesByProduct` keeps the last non-empty note.
- **Read surfaces:**
  - the basket line (`CartLineNote`: editable form, the dropped sentence, or nothing);
  - the customer and staff order item cards (`<span data-order-item-note>`);
  - the staff order list ("Has item notes" marker only, never the text);
  - the confirmation email.
- **Email escaping.** The email HTML-escapes the note and now the product name too, using the new
  `lib/html-escape.ts`. The product name was previously interpolated raw; escaping it is the same
  change, since the note sits in the same cell.
- **Data rights** (`lib/repositories/data-rights.ts`). Both exports include notes on order items
  and basket items. `eraseVendorData` and `eraseGuestOrderData` null `OrderItem.customNote` with a
  `tx.orderItem.updateMany` inside their existing WebSocket transactions. Basket rows are already
  deleted outright by erasure.
- **Staff.** The category and product forms have a checkbox each.

**AI plan mode (`#1028`).** `WORKERS_AI_PLAN` (`lib/config.ts`, `aiSchema`) is `"free"` unless it
is exactly `"paid"`, so a typo fails safe to the capped mode. `createAiMeter(prisma, vendorId,
feature, plan)` (`lib/ai-meter.ts`) works like this:

1. It always checks the vendor's own budget first.
2. In Free mode only, it then sums the platform's spend since 00:00 UTC
   (`sumPlatformMilliNeuronsSince`). Once that reaches 10,000 neurons it refuses with
   `scope: "platform"`.
3. Paid mode never reads the platform total.
4. Any read error refuses with `scope: "vendor"` (fail closed, as before).

`describeAiBudgetRefusal` has a platform sentence. Every meter caller passes
`getAiEnv().WORKERS_AI_PLAN`: the meter service, the net-content and synonym services, and both
scripts.

**Staff AI allowance page (`#1029`).** New page `/staff/ai-usage`, behind
`requireVendorRole("ADMIN")` with `PanelRefusal`.

- The page shows:
  - today's usage against the store's budget;
  - a by-feature table;
  - a Plan section. In Free mode it shows the platform's shared total; in Paid mode platform admins
    also see the charge estimate (`estimatedPaidChargeCents`, integer cents, $0.011 per 1,000
    neurons over the allowance).
- **Only a platform admin can change a budget.** `features/admin/ai-budget.ts` refuses unless
  `auth.via === "platform-admin"`, and writes only `auth.vendorId`. A store admin sees the budget
  as text.
- The page is on all three surfaces: PanelNav (admin tier), the hub, and
  `docs/store-admin-guide/admin-tabs-guide.md` 2.16.0.

**Backfill tone (`#1031`).** The backfill route still answers 200 on a budget refusal, so partial
progress is still reported, and now adds `budgetRefused: true`. `BackfillImagesButton` renders that
in the error tone with "(N generated before it stopped)".

**Docs.**
- `specs/architecture.md` 1.42.0: both plan modes, and the fact that the Free cap counts only this
  platform's ledger.
- `docs/developer-portal/env-setup.md` 1.19.0: `WORKERS_AI_PLAN`.
- `docs/platform-admin-guide/platform-admin-guide.md` 1.2.0: setting budgets.

## Decisions taken during the build

- **`allowsCustomNote` is optional on `ProductWriteInput` and `CategoryWriteInput`.** If a caller
  leaves it out, the stored value is untouched. Making it required broke the seed and the import
  scripts. Worse, a script that forgot the field would have silently un-ticked notes on every
  product it touched. The staff forms always send it.
- **`setCartNote` always lets a shopper clear a note**, even on a product that no longer takes
  notes. Without that, the "Remove note" button in the dropped state would be refused.
- **`setCartNote` writes with a singular `cartItem.update`** keyed on `cartId_productId`, over
  `getPrisma()`. It has no nested writes and needs no transaction, so this is allowed by CLAUDE.md's
  hybrid-client rule.
- **`setCartItemNote` answers `NOT_IN_CART` for non-string input**, rather than adding a third
  reason. A browser form can't produce that input, so it doesn't need its own copy.
- **`sumPlatformMilliNeuronsSince` has no `vendorId` parameter** and is allowlisted in
  `tests/repository-vendor-scoping.test.ts`, with the justification written there. A platform-wide
  sum is the whole point of the Free cap.
- **The note input sits above the add button on the full product-page variant only.** Product cards
  and quick view add without a note; the shopper can add one in the basket.
- **`lib/net-content-run.ts`'s stop log says "platform shared" or "vendor daily"** depending on the
  refusal's `scope`. Otherwise a Free-mode platform refusal would be logged as the vendor's own
  budget, which is misleading in a script's output. One line, no behaviour change.

## Deviations from the spec

None. Both items above that go beyond the literal requirements (optional write-input field, log
wording) are recorded as decisions. Neither changes a requirement's outcome.

## Known-shaky areas

- **The dev migration was applied after Build, by the owner** (2026-10-19,
  `env -u DIRECT_URL -u DATABASE_URL npx prisma migrate deploy`, datasource
  `ep-dry-morning-zab7dx08`). Since then `tests/express-sla.test.ts` and
  `tests/concurrency-slot-booking.test.ts`, which had failed while the column was missing, pass
  against dev (2 of 2). R21–R24 and R38 can now run under `npm run preview`.
- **The session environment exports the PRODUCTION `DIRECT_URL`** (`ep-young-glitter-zadlkttm`),
  the same trap that migrated production at `#1134`. `DATABASE_URL` is not exported, so live tests
  used dev through `.env`. Every Prisma CLI or DB script command must carry
  `env -u DIRECT_URL -u DATABASE_URL`. Run `printenv DIRECT_URL DATABASE_URL` before anything that
  touches a database.
- **Not yet exercised live:**
  - R21–R24: the note input on Aheed with a ticked category; nothing on SriMart; the dropped
    sentence after unticking; the mobile measurement;
  - R38: the store-admin versus platform-admin view of `/staff/ai-usage`.

  Unit tests cover the logic, but the rendered pages have only been checked by `npm run build`.
- **R41 passed against dev** (`npx tsx specs/2026-10-19-p1135-custom-notes-ai-allowance/verify-ai-plan-mode.ts`,
  with `env -u`):
  - platform total 0 → 10,001;
  - Free refused `concurrency-test-00ffa879` (0 of 3,000 used) with
    `{"allowed":false,"scope":"platform","usedNeurons":10001,"budgetNeurons":10000}`;
  - Paid allowed the same vendor with `scope:"vendor"`;
  - cleanup deleted 1 row and left 0.

  The script doesn't read `customNote`, so it ran before the migration.
- **Flaky under full-suite load.** `tests/add-to-cart-feedback.test.tsx` and
  `tests/storefront-chrome-rewards-gate.test.tsx` failed on one full run and passed alone. These are
  the known instabilities (`#983`, `#1037`, `#1125`). Run `npx vitest run` by itself, never beside a
  build.
- **Erasure's `orderItem.updateMany`** is covered by `tests/data-rights-item-notes.test.ts` with a
  fake client only. It runs inside the existing `getPrismaWs()` transactions, which is the correct
  adapter, but no real erasure has run since this change.
- **The email's product-name escaping is new behaviour.** A product name containing `&` now renders
  as `&amp;` in the HTML source, which is correct. Check one real confirmation if a name carries
  punctuation.
- **The Free cap counts only this platform's `AiUsageEvent` ledger**, part of which is estimated.
  Other usage on the same Cloudflare account is invisible to it. This is documented in
  architecture.md, but it means Cloudflare can still cut the account off before our counter says
  so.

**Owner actions carried forward (not validation items):**
- set `WORKERS_AI_PLAN=paid` on staging and production if the account is Paid (recorded on
  `#1028`);
- the `/privacy` decision (`#1156`);
- after promotion, tick Aheed's categories that should take notes.

Other deferred items are filed as `#1157` (more note surfaces), `#1158` (several notes per
product) and `#1159` (vendor-set note label).

## Validation pass 1 (2026-10-19, same context, Opus — not independent)

The owner chose to validate in the building session on Opus 5.5 rather than Clear and switch to
Sonnet, so this pass checks the builder's own work. Run on `dee3427`. Every row of `validation.md`
was walked; R43's CI half waits for Ship.

**Pre-flight.**
- `npm run lint`, `npm run format:check`, `npx tsc --noEmit` and `npm run build` all exit 0.
- `npx vitest run` (alone) passed 3,529 of 3,533. The four failures were `add-to-cart-feedback`,
  `product-grid-usage`, `repository-client-injection` and `storefront-image-fallback`; three of them
  were 5-second timeouts on source-scanning tests. All four files pass when run alone (26 of 26),
  which is the known load instability (`#1125`).

**Static and unit rows: all pass.**
- R1: apart from the four columns and their comments, the schema diff is `prisma format`
  whitespace (`git diff -w`).
- R2: one migration with four `ADD COLUMN`s; `DROP`, `UPDATE` and `INSERT` each match 0 times.
- R3: `productAcceptsNote` is called from the cart read, `noteAcceptingIds` (add and set-note),
  the product detail query and `placeOrder`. No other place combines the three flags.
- R7 and R10: neither file nor the diff has a match.
- R14: the added Prisma writes are two `tx.orderItem.updateMany` inside the erasure
  transactions, a singular `cartItem.update` and a singular `vendorConfig.update`.
- R26: every `createAiMeter` caller passes `getAiEnv().WORKERS_AI_PLAN`, directly or through a
  local.
- R4, R11–R13, R17–R20, R25, R27–R29, R33, R35–R37, R39 and R40: their named test cases are
  present and pass.

**Live rows, under `npm run preview` against dev (`ep-dry-morning-zab7dx08`), all pass.**
Accounts were the demo users (`demo-admin`, `demo-store-admin`, `demo-staff`, `demo-customer`),
driven with curl and the pages' own forms and actions.
- R20: ticking and then unticking Aheed's `halal-meat` through its edit form persisted both
  times. So did ticking and unticking `orange-juice-1l` on the product form.
- R5: `/products/halal-lamb-mince` (in the ticked category) and `/products/gen-1063-spice-mix`
  (in its sub-category `chicken-poultry`) both render `<input name="customNote" maxLength="200">`
  with `<label for>` "Note for this item". `orange-juice-1l` and `/categories/halal-meat` render
  none (R7).
- R6, adding the spice mix three times: stored notes `first`, then `first` (empty note), then
  `second line` (from `"  second\n  line "`). An add with a note on orange juice (not ticked)
  returned `added` and stored `null`.
- R8, through `setCartItemNote`:
  - orange juice is refused with `NOTES_NOT_TAKEN`;
  - an edit returns `edited note`;
  - a clear stores `null`;
  - a product not in the basket is refused with `NOT_IN_CART`.

  On `/cart`, the five lines that take notes render the editable form; olive oil and orange juice
  render none. Submitting the page's real Save form, and then its real Clear button
  (`formAction`), changed the stored note both times. The header drawer renders the same
  `CartContents`, and its payload carries the note input with the saved value.
- R9 and R23: with orange juice noted ("no pulp") and then unticked, `/cart` shows "Note: no pulp
  This item no longer takes notes, so your note will not be sent with the order."
- R12, R21 and R23: checkout as the customer (Click & Collect) redirected to a Stripe test
  Checkout session and created `AHE-20261019-74CVQB` (`PENDING_PAYMENT`). Its `OrderItem` rows
  show "Traditional Spice Mix 250g" with `thin slices please`, "Orange Juice 1L" with `null`, and
  the other five with `null`.
- R15: `/account/orders/<n>`, `/checkout/<n>` and `/staff/orders/<n>` each render exactly one
  `data-order-item-note` element in the DOM, "Note: thin slices please", under the spice mix.
- R16: `/staff/orders?status=PENDING_PAYMENT&q=AHE-20261019` shows the row with "Has item
  notes". The default list's other row (`AHE-20260929-74F9X4`) has no marker. Pending orders are
  not in the default action queue, so the filter was needed.
- R13: cancelling the order through `/checkout/<n>/cancel` restored its lines to the basket, and
  the spice mix line came back with `thin slices please`.
- R22: SriMart's `sri-smart-led-bulb`, `sri-over-ear-headphones` and `sri-gan-charger-65w`
  render no note input. An add with a note stored `null`, and SriMart's `/cart` has no
  `data-cart-note`.
- R24 (`scripts/verify-mobile-layout.ts --widths 375`):
  - `/products/halal-lamb-mince`: `viewportWidth 375`, `documentScrollWidth 375`.
  - `/cart`, signed in, with a 74-character note: `viewportWidth 375`, `documentScrollWidth 375`,
    and `formInputs` includes `cart-note-025de781-…`.
- R31: signed out gives 307 to `/login`. `demo-staff` gets `PanelRefusal` ("Store admins only").
- R32, Free mode (no `WORKERS_AI_PLAN`): both admins see "0 of 3,000 neurons used", the
  per-feature table with Today and Last 7 days columns, "Workers plan: Free" and "Shared
  allowance across every store: 0 of 10,000".
- R32 and R33, with `WORKERS_AI_PLAN="paid"` temporarily in `.dev.vars` and preview restarted:
  - both admins see "Workers plan: Paid" and no shared line;
  - only `demo-admin` sees "Estimated charge today above the shared 10,000-neuron allowance: $0.00
    (0 neurons across every store, at $0.011 per 1,000 above the allowance)".
- R34: only `demo-admin`'s page has `name="aiDailyNeuronBudget"`. The store admin sees "Daily
  budget: 3,000 neurons" as text.
- R38:
  - `demo-store-admin` posting the budget form (9,999) gets "Only a platform admin can change a
    store's AI budget." and the stored value stays 3,000;
  - `demo-admin` saved 4,321 and the page then showed "0 of 4,321", and was restored to 3,000;
  - SriMart's page (`demo-admin` signed in on `srimart.localhost:8787`) shows SriMart's own
    figures (Shop your list 0 over 7 days, against Aheed's 13) and names only SriMart.

  `demo-srimart-admin`'s dev password does not match `DEMO_ACCOUNT_PASSWORD` (401), so SriMart
  was read as a platform admin; R38 does not name a role for that check.
- R41, rerun: ALL PASS. The platform total went 0 → 10,001; Free refused with `scope:"platform"`;
  Paid allowed; cleanup left 0 rows.
- R42: the CHANGELOG names all four issues, and `sdd:audit` lists PR #1155 as cited. Its one
  remaining gap is this slice's own roadmap row, which lands at Document (final).

**Dev state restored:**
- no category or product ticked on either store;
- Aheed's budget is 3,000;
- the customer's Aheed basket is back to its five starting lines;
- `demo-admin`'s SriMart basket is back to `sri-earbuds` only;
- `AHE-20261019-74CVQB` is `CANCELLED`;
- `.dev.vars` is restored from a copy.

**Incident during validation (my tool, not the app).** My form-replay helper did not read
`<textarea>` contents, so the first product-form save blanked `orange-juice-1l`'s description
on dev. I fixed the helper, restored "Freshly squeezed orange juice, no added sugar." through the
same form, and confirmed by reloading that only `allowsCustomNote` had differed.

**Findings, none blocking a requirement:**
- `setVendorAiDailyBudget` uses `vendorConfig.update`, so saving a budget for a vendor with no
  `VendorConfig` row would throw. `getVendorAiDailyBudget` falls back to the default for exactly
  that case. Every dev vendor has a row, so it was not reproduced. An `upsert` would match the
  read side.
- Plausible, not verified: the cart note input's id is `cart-note-<productId>`. If the header
  drawer and `/cart` are ever in the DOM together, two inputs share an id and the second label
  points at the first input. `/cart`'s server HTML had each id once, and opening the drawer on
  `/cart` was not tried.

**Verdict:** every requirement passes locally. R43's CI `gates` result is confirmed at Ship.
