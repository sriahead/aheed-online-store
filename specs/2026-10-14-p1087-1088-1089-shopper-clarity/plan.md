---
id: p1087-1088-1089-shopper-clarity
title: "Shopper clarity: delivery intent, skipped shop-list lines, privacy copy (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-14
visibility: internal
summary: "Three storefront honesty defects from the owner's 2026-10-13 user-testing pass: entering a postcode from the Delivery affordance now selects Delivery without reverting #748, a skipped shop-list line is accounted for on /cart, and the privacy page leads with purpose instead of cookie names."
tags: [storefront, fulfilment, shop-list, privacy, p10, user-testing]
related: [user-testing-feedback-2026-10-13, roadmap, app-conventions]
---

# Shopper clarity: delivery intent, skipped shop-list lines, privacy copy (plan)

**Goal:** close the three "the shopper has to guess" defects the owner hit in the 2026-10-13
user-testing pass — `#1087`, `#1088`, `#1089` ("Club A"). Two are P1, pre-trading: a shopper who
enters a deliverable postcode can be left on Click & Collect with their own postcode invisible, and
a shop-list line they declined to resolve disappears with no acknowledgement anywhere. The third is
a P2 copy defect on `/privacy`. Shipping this slice means no storefront flow in Club A silently
discards the shopper's input.

The three items share a theme and nothing else: three independent files, **no schema change, no
migration, no new dependency**. They are one slice because each is small and none can collide with
the others, not because they are one mechanism.

## Scope (this slice)

### `#1087` — a deliverable postcode entered from the Delivery affordance selects Delivery

The defect is an interaction between two correct decisions. `setDeliveryPostcode`
(`features/storefront/delivery.ts:49-75`) deliberately does not touch the fulfilment method: `#748`
removed that because editing a postcode silently switched a Click & Collect shopper back to
Delivery. Separately, `getFulfilmentMethod` (`lib/fulfilment-service.ts:34-54`) prefers a stored
cookie over `defaultFulfilmentMethod`. So once `fulfilment-method` holds `COLLECTION`, entering a
postcode can never select Delivery, and because `LocationControl.tsx:64-65` shows the postcode only
when `method === "DELIVERY"`, the postcode the shopper just typed becomes unreadable — the pencil
appears instead, which is the "instead shows the edit" half of the report.

**Precision this slice depends on, and the reason the fix is intent-scoped rather than a revert:**
a shopper who has never touched the toggle is *not* affected — `defaultFulfilmentMethod`
(`lib/fulfilment-cookie.ts:50-56`) already returns `DELIVERY` as soon as the postcode is
deliverable. The defect needs a pre-existing `COLLECTION` cookie, which is exactly what a
collection-offering vendor serves to every visitor who has no postcode yet. The reported path is:
land on the store, see Click & Collect preselected, click **Delivery**, enter a deliverable
postcode, and stay on Click & Collect.

So the method must follow the shopper's **intent**, which the opener of the modal already encodes:

- Opened from a Delivery affordance (`LocationControl.tsx:111`, and `:141` for a vendor with no
  collection) — the shopper is asking to have it delivered. A deliverable postcode selects
  `DELIVERY`.
- Opened from the **pencil** (`:129`) — the shopper is changing where they live, not how they
  receive the order, which is `#748`'s own distinction, recorded in the comment at `:118-125`. The
  method is untouched.

The intent travels as a hidden form field, so the server action decides it and no client state is
trusted. The field name and its parser go in `lib/delivery-cookie.ts`, the existing plain sibling of
the `"use server"` module, because that file may export only async functions.

Deliverability inside the action costs nothing extra: `getDeliveryEligibility` is wrapped in React
`cache()` and `recordRefusalForPostcode` (already called at `:69`) resolves the same postcode in the
same request, so `isPostcodeDeliverable(submitted)` is a cache hit. The action still stores the
postcode only, never the verdict — the rule that file's own header sets out.

Second half: the control shows the stored deliverable postcode whatever the method, so it is never
unreadable.

### `#1088` — a skipped shop-list line is accounted for

`features/cart/add-list-to-cart.ts:30` drops a line whose `productId` is empty — the "Skip this
line" option at `ListReview.tsx:111` — and `:50` ends in a bare `redirect("/cart")` carrying nothing.

**Reuse, not a second mechanism.** `lib/restore-notice.ts` was built by `#957` for exactly this
class of defect ("not everything went back in"), is written by `features/orders/reorder-items.ts:43`
and rendered on `/cart` by `components/cart/RestoreNotice.tsx`. This slice adds a third
`RestoreSource` and a fourth entry kind to it rather than inventing a parallel notice.

