---
id: p1142-header-dropdown-search-room
title: "Header: Collect/Delivery dropdown, Shopping List beside search, new search placeholder (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-17
visibility: internal
summary: "Follow-on to slice A (#1131), issue #1142: replace the Click & Collect / Delivery toggle pair with one compact dropdown, move the Shopping List link next to the search bar, and change Aheed's search placeholder, so the search field gets more room."
tags: [header, search, location, fulfilment, shopping-list, mobile, p10]
related: [p1131-storefront-navigation-catalogue, p1090-1091-list-notice-and-control-names]
---

# Header: Collect/Delivery dropdown, Shopping List beside search, new search placeholder (plan)

Issue `#1142`. The owner's request of 2026-10-17, after slice A (`#1131`) shipped the department
search bar: the search field is still cramped, so give it room. Three changes, all in the header.
Decisions were taken at Propose and are recorded in the issue.

**Goal:** a wider search field with the Shopping List link beside it, a single compact control for
how and where the order goes, and the owner's new hint text. No fulfilment, postcode or
deliverability behaviour changes; only how the control looks and where the link sits.

## What Orient found, which the requirements rest on

Facts about the repository on 2026-10-17.

1. **The control is a toggle pair plus a pencil.** `components/layout/LocationControl.tsx` renders
   two `<form action={setFulfilmentMethod}>` buttons (`COLLECTION`, `DELIVERY`) in a pill, and a
   pencil button that opens the postcode `<dialog>` with intent `edit`. Both toggles are real form
   posts, so they work with JavaScript off (#748). The postcode dialog needs JS, as it always has.
2. **A vendor without collection renders one button instead** (`offerCollection` false). That
   path is already compact and already correct; this slice leaves it alone.
3. **`Header` renders the control twice**: inline from `sm` in the pinned row, and in a
   `data-header-location` row below the pinned header under `sm`.
4. **Intent matters.** The dialog submits `intent` (`delivery` or `edit`) and `setDeliveryPostcode`
   decides whether a deliverable postcode also selects Delivery (#1087). The new menu must keep
   exactly that mapping, or a postcode change would silently switch the shopper's method.
5. **The search bar sits inline only from `xl`** (slice A, measured: at 768 the shared row left
   the field 9px, at 1024 81px). Slice A's 1280px reading was a 521px form with a 337px input.
6. **The Shopping List link is in the right-hand nav** with Shop, account and the cart, and
   carries `aria-label="Shopping list"` because its text is hidden below `sm`.
7. **The search placeholder is vendor data**, `VendorConfig.searchPlaceholder`. Aheed's value comes
   from `scripts/apply-department-changes.ts` (`OWNER_SEARCH_PLACEHOLDER`,
   `prisma/department-changes.ts`), and `tests/apply-department-changes.test.ts` pins the old
   literal. Nothing changes a database until someone runs the script.
8. **Tests tied to the control**: `tests/location-control.test.tsx` (intent, readable postcode,
   one accessible name per button), `tests/tap-targets.test.ts` (the `location` and
   `location-dialog` tap surfaces, and the dialog hook `data-location-dialog`),
   `tests/header-shopping-list.test.tsx`, and `scripts/verify-mobile-layout.ts`
   (`--open-location`).

## Design

**The dropdown is a native `<details>`/`<summary>`**, not a custom listbox and not a `<select>`.
That keeps the no-JS posture: opening it needs no script and the Click & Collect and Delivery
items inside it are the same `<form action={setFulfilmentMethod}>` buttons as today. A `<select>`
could not submit a server action on change without JavaScript.

- **Summary (the trigger):** an icon, the current choice, and a chevron. Under COLLECTION it reads
  `Click & Collect`. Under DELIVERY it reads `Delivery · MK8 1BS`, or `Delivery` with no
  deliverable postcode. The visible text is the accessible name: no `aria-label`, no responsive
  span pair, so #1091's doubled-name trap cannot recur and WCAG 2.5.3 holds without extra work.
- **Menu items, in order:** `Click & Collect` (a form button, only when the vendor offers
  collection), `Delivery` (a form button when a deliverable postcode is stored, otherwise a button
  that opens the dialog with intent `delivery`), and `Change postcode` (only when a postcode is
  stored; opens the dialog with intent `edit`, so it never selects Delivery). The chosen method
  shows a check.
- **Closing:** a method form post reloads the page, which closes it. A small client effect closes it
  on Escape, on an outside click, and when a dialog item is chosen. That is an enhancement; the
  menu is usable without it, only less tidy.
- **The vendor-without-collection path is unchanged** (finding 2).
- **Mobile:** the same component in the existing below-`sm` row, full width.

**Shopping List moves next to the search bar.** A small server component, `ShoppingListLink`,
renders the existing link. `Header` places it directly after `DepartmentSearchBar` in both slots
(the inline desktop slot and the full-width row), wrapped with the bar in one flex container, and
removes it from the right-hand nav. Same `href`, `aria-label` and 44px tap box. It is not part of
the search `<form>`, so a Shopping List click is not a search.

**Search room.** Removing the toggle pair and the link from the shared row is what frees width.
The inline breakpoint is **decided by measurement at Build, not promised here**: Build tries `lg`
(1024px) and keeps it only if the input measures at least 240px there; otherwise it stays `xl`.
Either way the 1280px form must grow from slice A's 521px.

**Placeholder.** `OWNER_SEARCH_PLACEHOLDER` becomes `Find your favourites...` (three ASCII dots,
as the owner wrote it). The change is data, so it reaches a database only through the script, run
by hand per environment, as slice A's rollout already is. The code default stays `Search
products…`, vendor-neutral, and SriMart keeps its own value.

## Deliberately excluded

- No change to `setFulfilmentMethod`, `setDeliveryPostcode`, the cookie, the intent field or any
  fulfilment service. A diff touching them is a defect.
- No change to the postcode dialog's content or behaviour.
- No change to the department select or the search suggestions (`#1137` stays open).
- No new dependency, no schema change, no migration.
- Nothing is run against staging or production by this slice. The placeholder rollout is the
  user's, as in slice A.

## Risks the validator should test rather than assume

- **The dropdown clipped by an ancestor.** The pinned header and the logo block use `overflow-clip`
  in places; the menu must render fully at 360, 390, 768 and 1280, including inside the mobile row.
- **Intent regression.** Choosing `Change postcode` and submitting a deliverable postcode must
  leave the method as it was; choosing `Delivery` with no postcode must select it on success.
- **A vendor that offers no collection** must look and behave exactly as before.
- **Duplicate controls in the DOM.** The header renders the control and search bar twice (one
  hidden by CSS). Anything that reads `[data-header-location]` or finds the control by role must
  not double-match.
