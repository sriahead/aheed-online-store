# Custom item notes and the AI allowance (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice touches the database (one migration), checkout (`placeOrder`), personal-data rights,
an email template that receives shopper-typed text, a cost control on every Workers AI call, and a
new staff page with a platform-admin-only write. Risk is concentrated in R12 (checkout), R17 (HTML
injection into email), R19 (erasure), R27 (the meter every AI feature passes through) and R35 (who
may raise a budget), so each has a unit test **and** a live or scripted check. Accessibility is
covered by labelled controls (R5, R8, R20) and the mobile layout check (R24); this repo has no axe
dependency.

## Setup for the live rows

1. `npm ci && npm run db:generate`.
2. **Confirm the database target before any Prisma CLI command** (CLAUDE.md, Config & secrets):
   run `printenv DIRECT_URL DATABASE_URL`; if either prints, prefix every Prisma command with
   `env -u DIRECT_URL -u DATABASE_URL`. Diff `.env` and `.dev.vars` against `secrets/staging.vars`
   and `secrets/production.vars`. Run `npx prisma migrate status` and confirm its datasource line
   names the **dev** endpoint (`ep-dry-morning-zab7dx08`), never staging or production.
3. Apply this branch's migration to dev. The auto-mode classifier blocks `prisma migrate deploy`
   even against dev, so hand the user `! env -u DIRECT_URL -u DATABASE_URL npx prisma migrate deploy`.
4. Kill leftover `node`/`workerd` processes, then `npm run preview` (never `npm run dev`).
5. SriMart requests carry `-H "Host: srimart.localhost:8787" -H "x-forwarded-proto: http"`
   (`docs/developer-portal/local-dev-playbook.md`).
6. Accounts needed: an Aheed store admin, an Aheed STAFF-only member, a customer, and a platform
   admin (a dev user with `User.role = 'ADMIN'`). If no dev user has `role = 'ADMIN'`, set one for the
   check and restore its original role afterwards; record both in `build-notes.md`.
