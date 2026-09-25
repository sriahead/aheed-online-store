# P10 #613/#890/#889 — Delivery areas: district ranges, per-area pricing, refusal counts (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Risk profile: this slice changes **what shoppers are charged** and **who may check out**, adds a
migration, and adds `createMany`/`updateMany` writes that crash on the wrong Prisma client — a
failure only a real adapter reveals (`CLAUDE.md`, `#382`). So: pure logic (parser, matcher,
resolver) is unit-tested; the writes are proven against real Neon by a committed script; every
shopper-facing money surface is proven under `npm run preview` — **never `npm run dev`**, which
cannot load the WASM engine. Validate against **dev only**.

## Setup (for R16 and R34–R40)

1. Confirm `.env`/`.dev.vars` point at the **dev** Neon endpoint; diff them against
   `secrets/staging.vars` and `secrets/production.vars` (`CLAUDE.md`). Never run these rows against
   staging or production.
2. `npm run db:generate`; confirm the slice's migration is applied to dev (`npx prisma migrate status`).
3. Kill leftover `node`/`workerd`, then `npm run preview`.
4. Sign in as `demo-store-admin` (Aheed store admin) and, separately, `demo-customer` — browser, or
   curl per `docs/developer-portal/local-dev-playbook.md`.
5. **Record Aheed's delivery areas and any overrides from `/staff/delivery-areas`, and note the
   current `/staff/delivery-areas` turned-away table, before changing anything** — R40 restores to
   this.
