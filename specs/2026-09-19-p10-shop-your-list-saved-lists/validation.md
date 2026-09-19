# Surface saved lists on /shop-your-list (validation)

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

This slice touches only `app/(storefront)/shop-your-list/page.tsx` (a Server Component reading a
real session and a real saved-lists count) — **validate with `npm run preview`, never
`npm run dev`**, per `CLAUDE.md`. Rows marked **live-worker** need `npm run preview` running and a
signed-in session cookie (`demo-customer@example.com` / the `DEMO_ACCOUNT_PASSWORD` in `.dev.vars`,
via `POST /api/auth/sign-in/email` — no browser needed, this page has no client-side hydration
quirks for the new section). To get a shopper with saved lists for R3–R6, either use an account
that already has some, or create 2+ quickly through the existing `/shop-your-list` "save this list"
flow / `saveCartAsList`, and delete them afterwards to leave the account as found.

**`git diff origin/staging -- <path>` is used below to mean "unchanged."** If `origin/staging` is
not fetched, run `git fetch origin staging` first.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Unit | Read `app/(storefront)/shop-your-list/page.tsx`: the call to `getShoppingListService().list()` (or equivalent) is inside the `if (canSave)` branch (or a ternary conditioned on `canSave`), not called unconditionally before the check. |
| R2 | Regression | `git fetch origin staging` then `git diff origin/staging -- lib/repositories/shopping-lists.ts lib/shopping-lists-service.ts "app/(storefront)/account/lists/[listId]/page.tsx" components/cart/ListReview.tsx` produces no output. |
| R3 | E2E | **live-worker** — signed in as a shopper with ≥1 saved list, `curl -s -b jar.txt -H "Host: localhost:8787" http://127.0.0.1:8787/shop-your-list` returns HTML where the byte offset of `Your saved lists` is lower than the byte offset of `id="list"` (e.g. `python -c "h=open('page.html').read(); print(h.index('Your saved lists') < h.index('id=\"list\"'))"` prints `True`). |
| R4 | Unit | With a fixture account seeded to 7+ saved lists (or read `listShoppingLists`'s return array in a debugger/log), count the rendered row entries in R3's HTML — exactly 5, and their names/ids match the first 5 entries of `getShoppingListService().list()`'s return order for that account. |
| R5 | E2E | In R3's HTML, for each rendered row: the row's text contains the list's real `name`; a list with `itemCount: 1` renders literal text `1 item` (not `1 items`) and a list with `itemCount` ≠ 1 renders `{n} items`; an `<a href="/account/lists/<that-list's-id>">` (or a `<Link>` compiling to one) wraps or contains the row. |
| R6 | E2E | In R3's HTML, `grep -o 'href="/account/lists"[^>]*>[^<]*'` (or equivalent) finds exactly one match, and its visible text matches `/your lists/i`. Repeat with a fixture account at exactly 2 saved lists and at 6+ — the link is present in both cases with the same `href`. |
| R7 | E2E | **live-worker** — signed in as a shopper with **zero** saved lists (or after deleting them all via `/account/lists`), `curl`'s response for `/shop-your-list` contains no substring `Your saved lists` and no `href="/account/lists"`. |
| R8 | E2E + Regression | **live-worker** — with no cookie, `curl -s -H "Host: localhost:8787" http://127.0.0.1:8787/shop-your-list` contains no substring `Your saved lists` and no `href="/account/lists"`; separately, `git diff origin/staging -- "app/(storefront)/shop-your-list/page.tsx"` shows only additions (the new conditional branch, its data fetch, and any new imports) — no line inside the pre-existing guest-facing JSX (the heading, the intro paragraph, `<ShopYourList canSave={canSave} />`, the "Back to your cart" link) is modified or removed. |
| R9 | Regression | `git diff origin/staging -- lib/shopping-list.ts features/cart/match-list.ts features/cart/add-list-to-cart.ts components/cart/ShopYourList.tsx` produces no output. |
| R10 | E2E | **live-worker** — reusing `#116`'s own R32/R45 checks against a list surfaced by R5's link: signed out, the same `href` redirects to `/login`; signed in as the owner, it 200s and the rendered review contains every one of that list's saved lines; signed in as a **different** seeded user, the same `href` 404s. |
| R11 | Unit | `ls middleware.ts proxy.ts app/middleware.ts app/proxy.ts` finds none of them; `git status --porcelain` lists no new file with either name. |
| R12 | Regression | `git diff origin/staging -- CHANGELOG.md` shows a new entry for this slice citing `#806`. |
| R13 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0, and `npx vitest run` — run on its own — exits 0 with no file reporting zero executed tests. |
