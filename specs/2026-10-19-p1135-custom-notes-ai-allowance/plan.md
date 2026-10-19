---
id: p1135-custom-notes-ai-allowance
title: "Custom item notes and the AI allowance (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-19
visibility: internal
summary: "Shoppers attach a short note to a priced basket line where a category or product allows it (#1135); the Workers AI allowance gains a Free/Paid plan mode, a staff view, a platform-admin budget control and an honest backfill refusal (#1028, #1029, #1031)."
tags: [cart, checkout, orders, staff-panel, workers-ai, ai-budget, data-rights, p10]
related: [p1131-storefront-navigation-catalogue, p1134-switches-marketing-consent, architecture, app-conventions]
---

# Custom item notes and the AI allowance (plan)

Closes `#1135` (slice C of the owner's "Website Updates" brief, 2026-10-17), `#1028`, `#1029` and
`#1031`. The owner approved the approach at Propose on 2026-10-19 and made three rulings there that
are **not open for re-derivation**:

1. A custom line is a **note attached to a normal, priced product line** — not an unpriced request
   line. Price, Stripe and totals are unchanged.
2. Notes are enabled by a tick box on a **category** or on a **product**; a product accepts notes
   if either is ticked. There is no per-product opt-out inside a ticked category.
3. The Workers AI plan becomes a **configurable platform mode, Free by default**: in Free mode the
   shared 10,000-neuron daily allowance is enforced across all vendors and every vendor's AI pauses
   until 00:00 UTC once it is used; Paid mode removes that shared cap and reports the estimated
   charge beyond the allowance at $0.011 per 1,000 neurons. Both modes are documented in
   `specs/architecture.md` and tested. The ruling is recorded on `#1028` (comment of 2026-10-19).

The two halves share no code. They are one slice because the owner named the scope; they are kept
as separate requirement groups so either can be validated, or fail, on its own.

**Goal:** a shopper can say "curry cut" on the goat they are buying and staff see it on the order;
and the platform's shared AI spend is visible and controllable without a terminal, and cannot
silently exhaust the shared allowance on the Free plan.

## Half 1 — custom item notes (`#1135`)

### Data

Four additive columns, one migration:

- `Category.allowsCustomNote Boolean @default(false)`
- `Product.allowsCustomNote Boolean @default(false)`
- `CartItem.customNote String?`
- `OrderItem.customNote String?` — a snapshot, exactly like `OrderItem.productName`.

**Acceptance rule (one function, used everywhere):** a product accepts a note when
`product.allowsCustomNote` is true, **or** its category's `allowsCustomNote` is true, **or** its
category has a parent whose `allowsCustomNote` is true. The category tree is structurally two
levels deep (`lib/repositories/categories.ts`, "THE TREE IS TWO LEVELS DEEP"), so no deeper walk is
needed. One pure function decides it, so the cart, the product page and checkout cannot disagree.

**Note normalisation (one function):** trim; replace any run of whitespace, including newlines, with
a single space; remove control characters; cap at **200 characters**. An empty result means "no
note" and is stored as `null`.

### Where a note is written

- **Product detail page** (`app/(storefront)/products/[slug]/page.tsx`): when the product accepts
  notes, a labelled single-line text input sits with the Add to basket control. A non-empty note is
  sent with the add and **replaces** the line's existing note; an empty one leaves an existing note
  alone. Product cards and the Quick View drawer get no note box.
- **Basket line** (`components/cart/CartContents.tsx`, rendered by both the header drawer and
  `/cart`): a line whose product accepts notes shows its note and lets the shopper edit or clear it
  through a new server action. A line whose product does not accept notes shows no note control.
- **Copy is neutral** (CLAUDE.md, "UI copy comes from the vendor or is neutral"). No component or
  default parameter names a vendor or a grocery example such as "curry cut".

### Where a note travels

- `addCartItem`/`addCartItems` accept an optional note; `applyCartMerge` keeps notes (KEEP_SAVED and
  KEEP_NEW keep their own side's notes; COMBINE uses the guest line's note when it is non-empty,
  otherwise the saved line's).
- **Checkout** (`placeOrder`, `lib/repositories/orders.ts`) re-reads the note inside its transaction
  alongside prices, and copies it to `OrderItem.customNote` **only if the product still accepts
  notes at that instant**; otherwise the order line's note is `null`. This never fails checkout.
- **A note that will be dropped is not dropped silently.** The basket shows such a line's note with a
  sentence saying the item no longer takes notes and the note will not be sent with the order.
- **Restoring a basket** after a failed or cancelled payment (`restoreCartFromOrder`) and **ordering
  again** (`lib/restore-lines.ts`) carry each line's note back into the basket.
- **Read surfaces:** the shopper's order detail (`/account/orders/[orderNumber]`), the checkout
  result page that reads `findOrderForViewer`, the staff order detail
  (`/staff/orders/[orderNumber]`), and the order confirmation email
  (`features/checkout/send-confirmation.ts`). The staff order list marks any order that carries at
  least one note, so a note cannot be missed by someone packing from the list.
- **The confirmation email HTML-escapes the note.** That template interpolates strings into HTML
  today and no escaping helper exists in the repo; a shopper-typed note is the first
  attacker-controlled string to reach it. The product name is escaped by the same helper while the
  line is being touched.

### Data rights

A note is free text a shopper typed, so it is treated as personal data:

- The signed-in export and the guest-order export include `customNote` on order items, and the
  signed-in export includes it on cart items.
- `eraseVendorData` and `eraseGuestOrderData` set `customNote` to `null` on the items of every order
  they anonymise (carts are already deleted by erasure, which removes their notes).

### Staff

`components/staff/CategoryForm.tsx` and `components/staff/ProductForm.tsx` each gain one checkbox,
parsed by `lib/catalogue-form.ts` and saved by the existing `saveCategory`/`saveProduct` actions
under their existing role gates. No new staff page.

## Half 2 — the AI allowance (`#1028`, `#1029`, `#1031`)

### Plan mode (`#1028`)

- A new config key `WORKERS_AI_PLAN` in `lib/config.ts`'s `aiSchema`: `"free"` or `"paid"`. Unset or
  any other value resolves to `"free"` — a typo must never remove the shared cap.
- It is an environment setting, not a `VendorConfig` column, because it describes the Cloudflare
  account every vendor shares, not a vendor (ADR-004 governs vendor data).
- `createAiMeter` takes the plan as an explicit parameter, so the meter stays runnable from a plain
  script; every caller (`lib/ai-meter-service.ts`, the services and scripts that build a meter
  directly) passes `getAiEnv()`'s value. A required parameter makes `typecheck` find them all.
- **Free:** `check()` refuses when the vendor's own budget is used (unchanged), and otherwise also
  refuses when the platform's total since 00:00 UTC — all vendors — has reached **10,000 neurons**.
  A platform refusal carries `scope: "platform"` and its own message, so staff can tell "your store
  is out" from "the whole platform is out".
- **Paid:** no platform check. Per-vendor budgets still apply.
- Fail closed on a database error, as today.
- **Behaviour today does not change.** Two vendors at the 3,000 default spend at most 6,000, under
  the 10,000 cap; the cap bites only once budgets are raised or vendors added.
- The platform total needs a repository read with no `vendorId`. It is added to
  `lib/repositories/ai-usage.ts` with a justified entry in `tests/repository-vendor-scoping.test.ts`'s
  allowlist, the same mechanism the webhook binding refusal uses.

### Staff AI page (`#1029`)

A new page `/staff/ai-usage`, gated `requireVendorRole("ADMIN")` (store admins and platform admins):

- Today's neurons used and the vendor's daily budget; for each `AiFeature`, neurons today and over
  the last seven UTC days (today and the six before it).
- The plan mode. In Free mode, the platform's shared total today against 10,000.
- **Platform admins only:** in Paid mode, the estimated charge for today's platform usage above
  10,000 neurons, and a form to set this vendor's `aiDailyNeuronBudget` (integer 0–1,000,000; `0`
  turns AI off). The form's server action re-checks `auth.via === "platform-admin"` and refuses
  everyone else; hiding the form is not the control. Store admins see the budget read-only — it caps
  the platform's shared spend, which is not theirs to raise.
- The page lands on all three surfaces (`components/staff/PanelNav.tsx` admin tier, the hub at
  `app/(admin)/staff/page.tsx`, a "Store admins only" section in
  `docs/store-admin-guide/admin-tabs-guide.md`) and refuses with `PanelRefusal`. The platform-admin
  guide gains a paragraph on setting a budget and on `WORKERS_AI_PLAN`.
- `scripts/ai-usage.ts` stays as it is.

### Backfill refusal tone (`#1031`)

`POST /api/admin/jobs/backfill-images` keeps answering **200** on a budget refusal (so partial
progress is still reported and no product is written off) and adds `budgetRefused: true`.
`components/staff/BackfillImagesButton.tsx` renders that case in its existing **error** tone
(`role="alert"`) rather than the success tone. No new design token: the repo has no warning tint,
and the existing error tone is what `#1031` asked for as one of its two options.

## Deliberately excluded

- **Unpriced request lines** and any payment-model change — ruled out at Propose.
- **A per-product opt-out inside a ticked category** — ruled out at Propose.
- **Shopping-list notes.** `ShoppingListItem.rawText` is already free text and is not linked to a
  product; the brief's "cart/list" is met by the basket line.
- **"Fix existing free-text"** — deferred by the owner until there is a route or symptom (`#1135`).
- **More than one note per product in one basket** (e.g. 1 kg curry cut and 1 kg mince of the same
  product). `CartItem`'s `(cartId, productId)` uniqueness stays; that would be a cart-model change.
- **Notes in status emails, the guest order lookup summary, the staff order list preview text, and
  Stripe line descriptions.** The staff list gets a "has notes" marker, not the note text.
- **A vendor-configurable note label or placeholder.** Neutral copy only; a `VendorConfig` field can
  follow if the owner wants store-specific wording.
- **Privacy-page wording about notes.** The notes are covered by export and erasure in this slice;
  whether `/privacy` should name them is a legal-copy decision for the owner, carried below.
- **Revisiting the 3,000 default budget** (`#1028`'s step 3) — the Free cap now protects the pool
  regardless.
- **Verifying which plan the Cloudflare account is actually on.** The code no longer depends on it;
  setting `WORKERS_AI_PLAN=paid` is an owner action once the dashboard is read.

## Open items carried forward

- **Owner:** read the Cloudflare dashboard's Workers plan and, if Paid, set `WORKERS_AI_PLAN=paid`
  on staging and production (Cloudflare var or secret per `docs/developer-portal/env-setup.md`).
  Until then both run Free mode. Recorded on `#1028`.
- **Owner:** decide whether `/privacy` should mention item notes. If yes, a follow-up issue.
- **Owner, after promotion:** tick the categories (e.g. Meat, Fish) or products that should take
  notes for Aheed at `/staff/categories` / `/staff/products`. Nothing accepts notes until then.
- The Free-mode cap counts only this platform's ledger, part of which is estimated; other usage on
  the same Cloudflare account is invisible to it. It protects against our own spend, not against
  Cloudflare's own cut-off. Stated in `specs/architecture.md`.
