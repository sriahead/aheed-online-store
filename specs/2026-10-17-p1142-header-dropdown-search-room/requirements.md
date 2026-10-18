# Header: Collect/Delivery dropdown, Shopping List beside search, new search placeholder (requirements / acceptance criteria)

Closes `#1142`. Follow-on to slice A (`#1131`); the reasoning and what was found in the code first are
in `plan.md`. It does **not** close `#1137`, `#1138`, `#1139`, `#1140`, `#1134` or `#1135`. Everything
is vendor-neutral code (ADR-004) plus one piece of Aheed data.

Terms. **The menu** is the new dropdown. **The control** is `LocationControl`. **Aheed** is
`aheed-food-centre` at `http://localhost:8787`; **SriMart** is `srimart` at
`http://srimart.localhost:8787`. Live checks run under `npm run preview` against the dev database,
never `npm run dev`. **A deliverable postcode** is one the control receives as `postcode` with
`deliverable` true.

## A. The Collect/Delivery dropdown

R1. For a vendor with `offerCollection` true, `LocationControl` renders one
    `<details data-location-menu>` whose `<summary>` is the only always-visible part. It renders no
    pill of two toggle buttons and no standalone pencil button. For a vendor with
    `offerCollection` false it renders the same single button as before this slice, unchanged.

R2. The summary's visible text is the accessible name, with no `aria-label` and no pair of
    responsive spans. It reads `Click & Collect` when the method is `COLLECTION`; `Delivery · <postcode>`
    when the method is `DELIVERY` and a deliverable postcode is stored; and `Delivery` otherwise.
    It contains an icon and a chevron, both `aria-hidden`.

R3. Inside the menu, in DOM order: an item `Click & Collect`, an item `Delivery`, and, only when a
    postcode is stored, an item `Change postcode`.
    - `Click & Collect` is a `<form action>` whose submit button posts `fulfilmentMethod=COLLECTION`
      to `setFulfilmentMethod`, as today.
    - `Delivery` with a deliverable postcode is a `<form action>` posting `fulfilmentMethod=DELIVERY`
      to `setFulfilmentMethod`. With no deliverable postcode it is a `type="button"` that opens the
      postcode dialog with intent `delivery`.
    - `Change postcode` is a `type="button"` that opens the dialog with intent `edit`.
    - The `Delivery` item reads `Delivery · <postcode>` whenever a deliverable postcode is stored,
      whichever method is chosen, and `Delivery` otherwise. This keeps #1087's rule that a shopper
      on Click & Collect can still read the postcode they typed.
    - The item for the current method carries a check mark and `aria-current="true"`. Item names are
      their visible text, with no `aria-label` and no doubled name.

R4. **Intent is preserved.** The dialog still submits the hidden `POSTCODE_INTENT_FIELD`. Opening it
    from `Delivery` submits `delivery`; from `Change postcode` submits `edit`; from the single
    button of a vendor without collection submits `delivery`. `git diff origin/staging --stat`
    shows no change to `features/storefront/delivery.ts`, `lib/delivery-cookie.ts`,
    `lib/fulfilment-cookie.ts`, `lib/fulfilment-service.ts` or any other file that sets the
    fulfilment method, the postcode or their cookies.

R5. **No JavaScript.** With scripting off, `curl -s http://localhost:8787/` returns HTML in which the
    menu's `Click & Collect` and, with a stored deliverable postcode, `Delivery` items are
    `<form` elements with a submit button named `fulfilmentMethod`, inside a `<details`. Opening
    the menu needs no client code.

R6. A small client enhancement closes the menu on Escape, on a click outside it, and when a dialog
    item (`Delivery` with no postcode, or `Change postcode`) is chosen. In
    `tests/location-control.test.tsx`, each of these three closes an open menu (jsdom), and none of
    them changes the stored method.
    **Amended at Fix (2026-10-18):** submitting a method item (`Click & Collect` or `Delivery`)
    also closes the menu, and a test proves it for each. The plan assumed the post reloads the
    page; with JavaScript on, React submits the action without a reload, and Validate found the
    menu left open after every choice in a real browser.

