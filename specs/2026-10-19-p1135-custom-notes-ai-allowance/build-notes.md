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

- **The dev migration is NOT yet applied.** `env -u DIRECT_URL -u DATABASE_URL npx prisma migrate
  status` (host `ep-dry-morning-zab7dx08`, dev) lists `20261019120000_p1135_custom_item_notes` as
  pending. Auto mode blocks `migrate deploy`, so the owner must run
  `! env -u DIRECT_URL -u DATABASE_URL npx prisma migrate deploy`. Until then:
  - `tests/express-sla.test.ts` and `tests/concurrency-slot-booking.test.ts` fail against dev,
    because the Prisma client selects `customNote`;
  - R21–R24 and R38 can't be run.

  Rerun both test files first at Validate.
- **The session environment exports the PRODUCTION `DIRECT_URL`** (`ep-young-glitter-zadlkttm`),
  the same trap that migrated production at `#1134`. `DATABASE_URL` is not exported, so live tests
  used dev through `.env`. Every Prisma CLI or DB script command must carry
  `env -u DIRECT_URL -u DATABASE_URL`. Run `printenv DIRECT_URL DATABASE_URL` before anything that
  touches a database.
- **Not yet exercised live (pending the migration):**
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
