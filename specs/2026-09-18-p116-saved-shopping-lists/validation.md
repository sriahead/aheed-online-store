# Saved shopping lists (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**
   - *When needed:* Every feature.
   - *Purpose:* Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - *When needed:* Every feature. (Includes Contract testing).
   - *Purpose:* Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - *When needed:* For critical user journeys and validation testing.
   - *Purpose:* Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - *When needed:* Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - *Purpose:* Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - *When needed:* Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - *Purpose:* Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - *When needed:* Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - *Purpose:* Ensure the system is safe and accessible to all users.

---

## Before you start

You are reading this from a context that did not build the slice. Three environment rules decide
whether the rows below mean anything:

- **This slice is database-touching. Validate with `npm run preview`, never `npm run dev`** —
  `next dev` cannot load the WASM engine and silently renders an error state.
- **Run `npx vitest run` on its own**, not beside or straight after a build. Its forks pool silently
  fails to start workers and whole files never execute, sometimes still exiting 0.
- **After stopping `npm run preview`, kill the whole `node`/`workerd` chain** before the next build,
  or it fails `EBUSY`.

Rows marked **live-script** use `specs/2026-09-18-p116-saved-shopping-lists/verify-saved-lists.ts`,
a spec-local script run with `npx tsx` against the **dev** database, never through the Worker
(precedent: `#696`'s `verify-cancel.ts`, `#786`'s `verify-ledger.mjs`). It imports
`lib/repositories/shopping-lists.ts` directly and injects its own clients — which is exactly what the
repository layer's explicit-client rule exists to make possible.

Rows marked **live-worker** need `npm run preview` running and a signed-in session cookie. Server
actions here are drivable with `curl`; no browser is required.