**The alignment constraint is the whole design problem.** `add-list-to-cart.ts` reads `productId`
and `quantity` positionally, and its header comment states the contract: every rendered line emits
both inputs or neither. Only matched-in-stock and ambiguous lines emit them; out-of-stock and
unmatched lines emit nothing. A skipped line therefore reaches the server as an *empty*
`productId` — countable, but **nameless**, because the line's text lives only in the client.

The fix extends that contract from two aligned fields to three: every line that emits
`productId`/`quantity` also emits a `lineLabel` hidden input carrying `line.original`. The server
then knows the text of any line whose `productId` is empty. Chosen over a conditional
`skippedLine` input driven by the component's `choices` state because a hidden input gated on client
state is wrong whenever the select is changed without React — it would report a line the shopper
actually resolved as skipped. The positional label needs no client state and cannot produce a false
skip.

Pre-submit, the review step also states how many ambiguous lines are still unresolved, beside the
existing honest `readyCount` button label.

**One thing folded in because it costs nothing.** `addItems` returns `BulkAddLine[]`
(`lib/repositories/cart.ts:116`) and `addListToCart` discards it today. A line clamped by stock, or
one whose stock the cart already holds in full, is therefore dropped as silently as a skipped line —
the same complaint, one layer down. A stock clamp between review and submit is a race, but
`at_limit` is not: a shopper whose cart already holds everything in stock gets nothing added and is
told nothing, reproducibly. Passing that returned kind straight into the notice reuses `#957`'s
existing `u`/`p`/`h` codes and adds no query, so the notice accounts for the whole submission rather
than only the skip.

**One correction to the triage**, recorded because `requirements.md` is written against it:
`ListReview.tsx:32,139-144` already computes `readyCount` and labels the button "Add N items to
cart", so the pre-submit **count** is honest today. The triage's "counts only ready lines into the
button label" reads as if the label were the defect; it is the existing mitigation. What is missing
is naming the skipped lines before submit and any acknowledgement at all after the redirect.

### `#1089` — the privacy page leads with purpose, not with the cookie name

`app/(storefront)/privacy/page.tsx:76-103` lists seven storage items, each led by its technical name
in `<code>` style with the purpose second. The list itself is correct and deliberate — `#1064` built
it because the page previously named `aheed_session`, a string in no code, and omitted four items
the storefront really sets. This slice inverts the presentation and keeps every name: naming the
cookie is the transparency posture under PECR/UK GDPR, so removing the names would trade one defect
for another.

`tests/privacy-cookies-section.test.tsx` pins the exact wording and order and ties three names to
their exported constants. It is updated in the same commit — that test firing is it working as
designed.

## Deliberately excluded

- **Renaming the four `aheed_`-prefixed storage keys** (`#1080`, open). SriMart's privacy page
  publishing another vendor's name is a real multi-tenancy defect of the same class as `#239`, but
  renaming `aheed_cart` or `aheed_cookie_consent` drops every live cart and consent record, so it
  needs a migration plan. `#1089` changes presentation only and **must not** rename a key.
- **Reverting `#748`.** An unconditional "a deliverable postcode selects Delivery" would re-introduce
  the exact defect `#748` fixed. The pencil path keeps today's behaviour, and R5 is the regression
  guard.
- **Lines the review step never submits at all** — a matched line with zero stock
  (`ListReview.tsx:70-75`) and an unmatched line (`:127-132`). Both are already labelled in place on
  the review screen, neither is what the owner reported, and including them means emitting form
  fields for lines that currently emit none, which is the one change most likely to break the
  positional contract. **Not to be confused with the add-time `unavailable` outcome folded in
  above:** that is `addItems` reporting a line it was *sent* and could not add, and it is in scope.
  The new `"list"` source does not preclude adding the never-submitted lines later.
- **Referral economics as vendor data** (item 12.1), **staff-nav grouping** (item 1b) and the
  **spotlight query** (item 10 / `#1030`). Separate items in the triage's own clubbing, one of them
  needing a migration.
- **Items 14 and 16** from the triage: both need the owner before they can be filed at all.

## Open items carried forward

- `#1080` — the `aheed_`-prefixed keys. Untouched here, and `#1089`'s requirements forbid touching
  it so the two cannot be confused later.
- `#1034` — `getRewardsDataForUser` creating a referral code on every signed-in render. Adjacent to
  the triage's item 16 and not in this slice.
- The triage document gains its dated status register in this slice's commit: the register is the
  evidence this scope came from, and it is currently uncommitted on a merged branch.