7. Record the starting value of every flag and budget you change (category/product
   `allowsCustomNote`, Aheed's `aiDailyNeuronBudget`) and restore it at the end.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | Read the `prisma/schema.prisma` diff against `origin/staging`: exactly the four columns with the stated types and defaults in this half, no `Json`, and `CartItem` still has `@@unique([cartId, productId])`. `npm run db:generate` exits 0. |
| R2  | Unit | `git diff --name-only origin/staging -- prisma/migrations` lists exactly one new `migration.sql`. `grep -iE "DROP\|UPDATE \|INSERT" <that file>` prints nothing; every statement is `ALTER TABLE ... ADD COLUMN` for an R1 column. |
| R3  | Unit | Locate the acceptance function with `graft grep "allowsCustomNote"`; confirm the cart read, product page, add action, set-note action and `placeOrder` call it and none re-implements the OR. `npx vitest run` on its test file passes with the four outcome cases present. |
| R4  | Unit | `npx vitest run` on the normalisation test file passes and contains each of the five stated cases. |
| R5  | E2E | Preview, Aheed: tick one category at `/staff/categories/<id>`. `curl -s localhost:8787/products/<slug-in-that-category>` contains an `<input` with `maxlength="200"` and a `<label` whose `for` matches its `id`. Same curl for a product in an unticked category contains no such input. |
| R6  | Integration | Unit tests for the add path show: non-empty note replaces, empty note keeps the existing note, note for a non-accepting product stores `null` and the add still returns a success outcome. Live: add with note "first", then add again with an empty note, then with "second"; read `CartItem.customNote` after each step (a read-only `SELECT` on dev or the basket UI): `first`, `first`, `second`. |
| R7  | Unit | `graft grep "customNote"` shows no use in `components/product/ProductCard.tsx` or `components/product/QuickViewDrawer.tsx`; the category listing HTML (`curl -s localhost:8787/categories/<ticked-slug>`) contains no note input. |
| R8  | Integration | `head -1` of the new set-note module is `"use server"` and it exports only `async function`s. Its unit test shows a normalised save, a refusal for a non-accepting product, and a refusal for a product not in the caller's basket (no write in either refusal). Live: edit and clear a note in the drawer and on `/cart`; the stored value follows. |
| R9  | E2E | Covered live in R23: after unticking, the basket renders the note plus the "no longer takes notes … will not be sent" sentence. A component test renders a line with no note and no acceptance and finds no note element. |
| R10 | Unit | `git diff origin/staging -- components "app/(storefront)" \| grep -E '^\+' \| grep -iE 'aheed\|srimart\|curry\|goat'` prints nothing. `npx vitest run tests/vendor-neutral-copy.test.ts` passes. |
| R11 | Unit | `npx vitest run` on the merge tests passes with KEEP_SAVED, KEEP_NEW, COMBINE-guest-note and COMBINE-saved-note cases. |
| R12 | Unit + E2E | `npx vitest run tests/orders.test.ts` passes with the three stated cases. Live: covered by R21 (note copied) and R23 (dropped note is `null`, checkout succeeds). |
| R13 | Unit | Tests for `restoreCartFromOrder` and `lib/restore-lines.ts` pass and assert `customNote` is carried. |
| R14 | Unit | Read every Prisma call in the diff: no `createMany`/`updateMany`/nested-create on `getPrisma()`. `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` passes. |
| R15 | E2E | After the R21 order: `curl` (with session cookies) `/account/orders/<n>`, `/checkout/<n>` (with its viewer credential as the page requires) and `/staff/orders/<n>` each contain the note text under the line; a line without a note shows no note element. |
| R16 | E2E | `/staff/orders` HTML contains "Has item notes" in the row for the R21 order and not in a row for an order without notes. |
| R17 | Unit | The email unit test passes and asserts `&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;` is present and `<script>` is absent. Read `send-confirmation.ts`: the product name also passes through the helper. |
| R18 | Unit | Data-rights export tests pass and assert `customNote` on order items (signed-in and guest) and cart items (signed-in). |
| R19 | Unit | Erasure tests for `eraseVendorData` and `eraseGuestOrderData` pass and assert `customNote: null` on the anonymised orders' items, written inside the transaction. |
| R20 | Integration | `lib/catalogue-form.ts` tests pass for checked/absent. Live: tick and untick the box on a category and a product at `/staff/categories/<id>` and `/staff/products/<id>`; after each save and reload the checkbox reflects the stored value. |
| R21 | E2E | Preview, Aheed, signed in as the customer: run the full flow stated in R21 (ticked category and its sub-category show the input; unticked does not; note added on product page shows in drawer and `/cart`; edit and clear work; checkout with Stripe test mode; note on staff and shopper order detail). Record each URL and result in `build-notes.md`. |
| R22 | E2E | SriMart (Host header per setup step 5): `curl -s` three product pages from different categories; none contains the note input. With an item in the SriMart basket, `/cart` contains no note control. |
| R23 | E2E | Aheed: add a noted line, untick its category (and confirm the product's own box is unticked), reload `/cart`: the R9 sentence is shown. Place the order: it succeeds and a read-only `SELECT "customNote" FROM "OrderItem" WHERE "orderId" = …` on dev returns `NULL`. Re-tick afterwards if that was the starting state. |
| R24 | System | `npx tsx scripts/verify-mobile-layout.ts` (see its `--help` for host/path flags) against the R5 product page and `/cart` with a noted line reports no horizontal overflow at 375 px; output pasted into `build-notes.md`. |
| R25 | Unit | `npx vitest run` on the config test passes with the four stated inputs. |
| R26 | Unit | `graft grep "createAiMeter("`: every call passes a plan argument sourced from `getAiEnv()`. `npm run typecheck` exits 0. |
| R27 | Unit | `npx vitest run tests/ai-meter.test.ts` passes with: Free vendor-refused, Free platform-refused (with `usedNeurons` = platform total and `budgetNeurons` = 10000), Free allowed, Paid vendor-refused, Paid allowed with platform over 10,000 (and the platform sum not called), and DB-error fail-closed. |
| R28 | Unit | Read the new export's signature (no `vendorId`). `npx vitest run tests/repository-vendor-scoping.test.ts` passes and its allowlist entry for the export carries a justification string. |
| R29 | Unit | Unit test for `describeAiBudgetRefusal` asserts the vendor sentence is unchanged and the platform sentence contains "10,000" and "00:00 UTC"; neither contains a vendor name. |
| R30 | Unit | Read `specs/architecture.md`'s Workers AI paragraph: "unverified" no longer appears in it; both modes, `WORKERS_AI_PLAN`, the Free default and the ledger-only caveat are stated. `grep -n WORKERS_AI_PLAN docs/developer-portal/env-setup.md` prints at least one line. |
| R31 | E2E | Signed out: `curl -s -o /dev/null -w "%{redirect_url}" localhost:8787/staff/ai-usage` ends in `/login`. As the STAFF-only member: the HTML contains the `PanelRefusal` heading. |
| R32 | E2E | As the Aheed store admin: the page shows used and budget figures, a per-feature table with today and 7-day columns, the plan mode ("Free" with no `WORKERS_AI_PLAN` set) and the platform total "of 10,000". Restart preview with `WORKERS_AI_PLAN="paid"` in `.dev.vars` (remove it afterwards): the platform total line is absent. |
| R33 | Unit + E2E | The charge unit test passes for 0 over → 0 cents ("$0.00"); 1,000 over → `ceil(1000 × 11 / 10000)` = 2 cents ("$0.02"); 12,345 over → `ceil(12345 × 11 / 10000)` = 14 cents ("$0.14"). Live in Paid mode: the charge is visible to the platform admin and absent from the store admin's HTML. |
| R34 | E2E | Store admin's HTML has the budget as text and no `<form>` for it; platform admin's HTML has the form. |
| R35 | Unit | `head -1` of the action module is `"use server"`, exports only async functions; its unit tests cover the four stated cases and assert no write in the three refusals. |
| R36 | Unit | `npx vitest run tests/staff-nav-parity.test.ts tests/panel-refusal-coverage.test.ts tests/operator-doc-coverage.test.ts` passes. `grep -n "ai-usage" components/staff/PanelNav.tsx "app/(admin)/staff/page.tsx" docs/store-admin-guide/admin-tabs-guide.md` prints a line from each. |
| R37 | Unit | Read the platform-admin guide diff: budget-setting and `WORKERS_AI_PLAN` are described; it has no `## ` heading naming `/staff/ai-usage`. `tests/operator-doc-coverage.test.ts` passes (R36). |
| R38 | E2E | Run the four live checks stated in R38 and record results; restore Aheed's budget to its starting value. |
| R39 | Unit | Route test (extend `tests/ai-image-routes-budget.test.ts` or a new one) asserts the refusal response is 200 with `budgetRefused: true`, `message`, `processed`, `totalFound`, and that the "Backfill complete" and "No products need backfill" responses lack `budgetRefused`. |
| R40 | Unit | `npx vitest run tests/backfill-images-button.test.tsx` passes with a refusal case asserting `role="alert"` and the error styling, and the existing success case. |
| R41 | Integration | Run the spec-folder script against dev (`npx tsx specs/2026-10-19-p1135-custom-notes-ai-allowance/<script>.ts`): exits 0, prints platform-refused in Free and allowed in Paid, and afterwards a `SELECT count(*)` for its marker returns 0. Output in `build-notes.md`. |
| R42 | Unit | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1135`, `#1028`, `#1029`, `#1031`. `grep -n "1155" specs/roadmap.md` shows a change-log row. `npm run sdd:audit` no longer reports PR #1155 as pending carry-forward. |
| R43 | Unit | CI `gates` on the PR is green (ground truth). Locally: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` each exit 0, and `npx vitest run` run **alone** (not beside a build) passes. |
