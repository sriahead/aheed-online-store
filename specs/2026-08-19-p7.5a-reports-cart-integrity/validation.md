# P7.5a — Staff reports correctness & checkout cart preservation (validation)

Run in order. Rows R5, R6, R8 and R10–R13 touch the database or the Workers runtime and **must** use
`npm run preview`, never `npm run dev` — plain `next dev` cannot load `@prisma/client/wasm` and will
render an error state silently (see CLAUDE.md's Database section).

**Before starting any live row**, confirm which database you are pointed at: diff `.env` and
`.dev.vars` against `secrets/staging.vars` and `secrets/production.vars`. Two files agreeing is not
evidence they are right — at P5a's validation both agreed and both pointed at *production*. Only the
Neon host tells you which environment you are on.

**When finished with `npm run preview`**, kill the whole process chain
(`npm` → `opennextjs-cloudflare` → `wrangler dev` → `workerd.exe` ×2) via
`Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='workerd.exe'"` and `taskkill /F /PID`,
matching on the repo path — a survivor holds `.open-next\assets` and the next build fails `EBUSY`.

| Req | How to verify |
|-----|---------------|
| R1  | `grep -n "REVENUE_STATUSES" lib/order-status.ts` shows a single `export const REVENUE_STATUSES = ["CONFIRMED", "OUT_FOR_DELIVERY", "DELIVERED"] as const;`. Confirm by eye that it is a literal array — not `ORDER_STATUSES.filter(...)` or any expression referencing `STAFF_QUEUE_STATUSES`. |
| R2  | `grep -nE "@prisma/client\|lib/repositories\|lib/db" lib/order-status.ts` prints nothing. |
| R3  | `grep -n "getFinancialsForStaff" -A 12 lib/repositories/orders.ts` shows `status: { in: REVENUE_STATUSES }` inside the `aggregate` `where`, and `grep -n "REVENUE_STATUSES" lib/repositories/orders.ts` shows it arriving via an `import` from `@/lib/order-status`. |
| R4  | `npx vitest run tests/order-status.test.ts` exits 0 and its output names a test asserting `REVENUE_STATUSES` excludes `PENDING_PAYMENT` and `CANCELLED`, and a second asserting it includes `DELIVERED`. |
| R5  | Write `scripts/check-revenue.ts` (a real file — `npx tsx -e` fails silently on this Windows setup once a script imports a package) that connects with `DIRECT_URL` and prints, for the Aheed vendor: (a) `order.aggregate` `_sum.totalPence`/`_count.id` with no status filter, and (b) the same restricted to `CONFIRMED`/`OUT_FOR_DELIVERY`/`DELIVERED`. Run `npx tsx scripts/check-revenue.ts`. Then start `npm run preview`, sign in as `demo-admin@example.com`, open `/staff/reports`, and confirm the Total Revenue and Total Orders tiles equal **(b)** exactly and are strictly lower than **(a)**. Delete the script afterwards. |
| R6  | Have `scripts/check-revenue.ts` print the revenue-status order count **per vendor** and confirm one is zero — `prisma/seed.ts` writes no order rows, so SriMart is the expected candidate, but read the number rather than assuming it. Under `npm run preview`, load `/staff/reports` with `Host: srimart-staging.nocaped.com` (signed in as an admin of that vendor) and confirm HTTP 200, Avg Basket Value `£0.00`, and no `NaN` anywhere in the body. **Create no rows for this row** — if no vendor has zero revenue orders, record that and check the guard by unit-testing the page's divisor instead. |
| R7  | With `npm run preview` running: `curl -sSI http://localhost:8787/staff/reports` and confirm the `Cache-Control` response header value contains both `private` and `no-store`. This row needs no session — `next.config.mjs` `headers()` applies to the matched path regardless of the auth outcome. |
| R8  | On staging after `deploy-staging` completes: sign in as `demo-admin@example.com` in a browser and copy the session cookie. `curl -sSi -H "Cookie: <session>" https://staging.aheedfoodcentre.nocaped.com/staff/reports` — record `cf-cache-status` and the Total Orders figure from the body. Then place **one real guest order through the storefront checkout** with a Stripe test card (staging runs test keys) and let the webhook confirm it — this is how #237 was originally measured; do not hand-insert an order row. Repeat the curl. Confirm Total Orders increased by exactly 1 and that **neither** response reported `cf-cache-status: HIT`. If R7's header is present but `HIT` persists, stop — that is the zone-level Cache Rule named in `plan.md`'s open items; file it as an owner action rather than changing code. |
| R9  | `curl -sSI http://localhost:8787/` under `npm run preview` and confirm its `Cache-Control` header does **not** contain `no-store` (absent entirely is acceptable). |
| R10 | `npx vitest run tests/orders.test.ts` exits 0 and includes a test that mocks `createPayment` to reject, drives `placeOrder`, and asserts the fake tx received `cartItem` creates whose `{productId, quantity}` set equals the order's `OrderItem` set for the original `cartId`. |
| R11 | The same test asserts, on the failure path, that the order was updated to `CANCELLED`, the `Payment` row to `FAILED`, and that each product's inventory received an `increment` equal to the ordered quantity. |
| R12 | The same test asserts `placeOrder` rejects with a `CheckoutError` whose code is `PAYMENT_PROVIDER_FAILED`. |
| R13 | A test case seeds the fake state with a pre-existing `CartItem` for one restored product and asserts `placeOrder`'s failure path completes without throwing — plus a live check: set `STRIPE_SECRET_KEY` to a bogus value in `.dev.vars`, run `npm run preview`, add 3 items to a cart, place the order, and confirm the browser shows the "couldn't reach our payment provider" message **and** the cart still holds all 3 items with their original quantities. Restore `.dev.vars` afterwards. |
| R14 | `grep -n "releaseOrder" -A 40 lib/repositories/orders.ts` shows no `cartItem` create/`createMany`/`upsert` inside the `releaseOrder` transaction. |
| R15 | `grep -n "P7.5a" specs/decisions/ADR-005-payments-money-flow.md` shows an implementation note stating that the payment-failure compensation restores the cart and that the restore lives in `placeOrder`'s `catch`, not `releaseOrder`. Confirm the P3c implementation note no longer reads as if stock release is the whole compensation. |
| R16 | `grep -n "P7.5" specs/roadmap.md` shows an entry in the `## Phases` list naming the pre-launch closeout of P3/P5/P6 deferred debt and citing `#260`. |
| R17 | `grep -nE "259\|c532bb0" specs/roadmap.md` shows a Roadmap Change Log row for the P7d `/document` closeout promotion. |
| R18 | `npm run sdd:audit` prints no line containing `row pending carry-forward`, and its promotions section is present rather than skipped (a skip line means `gh` was unavailable and is **not** a pass). |
| R19 | Before merging, `gh pr view <n> --json body` and confirm the closing keywords name exactly `#261`, `#238`, `#237`, `#234`. Confirm `#260` appears only as a plain reference (e.g. "part of #260") with no closing keyword in front of it. After merge, `gh issue view 260 --json state` still reports `OPEN`. |
| R20 | `git diff origin/staging -- CHANGELOG.md` is non-empty and describes this slice. |
| R21 | `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check` each exit 0. If `format:check` fails on files this branch never touched, it is the documented `core.autocrlf` artifact — confirm the documented way (`git show HEAD:<file>` written out with LF, then `prettier --config .prettierrc.json --check`, run where prettier resolves the config) and treat CI on Linux as the authority. |
