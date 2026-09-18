---
id: p116-saved-shopping-lists
title: "Saved shopping lists (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-18
visibility: internal
summary: A signed-in shopper can save a reusable shopping list and re-open it against today's catalogue. Stores the shopper's own words, not product ids, so a saved list survives catalogue churn and stays different from reorder.
tags: [cart, lists, account, storefront, p10]
related: [architecture, roadmap, sdd-workflow]
---

# Saved shopping lists (plan)

**Closes #116.**

**Goal:** give a shopper who buys roughly the same things every week a list they save once and
re-open every week, matched against whatever the shop stocks *today*. Shipping this proves the
saved-list aggregate can exist without a single foreign key to `Product` — which is what keeps it
from collapsing into a second, worse copy of reorder.

## Why this shape, and not the obvious one

#116's own text assumed a `ShoppingList` / `ShoppingListItem` pair holding **product references**,
and then said the honest thing about it: P4's reorder "probably supersedes half of what a saved list
is for." That warning is correct, and it is the whole reason this slice does something else.

`reorderItems` (`features/orders/reorder-items.ts`) already answers **"the same products as last
time, exactly."** A product-id list would answer the same question with a nicer name on it. The
question reorder *cannot* answer is the one a weekly grocery shopper actually has: **"here is my
standing list in my own words — show me what you have for it this week."** Those differ whenever the
catalogue moves, which for a grocer is constantly: a line goes out of stock, a product is relisted
under a new name, a size changes, or the shopper writes down something this shop has never stocked.

So a `ShoppingListItem` stores **the shopper's line and its search terms**, never a `productId`. On
open, the list runs the pass P3d already ships and P2.6 already improved: `parseList` →
`ProductRepository.matchListTerms()` (one query, candidates capped at 200) → `resolveLines()` → the
mandatory review step → `addListToCart`. Every per-line decision stays where it already lives.

Three consequences worth stating, because they are the argument for the design:

- **Catalogue churn is free.** No nullable FK, no `onDelete` decision against `Product`, no
  "no longer available" UI branch. A delisted product simply stops matching, and the review screen
  already renders exactly that.
- **Unmatched lines are kept, deliberately.** A line this shop has never stocked stays in the saved
  list and re-matches every week. Under a product-id model it could not be stored at all. This is a
  feature, not a leak — it is the shopper's own note to themselves.
- **The AI pre-pass is paid for once.** `lib/list-normalisation.ts` runs at match time on
  `/shop-your-list`; saving persists the **normalised** line, so re-opening a list costs one DB
  query and no model call. Re-opening never calls Workers AI.