**`git diff origin/staging -- <path>` is used below to mean "unchanged."** If `origin/staging` is not
fetched, run `git fetch origin staging` first; a diff against a missing ref is not a pass.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Unit | `grep -n "model ShoppingList " -A 14 prisma/schema.prisma` shows `vendorId`, a non-nullable `userId String` (no `?`), both relations declaring `onDelete: Cascade`, `name String`, `createdAt`, `updatedAt`, the `items` relation, and `@@index([vendorId, userId])`. |
| R2 | Unit | `grep -n "model ShoppingListItem" -A 14 prisma/schema.prisma` shows `listId` with `onDelete: Cascade`, `rawText String`, `terms String`, `quantity Int`, `measure String?`, `brand String?`, `position Int`, and `@@index([listId])`. |
| R3 | Unit | In the same `model ShoppingListItem` block printed for R2, there is no line matching `productId`, none matching `Product `, and none matching `Json`. Do **not** grep the repo root for these words — `plan.md` and this file both state the absence in prose and would match. Separately `git diff origin/staging -- prisma/schema.prisma` shows no change inside `model Product`. |
| R4 | Integration | `git status --porcelain prisma/migrations/` lists exactly one new directory. In its `migration.sql`: `grep -c "CREATE TABLE" ` returns 2 and the two names are `ShoppingList` and `ShoppingListItem`; `grep -iE "drop index\|trgm"` over that one file returns nothing; every `ALTER TABLE` line in it names `ShoppingList` or `ShoppingListItem`. Confirm it was created with `--create-only` by checking the migration was committed in the spec/build commits and not applied by a `migrate dev` in the same step (`npx prisma migrate status` reports it as pending locally until `migrate deploy` runs). |
| R5 | Unit | `grep -n "^export function toTerms" lib/shopping-list.ts` returns one line. `git diff origin/staging -- lib/shopping-list.ts` shows changes confined to that one `export` keyword — no other export's name or signature line differs. |
| R6 | Unit | `npx vitest run tests/saved-list.test.ts` — a case asserts `MAX_SAVED_LISTS === 20` and `MAX_LIST_NAME_LENGTH === 60`. |
| R7 | Unit | Same command — cases assert `normaliseListName("  weekly   shop  ")` is `"weekly shop"`, that a 200-character input returns a 60-character result, and that `""` and `"   "` both return `null`. |
| R8 | Unit | Same command — a case calls `defaultListName(new Date("2026-09-18T10:00:00Z"))` twice and asserts both results are identical, non-empty, and at most 60 characters. |
| R9 | Unit | Same command — cases assert: 120 input lines yield 100 items; `position` runs 0..n-1 in array order; `terms: ["chicken","breast"]` serialises to `"chicken breast"`; a quantity of 0 clamps to 1 and 500 clamps to 99; absent `measure`/`brand` become `null`; a line with `terms: []` is dropped. |
| R10 | Unit | Same command — cases assert rows are returned in ascending `position` when supplied out of order, and that a row with `terms: "   "` is dropped. |
| R11 | Unit | Same command — a round-trip case over a fixture of at least five lines (including one with `measure` set, one with `brand` set, and one with both `null`) asserts deep equality on `original`, `quantity`, `terms`, `measure`, `brand`. |
| R12 | Unit | Same command — a case asserts `productNamesToLines([{ name: "Basmati Rice 5kg", quantity: 2 }])` yields one line whose `original` is the name, whose `terms` equal `toTerms("Basmati Rice 5kg")`, whose `measure` and `brand` are `null`; and that an entry named `"!!!"` is dropped. |
| R13 | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0 — both walk `lib/repositories/` without an allowlist, so the new file is covered by construction. Additionally `grep -nE "^import .*(@/lib/db|@/lib/auth|@/lib/tenant|@/lib/cart-identity)" lib/repositories/shopping-lists.ts` returns nothing (a `import type` line from `@/lib/db` is permitted and is what `customer-addresses.ts` does — check the matched line is `import type` if any appears). |
| R14 | Unit | `npx vitest run tests/shopping-lists-repository.test.ts` — a case drives `listShoppingLists` against a fake client and asserts the `where` carried both `vendorId` and `userId`, the `orderBy` is `updatedAt` descending, and each returned entry carries `id`, `name`, `itemCount`, `updatedAt`. |
| R15 | Unit | Same command — one case asserts items come back ordered by ascending `position`; a second asserts a client returning no row makes `findShoppingList` return `null`. |
| R16 | Integration | **live-script** — `npx tsx specs/2026-09-18-p116-saved-shopping-lists/verify-saved-lists.ts` prints `created list <id> with 3 items` and exits 0. This is the row that proves the WS-client choice against real Postgres rather than a double; a create routed through the HTTP client fails here even though every unit test above passes. |
| R17 | Unit | `npx vitest run tests/shopping-lists-repository.test.ts` — one case with the count query reporting 20 asserts `createShoppingList` returns `null` and issued no create; a second asserts the same for an empty `items` array. |
| R18 | Integration | **live-script** — the same script renames the list it created and prints `rename scoped: own=true other-user=false other-vendor=false`, proving the `updateMany` matched only the owner's row. It runs on the WS client; note the script fails on the HTTP client, which is the point. |
| R19 | Integration | **live-script** — the script deletes the list, prints `deleted=true items-remaining=0`, then calls delete again and prints `deleted=false` (idempotent, and the cascade removed the items). |
| R20 | Unit | Read `lib/repositories/shopping-lists.ts` top to bottom: every `shoppingList.*` call's `where` names `vendorId` and `userId`; every `shoppingListItem.*` call either nests under such a call or uses a `listId` returned by one. Confirm with `npx vitest run tests/repository-vendor-scoping.test.ts`, which exits 0. |
| R21 | Unit | Read `lib/shopping-lists-service.ts`: `getPrisma()`/`getPrismaWs()` are called inside `getShoppingListService()`, the function is not wrapped in any memo/cache helper, and no module-level `const` holds a client or the service. Compare shape against `lib/customer-addresses-service.ts`, which this mirrors. |
| R22 | Unit | `npx vitest run tests/shopping-lists-service.test.ts` — with the user-id reader stubbed to `null`, each of `list`, `find`, `save`, `rename`, `remove` returns `[]`/`null`/`false` respectively, none throws, and no repository function was called. |
| R23 | Unit | Same command — assertions record which client object each repository function received: `createShoppingList` and `renameShoppingList` get the WS client, the other three get the HTTP client. |
| R24 | Unit | For each of the five files, `head -1` is `"use server";`, and `grep -c "^export " <file>` returns 1 with that line beginning `export async function`. No repo-wide test enforces this rule, so the five `grep` results ARE the check — there is no test file to fall back to, and the rule is enforced only at runtime (#159). |
| R25 | Unit | `npx vitest run tests/save-list-actions.test.ts` — a case builds a `FormData` with four parallel `lineText`/`lineTerms`/`lineQuantity`/`lineMeasure`/`lineBrand` entries, one of which has an empty `lineTerms`, and asserts the service received exactly three lines with fields aligned to their index. |
| R26 | Unit | Same command — a case with a stubbed cart summary of two lines asserts the saved lines' `original` values equal the two product names and quantities match; a second case with `lines: []` asserts the service was not called. |
| R27 | Unit | Same command — a case with a stubbed order asserts lines come from `items[].productName`/`items[].quantity`; a second case with `getForUser` returning `null` asserts no save was attempted. |
| R28 | Unit | Same command — a case submitting `name: "  Weekly  "` asserts the service received `"Weekly"`; a case submitting an empty name asserts the received name equals `defaultListName` for the same clock value. |
| R29 | Unit | Same command — with no session, each of the five actions is invoked and asserted to perform no service write and not throw. |
| R29a | E2E | **live-worker** — seed the signed-in user with 20 saved lists (`verify-saved-lists.ts --fill-cap` does this), then submit a save from `/shop-your-list`. The response is 200 and its HTML contains a message naming the limit; it is not a 500 and not the generic error page. Confirm `/account/lists` still shows 20 lists, not 21. |
| R30 | Regression | `git diff origin/staging -- features/orders/reorder-items.ts features/cart/add-list-to-cart.ts` produces no output. |
| R31 | E2E | **live-worker** — with `npm run preview` running: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:8787/account/lists` with no cookie returns a redirect to `/login`. With a signed-in cookie, `curl -s http://localhost:8787/account/lists` returns HTML containing each saved list's name, its item count, a form posting to the rename action, a form posting to the delete action, and an `href` to `/account/lists/<id>`. |
| R32 | E2E | **live-worker** — signed out, `/account/lists/<valid-id>` redirects to `/login`. Signed in as the owner, it returns 200. Signed in as a **different** seeded user, the same id returns 404. |
| R33 | Unit | **Scope the absence-grep to `import` lines.** `grep -rnE "^import .*(match-list\|list-normalisation)" "app/(storefront)/account/lists/"` returns nothing. A bare word-grep here returns three matches and always will: the page's own docstring names both modules in order to explain why it does not import them, so the only way to "pass" a bare grep is to delete the most useful comment in the file — the trap `specs/sdd-workflow.md` records under the Spec stage. Additionally `grep -n "matchListTerms\|synonymAliasMap\|resolveLines" "app/(storefront)/account/lists/[listId]/page.tsx"` shows all three. **live-worker** cross-check: open a saved list with `CLOUDFLARE_API_TOKEN` removed from **both** `.env` and `.dev.vars` (precedence is per key) and confirm the review renders identically — no AI call is on this path to degrade. |
| R34 | E2E | **live-worker** — `curl -s http://localhost:8787/account` with a signed-in cookie returns HTML containing `href="/account/lists"`. |
| R35 | E2E | **live-worker** — `curl -s http://localhost:8787/cart` with a signed-in cookie whose cart has at least one line returns HTML containing a form whose action targets the save-cart action; the same request with no cookie returns HTML not containing it. |
| R36 | E2E | **live-worker** — `curl -s http://localhost:8787/account/orders/<orderNumber>` with the owner's cookie returns HTML containing both the existing reorder control and the new save-as-list control. |
| R37 | E2E | **live-worker** — `curl -s http://localhost:8787/shop-your-list` with no cookie returns 200 and HTML with the paste textarea and no save-list form; with a signed-in cookie the same page includes the save-list form. Also `ls middleware.ts proxy.ts app/middleware.ts app/proxy.ts` finds none of them, and `git status --porcelain` lists no new file with either name. |
| R37a | Unit | **The two `form` elements must not overlap.** Scan the rendered HTML from R37's signed-in request in document order and confirm every `<form` is closed by a `</form>` before the next `<form` opens — a nested form would show two opens before the first close. In source, `components/cart/ShopYourList.tsx` renders the save form and `components/cart/ListReview.tsx` renders the add form, as siblings; neither JSX tree contains the other's `form` element. |
| R38 | Unit | `ls components/cart/ListReview.tsx` succeeds; `grep -n "ListReview" components/cart/ShopYourList.tsx "app/(storefront)/account/lists/[listId]/page.tsx"` shows an import and a render in each. |
| R39 | Unit | `grep -n 'name="productId"\|name="quantity"' components/cart/ListReview.tsx` shows the hidden input pair for the matched branch and the select plus hidden quantity for the ambiguous branch — the same field names `features/cart/add-list-to-cart.ts` reads, which R30 proves unchanged. |
| R40 | Regression | **live-worker** — on `/shop-your-list`, POST a list of four lines (one that matches exactly, one ambiguous, one out of stock, one nonsense) and confirm the returned HTML renders all four branches; then submit the add form and confirm `/cart` shows the expected lines. This is the pre-existing P3d journey and must behave as it did before the `ListReview` extraction. |
| R41 | Unit | `npx vitest run tests/data-rights-saved-lists.test.ts` — a case asserts the export object has a `savedLists` array whose entries carry `name`, `createdAt` and `items` of `rawText`/`quantity`, populated for the given vendor and user. |
| R42 | Unit | Same command — a case with saved lists held by a second vendor asserts `countOtherVendorData`'s result includes them. |
| R43 | Integration | **live-script** — `npx tsx specs/2026-09-18-p116-saved-shopping-lists/verify-saved-lists.ts --erase` seeds a list, calls `eraseVendorData`, and prints `lists deleted: 1 items remaining: 0`, then exits 0. |
| R44 | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0, and `git diff origin/staging -- tests/repository-purity.test.ts tests/repository-client-injection.test.ts` produces no output. |
| R45 | E2E | **live-worker** — signed in, POST a three-line list to the save-list action, follow the redirect, and confirm `/account/lists` shows the new list with an item count of 3. Open it and confirm the review renders three lines. This is the acceptance journey; it is the row that fails if the WS-client choice is wrong in a way the fake client hid. |
| R46 | Unit | `npm run kms:validate` exits 0 and reports no failing front-matter. `npm run kms:build-index` then `npm run kms:check-generated` exits 0. Also run `npm run kms:assemble:internal` followed by a real build in `kms/site-internal` (`npx next build --webpack`) and **read its exit status directly** — do not pipe it through `head`/`tail`, which reports the pipe's status, not the build's. This slice adds three spec files, so the bare-`{` and bare-`<`-digit MDX traps apply to them. |
| R47 | Regression | `git diff origin/staging -- CHANGELOG.md` shows a new entry for this slice citing `#116` and `specs/2026-09-18-p116-saved-shopping-lists/`. |
| R48 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0, and `npx vitest run` — **run on its own** — exits 0 with no file reporting zero executed tests. |
