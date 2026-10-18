# Header: Collect/Delivery dropdown, Shopping List beside search, new search placeholder (build notes)

Written at the end of Build, **before** the Clear. Issue `#1142`. Every number below was measured
on 2026-10-17/18 under `npm run preview` against the **dev** database (host
`ep-dry-morning-zab7dx08`, confirmed different from `secrets/staging.vars` and
`secrets/production.vars`), as a guest on a fresh profile with no postcode cookie.

## What changed and why

- **`components/layout/LocationControl.tsx`**: the `offerCollection` branch is now one
  `<details data-location-menu>`. The `<summary>` shows an icon, the current choice and a chevron.
  The panel holds, in order: a `Click & Collect` form button, a `Delivery` item (a form button with
  a deliverable postcode, otherwise a dialog button with intent `delivery`) and `Change postcode`
  (only with a stored postcode; dialog, intent `edit`). The current method's item gets a `Check` and
  `aria-current="true"`. All icons are `aria-hidden`, and there is no `aria-label` on the summary or
  the items. The summary and every item carry `data-tap-surface="location"`.
  - A `useEffect` adds document `keydown` (Escape, which returns focus to the summary if focus was
    inside) and `click` (outside the `<details>`) listeners that set `menu.open = false`.
    `openModal` closes the menu too. `open` is never passed as a React prop, so the browser owns
    it.
  - The `offerCollection` false branch, the dialog, the intent field and the effect that closes
    the dialog are unchanged. `toggleClass` was removed because nothing used it any more.
- **`components/layout/ShoppingListLink.tsx`** (new, server component): the old nav link's markup,
  plus `shrink-0`, `aria-hidden` on the icon and `whitespace-nowrap` on the text.
- **`components/layout/Header.tsx`**: the link was removed from `<nav aria-label="Main Navigation">`
  and is rendered after `DepartmentSearchBar` in both slots. The inline slot is now
  `hidden xl:flex items-stretch gap-2` (was `hidden xl:block`), and the full-width row is
  `flex items-stretch gap-2 … xl:hidden`. Both bars get `className="min-w-0 flex-1"`. The
  `ShoppingBag` import was dropped.
- **`prisma/department-changes.ts`**: `OWNER_SEARCH_PLACEHOLDER = "Find your favourites..."`
  (ASCII dots). The code default `DEFAULT_SEARCH_PLACEHOLDER` is untouched.