R7. The menu is not clipped. At 360, 390, 768 and 1280px, with the menu open, the menu's box lies
    inside the viewport horizontally (`left >= 0`, `right <= viewport width`), and its bottom
    items are not hidden by an ancestor `overflow` (the element at the centre of each item is that
    item). Measured by `scripts/verify-mobile-layout.ts` with a new `--open-location-menu` flag,
    which sets `open` on the first visible `[data-location-menu]` before measuring.

R8. Tap size. The summary and each menu item have a box of at least 44 by 44 CSS px below 1024px.
    `tests/tap-targets.test.ts` still covers `components/layout/LocationControl.tsx` for the
    `location` and `location-dialog` surfaces, the summary and every item carry
    `data-tap-surface="location"`, and the dialog keeps the `data-location-dialog` hook.

R9. `Header` renders the control in both of its existing places (inline from `sm`, and the
    `data-header-location` row below `sm`), each with the same four props as before.

## B. Shopping List beside the search bar

R10. A server component `components/layout/ShoppingListLink.tsx` renders a link to `/shop-your-list`
     with `aria-label="Shopping list"`, the visible text `Shopping List` (hidden below `sm`) and the
     existing bag icon. It names no vendor.

R11. `Header` renders it directly after `DepartmentSearchBar` in the inline desktop slot and in the
     full-width row, each pair in one flex container, and renders it nowhere in the right-hand
     `<nav aria-label="Main Navigation">`. In `tests/header-shopping-list.test.tsx` (edited, see
     R22), with `isLanding` true and false, the link is present, is a sibling of the search form's
     container and not a descendant of the main navigation, and has `aria-label="Shopping list"`.
     The link is not inside the search `<form>`.

R12. **Live.** `curl -s http://localhost:8787/` and `curl -s http://localhost:8787/search` each
     contain `href="/shop-your-list"`. Read with `verify-mobile-layout.ts` at `--path /` and at
     `--path /search`, the link's box is at least 44 by 44 at 360 and 390 and sits on the same row
     as the search bar's button (tops differ by at most 2px) at every width.

## C. Search room

R13. **Measured.** With `npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path
     /search --widths 360,390,768,1024,1280`: at 1280 the `[data-header-search]` form is at least
     600px wide and its input is at least 400px wide (slice A measured 521 and 337); at 360 and 390
     the input is at least 120px wide; select, input and button tops differ by at most 2px; the
     page does not scroll horizontally at any width (`scrollWidth <= viewport width`).
     **Amended at Build (2026-10-17, owner-approved):** the form threshold was 640. Measured at
     1280 the slice's design gives 603: the 1248px row holds the logo (128), the menu summary
     (156), the nav (176) and three 16px gaps, and the Shopping List link (129 plus an 8px gap)
     now shares the search slot, so only the toggle pair's replacement frees width. The owner
     chose to keep the design and lower the threshold to 600 rather than shrink other controls.
     The breakdown is in `build-notes.md`.

R14. The inline breakpoint is recorded in `build-notes.md` with the measured input width at 1024.
     If the search bar is inline at 1024 (the `lg` choice), that measurement is at least 240px; if
     the measurement is lower, the bar stays inline only from `xl`. `Header.tsx`'s classes agree
     with the recorded choice.

R15. The pinned header is not taller than before this slice at any measured width: for each width in
     R13, `headerHeightAfterScroll` is no greater than slice A's recorded value (119 at 360 and 390,
     139 at 768, 134 at 1024, 89 at 1280) unless the bar moved inline, in which case it is lower.

## D. Placeholder

