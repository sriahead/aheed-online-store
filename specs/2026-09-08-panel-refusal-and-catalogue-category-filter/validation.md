# P9.3 — Panel refusal enforcement & admin catalogue category filter (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Before you start

Read these six notes first. Five of them have each cost a validation round trip in this repo.

1. **Use `npm run preview`, never `npm run dev`, for every live row below.** `next dev` runs in
   real Node and cannot load `@prisma/client/wasm`, so a DB-touching route silently renders an
   error state with no crash and no signal.

2. **Resolve the base URL from the database — do not assume a hostname.** `/staff/products`
   resolves its vendor from the request Host, and a host with no `VendorDomain` row silently
   redirects to `/coming-soon` with no error and no hint whether the cause is the host or the
   feature. That assumption cost a round trip at `#649`. Do this once, before any live row:

   ```
   # the value the preview server will use
   grep -E '^BETTER_AUTH_URL' .dev.vars
   # the hosts that actually resolve a vendor, in the DB the preview server points at
   npx tsx scripts/<scratch>.ts   # prisma.vendorDomain.findMany({ select: { host: true, vendorId: true } })
   ```

   Use the `BETTER_AUTH_URL` origin whose hostname appears in that `VendorDomain` list as
   **`$BASE`** in every command below. Do **not** spoof a different Host header: Better Auth's
   `trustedOrigins` rejects an unlisted origin at sign-in, so a spoofed host cannot even
   authenticate (CLAUDE.md, "Live-testing staff panel server actions").

3. **Write scratch scripts to a `.ts` file inside the repo and run `npx tsx path/to/file.ts`.**
   `npx tsx -e "<script>"` fails silently on this Windows setup the moment the script imports an
   installed package — no stdout, no stderr, exit 0. Delete the scratch file afterwards, and run
   `npx tsc --noEmit` once if you placed it at the repo root, since `next build` type-checks it.

4. **Scope every absence-grep to a directory, never the repo root.** Everything written in this
   spec is machine-copied into `app/(admin)/staff/runbook/docs.ts` by `kms:build-index` and into
   `kms/site-internal/content/` by `kms:assemble:internal`, so a repo-root grep for a string this
   spec discusses matches this spec plus both generated copies. Every row below names its
   directory deliberately — do not widen it.

5. **Where a row greps source for a symbol, it targets syntax, not the bare word.** These pages
   carry comments that name `PanelRefusal` and `return null` precisely because they explain what
   not to do, so a bare-substring check matches the comment. This is the same failure the previous
   slice fixed in `82dbb1d`.

6. **Sign-in for the live rows.** Passwords come from `DEMO_ACCOUNT_PASSWORD` in `.env` /
   `.dev.vars`. `demo-store-admin@example.com` is a vendor **ADMIN** (needed for `/staff/products`);
   `demo-staff@example.com` is vendor **STAFF**, i.e. authenticated but refused by the ADMIN-only
   `/staff/discounts` — that is the account R2 needs.

   ```
   curl -s -c admin.txt -X POST "$BASE/api/auth/sign-in/email" \
     -H "Content-Type: application/json" \
     -d '{"email":"demo-store-admin@example.com","password":"<DEMO_ACCOUNT_PASSWORD>"}'
   curl -s -c staff.txt -X POST "$BASE/api/auth/sign-in/email" \
     -H "Content-Type: application/json" \
     -d '{"email":"demo-staff@example.com","password":"<DEMO_ACCOUNT_PASSWORD>"}'
   ```

   Both must return HTTP 200 with a session cookie written to the jar. A `401`/`Invalid origin`
   here means `$BASE` is wrong — go back to note 2 rather than proceeding.

**Fixture ids for Half B.** Rows R17–R20 need real ids. Resolve them once with a scratch script
against the same `DATABASE_URL` the preview server uses, and reuse them:

- **`$DEPT`** — the id of a top-level category (`parentId: null`) that has at least one child
  **and** at least one product sitting in that child rather than in the department itself.
- **`$SUB`** — the id of that child.
- **`$SUBPRODUCT`** — the name of a product whose `categoryId` is `$SUB`.
- **`$OTHERSUB`** / **`$OTHERSUBPRODUCT`** — a *second* child of `$DEPT`, and the name of a
  product in it. R17's exactness half needs a product that must appear under `$DEPT` and must
  **not** appear under `$SUB`.
