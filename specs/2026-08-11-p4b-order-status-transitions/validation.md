# P4b — Staff order status transitions & delivery emails (validation)

**Pre-flight, before any row below.** Three environment facts, each of which has already produced a
confidently wrong result in this repo:

1. **Confirm `.env` and `.dev.vars` point at the same Neon project** (issue **#119** says they do
   not). `npm run preview` reads `.dev.vars`; every fixture and inspection script reads `.env`. If
   they differ, every live row below validates against a database the app is not running on, and the
   results look entirely plausible. Compare both `DATABASE_URL`/`DIRECT_URL` hosts *before* starting.
   `CLAUDE.md`'s config section documents the precedence: the Cloudflare request context wins under
   preview, so `.dev.vars` is what the app reads.
2. **Use `npm run preview`, never `npm run dev`,** for every row that touches the database — plain
   `next dev` cannot load `@prisma/client/wasm` and renders a silent error state.
3. **On Windows, stop a previous `npm run preview` properly.** Orphaned `node`/`workerd` processes
   hold file locks and the next build fails confusingly; `Stop-Process` them before retrying.

**Fixtures.** Build them with a plain `tsx` script. `placeOrder(prisma, vendorId, input)` and
`confirmPayment(prisma, orderNumber)` both take their client explicitly (P3b R9a / P3c), which is
what lets them be driven outside a request:

- **F1** — Aheed, `CONFIRMED` (call `placeOrder`, then `confirmPayment`). The main advance subject.
- **F2** — Aheed, left at `PENDING_PAYMENT` (call `placeOrder` only). Illegal-transition subject.
- **F3** — SriMart, `CONFIRMED`. Vendor-isolation subject.
- **F4** — Aheed, advanced all the way to `DELIVERED`. Queue-filter subject.
- **F5** — Aheed, `CONFIRMED`, a **second** order for the double-submit and action rows.
- **F6…** — enough further Aheed `CONFIRMED` orders to exceed one page (R23), with **distinct
  `createdAt` values**: several orders created in the same second are ordered by `id`, which is a
  `uuid`, so the sort is stable and total but not chronological-looking — the exact input that hides
  an off-by-one at a page boundary.

**Accounts** come from `npm run demo:accounts`, which already creates exactly the three shapes
needed — `demo-staff@example.com` (vendor `STAFF` membership, platform `CUSTOMER`),
`demo-customer@example.com` (plain shopper, no membership), `demo-admin@example.com` (platform
`ADMIN`). Confirm which vendor the script attached the membership to before relying on R22/R24.

**Authenticated requests, headlessly.** Sign in against the running preview, capture the session
cookie, reuse it. The vendor is resolved from the request host, so use `node:http` with
`{ setHost: false }` and set `Host` yourself — `fetch`/undici **silently drops a caller-set `Host`
header**, landing every request on `/coming-soon` and looking like a broken app. To drive the server
action (R26/R27), parse the rendered form's `<input>` **and** `<select>` elements whole, in document
order, and read `name`/`value` out of each — `$ACTION_REF_1` renders with no `value` attribute, and a
parser requiring `value="..."` drops it, producing a bare `500` with an empty body.

