# P7.5d+e — Staff panel completion (validation)

## Shared rig — do this first

Every DB-touching row below assumes this setup. `npm run dev` **cannot** be substituted: plain
`next dev` runs in real Node and cannot load `@prisma/client/wasm`, so a DB-touching route silently
renders an error state with no crash and no signal (see `CLAUDE.md`).

- **S1.** Before anything else, confirm which database you are pointed at. Diff `.env` and
  `.dev.vars` against `secrets/staging.vars` and `secrets/production.vars` and confirm the host in
  `DATABASE_URL`/`DIRECT_URL` is the **dev** Neon branch, not staging (`S3_BUCKET`-style
  staging-sounding neighbours are not evidence) and not production (`ep-young-glitter-zadlkttm`).
  Print keys, not lines — `DATABASE_URL` ends in `BASE_URL`, so an unanchored grep leaks the
  password (#175). Under `preview`, `.dev.vars` wins.
- **S2.** `npm run preview` (OpenNext + local Workers/Miniflare). Note the URL it prints; it is
  referred to below as `$PREVIEW`. When you stop it, kill the whole chain — `npm`,
  `opennextjs-cloudflare`, `wrangler.js` and both `workerd.exe` — or the next build fails `EBUSY`.
- **S3.** Get an admin session. `npm run demo:accounts` prints the demo credentials; sign in as the
  **Aheed store admin** and keep the session cookie for `curl -b`. Repeat for a **SriMart** admin
  where a row needs vendor B. **Do not assume the host names** — they are seeded from
  `SEED_AHEED_HOST`/`SEED_SRIMART_HOST`, so read the actual values from the dev database's
  `VendorDomain` rows with the S4 script and use those in `curl -H "Host: <value>"`. An unmatched
  host resolves to `/coming-soon`, which is the signal you guessed wrong.
- **S4.** For rows comparing a page against the database directly, write a scratch `.ts` file inside
  the repo and run `npx tsx scripts/tmp-validate.ts`. Do **not** use `npx tsx -e` — on this Windows
  setup it exits 0 with no output the moment the script imports `@prisma/client`, which is
  indistinguishable from success. Delete the scratch file when done.
- **S5.** Rows R15–R19 and R33 require temporary writes to the dev database. Record each row's
  before-state, make the write, verify, then restore. Do not leave fixture rows behind (#273).

| Req | How to verify |
|-----|---------------|
| R1  | `ls prisma/migrations/` shows a `*_p7_5de_order_search_trigram` directory. `grep -Ei "CREATE EXTENSION IF NOT EXISTS pg_trgm" prisma/migrations/*_p7_5de_order_search_trigram/migration.sql` matches, and `grep -Ei "using gin.*gin_trgm_ops" …/migration.sql` matches lines naming both `orderNumber` and `guestEmail`. |
| R2  | Read `…/migration.sql` top to bottom: a comment must state which objects Prisma cannot express and why. `grep -n "p7_5de_order_search_trigram" prisma/schema.prisma` returns a comment line on `model Order`. Both must be present — a missing comment is a fail, not a nit. |
| R3  | `npx prisma migrate deploy` exits 0; then `npx prisma migrate status` prints that the database schema is up to date with no pending migrations. |
| R4  | Via the S4 scratch script or `psql` against `DIRECT_URL`: `SET enable_seqscan = off;` then `EXPLAIN SELECT id FROM "Order" WHERE "orderNumber" ILIKE '%abc%';`. The plan text must name the trigram index from R1. If it still shows `Seq Scan`, the index cannot serve the predicate — fail. |
| R5  | Pick a real order and derive three terms from it (a 3+ char slice of its `orderNumber`, of a `guestEmail`, and of an account holder's `email`). For each: `curl -b <cookie> "$PREVIEW/staff/orders?status=all&q=<term>"` and compare the order numbers rendered against the same predicate run directly in the S4 script. The two sets must match exactly. |
| R6  | `curl -b <cookie> "$PREVIEW/staff/orders?status=all&q=<two-char-term>"` returns HTTP 200 and the rendered order numbers match the same two-character predicate run in the S4 script. Slowness is not a failure here; a wrong or empty result set is. |
| R7  | Find an order belonging to SriMart only. As the **Aheed** admin, `curl -b <aheed-cookie> "$PREVIEW/staff/orders?status=all&q=<that-order-number>"` — the rendered list must contain zero orders. Repeat mirrored (SriMart admin, Aheed order number) with `-H "Host: <srimart-host-from-S3>"`. |
| R8  | `grep -rEn "\$queryRaw|\$executeRaw|queryRawUnsafe|executeRawUnsafe" app/ features/ components/ lib/repositories/` returns no matches. |
| R9  | `grep -n "searchParams" -A 4 "app/(admin)/staff/products/page.tsx"` shows the params type including `q` and `status` alongside `cursor`. |
| R10 | `curl -b <cookie> "$PREVIEW/staff/products"` output contains a form whose method is `get` with `name="q"` and `name="status"` controls. `grep -c "use client" "app/(admin)/staff/products/page.tsx"` returns 0. |
| R11 | Choose a product name substring. `curl -b <cookie> "$PREVIEW/staff/products?q=<term>&status=all"` and compare the product names rendered against the same `name contains` predicate in the S4 script — sets must match. Then `?status=active` and `?status=inactive` each return the matching subset, and `?status=all` returns their union. |
| R12 | On a `q`/`status` combination yielding more than one page, extract the next-page href from the R11 response. It must contain the same `q` and `status` values. Fetch it; the returned products must be disjoint from page one and still satisfy the filter. |
| R13 | `grep -n "export async function listProductsForAdmin" -A 3 lib/repositories/products.ts` shows `vendorId: string` as an explicit parameter. `grep -En "getCurrentVendorId\(|headers\(|getAuth\(" lib/repositories/products.ts` returns no matches. |
| R14 | As the Aheed admin, search a term matching only a SriMart product (confirm via the S4 script that it exists for SriMart and not Aheed). The rendered list must contain zero products. |
| R15 | On `$PREVIEW/staff/loyalty` as the Aheed admin, submit the create control with a fresh key (e.g. `VALIDATE_TMP`). Confirm via the S4 script that exactly one new `VendorLoyaltyTier` row exists for Aheed with that key, and `curl` the page again to see it rendered. **Restore:** delete the row after R20. |
| R16 | Submit the create control again with the *same* key. The response must render a visible error naming the duplicate, and must not be an unhandled 500. Confirm via the S4 script that the row count for Aheed is unchanged. |
| R17 | With `-H "Host: <srimart-host-from-S3>"` and the SriMart admin cookie, create a tier using the **same** key as R15. It must succeed, proving scoping. **Restore:** delete it afterwards. |
| R18 | Record Aheed's tier keys via the S4 script. Delete the R15 tier through the page's delete control. Re-read: exactly that key is gone and every other tier key is still present. |
| R19 | Before R18's delete, capture via the S4 script the count of `LoyaltyLedgerEntry` rows for Aheed plus the `tierKey`/`multiplierBps` of any rows referencing a real tier key. Delete a tier whose key appears there (create ledger-referenced conditions if none exist, then restore). After the delete, re-read: count unchanged, and the captured `tierKey`/`multiplierBps` values identical. |
| R20 | `curl -b <cookie> "$PREVIEW/staff/loyalty"` and inspect the HTML: no form element may appear between another form element's start and end tags. Confirm the delete and create controls carry a `form=` attribute referencing a top-level form's id. |
| R21 | `grep -n "PanelRefusal" "app/(admin)/staff/loyalty/page.tsx"` matches. Then sign in as a demo **customer** (non-staff) and `curl -b <customer-cookie> "$PREVIEW/staff/loyalty"` — the body must contain the refusal text, not an empty content area. |
| R22 | For every file matching `grep -rl "use server" features/`, confirm each `export` is an `async function`: `grep -nE "^export (const|let|var|type|interface|default [^a])" <file>` must return no value exports (a `type`/`interface` export is erased at compile time and is acceptable; a value export is not). |
| R23 | As the demo customer, POST the tier-create and tier-delete actions directly (re-submitting the form with the customer cookie). Both must be refused, and the S4 script must show no `VendorLoyaltyTier` change. |
| R24 | `curl -o /dev/null -w "%{http_code}" -b <cookie> "$PREVIEW/staff/customers"` prints `200`. |
| R25 | Via the S4 script, compute for Aheed the set of customers with a revenue-status order plus each one's order count, total spend and loyalty balance. `curl -b <cookie> "$PREVIEW/staff/customers"` and confirm the rendered rows match that computation for at least three customers, including the GBP formatting of spend. Identity renders as the account holder's `User.name` for account orders and the `guestEmail` for guest orders — an entry showing a bare id or an empty cell is a fail. |
| R26 | Confirm via the S4 script that Aheed has at least one guest order (`userId` null, `guestEmail` set). It must appear in the rendered directory. If two distinct guest emails exist, confirm they render as two separate entries, not one. If no guest order exists, create one, verify, and delete it (S5). |
| R27 | Use the S4 script to confirm a vendor has more revenue-status customers than the page's `PAGE_SIZE` constant (read it from the page source; do not edit it). Fetch `/staff/customers`, extract the next-page href, fetch it, and confirm the second page's entries are disjoint from the first with no duplicates. If neither vendor has enough customers, create the shortfall as temporary orders, verify, then restore (S5) — and say so in the result rather than marking the row verified by inspection. |
| R28 | Identify via the S4 script a customer who has ordered only from SriMart. As the Aheed admin, that person must not appear in `$PREVIEW/staff/customers`. |
| R29 | As the demo **customer**, `curl -b <customer-cookie> "$PREVIEW/staff/customers"` — body contains the `<PanelRefusal>` text, not a blank content area inside the portal shell. |
| R30 | `curl -b <cookie> "$PREVIEW/staff"` output contains an href of `/staff/customers`. |
| R31 | `curl -sI -b <cookie> "$PREVIEW/staff/customers"` shows `Cache-Control: private, no-store, must-revalidate`. Note this is the *local* Worker; the real Cloudflare edge behaviour is #269's job, not this row's. |
| R32 | Via the S4 script compute Aheed's total products, active count, count with `Inventory.quantity` of 0, and count at or below `lowStockThreshold`. `curl -b <cookie> "$PREVIEW/staff/reports"` must render those four figures identically. |
| R33 | Via the S4 script compute the sum of `visibleBalance(...)` across Aheed's `LoyaltyAccount` rows and its pence value via `pointsToPence(points, config.pencePerPointRedeemed)`. The rendered liability figures must match exactly. |
| R34 | Two branches, both required. **(a)** With Aheed's `pointsExpiryMonths` set to a small number, set one account's `lastActivityAt` far enough back to lapse it; the rendered liability must drop by exactly that account's `balancePoints`. **(b)** Set `pointsExpiryMonths` to null; the rendered liability must equal the raw sum of all balances. Restore both the config and the `lastActivityAt` afterwards (S5). |
| R35 | Via the S4 script list Aheed's `DiscountCode` rows with their `DiscountRedemption` counts and `remainingRedemptions`. The rendered section must match, showing an unlimited indicator where `remainingRedemptions` is null. |
| R36 | `git diff origin/main...HEAD` over `app/`, `lib/` and `features/` contains no new aggregate grouping `Order.totalPence` by time, product or customer. `curl -b <cookie> "$PREVIEW/staff/reports"` shows exactly the three pre-existing revenue tiles and no fourth revenue figure. |
| R37 | `git diff origin/main...HEAD -- tests/repository-vendor-scoping.test.ts` is empty. `grep -rn "getCurrentVendorId(" lib/repositories/` returns only the nine functions already allowlisted in that test — no tenth. |
| R38 | `grep -n "#285" specs/roadmap.md` matches a change-log row citing PR #285 and merge `0340482`. `npm run sdd:audit` no longer reports it as pending. |
| R39 | `grep -n "app/(admin)/layout.tsx" CLAUDE.md` matches, and `grep -n "app/(admin)/staff/layout.tsx" CLAUDE.md` returns no matches. |
| R40 | `npm run kms:assemble:internal` exits 0, then `cd kms/site-internal && npx next build --webpack` exits 0. |
| R41 | Read the PR body. Its closing keywords name exactly #264, #265, #160, #161, #169, #163, #136, #260 — and none of #252, #269, #253, #254, #243, #244, #246, #236, #113, #46. Verified at Ship, before merge. |
| R42 | `git diff origin/main...HEAD -- CHANGELOG.md` is non-empty and describes this slice. |
| R43 | `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check` each exit 0. CI on Linux is the authority — if `format:check` fails on files this slice never touched, confirm it is the `core.autocrlf` artifact the documented way before treating it as drift. |
