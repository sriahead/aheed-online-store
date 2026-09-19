# Surface saved lists on /shop-your-list (build notes)

Written at the end of Build, **before** the Clear. Closes **#806**. Branch
`feature/806-shop-your-list-saved-lists`, cut from `staging`. Spec commit `66e9189`, implementation
commit `5851c28`.

## What changed and why

**One file touched**: `app/(storefront)/shop-your-list/page.tsx`. It already resolved `canSave` via
`getUserId()` to decide whether `ShopYourList` renders its save control; this slice adds one more
conditional fetch beside it — `getShoppingListService().list()`, called only when `canSave` is
true — and a new block above the paste form that renders the result.

**Each row links to the existing `/account/lists/<id>` page rather than resolving inline.** `#116`
already built the whole resolve-and-review path there (redirect signed-out, 404 for another
vendor/user's list, `ListReview` against re-matched lines); this slice's own `plan.md` named
"inline the resolve into `/shop-your-list`" as the alternative and rejected it — one page doing the
resolving, not two, and zero new matching logic. A plain `<Link>` is the entire mechanism.

**Capped to 5, most-recently-updated first**, using the array order `listShoppingLists` already
returns (`updatedAt` descending) — no new sort. A "Manage your lists →" link to `/account/lists` is
always rendered alongside, whether the shopper has 2 saved lists or is at the 20-list ceiling.

## Decisions taken during the build

- **`QUICK_PICK_LIMIT` is a local `const` in `page.tsx`, not a `lib/saved-list.ts` export.** It's a
  presentation choice for this one page, not a domain rule like `MAX_SAVED_LISTS` — nothing else
  reads it, and no test or repository function needs to agree with it.
- **The row markup (icon, name, pluralised item count, chevron) is copied from
  `app/(storefront)/account/lists/page.tsx`'s three-line row, not extracted into a shared
  component.** That page's version carries two sibling rename/delete `<form>`s this page has no use
  for; the shared part is four JSX lines. Two small near-identical blocks beat a component
  parameterised only to strip half of itself back out for the second caller.
- **"Manage your lists →" was chosen over "See all lists" or "Your lists"** — it reads correctly
  whether the shopper has 3 lists or 20, and satisfies R6's case-insensitive "your lists" substring
  check without being written to match the check.

## Deviations from the spec

None. Every row of `requirements.md` was built as written; nothing needed amending mid-build.

## Known-shaky areas

- **R4 (the 5-item cap and its ordering) was spot-checked live during Build, not substituted for a
  real `/validate`.** Seeded 6 lists for `demo-customer` via a scratch script, confirmed exactly 5
  distinct `/account/lists/<id>` links rendered and the newest-created list appeared first, then
  deleted all 6 to leave the account as found. A fresh-context validator should re-seed and re-check
  independently rather than trust this note.
- **This page gets no new vitest file.** Consistent with `#116`'s own precedent — neither
  `/account/lists` nor `/account/lists/[listId]` has one either, both validated live only. Every row
  in this slice's `validation.md` is Unit-by-diff/grep or E2E-by-curl; there is no unit test
  asserting the cap, the ordering, or the pluralisation in isolation from a real request.
- **Guest-render safety (R8) rests on a short-circuit, verified by reading, not by a live guest
  probe during Build**: `canSave ? await getShoppingListService().list() : []` means the service is
  never called at all when signed out, so there is no code path by which a guest's render could
  observe saved-list data or a side effect from resolving it. Confirmed live for the empty-list and
  signed-out cases during Build (see commit's own sanity checks); worth re-confirming at `/validate`
  precisely because "the code can't reach it" is a stronger claim than "it happened not to."
