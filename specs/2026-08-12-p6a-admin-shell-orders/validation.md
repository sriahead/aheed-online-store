# P6a — Admin panel shell & order dashboard (validation)

## Before any row: environment and fixtures

Per `CLAUDE.md`, do this **first** and record the result — a live check against the wrong database
proves nothing.

1. **Env.** Read `DATABASE_URL`/`DIRECT_URL` from `.env` **and** `.dev.vars`, and diff both against
   `secrets/staging.vars` *and* `secrets/production.vars`. All of `.env`, `.dev.vars` and
   `secrets/staging.vars` must name the **staging** Neon host. Two files agreeing with each other
   is not the check — agreeing with `staging.vars` and differing from `production.vars` is.
2. **Run.** Start the app with **`npm run preview`** (OpenNext + Miniflare), never `npm run dev` —
   every live row below touches Prisma, and `next dev` cannot load `@prisma/client/wasm`.
3. **Accounts.** Ensure the demo accounts exist (`npm run demo:accounts`, operator-supplied
   password): `demo-admin@example.com` (platform `ADMIN`), `demo-staff@example.com` (vendor `STAFF`
   for Aheed), `demo-customer@example.com` (neither).
4. **Requests.** Use `node:http` with `{ setHost: false }` and set the `Host` header yourself —
   `fetch`/undici silently drops a caller-set `Host`, every request lands on `/coming-soon`, and
   the app looks broken (P3d). **Sessions are host-scoped** (ADR-004 slice 3c): a cookie obtained
   on Aheed's host is *not* valid on SriMart's, so any cross-vendor row below requires signing in
   separately **on each host** — one cookie will not work for both.
5. **Fixtures** (throwaway, **uncommitted** script against staging; record what you create):
   - orders in `DELIVERED` and `CANCELLED` states for Aheed;
   - one **guest** order (`userId` null) for Aheed;
   - a **canary note**: pick a distinctive string such as `P6A-CANARY-7Q4X`, and write it into the
     `note` column of an `OrderStatusEvent` belonging to an order **owned by
     `demo-customer@example.com`**. R24 and R27 are a matched pair over this one string — it must
     appear on the staff page and must not appear on the customer page.
   - to create a real `createdByUserId`, sign in as `demo-staff` and advance one `CONFIRMED` order
     through the UI; P4b writes both the system note and the actor on that transition.

Windows note: stopping `npm run preview` leaves orphaned `node`/`workerd` processes holding file
locks — `Stop-Process` them before re-running a build, or the next `preview` fails confusingly.

