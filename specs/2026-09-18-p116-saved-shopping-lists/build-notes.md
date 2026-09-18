# Saved shopping lists (build notes)

Written at the end of Build, **before** the Clear. Closes **#116**. Branch
`feature/116-saved-shopping-lists`, cut from `staging`. Spec commit `b29ccf9`, implementation
commit `4682b75`.

## What changed and why

**Two new tables, one migration** (`20260918053538_p116_saved_shopping_lists`). `ShoppingList` and
`ShoppingListItem`. The migration SQL was read before it applied, as `CLAUDE.md` requires: two
`CREATE TABLE`s, two indexes, three FKs, **no `DROP INDEX` and nothing naming `trgm`** — the `#508`
trap did not fire on this one.

**The design decision is the absence of a column.** `ShoppingListItem` has no `productId` and no
relation to `Product`. It stores the shopper's line (`rawText`), its search terms (`terms`), a
quantity, and the optional `measure`/`brand` the P2.6 pre-pass can set. Reading the code alone will
not tell you why, so: P4's `reorderItems` already answers "the same products as last time,
exactly," and a product-id list would have answered the same question under a new name — which
`#116`'s own text predicted. Storing text answers the different question, and pays for itself in
what it does *not* need: no nullable FK, no `onDelete` decision against `Product`, no "no longer
available" UI branch, and lines this shop has never stocked can be stored at all.

**Opening a list reuses P3d/P2.6 wholesale.** `itemsToLines` → `matchListTerms` +
`synonymAliasMap` → `resolveLines` → the existing review step. No matching logic was written for
saved lists. The alias map is passed to `resolveLines` as well as to the candidate query, because
`#566`/`#396` established that omitting it silently re-rejects a candidate found only via an alias.

**`components/cart/ListReview.tsx` is an extraction, not a new component.** The review block moved
out of `ShopYourList.tsx` so `/shop-your-list` and `/account/lists/[listId]` render the same
ambiguous-line select, out-of-stock rendering and "Add N items" count. Copying it would have let
the two drift. `features/cart/add-list-to-cart.ts` and `features/orders/reorder-items.ts` are
byte-identical to `origin/staging` — the extracted form submits the same positional
`productId`/`quantity` fields the action has always read.

**Data-subject rights, all three surfaces.** `exportPersonalData`, `countOtherVendorData` and
`eraseVendorData`. `terms` is deliberately **not** exported: it is our tokenisation, not something
the subject supplied, and handing it back would overstate what they gave us.

**A guardrail document was corrected, with evidence** — see "Decisions" below.

## Decisions taken during the build

- **`SaveListState` lives in `lib/saved-list.ts`, not beside its action.** A `"use server"` module
  may export only async functions, enforced at runtime (`#159`), so the state type cannot sit in
  the action file. Same placement and same reason as `MatchListState` in `lib/shopping-list.ts`.

- **Two different feedback mechanisms, on purpose.** `/shop-your-list` uses `useActionState` and
  stays on the page — the shopper is mid-task and about to add these lines to the cart, so
  navigating away would make them re-paste. `/cart` and the order page redirect back with a
  `?list=saved|capped|empty` query param, reusing the `searchParams` notice surface `/cart` already
  has for P8.5c. One mechanism for both would have been tidier and worse.

- **The save form carries per-line hidden inputs rather than the raw pasted text.** Re-parsing the
  textarea at save time would have been much simpler, but it throws away the AI normalisation the
  shopper just reviewed, so a re-opened list would match *worse* than the screen it was saved from.
  Five positional arrays, the same index-alignment discipline `add-list-to-cart.ts` already relies
  on.

- **The cap is checked-then-acted, not serialised.** Two concurrent saves at 19 lists could both
  pass and produce a 21st. Deliberate: guarding it needs an interactive transaction to serialise a
  shopper against themselves, and being one over a soft ceiling on your own lists costs nothing,
  whereas holding a transaction open across two round trips costs something on every save.

- **A blank rename is ignored; a blank save name gets a default.** Replacing a name the shopper
  chose with a generated one is worse than doing nothing, but a *new* list has no name to preserve.

