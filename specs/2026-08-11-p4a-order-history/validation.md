# P4a — Order history & status timeline (validation)

**Pre-flight, before any row below.** Two environment facts must be established first, because both
have already produced confidently wrong results in this repo:

1. **Confirm `.env` and `.dev.vars` point at the same Neon project** (issue #119 says they currently
   do not). `npm run preview` reads `.dev.vars`; any inspection or fixture script reads `.env`. If
   they differ, every live row below validates against a database the app is not using. Compare the
   two `DATABASE_URL`/`DIRECT_URL` hosts before starting, not after a confusing result.
2. **Use `npm run preview`, never `npm run dev`,** for every row that touches the database — plain
   `next dev` cannot load `@prisma/client/wasm` and renders a silent error state (`CLAUDE.md`).

**Fixtures.** Several rows need orders that seeding does not create. Build them with a plain `tsx`
script calling `placeOrder(prisma, vendorId, input)` directly — it takes its client and vendor as
explicit arguments precisely so it can be driven outside a request (P3b R9a):

- **O1** — owned by demo member **A**, on the **Aheed** vendor.
- **O2** — a **guest** order (`userId: null`, `guestEmail` set), on the Aheed vendor.
- **O3** — owned by demo member **A**, on the **SriMart** vendor.
- **O4…O15** — twelve further orders owned by member A on Aheed, for the pagination rows.

Credentials come from `npm run demo:accounts`. Member **B** is a second demo account.

**Authenticated requests, headlessly.** Sign in against the running preview to get a session cookie,
then reuse it. Because the vendor is resolved from the request host, use `node:http` with
`{ setHost: false }` and set `Host` yourself — `fetch`/undici silently drops a caller-set `Host`
header, which lands every request on `/coming-soon` and looks like a broken app:

```js
// POST /api/auth/sign-in/email {email,password} -> capture set-cookie,
// then GET with { Host: '<vendor host>', Cookie: '<session cookie>' }, { setHost: false }.
```