- **`scripts/verify-mobile-layout.ts`**: adds the `--open-location-menu` flag (header comment and
  usage line), plus `locationMenu` (`open`, `summary` and `panel` edges, and per item
  `{ name, width, height, atCentre }` via `elementFromPoint`) and `shoppingList` (the displayed
  header link's box) in every printed object.
- **`docs/developer-portal/app-conventions.md`** 1.14.1: the `#748` rule now says the edit path is
  the **Change postcode** menu item, not the pencil.
- **Tests edited (R22):**
  - `tests/location-control.test.tsx`: the toggle-pair cases became menu cases.
    - The pencil lookup became the `Change postcode` item, found among the menu's items so that a
      summary with the same text cannot double-match.
    - The `#1091` table's collection rows now name the items, and their narrow text equals the name,
      because the items show one text at every width. A `Change postcode` row and an "items carry
      no aria-label" case were added.
    - New: the menu cases (R1–R3: one menu, no button outside it, no pencil; summary text for four
      states; item order, forms and values; the no-postcode variant; check and aria-current) and
      four closing cases (R6: Escape, outside click versus inside click, Change postcode, and
      Delivery with no postcode), each asserting that `setFulfilmentMethod` was not called.
    - **The no-collection cases are textually unchanged**, but the `#1091` `it.each` bodies around
      them now call a `control()` helper. For a no-collection row it is the same
      `screen.getByRole("button", { name })` as before.
  - `tests/header-shopping-list.test.tsx`: there are now two links (one per search bar) instead of
    one. A new case per `isLanding` checks that each `role="search"` form's next element sibling is
    the link, and that the link is outside the main nav and outside any form.
  - `tests/apply-department-changes.test.ts`: only the pinned literal changed.
  - Not edited: `tests/department-search-bar.test.tsx` still passes the old placeholder text as a
    plain prop. It tests prop passthrough, not the constant, and R22 allows only three edited files.

### Measurements (`verify-mobile-layout.ts --path search --open-location-menu`, final `xl` build)

| width | form | input | select/input/button/link top | header after scroll | scrollWidth |
|------:|-----:|------:|------------------------------|--------------------:|------------:|
| 360   | 276  | 136   | 139 / 139 / 139 / 139        | 119                 | 360 |
| 390   | 306  | 166   | 139 / 139 / 139 / 139        | 119                 | 390 |
| 768   | 599  | 411   | 159 / 159 / 159 / 159        | 139                 | 768 |
| 1024  | 855  | 671   | 143 / 143 / 143 / 143        | 134                 | 1024 |
| 1280  | 603  | 419   | 55 / 55 / 55 / 55            | 89                  | 1280 |

- Shopping List link: 44×44 at 360 and 390, 129×44 at 768, 129×39 at 1024 and 1280.
- Header heights equal slice A's at every width (R15).
- Menu open (no postcode, so two items):
  - At 360 and 390 the panel runs 16 to 344 (390: 16 to 374), the items are 318 (348) by 44, and
    both report `atCentre: true`.
  - At 768 the panel is 282 to 538, the items 246×44.
  - At 1024 and 1280 the panel is 410 to 666 (1280: 160 to 416), the items 246×36. They are at
    `lg:min-h-0`, which R8 permits at 1024 and above.
- **R14, the breakpoint:** a temporary `lg` build measured the inline input at **163px** at 1024
  (form 347, link at 687 to 816, header 89). That is below 240, so the bar stays inline from **`xl`**,
  and the `Header.tsx` classes are `hidden xl:flex` / `xl:hidden`. The `lg` change was reverted and
  rebuilt before the table above was taken.

### Live smoke, not validation

- `curl` of `/` and `/search` on Aheed shows two `<details data-location-menu>`, each containing a
  `<form … method="POST">` with a `$ACTION_ID_…` hidden input and
  `<button type="submit" value="COLLECTION" … name="fulfilmentMethod">`.
- **React writes `value` before `name`**, so a single grep for `name="fulfilmentMethod" value=…`
  finds 0. Grep the two attributes separately, or by the button tag.
- `href="/shop-your-list"` appears twice per page.
- SriMart's `/search` has no `data-location-menu`: SriMart is `offerCollection` false on dev, so it
  is the live no-collection vendor for R18.
- Aheed's placeholder is still the old value: the dev database has not been updated (R17 is the
  validator's write).

### Fix pass (2026-10-18)

- **Validation was run in the build context and on Opus, at the owner's explicit request.** It
  passed every row, but found one defect in a real browser.
- **The defect:** with JavaScript on, choosing `Click & Collect` or `Delivery` changed the method
  and updated the summary, but the menu stayed open. React submits a server-action form without a
  page reload, so the plan's "the post reloads the page, which closes it" holds only without
  JavaScript. No row caught it, because R6 listed three closing triggers and not this one.
- **Root-cause fix:** both method forms have `onSubmit={closeMenu}`. It doesn't call
  `preventDefault`, so the action still runs. `openModal` now uses the same `closeMenu`.
- **Spec:** R6 is amended (a method submit closes the menu), and `validation.md`'s R6 row gains a
  browser check.
- **Test:** two cases ("closes when the COLLECTION/DELIVERY method item is submitted"). Both
  **fail against the unfixed component** (checked by stashing the fix) and pass with it.
- **Validation evidence from the first pass, still valid for unchanged code:**
  - Server HTML for four cookie states (R5).
  - Layout at `/` and `/search` with the menu open (R7, R12, R13, R15), unchanged from the table
    above.
  - The three-item menu in Chrome: items 36px tall at `xl`, all at their centre, panel 280 to 536.
  - R17 on dev: the placeholder applied, a second apply was a no-op, and restore left the
    placeholder alone. The departments were re-hidden afterwards.
  - R19 in Chrome at a 1536px CSS viewport. That is the same `xl` tier, but the window could not go
    narrower at a device-pixel ratio of 2.5.
- **Dev state left behind:** Aheed's placeholder is now "Find your favourites...", and the five
  departments are hidden (as at the start). The owner's Chrome holds `delivery-postcode=MK9 1AA`
  with Click & Collect chosen.

## Decisions taken during the build

- **No ARIA menu role.** The panel is a plain group of buttons and forms inside `<details>`.
  `role="menu"` would oblige arrow-key handling and roving focus, which the spec doesn't ask for. Tab
  order already works.
- **Closing listens on `click`, not `pointerdown`**, so jsdom's `fireEvent.click(document.body)`
  exercises the same path a browser does. A click inside the details (summary or panel) is ignored.
  Escape refocuses the summary only if focus was inside the menu.
- **Each instance listens independently.** The header mounts the control twice, and opening one
  instance's summary counts as an outside click for the other, which closes harmlessly.
- **The panel is `absolute left-0 top-full z-50 w-64 min-w-full max-w-[calc(100vw-2rem)]`.** In
  the mobile row it is as wide as the full-width summary; inline it is 256px, and `left-0` is safe
  because the control sits just after the logo. The `calc(100vw-2rem)` form copies the dialog's
  existing class.
- **The summary shows the Truck icon under DELIVERY and the Store icon under COLLECTION.** The
  check mark appears only in the panel.
- **The summary is `whitespace-nowrap` with a `truncate` span**, so a long postcode cannot wrap the
  pinned row. In the mobile row, the chevron is pushed right with `ml-auto`.

## Deviations from the spec

- **R13's 1280 form threshold was lowered from 640 to 600, approved by the owner during Build
  (2026-10-17).** Measured at 1280: 603. The 1248px row holds the logo (128 on dev), the summary
  (156), the nav (Shop 79 + Sign In 89 + gap = 176) and 3×16 gaps, which leaves a 740px slot. The
  slot holds the form, an 8px gap and the 129px link. Moving the link out of the nav freed nothing
  in the shared row. Only the toggle pair's replacement did (slice A's pill was about 238px, now
  156px, so about 82px). The alternatives offered were tighter gaps (still short) or an icon-only
  link at `xl` (contradicts R10), and both were declined. `requirements.md` R13 and `validation.md`
  R13 carry the amendment. Input 419 ≥ 400 passes unamended.