| Req | How to verify |
|-----|---------------|
| R1  | `test -f "app/(admin)/layout.tsx"` exits 0 **and** `test -d "app/(storefront)/staff"` exits non-zero. |
| R2  | All three of `app/(admin)/staff/orders/page.tsx`, `app/(admin)/staff/loyalty/page.tsx`, `app/(admin)/staff/discounts/page.tsx` exist (`ls` each; every path present). |
| R3  | With a `demo-admin@example.com` session cookie, `GET /staff/orders`, `GET /staff/loyalty`, `GET /staff/discounts` each return status `200`. Print the three status codes. |
| R4  | `GET /staff/orders` with `Host: no-such-host.invalid` returns a redirect to `/coming-soon` (307/308 with `Location: /coming-soon`), **not** a 500. First confirm 2+ `ACTIVE` vendors exist (Aheed and SriMart both do on staging) — with exactly one, `lib/tenant.ts`'s single-vendor fallback resolves the host and this row would pass for the wrong reason. |
| R5  | `grep -n 'dynamic = "force-dynamic"' "app/(admin)/layout.tsx"` and each `page.tsx` under `app/(admin)/` — every file matches. Then `npm run build` exits 0. |
| R6  | Identify the shared module (e.g. `lib/vendor-theme.ts`). Confirm both `app/(admin)/layout.tsx` and `app/(storefront)/layout.tsx` import it. Then confirm neither layout holds its own mapping: `grep -c -- '--color-primary' "app/(admin)/layout.tsx" "app/(storefront)/layout.tsx"` returns `0` for both, while the shared module returns non-zero. |
| R7  | `grep -n "layout/Header" "app/(admin)/layout.tsx"` produces no output (exit 1). |
| R8  | Fetch `/staff/orders` three times — with the `demo-admin`, `demo-staff` and `demo-customer` cookies. Admin body contains hrefs `/staff/loyalty` and `/staff/discounts`; staff body contains neither but does contain `/staff/orders`; customer body contains none of the three. |
| R9  | `grep -n "requireVendorRole" "app/(admin)/staff/page.tsx" "app/(admin)/staff/orders/page.tsx" "app/(admin)/staff/orders/[orderNumber]/page.tsx" "app/(admin)/staff/loyalty/page.tsx" "app/(admin)/staff/discounts/page.tsx"` shows a call in each; the three `/staff`+orders pages pass `"STAFF", "ADMIN"` and the loyalty/discounts pages pass `"ADMIN"` alone. |
| R10 | `GET /staff/loyalty` with the `demo-staff` cookie returns 200 whose body contains the existing refusal heading ("Store admins only") and does **not** contain the config form's `<form` markup. |
| R11 | `GET /staff` with the `demo-admin` cookie: body contains hrefs `/staff/orders`, `/staff/loyalty`, `/staff/discounts`. With `demo-staff`: contains `/staff/orders`, and not the other two. |
| R12 | Read the count rendered on `/staff`. Independently, in a throwaway Prisma script, run `prisma.order.count({ where: { vendorId: <aheed>, status: { in: ["CONFIRMED","OUT_FOR_DELIVERY"] } } })`. The two numbers are equal. |
| R13 | `GET /staff` with **no** cookie returns a redirect to `/login`. `GET /staff` with the `demo-customer@example.com` cookie returns 200 containing a refusal message and **not** the `/staff/orders` link. |
| R14 | `GET /staff/orders` (admin cookie, no query string). Look up every rendered order number in the DB: each has status `CONFIRMED` or `OUT_FOR_DELIVERY`. Confirm the `DELIVERED` and `CANCELLED` fixtures are absent. |
| R15 | For each of `PENDING_PAYMENT`, `CONFIRMED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`: `GET /staff/orders?status=<S>`; every rendered order number has exactly status `<S>` in the DB. Report all five results, not a summary. |
| R16 | `GET /staff/orders?status=all` renders the `DELIVERED` fixture's order number — a status not in `STAFF_QUEUE_STATUSES` — proving it is genuinely wider than the default. |
| R17 | `GET /staff/orders?status=BANANA` returns 200, and its rendered order-number set is **identical** to the set from `GET /staff/orders` with no query string (R14). |
| R18 | Choose a term narrow enough that fewer than one page (20) of orders match, so the whole result set is on the page under test. Run two cases: (a) the last 4 characters of the `DELIVERED` fixture's order number; (b) a substring of `demo-customer@example.com` typed in **mixed case** (e.g. `DEMO-Customer`) to prove case-insensitivity. For each, `GET /staff/orders?status=all&q=<term>` and confirm the rendered set equals the DB's set of this vendor's orders where `orderNumber`, `guestEmail` or `user.email` contains the term case-insensitively. |
| R19 | `GET /staff/orders?status=DELIVERED&q=<email-substring from R18b>` — every rendered order is both `DELIVERED` and matching. Then confirm an order that matches the term but has a different status (find one from R18b's wider result) is **absent** from this response. |
| R20 | Use `?status=all` with no `q` if Aheed has more than 20 orders; otherwise create fixture orders until it does. **Do not lower the page size** — that tests modified code. Read the "older orders" link's `href`: it contains `status=all` and `cursor=`. Repeat with a `q` that matches more than 20 orders (create fixtures if needed) and confirm the href carries `q=` too. Follow each link and confirm the second page's orders still satisfy the same filter. |
| R21 | Locate the pure parser (e.g. `lib/staff-orders-query.ts`); confirm it imports nothing from `@/lib/db`, `@/lib/repositories/*` or `@prisma/client`. `npm test` passes, and the new test file exercises it — including R17's unrecognised-status fallback, `status=all`, and an empty/whitespace-only `q`. |
| R22 | Sign in as `demo-admin` **separately on each host** (host-scoped cookies — see the preamble). Fetch `/staff/orders?status=all` on SriMart's staging host and on Aheed's. The two rendered order-number sets are disjoint, and each matches that vendor's orders in the DB. Platform `ADMIN` transcends vendor membership, so this is the strongest viewer and therefore the hardest case for isolation. |
| R23 | `GET /staff/orders/{orderNumber}` (admin cookie) for a known order returns 200; the body contains each line-item product name, the recipient name, the postcode, the buyer email, and the four money values rendered as `formatPrice` produces them. Compare each against the DB row. |
| R24 | `GET /staff/orders/{orderNumber}` for the canary-note fixture order: the body contains `P6A-CANARY-7Q4X`. Separately, for the order advanced by `demo-staff`, the body contains that staff account's **name** next to the transition entry. |
| R25 | Read `lib/order-status.ts`: `buildTimeline` and `StatusEventInput` are still exported, and `StatusEventInput` declares only `status` and `createdAt` — no `note`. Confirm a separate exported staff builder exists with its own entry type. |
| R26 | `git diff origin/staging -- tests/order-status.test.ts` shows added lines only — no deletions, no modified assertions. `npm test` exits 0. |
| R27 | Sign in as `demo-customer@example.com` and `GET /account/orders/{canary-order-number}`. The response body does **not** contain `P6A-CANARY-7Q4X`, while R24 proved the staff page does. Verify against the rendered HTML — do **not** grep the source for the word "note", which matches the comment explaining the exclusion (the P4a/P5b grep trap). |
| R28 | Read the repository method backing the detail page: its `where` contains `vendorId` and no `userId`. Then prove it behaviourally — as `demo-admin`, `GET /staff/orders/{n}` returns 200 and renders the order for (a) the **guest** order fixture (`userId` null) and (b) an order owned by `demo-customer`. |
| R29 | Take an order number belonging to **SriMart**. As `demo-admin` on **Aheed's** host, `GET /staff/orders/{srimart-number}`: the response is a not-found state (404, or 200 rendering the not-found message), and the body contains none of that order's item names, recipient name or buyer email. |
| R30 | For a `CONFIRMED` order the detail page body contains a submit control labelled for `OUT_FOR_DELIVERY`; for the `DELIVERED` fixture it contains no advance control. Confirm it drives the existing action: parse each `<input>` in the form whole (`$ACTION_REF_1` renders with **no** `value` attribute — a parser requiring one drops it and the POST fails as a bare 500), extract the action id, and confirm `.next/server/server-reference-manifest.json` maps that id to `features/orders/advance-status.ts`. |
| R31 | `grep -n "OrderItemsCard\|OrderAddressCard" "app/(admin)/staff/orders/[orderNumber]/page.tsx"` shows both imported from `@/components/orders/`. Confirm no new component duplicating either exists under `components/`. |
| R32 | `git diff --stat origin/staging -- prisma/` produces no output, and `ls prisma/migrations` shows no directory absent from `origin/staging`. |
| R33 | `git diff origin/staging -- specs/architecture.md` shows the ADR-004 slice 3b passage now naming both layouts, and the front-matter `version` increased. `npm run kms:validate` exits 0. |
| R34 | `grep -n "(admin)" docs/repo-structure.md` shows `(admin)/staff/` and no longer shows `(admin)/admin/`; the listed pages match what exists on disk. Front-matter `version` increased (was `1.1.0`). `npm run kms:validate` exits 0. |
| R35 | `git diff origin/staging -- CHANGELOG.md` is non-empty and the new entry sits under `[Unreleased]`. |
| R36 | `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run build` each exit 0. On a Windows checkout treat a `format:check` failure as suspect until confirmed against the committed blob (`git show HEAD:<file>`) — `core.autocrlf` makes Prettier flag files that are clean on the Linux CI runner. **CI's `gates` job is the authority, not local output.** |