**Alternatives considered and rejected.** A product-referencing model (the issue's own assumption) —
rejected above. A hybrid storing `rawText` *plus* a cached `productId` — genuinely defensible, and
the most faithful long-term, but it carries two sources of truth per line that can disagree and
needs a staleness rule nobody has written; deferred rather than guessed at. Re-parsing the raw
pasted textarea at save time instead of persisting per-line fields — simpler, but it throws away the
AI normalisation the shopper just reviewed, so a re-opened list would match *worse* than the screen
they saved from.

## Scope (this slice)

**Schema — two new tables, one migration.**
`ShoppingList` (`vendorId`, non-null `userId`, `name`) and `ShoppingListItem` (`rawText`, `terms`,
`quantity`, `measure`, `brand`, `position`). `ShoppingListItem` has **no** `productId` and no
relation to `Product`.

**Why `terms` is a plain `String`, and why it exists at all** — the objections a strict reading of
`architecture.md` §3.1 would raise, answered here so they are not re-litigated at `/validate`:

- **Not a `Json` column.** §3.1 forbids `Json` for domain data, so `terms` is a space-joined
  `String`. That is lossless by construction rather than by convention: `toTerms()` emits lowercase
  tokens with whitespace already split out and surrounding punctuation stripped, so no token can
  contain a space, and split-on-read inverts join-on-write exactly. R11 asserts the round trip.
- **Not a third `ShoppingListItemTerm` table.** Terms are never queried, joined or filtered on in
  the database — they are read back whole, as one line's search input, and every per-line decision
  happens in pure code afterwards. A child table would add a join to every list open in order to
  normalise something nothing ever queries.
- **Not derivable from `rawText`, which is why it is stored at all.** `parseList(rawText)` returns
  the *deterministic* parse. When the AI pre-pass ran, `terms` holds the **normalised** words
  instead, and those cannot be recovered from the shopper's original line without calling the model
  again. `terms` and `rawText` are genuinely different facts — what we will search for, and what the
  shopper actually wrote. The review screen shows the second and matches on the first.

**Pure logic — `lib/saved-list.ts`** (new; no I/O, no Prisma import, mirroring `lib/shopping-list.ts`
and `lib/cart-rules.ts`). Serialising `ParsedLine[]` to rows and back, list-name normalisation, the
default name, and building lines from product names for the cart and order entry points.
`lib/shopping-list.ts` gains exactly one change: `toTerms` becomes exported.

**Repository — `lib/repositories/shopping-lists.ts`**, with `lib/shopping-lists-service.ts` as the
request-scoped facade. This copies `#764`'s `customer-addresses.ts` / `customer-addresses-service.ts`
pair almost line for line, including its ruling that **guests are not served**: every facade method
returns empty/null/false when nobody is signed in.

**The `getPrismaWs()` question, answered explicitly.** Creating a list writes N item rows, and
renaming writes through a vendor- and user-scoped `updateMany`. Both are the shapes `CLAUDE.md`
records as crashing *unconditionally* through the HTTP adapter (#382) while every local unit test
stays green. Create and rename therefore take the **WebSocket** client; `deleteMany` and the reads
take the ordinary one, exactly as `touchCustomerAddress` is split out today. `validation.md` proves
this against a real running Worker rather than against a hand-built double, because a double only
reproduces its author's guess.

**Server actions — one file per action**, under `features/lists/`: `save-list-from-match.ts`,
`save-cart-as-list.ts`, `save-order-as-list.ts`, `rename-list.ts`, `delete-list.ts`. One file per
action is deliberate: a consolidated `features/cart/actions.ts` is on record in `sdd-workflow.md` as
a spec deviation the first Clear-and-validate pass caught. Each file exports only async functions
(`#159` — a `"use server"` module exporting a plain const 500s every action in the file at runtime
while the build stays green).

**Three entry points**, all producing the same rows:
1. `/shop-your-list` — a "Save this list" form sibling to the existing add-to-cart form, carrying
   per-line hidden inputs so what gets saved is exactly what was reviewed, AI normalisation included.
2. `/cart` — "Save as list", from `CartSummary.lines` (`name` + `quantity`).
3. `/account/orders/[orderNumber]` — "Save as list", beside the existing Reorder button, from
   `OrderDetail.items` (`productName` + `quantity`).

For (2) and (3) the text is a catalogue product name, so `terms` come from `toTerms(name)` and no AI
call is made — a catalogue name re-matches itself exactly.

**Pages.** `/account/lists` (the shopper's lists; rename, delete, open) and
`/account/lists/[listId]` (server-resolves the list against today's catalogue and renders the
review). A card on `/account`. Both routes redirect to `/login` for a guest and `notFound()` for an
id belonging to another user or vendor.

**One refactor.** The review block inside `components/cart/ShopYourList.tsx` moves to
`components/cart/ListReview.tsx`, so `/shop-your-list` and `/account/lists/[listId]` render the same
component instead of two copies of the ambiguous-line select logic. `/shop-your-list`'s behaviour is
unchanged, and `requirements.md` carries a regression requirement saying so.

**Data-subject rights.** A new user-owned table is personal data. `lib/repositories/data-rights.ts`
gains saved lists in all **three** places — `exportPersonalData`, `countOtherVendorData` and
`eraseVendorData`. Nothing in `lint`/`typecheck`/`test` enforces this; missing one makes export and
erasure silently under-report, which is the failure mode P7b (#216) exists to prevent.

## Deliberately excluded

- **#232 (wishlist).** The roadmap groups it with this as "save-for-later," and it is **not** in
  this slice. It also will not reuse this aggregate: a wishlist is a set of *product references*,
  which is precisely what this model refuses to store. #232 needs its own table and its own
  `/propose`. Said plainly here so a later reader does not go looking for reuse that was never
  promised.
- **Guest lists and any sign-in merge.** Saving requires an account. `/shop-your-list` stays fully
  usable by guests and still writes nothing (P3a's rule that browsing creates no state). A guest
  merge would need a merge/dedupe rule, orphan expiry (the ground `#94` covers) and a nullable
  identity branch through every read, to serve a shopper who declined the account that a
  weekly-reuse feature is entirely aimed at. Same ruling, for the same reason, as `#764`'s.
- **"Add to list" from a product card or PDP.** That control is #232's, not this one's.
- **Any change to `reorderItems`.** The two features stay independent and both stay on the order
  page; the copy distinguishes them, the code does not touch.
- **Sharing, printing, or exporting a list**, list-level scheduling, and any "remind me weekly"
  notification. None is needed to prove the aggregate works.
- **A cached/hybrid `productId` per line.** See the alternatives above.
- **Money, payments, stock or loyalty.** This slice writes none and reads stock only through the
  existing review pass.

## Open items carried forward

- **Demand for this is unmeasured, and cannot be measured yet.** The platform has never traded
  (`#113` live Stripe keys, `#104` verified email domain — both open, both owner-gated). #116 asked
  to "sequence reorder first and see what demand is left"; reorder shipped in P4, but with no
  trading history there is no demand signal to read. This slice therefore ships on judgement, which
  is recorded here rather than implied.
- **Ambiguous lines are not remembered.** If a saved line offers three sizes, the shopper picks one
  every time they open the list; the choice is not persisted back. Persisting it is the hybrid model
  this slice deferred — worth revisiting only if real use shows the same line being disambiguated
  the same way repeatedly.
- **Board and milestone drift beyond #116.** #116's milestone was corrected from `P09.2` to `P10`
  at `/propose`. **#400** and **#613** carry the same wrong milestone, and **#695** and **#697**
  have none. Out of scope here; worth a sweep at a future `/document`.