| Req | How to verify |
|-----|---------------|
| R1  | `grep -nE "getPrisma\|@prisma/client\|fetch\(\|cookies\(\|headers\(" lib/order-status.ts` prints nothing outside comments. `npm run test -- order-status` passes with `DATABASE_URL` unset. |
| R2  | Unit test asserts `canTransition("CONFIRMED","OUT_FOR_DELIVERY") === true` and `canTransition("OUT_FOR_DELIVERY","DELIVERED") === true`. |
| R3  | Unit test loops all 5×5 ordered pairs of the `OrderStatus` values and asserts `canTransition` is `true` for exactly the two pairs in R2 and `false` for the other 23. Assert the *count* of true pairs is 2, so a future added status cannot silently widen the table. |
| R4  | Unit test: `canTransition("NOT_A_STATUS","DELIVERED") === false`, `canTransition("CONFIRMED","NOT_A_STATUS") === false`, `nextStatus("NOT_A_STATUS") === null`, none of which throw. |
| R5  | Unit test asserts each of the five mappings named in the requirement, by value. |
| R6  | Unit test loops the five `OrderStatus` values and asserts, for each, that `nextStatus(s) === null` or `canTransition(s, nextStatus(s)!) === true` — deriving the invariant rather than restating R2/R5's constants. |
| R7  | `grep -n "createdByUserId\|createdBy " prisma/schema.prisma` shows `createdByUserId String?` and `createdBy User?` inside `model OrderStatusEvent`. `git diff origin/staging -- prisma/schema.prisma` touches no other `model` block (the `User` back-relation line is expected and is not a model change). |
| R8  | `ls prisma/migrations/` shows exactly one new directory vs `origin/staging`. `grep -cE "DROP\|SET NOT NULL\|ALTER TYPE" <new>/migration.sql` prints `0`; `grep -c "ADD COLUMN" <new>/migration.sql` prints ≥ 1. |
| R9  | `grep -n "onDelete: SetNull" prisma/schema.prisma` matches the `createdBy` relation, and the migration SQL's `FOREIGN KEY` for `createdByUserId` carries `ON DELETE SET NULL`. |
| R10 | Before migrating, record `SELECT count(*) FROM "OrderStatusEvent";`. Run `npm run db:migrate` (uses `DIRECT_URL`); it exits 0. Then `SELECT count(*) FROM "OrderStatusEvent" WHERE "createdByUserId" IS NOT NULL;` returns `0` and the total count is unchanged. |
| R11 | `npx prisma migrate status` prints that the database schema is up to date, with no drift and no pending migrations. |
| R12 | `grep -n "export async function advanceOrderStatus" -A 8 lib/repositories/orders.ts` shows all five parameters in the signature. The fixture script calls it directly via `tsx` (no Workers context) and it returns a result — this is the same script the rows below use, so R12 passing is a precondition for R13–R19. |
| R13 | In the script: a legal call returns an object with `ok === true` and `order.orderNumber`, `order.buyerEmail`, `order.items`, `order.totalPence` present; an illegal call returns `ok === false` with `reason` in `{"not-found","illegal-transition"}`. Neither call is wrapped in `try/catch` — a throw fails the row. |
| R14 | Advance **F1** `CONFIRMED → OUT_FOR_DELIVERY`. Then `SELECT status FROM "Order" WHERE "orderNumber"=F1;` returns `OUT_FOR_DELIVERY`, and `SELECT status, "createdByUserId" FROM "OrderStatusEvent" WHERE "orderId"=F1 ORDER BY "createdAt" DESC LIMIT 1;` returns `OUT_FOR_DELIVERY` and the `demo-staff` user's id. Also assert the count of events for F1 rose by exactly 1. |
| R15 | `SELECT note FROM "OrderStatusEvent" WHERE "orderId"=F1 ORDER BY "createdAt" DESC LIMIT 1;` returns a non-null string that appears as a literal in this slice's own source. Then confirm no staff-supplied path exists: `grep -rniE "<textarea\|type=\"text\"\|name=\"note\"" "app/(storefront)/staff/" features/orders/` prints nothing, and the advance action's parameter list has no note field. Reading the action's signature is the authority here — a grep for the word `note` alone would match the explanatory comments that exist precisely to record this rule. |
| R16 | Record F2's status and its `OrderStatusEvent` count. Call `advanceOrderStatus(..., F2, "DELIVERED", ...)` → `{ok:false, reason:"illegal-transition"}`. Re-query: status still `PENDING_PAYMENT`, event count unchanged. Repeat with F5 (`CONFIRMED`) and `toStatus="DELIVERED"` to cover the rung-skip case. |
| R17 | Call `advanceOrderStatus(prisma, <Aheed vendorId>, F3, "OUT_FOR_DELIVERY", actor)` — F3 belongs to SriMart. Returns `{ok:false, reason:"not-found"}`. F3's status and event count are unchanged. Confirm the same `reason` comes back for a fabricated order number, so the two are indistinguishable to a caller. |
| R18 | Call `advanceOrderStatus(..., F5, "OUT_FOR_DELIVERY", ...)` twice in a row. First returns `ok:true`, second returns `{ok:false, reason:"illegal-transition"}`. `SELECT count(*) FROM "OrderStatusEvent" WHERE "orderId"=F5 AND status='OUT_FOR_DELIVERY';` returns `1`. |
| R19 | Read `advanceOrderStatus` in `lib/repositories/orders.ts`: the `updateMany` `where` names `vendorId` and `status`, and no `fetch(`, `getEmailService` or `send` appears between the `$transaction(` opening and its closing brace. Confirm by reading the function body, not by grepping the whole file. |
| R20 | `node:http` `GET /staff/orders` with `Host` set and no cookie → `307`/`302` with `location: /login`. |
| R21 | Sign in as `demo-customer@example.com`, `GET /staff/orders` → the body contains the staff-only refusal copy, and grepping the body for F1's and F5's order numbers finds neither. |
| R22 | Sign in as `demo-staff@example.com`, `GET /staff/orders` → `200`. Body contains F5's order number (`CONFIRMED`) and, after R14, F1's (`OUT_FOR_DELIVERY`). Body contains **neither** F2's (`PENDING_PAYMENT`) nor F4's (`DELIVERED`) order number. Confirm newest-first by extracting the order numbers in body order and checking their `createdAt` values descend. |
| R23 | With F6… seeded past one page, `grep -n "OFFSET\|skip:" lib/repositories/orders.ts` shows no `skip:` in the staff list method. Fetch page 1, collect its order numbers, follow the rendered next-page link, collect page 2's. The two sets are disjoint, their union contains every actionable Aheed order the DB holds (`SELECT "orderNumber" FROM "Order" WHERE "vendorId"=<aheed> AND status IN ('CONFIRMED','OUT_FOR_DELIVERY')`), and no order number repeats. |
| R24 | With the same staff session, `GET /staff/orders` with `Host` set to the **SriMart** host, then to the **Aheed** host. Neither response body contains an order number belonging to the other vendor (F3 absent from the Aheed page). If the staff account holds no SriMart membership, the SriMart request is a 403 — **record which of the two outcomes occurred**; both satisfy isolation, and naming which one is what makes this row unambiguous rather than a judgement call. |
| R25 | `grep -n 'dynamic = "force-dynamic"' "app/(storefront)/staff/orders/page.tsx"` matches. `grep -rn "OrderStatusBadge" "app/(storefront)/staff/"` shows an import from `@/components/orders/OrderStatusBadge`, and `ls components/orders/` still shows exactly one status-badge component file. |
| R26 | From the R22 response, extract the advance form's fields (see the parsing note above). POST that exact payload as `multipart/form-data` **with no `Cookie` header**, then again with `demo-customer`'s session. After both, `SELECT status FROM "Order" WHERE "orderNumber"=F5;` is unchanged. Then confirm the action is itself the gate, not just the page: `grep -n "requireVendorRole" features/orders/advance-status.ts` matches. |
| R27 | Replay the R26 payload with a **valid staff session** but `toStatus` rewritten to `"DELIVERED"` (illegal from `CONFIRMED`), and again to `"BANANA"`. After each, F5's status is unchanged and `SELECT count(*) FROM "OrderStatusEvent" WHERE "orderId"=F5;` equals the count taken before the replay. |
| R28 | Advance F5 `CONFIRMED → OUT_FOR_DELIVERY` through the real rendered form as `demo-staff`. Then sign in as F5's owning customer and `GET /account/orders/{F5}` → the timeline body contains "Out for delivery". Confirm `git diff origin/staging -- "app/(storefront)/account/" components/orders/OrderTimeline.tsx` is empty, so P4a's read path is genuinely unmodified rather than adjusted to suit. |
| R29 | Set `RESEND_API_KEY` to a deliberately invalid value in `.dev.vars`, restart `npm run preview`, and advance F1 `OUT_FOR_DELIVERY → DELIVERED` through the form. The response is not a 500, `SELECT status FROM "Order" WHERE "orderNumber"=F1;` returns `DELIVERED`, and a new `OrderStatusEvent` row exists. Restore `.dev.vars` afterwards. |
| R30 | Unit test (`vi.stubGlobal("fetch", spy)` + a stubbed vendor profile, the pattern already in `tests/email.test.ts`): calling `sendOrderStatusEmail` for `OUT_FOR_DELIVERY` and for `DELIVERED` each calls the spy **once**; the parsed request body's `to` equals the order's `buyerEmail` and its `subject` contains the stubbed `senderName`. Then assert the subject is not a hardcoded name by running the same test with a different stubbed `senderName` and confirming the subject changes. Live cross-check: advance an order on each vendor's host under `npm run preview` and confirm the console shows exactly one Resend attempt per advance. |
| R31 | In the same unit test file, calling `sendOrderStatusEmail` for `CONFIRMED`, `PENDING_PAYMENT` and `CANCELLED` leaves the fetch spy uncalled. Live: during the R16/R17/R27 rejected-transition runs, the preview console shows no Resend attempt. `grep -rn "sendOrderStatusEmail" features/ app/ lib/` shows it called only from the advance path. |
| R32 | **Expected to be unverifiable — record it as such, with the reason, not as a pass.** #104: Resend has no verified sending domain, so no message from R30 can be delivered to a real inbox in any environment. The validation write-up must state explicitly that R30/R31 were satisfied structurally (attempt count, recipient, sender identity) and that end-to-end delivery was **not** verified. |
| R33 | `grep -n "#128" specs/roadmap.md` matches a change-log row recording P4a's promotion to production. `npm run kms:validate` exits 0 (the roadmap's front-matter `version`/`updated` were bumped alongside). |
| R34 | `git diff origin/staging -- CHANGELOG.md` is non-empty and the new text sits under `## [Unreleased]`. Re-check this immediately before opening the PR: Gate 4's CI check diffs against the PR's **current** base, so another PR merging first can make an earlier diff vanish. |
| R35 | `npm run lint`, `npm run typecheck`, `npm run test`, `npm run format:check` each exit 0. On a Windows checkout, treat a `format:check` complaint as suspect until confirmed against the committed blob (`git show HEAD:<file>`) — `core.autocrlf` makes Prettier flag files that are clean on the Linux CI runner. CI's `gates` run is the authority. |
