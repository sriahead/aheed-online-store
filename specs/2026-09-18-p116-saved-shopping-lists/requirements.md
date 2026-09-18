# Saved shopping lists (requirements / acceptance criteria)

Closes **#116**. A signed-in shopper can save a reusable shopping list and re-open it against
today's catalogue. A saved line stores the shopper's own words and search terms — never a
`productId` — so the list is re-matched on every open through the pass P3d (#114) and P2.6 (#566,
#567) already ship. Guests are not served; `/shop-your-list` is unchanged for them and still writes
nothing. Wishlist (**#232**) is explicitly not in this slice and will not reuse this aggregate. See
`plan.md` for the reasoning behind each requirement below.

Throughout: "the WS client" means the client `getPrismaWs()` returns, "the HTTP client" the one
`getPrisma()` returns.

## Schema

R1. `prisma/schema.prisma` declares `model ShoppingList` with fields `id` (uuid primary key),
    `vendorId` + a `Vendor` relation with `onDelete: Cascade`, `userId` (**non-nullable**
    `String`) + a `User` relation with `onDelete: Cascade`, `name String`, `createdAt`, `updatedAt`,
    an `items` relation to `ShoppingListItem`, and `@@index([vendorId, userId])`.

R2. `prisma/schema.prisma` declares `model ShoppingListItem` with fields `id` (uuid primary key),
    `listId` + a `ShoppingList` relation with `onDelete: Cascade`, `rawText String`, `terms String`,
    `quantity Int`, `measure String?`, `brand String?`, `position Int`, and `@@index([listId])`.

R3. The `ShoppingListItem` model declares **no** field named `productId`, no relation to `Product`,
    and no field of Prisma type `Json`. The `Product` model is unchanged by this slice.

R4. Exactly one new directory exists under `prisma/migrations/`, it was generated with
    `--create-only`, and its `migration.sql` contains `CREATE TABLE "ShoppingList"` and
    `CREATE TABLE "ShoppingListItem"` and no `DROP INDEX` statement, no statement naming `trgm`, and
    no `ALTER TABLE` or `DROP` against any table other than the two created in that file.

## Pure logic — `lib/saved-list.ts` (new) and `lib/shopping-list.ts`

`lib/saved-list.ts` performs no I/O and imports nothing from `@/lib/db`, `@prisma/client`,
`@prisma/client/wasm`, `@/lib/auth` or `@/lib/tenant`.

R5. `toTerms` is exported from `lib/shopping-list.ts`, and that file's other exports
    (`MAX_LIST_LINES`, `MAX_LINE_QUANTITY`, `MAX_CANDIDATES_PER_LINE`, `CANDIDATE_QUERY_LIMIT`,
    `ParsedLine`, `ListCandidate`, `LineResolution`, `ResolvedLine`, `MatchListState`,
    `EMPTY_MATCH_STATE`, `normaliseName`, `parseListLine`, `parseList`, `distinctTerms`,
    `resolveLines`) are unchanged in name and signature.

R6. `lib/saved-list.ts` exports `MAX_SAVED_LISTS = 20` and `MAX_LIST_NAME_LENGTH = 60`.

R7. `lib/saved-list.ts` exports `normaliseListName(raw: string): string | null`, which trims,
    collapses internal whitespace runs to a single space, truncates to `MAX_LIST_NAME_LENGTH`
    characters, and returns `null` for input that is empty or whitespace-only.

R8. `lib/saved-list.ts` exports `defaultListName(now: Date): string`, a pure function of its
    argument only, whose result is non-empty and at most `MAX_LIST_NAME_LENGTH` characters.

R9. `lib/saved-list.ts` exports `linesToItems(lines: readonly ParsedLine[]): SavedListItemInput[]`
    which emits at most `MAX_LIST_LINES` items, sets `position` to the item's zero-based index in
    the returned array, sets `terms` to the line's `terms` joined by a single space, clamps
    `quantity` into the range 1 to `MAX_LINE_QUANTITY` inclusive, maps an absent `measure` or
    `brand` to `null`, and drops any input line whose `terms` array is empty.

R10. `lib/saved-list.ts` exports `itemsToLines(rows: readonly SavedListItemRow[]): ParsedLine[]`
     which splits `terms` on whitespace, drops any row whose `terms` splits to nothing, and returns
     lines ordered by ascending `position`.

R11. For any `ParsedLine[]` whose lines each have a non-empty `terms` array and a quantity within 1
     to `MAX_LINE_QUANTITY`, `itemsToLines(linesToItems(lines))` returns an array equal to the input
     in `original`, `quantity`, `terms`, `measure` and `brand`, for every line.

R12. `lib/saved-list.ts` exports
     `productNamesToLines(entries: readonly { name: string; quantity: number }[]): ParsedLine[]`,
     which sets `original` to the entry's `name`, `terms` to `toTerms(name)`, `measure` and `brand`
     to `null`, clamps quantity as in R9, and drops entries whose name yields no terms.

## Repository — `lib/repositories/shopping-lists.ts` (new)

R13. Every function exported from `lib/repositories/shopping-lists.ts` takes its Prisma client as
     its first parameter and takes `vendorId` and `userId` as explicit parameters; the file contains
     no value import of `@/lib/db`, `@/lib/auth`, `@/lib/tenant` or `@/lib/cart-identity`.

R14. `listShoppingLists(prisma, vendorId, userId)` returns one entry per list owned by that vendor
     and user, each carrying `id`, `name`, `itemCount` and `updatedAt`, ordered by `updatedAt`
     descending.

R15. `findShoppingList(prisma, vendorId, userId, id)` returns the list with its items ordered by
     ascending `position`, and returns `null` when no row matches all three of `id`, `vendorId` and
     `userId`.

R16. `createShoppingList(prismaWs, vendorId, userId, name, items)` takes the **WS** client, writes
     one `ShoppingList` row and one `ShoppingListItem` row per entry in `items`, and returns the new
     list's `id`.

R17. `createShoppingList` returns `null` and writes nothing when the vendor-and-user already own
     `MAX_SAVED_LISTS` lists, and returns `null` and writes nothing when `items` is empty.

R18. `renameShoppingList(prismaWs, vendorId, userId, id, name)` takes the **WS** client, performs a
     single `updateMany` whose `where` names all three of `id`, `vendorId` and `userId`, and returns
     `true` only when that update reported a non-zero count.

R19. `deleteShoppingList(prisma, vendorId, userId, id)` performs a single `deleteMany` whose `where`
     names all three of `id`, `vendorId` and `userId`, and returns `true` only when the delete
     reported a non-zero count.

R20. Every Prisma query in `lib/repositories/shopping-lists.ts` that reads or writes `ShoppingList`
     filters on both `vendorId` and `userId`; every query against `ShoppingListItem` is reached only
     through a `ShoppingList` already so filtered, or names a `listId` obtained from one.

## Request-scoped facade — `lib/shopping-lists-service.ts` (new)

R21. `lib/shopping-lists-service.ts` exports `getShoppingListService()`, which resolves the vendor
     id and user id per call and constructs both Prisma clients per call, memoising neither the
     clients nor the factory across requests.

R22. Every method of the service returns an empty array, `null` or `false` — never a thrown error and
     never a write — when no user is signed in.

R23. The service passes the WS client to `createShoppingList` and `renameShoppingList`, and the HTTP
     client to `listShoppingLists`, `findShoppingList` and `deleteShoppingList`.

## Server actions — `features/lists/`

R24. Each of `features/lists/save-list-from-match.ts`, `features/lists/save-cart-as-list.ts`,
     `features/lists/save-order-as-list.ts`, `features/lists/rename-list.ts` and
     `features/lists/delete-list.ts` begins with the `"use server"` directive and exports exactly one
     binding, which is an `async function`. None of these files exports a constant, type, interface
     or class.

R25. `saveListFromMatch` reads the positional form fields `lineText`, `lineTerms`, `lineQuantity`,
     `lineMeasure` and `lineBrand`, builds one `ParsedLine` per index at which `lineTerms` is
     non-empty, and saves them through the service.

R26. `saveCartAsList` builds its lines from `getCartRepository().getSummary(identity)`'s
     `lines[].name` and `lines[].quantity` via `productNamesToLines`, and writes nothing when the
     cart has no lines.

R27. `saveOrderAsList` resolves the order through `getOrderRepository().getForUser(orderNumber,
     userId)`, builds its lines from that order's `items[].productName` and `items[].quantity` via
     `productNamesToLines`, and writes nothing when the lookup returns `null`.

R28. Each of the three save actions derives the list name by passing the submitted `name` field
     through `normaliseListName` and falling back to `defaultListName(new Date())` when that returns
     `null`.

R29. Each of the five actions performs no write and does not throw when no user is signed in.

R29a. When a save is refused because the shopper already owns `MAX_SAVED_LISTS` lists (R17), the
      shopper is shown a message saying so on the page they submitted from. The refusal is not
      silent, and it is not an error page.

R30. `features/orders/reorder-items.ts` and `features/cart/add-list-to-cart.ts` are byte-identical to
     their state on `origin/staging`.

## Pages

R31. `app/(storefront)/account/lists/page.tsx` redirects to `/login` when there is no session, and
     otherwise renders one entry per saved list showing its name and item count, with a rename
     control, a delete control and a link to that list.

R32. `app/(storefront)/account/lists/[listId]/page.tsx` redirects to `/login` when there is no
     session, calls `notFound()` when the list id does not belong to the signed-in user and the
     current vendor, and otherwise renders the resolved review for that list.

R33. Opening a saved list issues no request to Cloudflare Workers AI:
     `app/(storefront)/account/lists/[listId]/page.tsx` imports neither `features/cart/match-list.ts`
     nor `lib/list-normalisation.ts`, and resolves its lines by calling `matchListTerms` and
     `synonymAliasMap` and passing both to `resolveLines`.

R34. `app/(storefront)/account/page.tsx` renders a link to `/account/lists`.

R35. `app/(storefront)/cart/page.tsx` — or a component it renders — presents a "save as list"
     control that submits to `saveCartAsList`, and that control is not rendered when no user is
     signed in.

R36. `app/(storefront)/account/orders/[orderNumber]/page.tsx` presents a "save as list" control that
     submits to `saveOrderAsList`, in addition to the existing control that submits to
     `reorderItems`; both controls are present.

R37. `app/(storefront)/shop-your-list/page.tsx` resolves the session on the server and passes the
     result to `ShopYourList` as a boolean prop; `ShopYourList` renders the "save this list" control
     only when that prop is true. The page's match-and-add behaviour is available to guests exactly
     as before. The same server-prop pattern carries the signed-in flag to the cart control in R35 —
     no module under `app/`, `components/`, `features/` or `lib/` gains a `middleware.ts` or
     `proxy.ts` for this.

R37a. The "save this list" control on `/shop-your-list` is a **sibling** of the add-to-cart form, not
      nested inside it, and carries its own per-line hidden inputs. HTML forbids nested forms, and
      the add-to-cart form is rendered by the shared `ListReview` component (R38), which the save
      control is not part of.

## Shared review component

R38. `components/cart/ListReview.tsx` exists and accepts the resolved lines as a prop, and both
     `components/cart/ShopYourList.tsx` and `app/(storefront)/account/lists/[listId]/page.tsx`
     render it.

R39. The add-to-cart form rendered by `ListReview` submits the same `productId` and `quantity`
     positional fields that `addListToCart` reads today, for matched-and-in-stock lines and for
     ambiguous lines the shopper has resolved.

R40. `/shop-your-list` still parses, matches and adds a pasted list end to end after the refactor,
     including the ambiguous-line select and the out-of-stock and unmatched renderings.

## Data-subject rights

R41. `PersonalDataExport` in `lib/repositories/data-rights.ts` has a `savedLists` field carrying,
     per list, its `name`, `createdAt` and its items' `rawText` and `quantity`, and
     `exportPersonalData` populates it for the given vendor and user.

R42. `countOtherVendorData` includes saved lists held for the same user by other vendors in the count
     it returns.

R43. `eraseVendorData` deletes the user's `ShoppingList` rows for that vendor, their
     `ShoppingListItem` rows are removed with them, and its `EraseResult` reports how many lists were
     deleted.

## Enforcement and gates

R44. `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts`
     exits 0, and neither test file is modified by this slice.

R45. A signed-in shopper saving a list of at least three lines through a real running Worker
     succeeds, and the same shopper re-opening that list renders a review for every saved line.

R46. `npm run kms:validate` exits 0, and `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts`
     are regenerated so `npm run kms:check-generated` exits 0.

R47. `CHANGELOG.md` updated (Gate 4).

R48. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.