- **`$EMPTYCAT`** — the id of any category of this vendor with **zero** products. R20 needs the
  empty state to be reachable from a category filter *alone*; adding a `q=` term to force it
  would prove only that `q` sets `isFiltered`, which was already true before this slice.

If no department satisfies the `$DEPT`/`$SUB` shape, or the vendor has no empty category, say so
in the validation record and mark the affected row **not verified** rather than substituting a
weaker fixture — see the closing note.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `grep -n "PanelRefusal" "app/(admin)/staff/discounts/page.tsx"` shows both an import from `@/components/staff/PanelRefusal` and a JSX usage. `grep -c "<h1" "app/(admin)/staff/discounts/page.tsx"` returns `0`. |
| R2  | E2E | With the preview server running: `curl -s -o discounts.html -w "%{http_code}\n" -b staff.txt "$BASE/staff/discounts"` prints `200`. `grep -c "Store admins only" discounts.html` returns a non-zero count, and `grep -c "You&#x27;re signed in, but" discounts.html` (or the `&apos;`/`'` form the renderer actually emits — check the file if the first pattern returns 0, per the HTML-escaping trap) returns a non-zero count. |
| R3  | Unit | `test -f tests/panel-refusal-coverage.test.ts` succeeds. Read the file: the page list comes from a `readdirSync`/`readdir`-based walk of `app/(admin)`, and the file contains no array of literal page paths and no variable named like an allowlist/exclusion list. State in the record which lines you read to conclude this. |
| R4  | Unit | `npx vitest run tests/panel-refusal-coverage.test.ts` exits `0` and reports every discovered page as passing. Then negative-control it: `git stash` is not needed — instead temporarily revert R1 by restoring the hand-rolled branch in `app/(admin)/staff/discounts/page.tsx` (`git stash push -- "app/(admin)/staff/discounts/page.tsx"`), re-run the same command, and confirm it now **fails naming that file**. `git stash pop` to restore. |
| R5  | Unit | Create a probe page `app/(admin)/__ast_probe__/page.tsx` whose body calls `requireVendorRole("ADMIN")` and whose only mention of the component is a comment line such as `// renders <PanelRefusal> on refusal` — with no JSX usage. `npx vitest run tests/panel-refusal-coverage.test.ts` must **fail** naming the probe file. Delete the probe directory and re-run to confirm it passes again. A test that passes with the probe present is text-matching, not AST-matching. |
| R6  | Unit | `grep -c "keep their own copies" components/staff/PanelRefusal.tsx` returns `0`. |
| R7  | Unit | `grep -n "storefront" CLAUDE.md \| grep -i "panelrefusal\|refusal"` and `grep -n "discounts" CLAUDE.md \| grep -i "panelrefusal\|refusal"` each return at least one line, and `grep -c "panel-refusal-coverage" CLAUDE.md` returns a non-zero count. |
| R8  | Unit | `grep -n "#350" specs/roadmap.md` shows no line containing `Still open`, and shows a line recording it as closed by this slice. |
| R9  | Unit | `grep -n "CATEGORY_ALL" lib/staff-products-query.ts` shows an `export const`. `npx tsc --noEmit` exits `0` with `parseStaffProductsQuery` declaring a second parameter that is **not** optional (no `?`, no default) — confirm by reading the signature. |
| R10 | Unit | `grep -nE "from \"@/lib/(db\|repositories/\|tenant\|auth\|auth-rbac)\|from \"next/headers\"" lib/staff-products-query.ts` returns nothing. |
| R11 | Unit | `npx vitest run tests/staff-products-query.test.ts` exits `0`, including cases for: a known parent id, a known child id, an absent value, a blank value, and an id not present in the supplied categories (the last three all resolving to `CATEGORY_ALL`). |
| R12 | Unit | Same command as R11; the suite includes a case asserting a parent selection yields the parent id plus every supplied child id, and a case asserting a child selection yields exactly that one id. |
| R13 | Unit | Same command as R11; the suite includes a case asserting `categoryIds` is `undefined` (not `[]`) for `CATEGORY_ALL`, and a case for a parent with no children asserting `[parentId]` rather than `[]`. |
| R14 | Unit | Same command as R11; the suite includes a round-trip asserting `staffProductsHref` emits `category=<id>` for a selection and omits the key entirely for `CATEGORY_ALL`. |
| R15 | Integration | Read `listProductsForAdmin` in `lib/repositories/products.ts`: its options type declares `categoryIds?`, the `where` applies `categoryId: { in: … }` only when that value is present, and the first two parameters are still the Prisma client and `vendorId`. Then `npx vitest run tests/repository-client-injection.test.ts` exits `0`. |
| R16 | E2E | `curl -s -o products.html -b admin.txt "$BASE/staff/products"`, then `grep -c "<select name=\"category\"" products.html` returns `1` and `grep -c "All categories" products.html` returns a non-zero count. `grep -c "<optgroup" products.html` returns the number of **groups**, which is this vendor's top-level category count **plus any child whose parent is absent from the list** — `toCategoryOptionGroups` promotes an orphan to its own group, so do not assert a bare department count. Have the fixture script print both numbers and compare. Finally confirm `grep -c "value=\"$DEPT\"" products.html` is non-zero: the department is selectable in its own right, not a label. |
| R17 | E2E | `curl -s -b admin.txt "$BASE/staff/products?category=$DEPT" \| grep -c "$SUBPRODUCT"` returns a non-zero count — a product in the **child** appears when the **department** is selected. Then `curl -s -b admin.txt "$BASE/staff/products?category=$DEPT" \| grep -c "$OTHERSUBPRODUCT"` also returns non-zero (both children roll up), while `curl -s -b admin.txt "$BASE/staff/products?category=$SUB" \| grep -c "$OTHERSUBPRODUCT"` returns **`0`** — a subcategory selection is exact and does not leak its sibling. |
| R18 | E2E | `curl -s -b admin.txt "$BASE/staff/products?category=$DEPT" \| grep -o 'href="/staff/products?[^"]*cursor=[^"]*"'` prints an href, and that href contains `category=$DEPT`. If the filtered set is smaller than one page there is no "Older products" link — in that case use `$DEPT` for a department with more than 25 products, or fall back to asserting the same property with `status=active` present, and say which you did. |
| R19 | E2E | `curl -s -o forged.html -b admin.txt "$BASE/staff/products?category=not-a-real-id"`. Three checks: the page lists products (`grep -c "/staff/products/" forged.html` is non-zero, i.e. it did **not** collapse to an empty filtered view); no option carrying a real category id is marked selected (`grep -o '<option value="[^"]*" selected' forged.html` prints either nothing or only the `all` sentinel — React renders `selected` on the option matching the select's `defaultValue`); and `grep -o 'href="/staff/products?[^"]*cursor=[^"]*"' forged.html` prints an href containing **no** `category=`, so the forged value cannot ride into the next page. |
| R20 | E2E | `curl -s -o empty.html -b admin.txt "$BASE/staff/products?category=$EMPTYCAT"` — **no `q`, no `status`**, so the category filter is the only thing active. `grep -c "No products match this view" empty.html` returns a non-zero count and `grep -c "No products yet" empty.html` returns `0`. Using `q=` to force the empty state would prove only that `q` sets `isFiltered`, which held before this slice. |
| R21 | Unit | `git diff --name-only origin/staging -- prisma/` prints nothing. |
| R22 | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits `0`, and `git diff --name-only origin/staging -- tests/repository-purity.test.ts tests/repository-client-injection.test.ts` prints nothing. |
| R23 | Unit | Run `npx vitest run` **alone**, with no build running and no orphaned `node.exe`/`workerd.exe` (check `Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='workerd.exe'"`). Confirm `CLAUDE.md`'s baseline line quotes the exact `Test Files` / `Tests` totals that run printed. A shortfall against the previous baseline plus `Failed to start forks worker` is the forks-pool trap, not a result — re-run rather than recording it. |
| R24 | Regression | `git diff origin/staging -- CHANGELOG.md` shows an `[Unreleased]` entry naming `#350`, `#503` and the split-out `#670`. |
| R25 | Regression | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` each exit `0`. **CI on the PR is the authority**, not local output — read the real check runs before calling this passed. |

---

## Notes for the record

- **`#670` must not be closed** by this slice's PR. Nor `#513` (board Phase options) or `#439`.
  Closing keywords may name only `#350` and `#503`.
- **PR `#669` needs its roadmap change-log row** on this branch (carry-forward rule) — `npm run
  sdd:audit` reports it as pending. That is Document (final) work, not a row above.
- If R17's fixture cannot be satisfied because every product sits directly on a department,
  record that and treat R17 as **not verified** rather than passing it on the exact-match case
  alone — the department-includes-children rule is the one thing in Half B that a unit test
  cannot prove against real data.
