---
id: p1186-1187-quick-shop-hub-plan
title: "The Quick Shop hub, and a Regulars placeholder (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-20
visibility: internal
summary: "Slices 2 and 3 of the Quick Shop programme, combined: a four-tile hub (#1187) at /quick-shop, an authenticated-only Regulars placeholder (#1186) at /account/regulars, and the paste-a-list page retitled Smart Lists with its saved-list preview relabelled to one name."
tags: [quick-shop, navigation, storefront, account, copy]
related: [architecture, design-system, app-conventions, p232-1185-favourites-card-controls-plan, p1180-shared-page-container-plan]
---

# The Quick Shop hub, and a Regulars placeholder (plan)

**Goal:** finish the Quick Shop programme. The header's Quick Shop button stops opening a textarea
and opens a hub with four real destinations, and the last missing destination — Regulars — gets a
page. Shipping this proves the programme's shape end to end: one entry point, four things a
returning shopper can do, and no dead tile in any deployed state.

## Why both issues are one slice

`#1187` requires that it "lands last of the three, once all four tiles have real destinations".
Combining it with `#1186` satisfies that **by construction** rather than by sequencing discipline:
the hub and its fourth destination appear in the same commit, so no deployed state ever shows a
shopper a tile that goes nowhere.

Split, `#1186` could only deliver half of its own stated scope — it names "the Quick Shop hub's
Regulars tile, **and** `/account`" as its two entry points, and the hub would not exist yet — so
`#1187` would then re-edit the page `#1186` had just added. The repository has done this before on
purpose: `#232`+`#1185` shipped as one slice because both rewrote the same region of
`ProductCard.tsx`, and `#1131` absorbed `#1132`/`#1133` at the owner's direction.