| Req | How to verify |
|-----|---------------|
| R1  | `grep -nE "getPrisma\|@prisma/client\|fetch\(\|cookies\(\|headers\(" lib/order-status.ts` prints nothing. `npm run test` runs `tests/order-status.test.ts` with no DB available and it passes. |
| R2  | A unit test asserts `orderStatusLabel` returns a distinct non-empty string for each of the five `OrderStatus` values, and a non-empty fallback (not the raw input, no throw) for `"NOT_A_STATUS"`. |
| R3  | A unit test passes events in deliberately shuffled order and asserts the returned array is ascending by `at` and that each `label` equals `orderStatusLabel(status)` for that entry. |
| R4  | Two unit tests: `[CONFIRMED@t1, CONFIRMED@t2, DELIVERED@t3]` → length 2 with `result[0].at === t1`; `[CONFIRMED@t1, CANCELLED@t2, CONFIRMED@t3]` → length 3. |
| R5  | `grep -nE "\bnote\s*[:?]" lib/order-status.ts` prints nothing (matches on the word inside explanatory comments do **not** count — see the row's correction note). Read `getForUser`'s `statusEvents` select: `status` and `createdAt` only. `npm run test` passes the "carries no note field" case. Then write a note directly into the DB (`UPDATE "OrderStatusEvent" SET note='INTERNAL-DO-NOT-SHOW' WHERE "orderId" = <O1>`) and confirm `INTERNAL-DO-NOT-SHOW` does not appear in the body of `GET /account/orders/{O1}`. |
| R6  | `grep -n "getCurrentVendorId" lib/repositories/orders.ts` shows `listForUser` resolving vendor through the seam. Read the method: its `where` contains both `vendorId` and `userId`. `npm run typecheck` exits 0 with `OrderListPage` as specified. |
| R7  | Read `listForUser`: `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`, `take: take + 1`, and `cursor`/`skip: 1` only when a cursor is passed. `grep -n "skip:" lib/repositories/orders.ts` shows only `skip: 1`. |
| R8  | With O1 built as 2 × one product and 1 × another, `listForUser` returns `itemCount: 3` for it. For an order with 5 distinct items, `previewItems.length === 3` and those three are the alphabetically-first product names — re-run twice and confirm the same three in the same order. `npm run typecheck` confirms `OrderListItem` exposes no `address` field. |
| R9  | Count queries in a driver script calling `listForUser(userId, { take: N })` with Prisma query logging enabled (`new PrismaClient({ log: ["query"] })`), first with **1** fixture order and then with **10**. The query count must be **identical** for both — one `SELECT` against `"Order"` plus one batched `SELECT ... FROM "OrderItem" WHERE "orderId" IN (...)`. A count that grows with the number of orders fails this row. |
| R10 | Leave one fixture order in `PENDING_PAYMENT` and cancel another. `GET /account/orders` contains **both** order numbers, each with its `orderStatusLabel` text from R2. Neither is filtered out. |
| R11 | Read `getForUser`: `where: { orderNumber, vendorId, userId }`. Backed empirically by R19 and R20. |
| R12 | `GET /account/orders/{O1}` (signed in as A) returns 200 and the body contains the order number, each item name, the subtotal/delivery/total figures, the address line 1, and at least one timeline label from R2. |
| R13 | `git diff origin/staging -- lib/repositories/orders.ts` shows no changed line inside the `getByOrderNumber` body. Backed empirically by the `/checkout/{O2}` 200 in R19. |
| R14 | `grep -n "force-dynamic" "app/(storefront)/account/orders/page.tsx"` matches. `GET /account/orders` with **no** cookie returns a redirect to `/login` (302/307, `location` contains `/login`). With A's cookie it returns 200 and contains exactly 10 order numbers. |
| R15 | With A's 15 Aheed orders (O1, O4…O15 plus any others), `GET /account/orders` returns 10 and a link whose href contains `?cursor=`. Follow it: the next response contains the remainder, **no** order number repeated from page 1, and no further `?cursor=` link on the last page. |
| R16 | Sign in as member **B** (no orders). `GET /account/orders` returns 200, the body contains the empty-state text, and it contains an `href="/categories"`. |
| R17 | `grep -n "force-dynamic" "app/(storefront)/account/orders/[orderNumber]/page.tsx"` matches. `GET /account/orders/AH-DOES-NOT-EXIST` signed in returns **404**. `GET /account/orders/{O1}` with no cookie redirects to `/login`. |
| R18 | The R12 response body additionally contains each item's quantity and line total, the delivery recipient and postcode, one timeline entry per distinct status the order has passed through (placed → confirmed shows two), and dates in `en-GB` form (e.g. `11/08/2026` or `11 August 2026`, never `8/11/2026`). |
| R19 | Signed in as A: `GET /account/orders/{O2}` (the **guest** order) returns **404**. With the same host and no cookie, `GET /checkout/{O2}` returns **200** and its body contains O2's order number. **Both halves must hold** — the 404 alone does not prove the rule, only that something failed. |
| R20 | Signed in as member **B**: `GET /account/orders/{O1}` returns **404**, and `GET /account/orders` for B does not contain O1's order number. |
| R21 | Signed in as A: `GET /account/orders` with `Host: <aheed host>` contains O1 and **not** O3; with `Host: <srimart host>` it contains O3 and **not** O1. `GET /account/orders/{O3}` with `Host: <aheed host>` returns **404**. |
| R22 | `GET /account` signed in returns 200 and the body contains `href="/account/orders"`. |
| R23 | `ls components/orders/` shows the two components. `grep -rn "components/orders" "app/(storefront)/checkout/[orderNumber]/page.tsx" "app/(storefront)/account/orders/[orderNumber]/page.tsx"` matches in both. `grep -c "Subtotal" "app/(storefront)/checkout/[orderNumber]/page.tsx"` returns 0 — the money markup lives only in the shared component. |
| R24 | **Before** the refactor, save `GET /checkout/{O1}` and `GET /checkout/{O2}` response bodies. **After**, fetch both again and diff: item lines, the three money figures, the address block and the status banner text must be identical. Report any intentional difference explicitly rather than accepting it silently. |
| R25 | `git diff origin/staging --stat -- prisma/` prints nothing. |
| R26 | `grep -rn "getPrisma\|@prisma/client" "app/(storefront)/account/" components/orders/` prints nothing. `npm run lint` exits 0. |
| R27 | Read the delivery-board blockquote: it must not claim `Backlog`/`In Review` are missing, nor tell the reader to substitute `Todo`. `git diff` shows its `version`/`updated` front-matter bumped. **Corrected 2026-08-11, at Validate.** This row originally verified with `grep -n "Todo\|do not exist yet" specs/sdd-workflow.md` returning nothing. That check is wrong in the same way R5's original was: the *corrected* blockquote necessarily names the mistake it is correcting ("previously … told the reader to substitute `Todo`"), so the grep matches the fix itself. Satisfying it literally would mean deleting the explanation that makes the correction useful. The row now states the property; the grep cannot express it. |
| R28 | `npm run kms:validate` exits 0 with 0 failing. `npm run kms:build-index` then `git diff --exit-code ARTIFACT_INDEX.md` exits 0, and `grep -n "p4a-order-history" ARTIFACT_INDEX.md` matches. |
| R29 | `git diff origin/staging -- CHANGELOG.md` is non-empty and describes this slice under `[Unreleased]`. |
| R30 | `npm run lint`, `npm run typecheck`, `npm run test`, `npm run format:check` each exit 0; `npm run build` succeeds. On a Windows checkout, do **not** trust a `format:check` failure at face value — `core.autocrlf` rewrites line endings, so diff the committed blob (`git show HEAD:<file>`) before treating a flagged file as real drift. CI is the authority. |