R16. `prisma/department-changes.ts` exports `OWNER_SEARCH_PLACEHOLDER` equal to exactly
     `Find your favourites...` (three ASCII full stops, no ellipsis character). It is at most 80
     characters. The code default `DEFAULT_SEARCH_PLACEHOLDER` stays `Search products…`.
     `tests/apply-department-changes.test.ts` is edited only to pin the new literal (R22).

R17. **Live.** After `npx tsx scripts/apply-department-changes.ts --vendor aheed-food-centre --apply`
     on the dev database: `curl -s http://localhost:8787/search | grep -c 'placeholder="Find your
     favourites..."'` is at least 1, and SriMart's search page does not contain it. The script's
     dry run before `--apply` plans exactly one `set-search-placeholder` change from the old value,
     and a second `--apply` reports no changes. `--restore` still leaves the placeholder alone.

## E. Preserving what works, and the delivery gates

R18. A vendor without collection looks and behaves as before: in `tests/location-control.test.tsx`
     the existing case for that vendor passes unmodified, and live on a vendor with
     `offerCollection` false (a one-off dev database edit, or a rendered fixture test if the dev
     data has none) the control is the same single button.

R19. Method and postcode behaviour is unchanged. `tests/delivery-postcode-intent.test.ts`,
     `tests/fulfilment-cookie.test.ts`, `tests/delivery-pricing.test.ts` and
     `tests/place-order-delivery-pricing.test.ts` pass unmodified. **Live, in a real browser at
     1280px on Aheed:** choosing `Click & Collect` from the menu shows `Click & Collect` in the
     summary after the reload; choosing `Delivery` with a stored deliverable postcode shows
     `Delivery · <postcode>`; `Change postcode` followed by a deliverable postcode leaves the method
     as it was.

R20. `package.json` and `package-lock.json` are byte-identical to `origin/staging`'s. No file under
     `app/`, `components/`, `lib/` or `features/` contains `runtime = "edge"`, and the diff adds no
     `$queryRaw`, `$executeRaw` or `Prisma.sql`, excluding the generated `docs.ts` embed.

R21. `components/layout/LocationControl.tsx` and `ShoppingListLink.tsx` contain none of the
     case-insensitive strings `aheed`, `srimart`, `grocery`, `groceries` or `halal`.

R22. Tests edited, each listed in `build-notes.md` with the reason and none weakened:
     `tests/location-control.test.tsx` (the toggle-pair cases become menu cases, preserving each
     behaviour R3, R4 and R6 name), `tests/header-shopping-list.test.tsx` (the link's new
     position, R11) and `tests/apply-department-changes.test.ts` (the placeholder literal, R16).
     `tests/header-brand.test.tsx` passes unmodified.

R23. `specs/architecture.md` is unchanged unless it describes the toggle pair; if it does, it is
     corrected. `docs/store-admin-guide/admin-tabs-guide.md` is checked: its search-box hint section
     (the example text) stays true for the new default, and any sentence naming the header's
     Collect/Delivery toggle or the Shopping List's position is corrected. `npm run kms:validate`
     exits 0 with `invalid front-matter (failing): 0`; after the doc edits `npm run
     kms:build-index`, `npm run kms:check-generated`, `npm run kms:assemble:internal` and a real
     Next build in `kms/site-internal` exit 0; this slice's `plan.md` contains no bare `<` directly
     before a digit.

R24. `CHANGELOG.md` is updated on the branch (Gate 4), naming `#1142` and saying the dropdown, the
     Shopping List position and the placeholder are included, and that the placeholder reaches a
     database only through the script. No commit message or pull request body on this branch uses a
     closing keyword directly before `#1137`, `#1138`, `#1139`, `#1140`, `#1134` or `#1135`; the pull
     request base is `staging` and its body says `Closes #1142`.

R25. `npm run lint`, `npm run typecheck`, `npx vitest run` (alone), `npm run format:check` and
     `npm run build` all exit 0, and CI on the pull request is green.
