# Surface saved lists on /shop-your-list (requirements / acceptance criteria)

Closes **#806**, a direct follow-up to **#116** (`specs/2026-09-18-p116-saved-shopping-lists/`). A
signed-in shopper with saved lists sees them on `/shop-your-list` itself, above the paste form, and
opens one via the existing `/account/lists/[listId]` page. No new repository function, service
method, matching logic, or add-to-cart path is introduced. See `plan.md` for the reasoning behind
each requirement below.

R1. `app/(storefront)/shop-your-list/page.tsx` calls `getShoppingListService().list()` when (and
    only when) `canSave` is `true`, and does not call it when `canSave` is `false`.

R2. `git diff origin/staging -- lib/repositories/shopping-lists.ts lib/shopping-lists-service.ts app/(storefront)/account/lists/[listId]/page.tsx components/cart/ListReview.tsx`
    produces no output — this slice adds no new repository function, service method, or resolve
    path, and does not modify the existing list-detail page or the shared review component.

R3. When `getShoppingListService().list()` returns at least one list, the rendered HTML of
    `/shop-your-list` contains a heading text "Your saved lists" that appears before the paste
    form's `<textarea id="list">` in document order.

R4. That section renders at most 5 `<li>`/list-row entries even when more than 5 lists are
    returned, and the rows shown are the first 5 entries of the array `list()` returns (i.e. the 5
    most recently updated, since `listShoppingLists` already orders by `updatedAt` descending —
    R4 does not re-order what R1's call already returns).

R5. Each rendered row shows the list's `name` and its `itemCount` pluralised as `{n} item` for
    `itemCount === 1` and `{n} items` otherwise, and is (or contains) a link whose `href` is
    `/account/lists/<id>` for that row's list id.

R6. Whenever the "Your saved lists" section renders (R3), it also renders exactly one link whose
    `href` is `/account/lists` and whose visible text contains "your lists" (case-insensitive) —
    present whether the shopper has 2 saved lists or 20.

R7. When `getShoppingListService().list()` returns an empty array (`canSave` true, zero saved
    lists), `/shop-your-list`'s rendered HTML contains no "Your saved lists" heading text and no
    link whose `href` starts with `/account/lists`.

R8. When `canSave` is `false` (no session), `/shop-your-list`'s rendered HTML is unchanged from its
    pre-slice output: no "Your saved lists" heading text, no link whose `href` starts with
    `/account/lists`, and `git diff origin/staging -- app/\(storefront\)/shop-your-list/page.tsx`
    shows the guest-facing paste form and its surrounding markup untouched (only the new
    signed-in-with-lists branch and its imports added).

R9. The paste textarea, its "Match my list" form, and the match-and-add-to-cart journey it drives
    are unaffected: `git diff origin/staging -- lib/shopping-list.ts features/cart/match-list.ts features/cart/add-list-to-cart.ts components/cart/ShopYourList.tsx`
    produces no output.

R10. `/account/lists/<id>` reached from one of R5's links behaves exactly as `#116` shipped it,
     unmodified by this slice: redirects to `/login` signed out, calls `notFound()` for a list
     belonging to a different vendor or user, and otherwise renders `ListReview` with every saved
     line resolved against the current catalogue.

R11. No `middleware.ts` or `proxy.ts` exists anywhere in the repository after this slice
     (`ls middleware.ts proxy.ts app/middleware.ts app/proxy.ts` finds none, `git status
     --porcelain` lists no new file with either name).

R12. `CHANGELOG.md` updated (Gate 4).

R13. `lint`, `typecheck`, `test`, and `format:check` all remain green after this slice.
