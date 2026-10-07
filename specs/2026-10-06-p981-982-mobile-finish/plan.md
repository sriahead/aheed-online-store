---
id: p981-982-mobile-finish-plan
title: "#981, #982 — Mobile finish: Quick View review tap targets and the logo-less header wordmark (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-06
visibility: internal
summary: "The review controls #964 and #979 left under 44px reach the tap size below lg, on both the Quick View drawer and the product page, and a logo-less vendor's header wordmark truncates instead of widening a phone page. No schema change."
tags: [storefront, mobile, accessibility, design-system, header, reviews, p10]
related: [p979-655-storefront-finish-plan, p964-966-968-mobile-tap-targets-plan, design-system]
---

# #981, #982 — Mobile finish: Quick View review tap targets and the logo-less header wordmark (plan)

The narrative: why this slice exists, what it proves, and where its edges are. `requirements.md`
holds the checkable acceptance criteria; this file holds the reasoning a reader needs to trust
those requirements are the right ones.

**Goal:** close the two controls-and-layout defects the mobile programme deliberately deferred, so
that every storefront control a shopper can tap is at least 44×44 below `lg`, and no vendor's
header can widen a phone page. Gate 1 was approved by the owner on 2026-10-06; the record is the
"Gate 1 — approved scope" comment on each of `#981` and `#982`.

Both issues are leftovers from slice 5 (`#979`/`#655`,
`specs/2026-10-04-p979-655-storefront-finish/`). Neither is an AA failure: `#981` is WCAG SC 2.5.5
(AAA) usability, and `#982` is a layout defect with no current visible symptom. **The platform has
never traded**, so neither repairs a measured loss.

## What is true today (read from the code on 2026-10-06)

- **`#981` — five controls, measured from their classes, not guessed.** `#979` brought Quick View's
  close button, its pre-add minus and plus and its gallery arrows to 44px. These stayed behind:

  | Control | Site | Current size |
  |---|---|---|
  | Submit / Update review | `components/product/QuickViewDrawer.tsx:507` — `px-4 py-2 text-xs` | ~32px tall |
  | Delete (a review) | `QuickViewDrawer.tsx:543` — `text-xs`, no padding | ~16px tall |
  | Try again (error state) | `QuickViewDrawer.tsx:297` — `px-4 py-2 text-xs` | ~32px tall |
  | Log in (inline link) | `QuickViewDrawer.tsx:513` | text-only |
  | Star rating input | `components/product/StarRatingInput.tsx:85` — `p-1` + `h-6 w-6` | **32×32** |

- **The same defect exists a second time, on a surface `#981` does not name.**
  `features/reviews/components/ReviewForm.tsx` renders on the product page
  (`app/(storefront)/products/[slug]/page.tsx:205`) with the same shared `StarRatingInput` and a
  `px-4 py-2` submit button. `#955` restored the product page as a real crawlable destination, so
  it is more reachable now than when `#981` was filed. Fixing only Quick View would leave the
  identical control failing depending on which route the shopper took. Folded in at Gate 1.

- **`StarRatingInput` is shared beyond reviews.** `components/storefront/FeedbackForm.tsx` uses it
  too, so sizing its hit area changes the feedback form as well. The owner accepted that at Gate 1
  as a fix rather than a regression, and this slice verifies it rather than assuming it.

- **`#982` — the wordmark branch is live in production, the overflow is not.** `Header.tsx:154`
  renders a wordmark (an initial tile, the name in two spans, the locality) for a vendor with no
  `logoStorageKey`. Its container (`Header.tsx:241`) is
  `flex items-center gap-3 shrink-0 h-10 overflow-clip`: `shrink-0` is what forces the *page* to
  widen rather than the wordmark to give way, and the existing `overflow-clip` does not save it.
  During slice 5 this widened a 360px page to 382px — a sideways scroll on every page — and at
  1024 squeezed the header search from 349px to 215px.

  **Read live on 2026-10-06:** `https://srimart.nocaped.com/` serves the wordmark branch in
  production right now (no CDN logo URL, initial tile present, name `SriMart`, locality `Reading`).
  `#982`'s own text says "no production vendor is known to be logo-less today"; that is **stale**.
  But `SriMart` is one short word, so it almost certainly does not overflow at 360px. The risky
  branch is live; the symptom is one rename, one new logo-less vendor, or one longer name away.
  This slice is therefore **pre-emptive**, which the owner accepted explicitly at Gate 1.

## Scope (this slice)

### `#981` — the five controls, on both review surfaces