Both issues were opened and read in full before being cited here (`#1186` "Regulars page:
placeholder for frequently ordered items (derivation deferred)", `#1187` "Quick Shop landing page
with four tiles, and the paste-a-list page retitled Smart Lists"), as were `#1184` and `#1188`,
which are deferred out of the programme and **not** closed by this slice.

## The naming problem, and why the fix is one string

`#1187` describes the "Your saved lists" block on `/shop-your-list` and the `/account/lists` page as
"two different list concepts" on one screen. **They are not two concepts.** Both render the same
data from the same call: `app/(storefront)/shop-your-list/page.tsx:43` awaits
`getShoppingListService().list()`, and so does `app/(storefront)/account/lists/page.tsx`. The block
at `:47` is a truncated preview — the first `QUICK_PICK_LIMIT` entries, each linking to
`/account/lists/<id>`, under a "Manage your lists →" link pointing at `/account/lists`.

So retitling the page "Smart Lists" would leave **one concept wearing three labels**: "Smart Lists",
"Your saved lists" and "Your lists". That is precisely the failure `#1145` was opened to fix — the
feature had three names ("Shopping List", "Shop your list", "Match my list") and `#1145` collapsed
them to one — re-created on a neighbouring surface a fortnight later.

The owner's decision (recorded on `#1187`, 2026-10-20): **"Smart Lists" names the paste-a-list
*page*; the saved-list *collection* keeps one label everywhere.** The whole fix is renaming the
preview block's `<h2>` from "Your saved lists" to "Your lists", matching `/account/lists`. Two names
remain on screen, but they now name two genuinely different things — an action page and a collection
— and the collection has no aliases left.

Rejected, with reasons: keeping the tile and the page heading different (`#1187`'s own first option
— a shopper taps "Smart Lists" and lands on a page not called that, which is the `#1145` disease in
a new place); and deleting the preview block (removes a working shortcut and reaches into `#116`'s
saved-list journey, which `#1187` puts out of scope).

## Scope (this slice)

**1. `/quick-shop` — the hub.** New `app/(storefront)/quick-shop/page.tsx`, `<h1>Quick Shop</h1>`,
four tiles. It reuses `app/(storefront)/account/page.tsx:84-125`'s existing tile markup verbatim
(`rounded-2xl border border-black/10 bg-white p-5 hover:border-action transition block`, a lucide
icon, a bold label, a muted sentence) rather than inventing a tile style — reuse before create.

**It reads no session and queries no database.** All four tiles render for every visitor, and the two
authenticated-only destinations redirect on tap exactly as `/account/favourites` already does. That
is the owner's decision, and it is also what keeps the module free of `getAuth()`/`getPrisma()`.
The `(storefront)` layout is already `export const dynamic = "force-dynamic"`
(`app/(storefront)/layout.tsx:9`, because the Header reads the session), so this page needs no
rendering directive of its own — the same position `app/(storefront)/help/page.tsx` is in.

**Tile labels equal their destination's own `<h1>`.** This is the naming decision applied
consistently rather than only to the one block that forced it:

| Tile label | Destination | That page's `<h1>` today |
|---|---|---|
| Your favourites | `/account/favourites` | "Your favourites" (shipped, `#232`) |
| Your regulars | `/account/regulars` | "Your regulars" (new, this slice) |
| Smart Lists | `/shop-your-list` | "Smart Lists" (retitled, this slice) |
| Value Bundles | `/bundles` | "Value Bundles" (shipped, `bundles/page.tsx:80`) |

`#1187`'s body names the tiles informally as "Favourites, Regulars, Smart Lists and Bundles". Two of
those would not match the page they open, so the labels above use each destination's real name. The
alternative — editing `/bundles`'s `<h1>` to "Bundles" — would reach outside this slice's scope for
a cosmetic gain.

**2. `/account/regulars` — the Regulars placeholder.** New
`app/(storefront)/account/regulars/page.tsx`, built on `/account/favourites` as its template:
`export const dynamic = "force-dynamic"`, read the session, `redirect("/login")` for a guest, a
`ChevronLeft` "Your account" back link, `<h1>Your regulars</h1>`, and one placeholder sentence.

Authenticated-only is the owner's decision and the only coherent one: order history requires an
account, so a guest-reachable Regulars page could never hold content. `#232` settled the identical
question for favourites the same way.

The sentence lives in a new `lib/regulars.ts` as `REGULARS_PLACEHOLDER_MESSAGE`, mirroring
`lib/favourites.ts:46`'s `FAVOURITES_EMPTY_MESSAGE` and its stated reason — "exported so the page
and its test assert against one string rather than two copies of it". It also gives the eventual
derivation a module to live in.

**3. A Regulars tile on `/account`**, beside the existing six (`account/page.tsx:88-160`:
orders, lists, favourites, loyalty, feedback, data), using the same tile class string as its
siblings.

**4. The rename, by enumerated call site.** `#1187` asks for this explicitly — "the spec should name
every call site rather than relying on grep alone", because this is the second rename of the same
surface in a fortnight. Every site, measured on 2026-10-20:

- **3 hrefs to `/shop-your-list`** — `components/layout/ShoppingListLink.tsx:18` (becomes
  `/quick-shop`), `app/(storefront)/cart/page.tsx:64` (**unchanged** — stays pointed at the paste
  page), `app/(storefront)/account/lists/page.tsx:52` (**unchanged**, same reason).
- **6 visible "Quick Shop" strings** — `ShoppingListLink.tsx:19` (`aria-label`, stays "Quick Shop",
  now accurate for a hub) and `:24` (visible text, stays); `shop-your-list/page.tsx:23`
  (`metadata.title` → "Smart Lists") and `:43` (`<h1>` → "Smart Lists"); `cart/page.tsx:68` (→
  "Smart Lists", since that link opens the paste page); `account/lists/page.tsx:53` (→ "Smart
  Lists", in the sentence "Paste a list on `<link>`" — backticked because this file is rendered as
  MDX on the internal docs site, where a bare `<link>` is parsed as an unclosed JSX element and
  fails the Nextra build).
- **`ShoppingListLink.tsx:21`'s `title="Shop by pasting your list"` becomes false** once the link
  opens a hub, and is rewritten. Its `aria-label` and visible text must stay identical to each
  other — WCAG 2.5.3, recorded in that file's own comment.
- **`account/page.tsx:106`'s Lists tile copy** reads "Manage saved items, recurring shopping lists,
  and quick shopping", which now collides with Favourites, Regulars and Quick Shop by name. It is
  rewritten to describe saved lists only.

Keeping the `/cart` and `/account/lists` links on the paste page is deliberate, not an oversight:
both exist to get a shopper with a list straight to the textarea, and `/cart`'s link is documented
as "the other cart-entry path (P3d, `#114`)". It also leaves a one-tap paste route in place, which
is the mitigation for the header button now costing two taps — a cost the owner accepted.

**5. Two rows in `tests/page-container.test.ts`'s `EXPECTED` registry.** That test asserts "every
page on disk has an expected width recorded" and "every recorded page still exists", so two new
pages mean two new rows or a red suite. Both are `standard` / `padY: default`.

`standard` for the hub matches `/account`, the tile grid it borrows from. `standard` for Regulars
matches its account siblings rather than `/account/favourites`'s `wide` — favourites is `wide`
specifically because it renders a `ProductGrid`, and this page renders one sentence. **When the
derivation lands and the page renders a grid, its row moves to `wide`**; the registry is what will
force that to be a decision rather than a drift.

`/quick-shop` stays out of `app/sitemap.ts`'s `STATIC_PATHS`: it is navigation with no indexable
content of its own, which is exactly that list's documented rationale (`sitemap.ts:38-47`).
`/shop-your-list` keeps its URL, so bookmarks, the sitemap and every inbound link keep working —
the same reasoning `#1145` used.

## Deliberately excluded

- **The Regulars derivation itself.** `#1186` is explicit that "regularly ordered" has no definition
  and cannot be queried without one: a **threshold** (how many orders make a regular), a **window**
  (all time, or rolling — without one a product bought weekly for a year then abandoned stays
  "regular" forever), **vendor scoping** (per ADR-004 a shopper may hold orders with more than one
  vendor, so it is per `vendorId`), **which order states count** (`#795` found a
  cancelled-but-unrefunded order drops money still in the bank; the same question applies to a line
  item), and **cost** (a per-shopper aggregate over order history, needing a bounded query or a
  cache). This slice ships the route, the page, the sentence and the two entry points only.
- **`#1184`** — reading a list from a photo on Smart Lists. Deferred out of the programme; stays
  open, not closed by this slice.
- **`#1188`** — keyset paging for the unbounded favourites list. Same.
- **Renaming code identifiers** — `ShopYourList`, `ShoppingListLink`, the `shop-your-list` route
  segment. A shopper never sees them, and `#1145` excluded this for the same reason.
- **Any change to matching, parsing, the 100-line cap, saved lists or the review step.** `#1187`
  puts all of these out of scope, and nothing here touches them.
- **`tests/quick-shop-copy.test.tsx` needs no edit**, which is worth stating because its name
  suggests otherwise. Every assertion in it is about the `ShopYourList` *form* — the textarea label,
  the two quantity-hint branches, the "Find my items" button — and none reads the page's `<h1>` or
  `metadata.title`. This slice changes the page heading, not the form.
- **A tab in `components/account/AccountNav.tsx`.** This is the one deliberate omission a reviewer
  is most likely to read as an oversight, so it is recorded here with its evidence. That component
  is the persistent horizontal nav rendered across every `/account/*` page and `/feedback` (`#836`),
  and it lists six destinations — Overview, Orders, Lists, Loyalty & Rewards, Feedback, Data rights.
  **`/account/favourites` is not among them**: `#232` added the page and the `/account` tile but no
  nav tab, and nothing catches it — `tests/account-nav.test.tsx` asserts a hardcoded list of six
  and has **no parity check against the pages on disk**, unlike `tests/staff-nav-parity.test.ts`
  for `/staff/*` or `tests/page-container.test.ts`'s width registry.

  Regulars therefore follows its shipped sibling exactly: reachable from the hub and from
  `/account`, absent from the persistent nav. Adding a tab for Regulars alone would leave
  favourites the single omission, which is worse than the consistent state. Adding both would be a
  visual change to eight pages through a shared nav with scroll affordances — the kind of
  shared-surface edit `#1177` showed deserves its own propose, not a ride on a hub slice. **The
  real gap — both pages, plus the missing parity test that would have caught either — is filed as
  `#1191`.** `AccountNav.tsx` and its test are untouched by this slice, and R28 asserts that so a
  later pass cannot quietly add one and call it tidy-up.
- **No schema change, no migration, no new dependency.** Nothing here reads or writes a new column.
- **`/bundles` is untouched**, including its `<h1>`.

## Open items carried forward

- **The Regulars derivation is `#1192`**, filed at this slice's `/build-notes`. `#1186` itself
  closes here, since the placeholder is its whole stated scope — which is exactly why the derivation
  needed an issue of its own rather than inheriting one. The five decisions above need their own
  `/propose` before anything queries `OrderItem`.
- **The account-nav gap is `#1191`**, also filed at `/build-notes`: Favourites *and* Regulars are
  both missing from `components/account/AccountNav.tsx`, and no parity test would catch either.
- **`#1184`** and **`#1188`** remain open and unscheduled.
- **Carry-forward from the previous slice.** `docs/p232-1185-document` holds one unpushed commit,
  `cecba89`, with `#232`/`#1185`'s roadmap rows for PR #1189/#1190, the `ARTIFACT_INDEX.md` and
  `app/(admin)/staff/runbook/docs.ts` rebuild, a `CLAUDE.md` hazard and the handoff rewrite. Under
  the carry-forward rule it rides **this** slice's branch; `origin/staging`'s `specs/roadmap.md`
  cites PR #1189 and PR #1190 zero times until it does.
- **A two-vendor check has been unverified for two consecutive slices** because
  `demo-srimart-admin@example.com` is absent from the dev database. `npx tsx
  scripts/demo-accounts.ts add` in a clean shell closes it, and this slice touches shared chrome
  (`ShoppingListLink`, rendered in every storefront header), so it is done before validation rather
  than during it.