6. Real postcodes: `MK9 2EA`, `MK17 8NL`, `MK10 1AA`. Do not use `MK9 2AA` (returns
   `INVALID_POSTCODE`).

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `grep -n "export function parsePrefixListInput" lib/delivery-area-form.ts` prints one line; a test asserts a failure's `error.field === "prefix"`. |
| R2  | Unit | Tests: `"MK1,,MK2"` and `"MK1, MK2,"` → `["MK1","MK2"]`; `""`, `" "`, `" , "` → message exactly `Enter a postcode area.`. |
| R3  | Unit | Tests: `"mk, rg"` → `["MK","RG"]`; `"MK1, M[, MK2"` fails with message containing `M[`; `"MK1, MKXX"` fails with message containing `MKXX`. |
| R4  | Unit | Tests: `"MK1-MK10"` → `MK1`…`MK10` in order; `"mk1 – mk3"` → `["MK1","MK2","MK3"]`; `"MK5-MK5"` → `["MK5"]`. |
| R5  | Unit | One failing test per entry, each asserting the message contains it: `MK1-RG5`, `MK10-MK1`, `EC1A-EC1C`, `MK1-10`, `MK1-MK100`. |
| R6  | Unit | Test: `"MK9, MK1-MK10, mk9"` → `["MK9","MK1","MK2","MK3","MK4","MK5","MK6","MK7","MK8","MK10"]`. |
| R7  | Unit | Tests: `"X0-X99"` succeeds with 100 values; `"X0-X99, Y1"` fails, message contains `100`. |
| R8  | Regression | `git diff origin/staging -- tests/delivery-area-form.test.ts` removes/alters no pre-existing `expect(`, `it(` or `it.each(` line (comments and new tests only); `npx vitest run tests/delivery-area-form.test.ts` passes. |
| R9  | Unit | `tests/delivery-areas-repository.test.ts` (stub client): `createMany` called once, `skipDuplicates: true`, every `data[i].vendorId === VENDOR` and carrying the passed overrides; stubbed `{count: 7}` for 10 prefixes → `{added: 7, alreadyListed: 3}`. `grep -n "createDeliveryAreasForVendor" lib/repositories/delivery-areas.ts` shows the first parameter typed `DbWs`. |
| R10 | Unit + E2E | Action unit test (mock `requireVendorRole` + repository factory): 1 value → `create`, not `createMany`; 2 values → `createMany`, not `create`; unauthorised → no repository call. E2E: add `MK1` twice → second shows `That postcode area is already on the delivery list.`; remove `MK1`. |
| R11 | Unit | Tests assert the exact strings for (N=10,M=0), (N=7,M=3), (N=0,M=10), (N=1,M=1) → `Added 1 delivery area; 1 already listed (their charges were not changed).`; single-row success → `message: null`. |
| R12 | Regression | `grep -nE "^export " features/admin/delivery-areas.ts` — every line begins `export async function`. R35's live submissions are the runtime proof. |
| R13 | Review | `grep -n 'maxLength={200}\|Postcode areas or districts\|MK, MK9 or MK1-MK10' components/staff/DeliveryAreaManager.tsx` → 3 matches; help text read and confirmed. |
| R14 | UI | No `sr-only` wraps the add form's feedback (read the component). In preview at ≥1024px width, submitting `MK1-RG5` shows the error visibly. |
| R15 | Review | `sed -n '/^model VendorDeliveryArea/,/^}/p' prisma/schema.prisma` shows the three `Int?` columns and a `prefix` comment naming `MK` and `MK9`. |
| R16 | Regression | `git diff origin/staging --name-only -- prisma/migrations/` lists exactly one new directory; read its `migration.sql` and confirm only the statement kinds R16 allows (`grep -niE "DROP\|ALTER COLUMN\|trgm" <file>` prints nothing). `npx prisma migrate status` (dev) reports it applied. |
| R17 | Unit | Tests on `matchDeliveryArea`: areas `[MK, MK9]` with `MK9 2EA` → the `MK9` row; with `MK10 1AA` → the `MK` row; `[MK1…MK10]` with `MK17 8NL` → `null`, with `MK11 1AA` → `null`. `npx vitest run tests/is-deliverable.test.ts` passes; `git diff origin/staging -- tests/is-deliverable.test.ts` removes no pre-existing assertion. |
| R18 | Unit + Review | `grep -nE "^import" lib/delivery-pricing.ts` shows no `@prisma`, `next/`, or `-service` import. Covered behaviourally by R19. |
| R19 | Unit | `tests/delivery-pricing.test.ts` asserts the five cases in R19 exactly. |
| R20 | Unit | A test in `tests/order-totals*.test.ts` (or the file testing `computeTotals`) asserts threshold `0`, subtotal 10000 → `deliveryFeePence` equals the fee. |
| R21 | Unit/Review | `grep -n "deliveryAreas" lib/repositories/vendor.ts` shows the field and `deliveryPrefixes` derived from it; a test or the R34 script confirms equality. |
| R22 | Review | For each of the five files, `grep -n "resolveDeliveryRules" <file>` matches, and `grep -nE "(profile\|vendor)\??\.(deliveryFeePence\|minimumOrderPence\|freeDeliveryThresholdPence)" <file>` prints nothing. |
| R23 | Unit + E2E | `place-order` unit test: mismatched `quotedDeliveryRules` → no `createOrder` call, cookie set to the address postcode, exact R23 message; matching values → proceeds; missing field → refused. E2E is R39. |
| R24 | Unit | Repository test: `updateMany` called with `where: { id, vendorId }`; `{count: 0}` → the "no longer exists" failure. Signature's first parameter typed `DbWs`. |
| R25 | Unit | Tests: blank → `null`; `"5.99"` → 599; `"-1"` and `"abc"` → field error naming the field and no repository call. |
| R26 | E2E | In preview, edit `MK10`'s row to fee £5.99, minimum £30.00, threshold £0.00 → the row shows those; clear the fee → the row shows `Store default` for fee. Action file: `updateDeliveryAreaCharges` calls `requireVendorRole("ADMIN")` before parsing (read it). |
| R27 | Regression | `grep -n "getPrismaWs\|createMany\|updateCharges" lib/delivery-areas-service.ts`; `npx vitest run tests/repository-transaction-safety.test.ts tests/repository-purity.test.ts tests/repository-client-injection.test.ts` passes; `git diff origin/staging --stat -- tests/repository-*.test.ts` is empty. |
| R28 | Review | `sed -n '/^model DeliveryRefusalCount/,/^}/p' prisma/schema.prisma` shows exactly the listed fields, the unique, and no user/session/postcode/cookie/IP column. |
| R29 | Unit | Repository tests: `upsert` called once with the four-key unique `where`, `create.count === 1`, `update.count.increment === 1`; `listRecentDeliveryRefusals` folds header/checkout rows into one object per district and sorts by total desc then district asc. |
| R30 | Unit | Tests: `OUTSIDE_DELIVERY_AREA` for `MK17 8NL` records district `MK17`; `INVALID_POSTCODE`, `UNVERIFIED`, `DELIVERABLE` record nothing; `day` is the vendor-timezone calendar day (test at a UTC instant that is the next day in a non-UK zone). |
| R31 | Unit + Review | Tests for both call sites assert the source. `grep -n "recordDeliveryRefusal\|delivery-refusal" app/api/address/lookup/route.ts` prints nothing. |
| R32 | Unit | Tests make the repository throw at both call sites; the return value (and for `setDeliveryPostcode`, the cookie set) matches the non-throwing case. |
| R33 | E2E | Preview: with no rows, the section shows `No out-of-area postcodes in the last 30 days.`; after R37 the table shows `MK17`. |
| R34 | Integration (real DB) | `npx tsx scripts/verify-delivery-areas.ts` against dev exits 0, printing each step. Then `/staff/delivery-areas` shows the Setup step 5 list unchanged. |
| R35 | E2E | As `demo-store-admin`: submit `MK1-MK10` → an R11 bulk message; list shows `MK1`…`MK10`. Resubmit → `All 10 already listed — nothing changed.`. |
| R36 | E2E | Remove every non-`MK1`…`MK10` row. `curl -s "http://localhost:8787/api/address/lookup?postcode=MK9%202EA"` → `"status":"DELIVERABLE"`, `"deliverable":true`; `…MK17%208NL` → `"status":"OUTSIDE_DELIVERY_AREA"`, `"deliverable":false`. `curl -s -b "delivery-postcode=MK9%202EA" http://localhost:8787/ \| grep -c "Delivery · MK9 2EA"` ≥ 1, and the `MK17 8NL` equivalent prints `0` (if the cookie format differs, use the header control in a browser). As `demo-customer` with a basket, a delivery checkout to `MK17 8NL` shows `Sorry — we don't deliver to MK17 8NL yet.`. |
| R37 | E2E | Enter `MK17 8NL` in the header postcode control once (plus R36's checkout attempt). `/staff/delivery-areas` turned-away table shows `MK17` with Header ≥ 1, Checkout ≥ 1. |
| R38 | E2E | Set areas to `MK` (no overrides) and `MK10` (£5.99 / £30.00 / £0.00). Cookie `MK10 1AA`: cart drawer and `/checkout` show £5.99 delivery and a £30.00 minimum. Cookie `MK9 2EA`: vendor defaults shown. Place a `MK10 1AA` order above £30 (test card); its `/checkout/<orderNumber>` page, and the `Order.deliveryFeePence` read by the R34-style query or the staff order page, show 599. |
| R39 | E2E | Cookie `MK9 2EA`; on `/checkout` change the address postcode to `MK10 1AA`; place → the R23 message, no new order in `/staff/orders`; reload → summary shows £5.99. Then clear the cookie (header "forget" or delete it) and place a `MK9 2EA` order → placed, no R23 message. |
| R40 | Data hygiene | Restore Aheed's areas and overrides to the Setup step 5 record (add before removing — the last-area guard). Delete Aheed's `DeliveryRefusalCount` rows created today in dev. Cancel/leave the test orders per the playbook. Record before/after in the evidence. |
| R41 | Review | `grep -n "RegExp" lib/delivery-area-form.ts lib/delivery.ts features/admin/delivery-areas.ts tests/delivery-area-form.test.ts` prints nothing; header comments read and confirmed. |
| R42 | Review | Read the intro in `app/(admin)/staff/delivery-areas/page.tsx`; it names areas, districts and per-area charges. |
| R43 | Review | `grep -c "Prefixes are whole postcode" docs/store-admin-guide/admin-tabs-guide.md` → `0`; read the section and tick each listed topic. |
| R44 | Review | `grep -n "#890" specs/decisions/ADR-006-store-locations.md` shows the dated note; `grep -n "DeliveryRefusalCount\|resolveDeliveryRules" specs/architecture.md` matches. |
| R45 | Regression | `grep -n "PR #887" specs/roadmap.md` shows a row with `3b85289`; `npm run sdd:audit` shows no `PR #887 … pending carry-forward` line. |
| R46 | Gate 4 | `git diff origin/staging -- CHANGELOG.md` shows an entry citing `#613`, `#890`, `#889`. |
| R47 | Gate 3 | Each exits 0: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run kms:validate`, `npm run kms:check-generated`. `npx vitest run` **alone** (not beside a build), summary line confirms every file ran. `npm run kms:assemble:internal`, then a Next build in `kms/site-internal`. PR CI green is ground truth. |