- **`CLAUDE.md` and `docs/developer-portal/runtime-pitfalls.md` were corrected.** This is the one
  finding here with reach beyond the slice. `--prove-http` showed the nested create failing, which
  `#382`'s recorded rule said should be fine, so it was measured properly — five operations, one
  `PrismaNeonHttp` client, one run against the dev Neon branch:

  | Operation | HTTP adapter |
  |---|---|
  | singular `create`, no nested children | succeeds |
  | singular `create` **with** nested child writes | **fails** — `Transactions are not supported in HTTP mode` |
  | singular `update` by primary key | succeeds |
  | `updateMany` | **fails** — same error |
  | `deleteMany` | succeeds |

  `runtime-pitfalls.md` claimed `updateMany`/`createMany` were the crashing operations "and ONLY
  those two," and that singular `create` succeeds. That was true of what `#382` actually tested — a
  childless create. The real rule is **"does this open an implicit transaction,"** not which method
  is named. Both documents now say so, and `--prove-http` reports a *success* as a failed check, so
  if this ever stops being true the script says so instead of passing quietly.

## Deviations from the spec

Four amendments to this slice's own `validation.md`, made mid-build and committed with the
implementation (precedent: `#537`'s R2, `#539`'s R9). No requirement's substance changed; four
checks were unrunnable as written.

1. **R14/R15/R17 and R41/R42 named test files that do not exist.** The spec said
   `tests/shopping-lists.test.ts` and `tests/data-rights.test.ts`; the files built are
   `tests/shopping-lists-repository.test.ts` and `tests/data-rights-saved-lists.test.ts`, matching
   the repo's existing `*-repository.test.ts` naming.
2. **R24 offered a fallback to `tests/server-action-exports.test.ts`, which does not exist.** No
   repo-wide test enforces the one-async-export rule — it is runtime-only (`#159`). The row now
   states the five `grep` results *are* the check, with no phantom alternative.
3. **R37a's wording contradicted itself** ("appears before the opening tag and after its closing
   tag"). Rewritten as the property actually wanted: the two `form` elements must not overlap,
   checked by scanning the rendered HTML in document order.
4. **R33 walked into the grep-self-match trap** `sdd-workflow.md` documents under Spec. Its
   absence-grep for `match-list|list-normalisation` returns three hits in
   `app/(storefront)/account/lists/[listId]/page.tsx` — all of them the page's own docstring
   explaining why it does *not* import those modules. Passing it as written would have meant
   deleting the most useful comment in the file. Now scoped to `^import` lines, which is the syntax
   that would constitute the real defect.

No scope was widened. Everything `plan.md` listed as excluded is still excluded.

## Known-shaky areas

- **Every `live-worker` row is unproven.** R29a, R31–R37a, R40 and R45 need `npm run preview` and a
  signed-in session cookie, and were deliberately not self-certified in the context that wrote the
  code. **This is where validation should start.** R45 (save a three-line list, re-open it) and R40
  (the pre-existing P3d journey, after the `ListReview` extraction) are the two that would hurt
  most if wrong.

- **The `ListReview` extraction is the highest-risk change to existing behaviour**, because it
  touches a shipped, working feature that this slice had no need to modify. The ambiguous-line
  `<select>` and its `choices` client state moved wholesale; the "Add N items" count depends on
  that state. R40 exercises all four rendering branches (matched, out-of-stock, ambiguous,
  unmatched) for this reason.

- **Nested forms.** `/shop-your-list` now renders three forms and `/account/lists` renders two per
  row. HTML forbids nesting and a nested form silently does not submit. R37a exists for this; check
  the rendered HTML, not the JSX.

- **The dev database has these tables; staging and production do not.** `prisma migrate deploy` was
  run locally against the dev Neon branch (`ep-sparkling-paper-za3j7xza`) so the live script could
  run — a Node runner against `DIRECT_URL`, which is the sanctioned path. Staging and production
  get the migration from the deploy workflows, which build before they migrate. Nothing to do here;
  recorded so a fresh context does not read the dev branch's state as evidence about either
  environment.

- **`--fill-cap` deliberately leaves 20 lists behind** for the R29a live-worker row, cleaned up
  only when its fixture user is deleted. If a validation run is interrupted mid-way, a
  `P116VERIFY-*` user may survive in the dev database.

- **Thin coverage: the `/account/lists` rename and delete forms.** The actions are unit-tested and
  the repository scoping is proven live, but the page's own two-sibling-forms markup is only
  checked by R31's `curl` assertion.

- **Not exercised at all: a second vendor.** Every query filters on `vendorId` and
  `tests/shopping-lists-repository.test.ts` asserts the `where` clauses, but no run has put two
  vendors' lists in the same database and confirmed isolation end to end. The scoping is
  structurally identical to `#764`'s saved addresses, which is why this was judged acceptable
  rather than built out.