- Every control above adopts the established pattern from `specs/design-system.md` ("Touch
  targets"): `min-h-tap`/`min-w-tap` (or `size-tap`) below `lg`, with `lg:min-h-0`/`lg:size-auto`
  restoring the exact desktop size. **Make the button `tap`-sized, not the icon** — the stars keep
  their `h-6 w-6` visual.
- **Three new `data-tap-surface` hooks**, not one: `quick-view-body` (the Quick View review
  region), `product-reviews` (the product page's review section) and `feedback-form`. The script
  reports a control **only** when it carries such a hook or sits inside one, so without all three,
  two of the three surfaces this slice fixes would measure as an empty set and the live rows would
  silently pass on nothing. This matches the 18 hooks that already exist.
- `tests/tap-targets.test.ts` gains the new surfaces and files in its `surfaces` map.
- Each star is a radio inside a `<label>`, which `#979` already taught the script to measure by the
  label's box (`hitArea: "label"`) — the box a finger actually hits. So the star fix needs no new
  measuring capability beyond the hook.

**The star row does not fit at 44px, and this is the one non-obvious part of the slice.** Computed
at 360px: the drawer content is `p-5` (40px) and the review form is `p-4` (32px), leaving **288px**.
Five 44px stars plus four 2px gaps is **228px**, which fits with 60px to spare — but the row also
carries a `gap-2.5` (10px) and the rating-label text at `min-w-[75px]`, giving **313px**, which
**overflows by 25px**. At today's 32px stars the same row is 253px and fits, which is why this has
never shown up. So the rating-label text must move to its own line below `sm` (the row wraps)
rather than sitting beside the stars. Requirements state the *outcome* (each star ≥44, no page
overflow); the wrap is the mechanism that gets there.

### `#982` — the wordmark truncates

- **Owner decision at Gate 1: shrink and truncate**, not "hide the name below `sm`". The vendor's
  name stays visible at every width, clipped with an ellipsis when space runs out. The rejected
  alternatives were hiding the name below `sm` (a logo-less vendor reduced to a single letter — too
  large a branding loss) and a hybrid that also dropped the locality line on phones (recovers ~14px
  of header height, which `#960` would have valued, but loses the locality cue).
- `min-w-0` on the logo container and the inner block, `truncate` on the two name spans and the
  locality. A vendor **with** a logo must be unchanged — that path is `#655`'s, not this one.

### Tooling: the measuring script must learn to sign in

**Both review forms are gated on a session** (`QuickViewDrawer.tsx:458` checks `currentUser`;
`products/[slug]/page.tsx:204` checks `session?.user`), and
`scripts/verify-mobile-layout.ts` has **no authentication of any kind** — it launches a fresh
throwaway Chrome profile every run (line 500) and measures as a guest. A guest sees only the "Log in
to leave a review" link; the Submit, Delete and star controls never render.

There is no second tool that closes this gap: desktop Chrome (including the browser-extension route
used for other slices' live rows) **cannot go below 501px**, which is the entire reason this script
exists. So the signed-in controls cannot be measured at 360px by anything that exists today.

This slice therefore adds a `--sign-in <email>:<password>` flag to the script, which authenticates
against `/api/auth/sign-in/email` and installs the session cookie before measuring. This is the
same kind of extension `#964` and `#979` each made to this script, and every later mobile slice
that touches a signed-in surface needs it. Without it, `#981`'s live rows are unverifiable and the
slice would ship on a source-read alone.

## Deliberately excluded

- **The gallery's dot buttons** (6px). The arrows and swiping do the same job — SC 2.5.5's
  "equivalent" exception. `#981` records this exclusion itself and `specs/design-system.md` already
  names it.
- **Desktop sizing.** Everything is below `lg`; `lg`+ keeps its exact current size.
- **Real-device touch behaviour** (long-press, iOS Safari hit-testing). That needs `#440`'s
  Playwright harness, which has not been built. Headless Chrome at an emulated 360px proves layout
  and geometry, not a finger.
- **The staff panel.** `specs/design-system.md` puts it outside the tap rule deliberately.
- **Any change to the review feature itself** — moderation, `#819`, the review list's own layout.
  This slice only resizes hit areas.
- **Giving SriMart a logo.** That is vendor data entry, not code, and it would mask `#982` rather
  than fix it.
- **`#395`** (mobile sticky bottom navigation). Open, challenged by the 2026-10-02 Discover pass,
  and gated on analytics (`#607`) that do not exist. Not part of this slice.

### Two traps a validator will otherwise hit

- **Quick View opens from a product *card*.** `--open-quick-view` clicks the first card's "Quick
  view" button and throws if there is none, so its live rows run against a **category page**, never
  a product detail page. R9 and R13 say so explicitly.
- **`/feedback` redirects a signed-out visitor** (`app/(storefront)/feedback/page.tsx:36`), so R12
  needs `--sign-in` just as the review rows do.

## Open items carried forward

- **`#982` has no currently-visible symptom.** Production's one logo-less vendor has a name short
  enough not to overflow. The live check therefore proves the *fix* (a long name no longer widens
  the page) against a dev vendor, not the repair of a visible production break.
- **R17 needs one dev-database write** (clearing a vendor's `logoStorageKey`, then restoring it) to
  put a *long* name on the wordmark path, because production's only logo-less vendor has a short
  name. It is a single-row update on dev, reverted immediately, and `build-notes.md` records the
  restore. If auto mode refuses it, the owner runs the two statements with `!` — this is the one
  row in the slice that may need them.
- **`#440`** still owns real-device verification for everything this slice measures in headless
  Chrome.
- **`#983`** (flaky `add-to-cart-feedback` test) is untouched here and will keep intermittently
  reddening CI, including the deploy that ships this slice.
