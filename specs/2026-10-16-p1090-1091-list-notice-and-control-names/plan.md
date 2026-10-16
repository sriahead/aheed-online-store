---
id: p1090-1091-list-notice-and-control-names
title: "Shop-list lines the cart notice never names, and header controls with doubled names (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-16
visibility: internal
summary: "Club F (#1090, #1091): /cart's notice now accounts for out-of-stock and unmatched shop-list lines through a fourth positional lineStatus field, and the four LocationControl buttons get one stable accessible name that does not depend on the stylesheet."
tags: [shop-your-list, cart, restore-notice, accessibility, accessible-name, header, p10]
related: [p1087-1088-1089-shopper-clarity, app-conventions]
---

# Shop-list lines the cart notice never names, and header controls with doubled names (plan)

Club F of the 2026-10-15 backlog clubbing. Both issues were found during
`specs/2026-10-14-p1087-1088-1089-shopper-clarity/` and deliberately left out of it: `#1090` is
recorded under that slice's "Deliberately excluded", `#1091` is a pre-existing defect its build
tripped over.

**Goal:** a shopper who submits a list lands on `/cart` with every line that did not go in named,
whatever the reason; and every button in the header's location control has one accessible name,
the same in a browser and in jsdom.

## #1090 — the two kinds of line `/cart` still loses

`#1088` made `/cart` name an ambiguous line the shopper left unresolved (kind `s`) and any line the
bulk add clamped (`p`, `h`). Two kinds still vanish at the redirect, because
`components/cart/ListReview.tsx` renders **no form fields** for them:

- a matched line whose product has zero stock (labelled in place "unavailable, not added");
- an unmatched line (labelled in place "No match in this shop").

`features/cart/add-list-to-cart.ts` reads `productId`, `quantity` and `lineLabel` **positionally**,
and the file's contract is that every rendered line emits all of them or none. Fixing `#1090`
means these two kinds start emitting fields — and the server then needs to know *why* a line came
back with an empty `productId`, which today always means "skipped".

**Approach (approved at Propose):** every line emits a fourth positional field, `lineStatus`, with
one of four values:

| Line | `productId` | `lineStatus` | `lineLabel` | Notice kind / code |
|---|---|---|---|---|
| matched, in stock | product id | `ready` | typed text | bulk add's own |
| ambiguous | select value (empty = skip) | `choose` | typed text | `skipped` / `s` when empty |
| matched, out of stock | empty | `unavailable` | **matched product's name** | `unavailable` / `u` |
| unmatched | empty | `unmatched` | typed text | `unmatched` / **`m` (new)** |

- `lineStatus` is read **only** when `productId` is empty. A non-empty `productId` always goes to the
  bulk add, whatever status accompanies it.
- An empty `productId` with a missing or unrecognised `lineStatus` is `skipped`, exactly as today.
  That keeps `#1088`'s behaviour for a review page rendered before this deploy and submitted after
  it (version skew), and for a crafted post.
- `lineStatus` is untrusted client input, and that is fine: it chooses only the **wording** of a line
  that added nothing. It cannot cause an add.
- The out-of-stock line is named by the matched product, because that is the name the review
  screen showed beside "unavailable, not added". The other kinds keep the shopper's typed text, as
  `#1088` settled.
- The `u` code and its copy (`<name>: not available right now`) already exist from `#957`; the new
  `m` code reads `<name>: not added, no match in this shop`. `parseRestoreNotice` validates `m` the
  same way it validates `s` (`added === 0`, `requested >= 1`).
- `lib/restore-lines.ts`'s `restoredLines` currently takes one `missingKind` for every id-less
  item. It gains a per-item kind; reorder and the unpaid-order cancel pass none and keep reporting
  `unavailable`.
- The `"m"` code is added to `RestoreEntryKind` and `"unmatched"` to `RestoredLineKind` in
  `lib/restore-notice.ts` — **not** to `lib/cart-rules.ts`'s `BulkAddKind`, for the same reason
  `#1088` kept `skipped` out of it: the bulk add never sees these lines.

**This supersedes `#1088`'s R9.** That slice's test asserts only two of four rendered line kinds
emit fields, and the header comment in `add-list-to-cart.ts` says "every rendered line emits ALL
THREE inputs or none". Both are rewritten, not left beside the new behaviour: every line now emits
all four.

**Rejected — send the real product id for an out-of-stock line and let the bulk add decide.** A
product restocked between review and submit would then be added, contradicting the "unavailable,
not added" the review screen showed and the "Add N items" count the shopper pressed. And it does
nothing for an unmatched line, which has no id.

## #1091 — doubled accessible names in `LocationControl`

`components/layout/LocationControl.tsx` switches label text by viewport with two sibling spans
(`hidden sm:inline` and `sm:hidden`). In a browser exactly one is `display: none` at any width, so
the name is right; anywhere the stylesheet is not applied — jsdom included — both count and the
name doubles. Four buttons carry the pattern:

| Button | Wide span | Narrow span | Fix |
|---|---|---|---|
| Collect toggle | `Click & Collect` | `Collect` | `aria-label="Click & Collect"`; both spans `aria-hidden` |
| Delivery toggle (deliverable postcode) | `Delivery · {postcode}` | `{postcode}` | `aria-label` = `Delivery · {postcode}`; both spans `aria-hidden` |
| Delivery affordance (no deliverable postcode) | `Delivery` | `Delivery` | collapse to one plain span; no `aria-label` |
| No-collection single button | `Delivery · {postcode}` or `Check delivery availability` | `Delivery · {postcode}` or `Check delivery` | `aria-label` = the wide text; both spans `aria-hidden` |

Each `aria-label` contains the narrow span's visible text, so WCAG 2.5.3 (Label in Name) holds at
every width. Classes are untouched, so the visual result at every breakpoint is unchanged.

`tests/location-control.test.tsx`'s `deliveryAffordance()` structural helper — written precisely
because of this defect — is replaced by `getByRole("button", { name })`.

**Rejected — one span whose text a CSS technique switches.** It moves copy into CSS, and jsdom still
could not check it.

## Deliberately excluded

- **The header's icon-plus-text links** (`components/layout/Header.tsx:290,303,316,324` — Shop,
  Shop List, account, Sign In). They use a **single** `hidden sm:inline` span, so their name does
  not double; at narrow widths it falls back to the link's `title`. That is a different question
  (whether `title` is an adequate name) and not what `#1091` reports.
- **`aria-pressed` on the method toggle.** The toggle's selected state is conveyed visually only.
  Real, but a different defect from a doubled name; not raised by either issue.
- **A screen-reader pass.** `#1091` suggests checking `Click & Collect` against a real screen
  reader. This slice makes the name authoritative via `aria-label`, so the jsdom name and the
  browser name are the same string by construction; validation checks the browser's computed name
  in Chrome's accessibility tree, not with assistive technology.
- **A list where nothing is addable.** The submit button is disabled when `readyCount === 0`, so
  such a list never reaches `/cart`; each line is already labelled on the review screen. Unchanged.
- **Reworking the notice heading.** `k of N items from your list couldn't be added in full:` stays.
  `N` now counts every line on the list, including out-of-stock and unmatched ones, which is
  accurate.

## Open items carried forward

None. No owner decision, credential or prerequisite slice is needed.
