# The Quick Shop hub, and a Regulars placeholder (validation)

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

## Before you start (read this first — you have no memory of the build)

This slice touches a **session-gated page**, so `npm run dev` cannot validate it: `next dev` cannot
load the WASM Prisma engine and silently renders an error state. **Every live row below runs under
`npm run preview`.** Start it once, run all the live rows, then kill the whole `node`/`workerd`
chain before any build — stopping `preview` does not stop it, and the next build fails with `EBUSY`.

Setup, all one-off, in this order:

1. `npx tsx scripts/demo-accounts.ts add` in a clean shell, with `DEMO_ACCOUNT_PASSWORD` set
   (min 8 chars). `demo-srimart-admin@example.com` has been absent from the dev database for two
   slices, which is what left the last two two-vendor checks unverified. `demo-customer@example.com`
   is the account the signed-in rows below use.
2. `export BASE=http://localhost:8787` — what `npm run preview` serves. Every `$BASE` below is this.
3. **Create the session cookie jar once; the rows marked `-b jar.txt` all depend on it:**
   ```
   curl -s -c jar.txt -X POST $BASE/api/auth/sign-in/email \
     -H 'content-type: application/json' \
     -d "{\"email\":\"demo-customer@example.com\",\"password\":\"$DEMO_ACCOUNT_PASSWORD\"}"
   ```
   Confirm it worked before going further: `curl -s -o /dev/null -w '%{http_code}\n' -b jar.txt
   $BASE/account` prints `200`, not a 3xx. A silently-empty jar makes every signed-in row below
   fail as if the page were broken.
4. **R18 needs at least one saved list on that account**, or its `<h2>` block does not render at all
   (`shop-your-list/page.tsx:45` guards on `savedLists.length > 0`). Add one from `/cart` →
   Smart Lists → save, or confirm one exists: `curl -s -b jar.txt $BASE/account/lists | grep -c
   'no saved lists yet'` prints `0`.
5. Run `npx vitest run --maxWorkers=4` **alone**, never beside or straight after a build. At the
   default worker count a loaded machine produces 2-10 scattered, moving, plausible failures that
   look exactly like a real regression. The tells are the durations (5-9 s for a trivial assertion)
   and that the failing set changes between runs. Do not bisect against them.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Integration  | `npx vitest run --maxWorkers=4 tests/page-container.test.ts` exits 0. Its "each page renders PageContainer with the width its spec row says" case reads `app/(storefront)/quick-shop/page.tsx` off disk and asserts the first JSX element after `return (` is `<PageContainer width="standard">`. |