- **Logo width caveat:** dev renders the wordmark fallback (`brand.fallback: true`, 128px). On an
  environment with a real logo the 1280 numbers may differ.
- `tests/location-control.test.tsx`'s `#1091` `it.each` bodies changed shape (see above), although
  R18 asks for the no-collection case to pass "unmodified". The no-collection **case data** and the
  `R7` no-collection `it` are byte-identical. Only the shared helper around the table rows changed,
  and for those rows it resolves the same query.

## Known-shaky areas

- **Real-browser behaviour of the closing enhancement (R6, R19).** Only jsdom has exercised it.
  Check in Chrome: Escape, an outside click, and that choosing `Change postcode` closes the menu
  before the modal shows. Also check that the modal's backdrop click does not leave the menu open
  behind it.
- **Safari marker.** `list-none` plus `[&::-webkit-details-marker]:hidden` should hide the
  disclosure triangle. Only Chrome was used here.
- **The menu with a stored deliverable postcode (three items) was not measured.** The no-cookie
  state above has two items. Set a postcode in a browser, or pass a cookie, before R7 to measure the
  taller panel at 360, especially whether `Change postcode` stays `atCentre` above page content.
- **The summary under `Delivery · <postcode>`** is wider than `Click & Collect` (156), so the 1280
  form shrinks by the same amount for a shopper in that state. R13 is measured as a guest.
- **A full-suite flake:** `npx vitest run` (alone, after stopping preview) had 1 failure in
  `tests/add-to-cart-feedback.test.tsx` ("a rejected call is caught…", 89ms). That file passes
  12/12 run alone and is untouched by this slice, so it looks like load timing. It is not `#1125`'s
  file.
- `#1129` (the toggle conveyed its selected state only visually) is probably addressed by the
  menu's `aria-current`. **It is not closed by this slice** and is not named in the PR body. Leave
  it for the owner or a later triage.