| R2  | E2E          | Under `npm run preview`: `curl -s $BASE/quick-shop \| grep -o '<h1[^>]*>Quick Shop</h1>'` prints one match, and `curl -s $BASE/quick-shop \| grep -c '<title>Quick Shop'` prints `1`. |
| R3  | Unit         | `npx vitest run --maxWorkers=4 tests/quick-shop-hub.test.tsx` exits 0. It renders the hub and asserts `[...container.querySelectorAll("a")].map(a => a.getAttribute("href"))` equals exactly `["/account/favourites", "/account/regulars", "/shop-your-list", "/bundles"]` — order included, and length 4 so a fifth link fails it. |
| R4  | Unit         | Same file as R3: for each of the four links it asserts the label text is exactly `Your favourites` / `Your regulars` / `Smart Lists` / `Value Bundles`, and the description sentence is byte-equal to the string in `requirements.md` R4. Cross-check that the two already-shipped destinations really carry those names: `curl -s -b jar.txt $BASE/account/favourites \| grep -c '>Your favourites<'` and `curl -s $BASE/bundles \| grep -c '>Value Bundles<'` each print at least `1`. |
| R5  | Integration  | `grep -cF 'rounded-2xl border border-black/10 bg-white p-5 hover:border-action transition block' "app/(storefront)/quick-shop/page.tsx"` prints `4` (`-F`, so the `/` and `-` are literal). The same string is already in use on the page it was borrowed from: `grep -cF 'hover:border-action transition block' "app/(storefront)/account/page.tsx"` prints `6` or more. |
| R6  | Integration  | `grep -nE 'getAuth\|getSession\|getPrisma\|getUserId\|@/lib/[a-z-]+-service\|@/lib/repositories/' "app/(storefront)/quick-shop/page.tsx"` prints nothing and exits 1. |
| R7  | Integration  | `grep -nE '^export const (dynamic\|revalidate)' "app/(storefront)/quick-shop/page.tsx"` prints nothing and exits 1; `grep -n 'force-dynamic' "app/(storefront)/layout.tsx"` hits (the group already forces it). |
| R8  | Integration  | `grep -n 'export const dynamic = "force-dynamic"' "app/(storefront)/account/regulars/page.tsx"` hits; `curl -s --cookie jar.txt $BASE/account/regulars \| grep -c '<title>Your regulars'` prints `1`. |
| R9  | E2E          | Under `npm run preview`, with **no** cookie jar: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' $BASE/account/regulars` prints a 3xx whose redirect URL path is `/login`. (This is the same shape `#232` used for `/account/favourites`.) |
| R10 | E2E          | With the jar from setup step 3: `curl -s -o body.html -w '%{http_code}\n' -b jar.txt $BASE/account/regulars` prints `200`, then `grep -c '>Your regulars<' body.html` and `grep -cF 'Your regularly ordered items will appear here once you start shopping.' body.html` each print at least `1`. |
| R11 | Unit         | `npx vitest run --maxWorkers=4 tests/quick-shop-hub.test.tsx` exits 0 — it imports `REGULARS_PLACEHOLDER_MESSAGE` from `@/lib/regulars` and asserts the rendered Regulars page contains that exact value. Then `grep -c 'Your regularly ordered items will appear here' "app/(storefront)/account/regulars/page.tsx"` prints `0` (the page holds the import, not a second copy) while `grep -c 'Your regularly ordered items will appear here' lib/regulars.ts` prints `1`. |
| R12 | Integration  | `npx vitest run --maxWorkers=4 tests/page-container.test.ts` exits 0 (asserts `width="standard"` for this page from its registry row); `curl -s -b jar.txt $BASE/account/regulars \| grep -o 'href="/account"[^>]*>.\{0,40\}'` shows the `Your account` back link. |
| R13 | E2E          | `curl -s -b jar.txt $BASE/account \| grep -o 'href="/account/regulars"'` prints one match, and the surrounding anchor's text is `Your regulars` (`curl -s -b jar.txt $BASE/account \| grep -o 'href="/account/regulars"[^<]*<[^>]*>[^<]*<[^<]*Your regulars'` hits). |
| R14 | Integration  | `grep -nE 'recurring shopping lists\|quick shopping' "app/(storefront)/account/page.tsx"` prints nothing and exits 1. |
| R15 | Integration  | `grep -n 'href="/quick-shop"' components/layout/ShoppingListLink.tsx` hits; `grep -c 'shop-your-list' components/layout/ShoppingListLink.tsx` prints `0`. |
| R16 | Security & Accessibility | `npx vitest run --maxWorkers=4 tests/quick-shop-hub.test.tsx` exits 0 — it renders `ShoppingListLink` and asserts `getByRole("link").getAttribute("aria-label")` equals its `textContent.trim()` equals `Quick Shop`. Then `grep -n 'pasting' components/layout/ShoppingListLink.tsx` prints nothing and exits 1. |
| R17 | E2E          | `curl -s -o sl.html $BASE/shop-your-list`, then `grep -c '<h1[^>]*>Smart Lists</h1>' sl.html` and `grep -c '<title>Smart Lists' sl.html` each print `1`. For the "no `Quick Shop` outside a comment" half, run `npx tsx -e "import{readFileSync}from'fs';const s=readFileSync('app/(storefront)/shop-your-list/page.tsx','utf8').replace(/\/\*[\s\S]*?\*\/\|\/\/.*$/gm,'');process.exit(s.includes('Quick Shop')?1:0)"` — it exits 0 when the only survivors are comments, 1 otherwise. A bare `grep` cannot answer this row, because the file's comments legitimately quote the old name. |
| R18 | Integration  | Source first, deterministically: `grep -c '<h2[^>]*>Your lists</h2>' "app/(storefront)/shop-your-list/page.tsx"` prints `1`. Repo-wide, with comments stripped the same way as R17: no `.tsx` file under `app/` or `components/` still contains `Your saved lists` — `npx tsx -e "…"` over both trees exits 0. Then confirm it renders, with the saved list from setup step 4 in place: `curl -s -b jar.txt $BASE/shop-your-list \| grep -c '>Your lists<'` prints at least `1`. If setup step 4 was skipped this live half is vacuous, not passing. |
| R19 | Integration  | `grep -n 'href="/shop-your-list"' "app/(storefront)/cart/page.tsx" "app/(storefront)/account/lists/page.tsx"` prints one hit in each file; `grep -n 'Smart Lists' "app/(storefront)/cart/page.tsx" "app/(storefront)/account/lists/page.tsx"` prints one hit in each; `grep -c 'Quick Shop' "app/(storefront)/cart/page.tsx" "app/(storefront)/account/lists/page.tsx"` prints `0` for both. |
| R20 | Regression   | `curl -s -b jar.txt $BASE/account/lists \| grep -o '<h1[^>]*>Your lists</h1>'` prints one match, and `git diff origin/staging -- "app/(storefront)/account/lists/page.tsx"` shows no change to the `<h1>` line. |
| R21 | Integration  | `git diff origin/staging -- tests/page-container.test.ts` shows exactly two added `EXPECTED` keys, both `{ width: "standard", padY: "default" }`; `npx vitest run --maxWorkers=4 tests/page-container.test.ts` exits 0. Prove the registry is load-bearing: temporarily delete one of the two rows and confirm the "every page on disk has an expected width recorded" case **fails**, then restore it. |
| R22 | Regression   | `git diff origin/staging -- app/sitemap.ts` is empty, and `grep -n 'STATIC_PATHS' -A2 app/sitemap.ts` shows neither `/quick-shop` nor `/account/regulars`. |
| R23 | Security & Accessibility | `npx vitest run --maxWorkers=4 tests/vendor-neutral-copy.test.ts` exits 0. Then read the five new sentences in `git diff origin/staging` and confirm each names no vendor and no product category — that test is a **denylist**, so a green run is not evidence about new copy, only about the known-bad strings. Second vendor, measured not assumed: get the host from the dev config rather than guessing one (`grep SEED_SRIMART_HOST .env .dev.vars`), then `npx tsx scripts/verify-mobile-layout.ts --base http://<that-host>:8787 --map-host 127.0.0.1 --path /quick-shop --widths 390 --desktop` renders the hub under SriMart's branding. Confirm the four tile labels and sentences are byte-identical to Aheed's — the copy is vendor-neutral, so any difference is a defect. |
| R24 | Unit         | `npx vitest run --maxWorkers=4 tests/quick-shop-hub.test.tsx` exits 0, and the mutation check is recorded in `build-notes.md`: for each of the three subjects (an href, a tile label, the placeholder constant) the assertion was seen to **fail** with the subject changed and pass with it restored. An un-mutated new test file does not satisfy this row. |
| R25 | Regression   | `git diff --stat origin/staging -- prisma/ package.json package-lock.json` prints nothing, and `git status --porcelain prisma/migrations` is empty. |
| R26 | Regression   | `git diff origin/staging -- tests/quick-shop-copy.test.tsx` is empty, and `npx vitest run --maxWorkers=4 tests/quick-shop-copy.test.tsx` exits 0. |
| R27 | Acceptance   | After the PR is open: `GH_TOKEN=$(gh auth token -u sriahead) gh pr view <N> --json closingIssuesReferences --jq '[.closingIssuesReferences[].number] \| sort'` prints `[1186,1187]` exactly. Then `GH_TOKEN=$(gh auth token -u sriahead) gh issue view 1184 --json state` and the same for `1188` both print `OPEN`. |
| R28 | Regression   | `git diff origin/staging -- components/account/AccountNav.tsx tests/account-nav.test.tsx` is empty, and `npx vitest run --maxWorkers=4 tests/account-nav.test.tsx` exits 0. The omission is deliberate — see `plan.md`. Confirm the follow-up issue for the real gap exists and is referenced in `build-notes.md`. |
| R29 | Acceptance   | `git diff origin/staging -- CHANGELOG.md` is non-empty and its `[Unreleased]` section names both `#1186` and `#1187` and this slice's spec folder path. |
| R30 | Release      | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0, and `npx vitest run --maxWorkers=4` **run alone** exits 0 with no failed file. CI, not local output, is ground truth: `gates` green on the PR is what closes this row. |
