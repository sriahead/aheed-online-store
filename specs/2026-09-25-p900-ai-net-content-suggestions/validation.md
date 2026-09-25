# #900 — AI-suggested net content with image provenance (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Before any live step

1. Diff `.env` and `.dev.vars` against `secrets/staging.vars` and `secrets/production.vars`.
   `DATABASE_URL` in `.env` and `.dev.vars` must name host `ep-dry-morning-zab7dx08` (dev).
   **Stop if either names staging (`ep-empty-scene`) or production (`ep-young-glitter`).**
2. Every `scripts/suggest-net-content.ts` run in this file uses `--env-file .dev.vars`. None uses a
   `secrets/*.vars` file.
3. Browser and HTTP checks run under `npm run preview`, never `npm run dev`, which cannot load the
   WASM Prisma engine. Kill the whole `node`/`workerd` chain after stopping preview.
4. Staff accounts on dev are `demo-staff@example.com` (STAFF), `demo-admin@example.com` (ADMIN) and
   `demo-customer@example.com` (CUSTOMER). See `docs/developer-portal/env-setup.md`.
5. Live AI calls cost neurons from the account's shared 10,000-a-day free allowance. Every run
   below uses `--limit 5` or less.

## Testing areas for this slice

1. **Unit:** the reply validator (R11), the label check (R12), and the script's flag parsing and
   budget (R13, R16).
2. **Integration:** the migration (R3), provenance writes (R4–R8), and the script against dev
   (R14, R15, R28, R29).
3. **System / E2E:** the staff queue under preview (R17–R22, R30, R31).
4. **Security:** role gating and vendor scoping (R8, R18, R19, R21, R31).

## Validation steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | Read `prisma/schema.prisma`. The enum has exactly the six members, and `ProductImage.source` is `ProductImageSource @default(UNKNOWN)` without `?`. |
| R2  | Unit | Read `prisma/schema.prisma`. The three enums have exactly the listed members. `NetContentSuggestion` has every field listed, with the stated optionality and relations, and both `@@index` lines. Run `grep -n "Json" prisma/schema.prisma` and confirm no match falls inside `NetContentSuggestion`. |
| R3  | Integration | `git diff --name-only origin/staging...HEAD -- prisma/migrations` lists files under exactly one new directory. `grep -niw "DROP" <that dir>/migration.sql` prints nothing, and so does `grep -niw "UPDATE" <that dir>/migration.sql`. `npx prisma migrate status` (reads `.env`, dev) reports the schema up to date. Confirm the three trigram indexes still exist: `npx tsx scripts/verify-unit-price-sort.ts` prints them. |
| R4  | Integration | Read both functions in `lib/repositories/products.ts`. `source: "STAFF_UPLOAD"` appears in `addProductImage`'s create, and in both the `update` and `create` branches of `setPrimaryProductImage`. R29 proves it live. |
| R5  | Integration | `npm run typecheck` exits 0. `grep -rn "saveGeneratedProductImage(" app scripts lib` lists four call sites, and each passes a `source` argument (read them). In `lib/product-image-pipeline.ts`, the Open Food Facts branch yields `"OPEN_FOOD_FACTS"` and the generation branch `"AI_GENERATED"`. `tests/product-image-pipeline.test.ts` asserts both. |
| R6  | Unit | `grep -n "PLACEHOLDER" prisma/seed.ts` shows it at both nested `images` creates and in the `productImage.createMany` data. |
| R7  | Unit | Search the write surfaces with `grep -rn "productImage.update" lib features app scripts` (this also matches `updateMany`) and `grep -rn "productImage.upsert" lib features app scripts`. Open every hit whose `data` includes `source`. The only ones are `setPrimaryProductImage`'s replace branch and the R8 repository function. |
| R8  | Integration | A unit or integration test covers all four transitions: `UNKNOWN` to `STAFF_CONFIRMED_PHOTO` succeeds; the reverse succeeds; `AI_GENERATED` refuses with no write; another vendor's image refuses with no write. Under preview as `demo-staff`, open a dev product with an `UNKNOWN` image. The source label is visible. Click confirm, and the DB row reads `STAFF_CONFIRMED_PHOTO`. Click again, and it reads `UNKNOWN`. |
| R9  | Unit | Read `lib/net-content-suggester.ts` for the three exports and `lib/config.ts` for the optional key. A unit test proves the resolution order (flag, then env, then default). `grep -rn "ai/run" lib features app scripts` finds the net-content request only in `lib/net-content-suggester.ts`. |
| R10 | Unit | Unit tests with a stubbed `fetch` cover each case. No credentials returns not configured, with no fetch made. A non-OK status, a thrown fetch and an aborted (timed-out) fetch each return a transport error without throwing. Read the source: the abort deadline is 60 seconds. With a photo, the request body carries image data; without one, it carries none. |
| R11 | Unit | `npx vitest run tests/net-content-suggester.test.ts`. There is one passing case per rule, and a failing case for each of: fractional amount, unknown unit, confidence 101, evidence absent from the name, `PHOTO` without a photo, malformed JSON, and an explicit null answer. EACH cases: `6 EACH` with evidence `Salted Crisps 6 pack` passes. `1 EACH` with evidence `Fast Phone Charger` fails. `6 EACH` with evidence `16 pack` fails. Read the prompt builder: it instructs a null answer when net content does not apply, and forbids `EACH` for that case. |
| R12 | Unit | `npx vitest run tests/net-content-label-check.test.ts`. Every row of R12's table is asserted with its exact expected result. |
| R13 | Unit | `npx tsx scripts/suggest-net-content.ts` with no flags, then with `--limit 0` and `--limit 101`: each exits non-zero before printing a host. Read the script: it has no `product.` or `productImage.` create/update/delete/upsert call. R28 proves it live. |
| R14 | Unit | Run the unit tests for the two pure functions. **Filter:** the built filter excludes inactive products, products with net content, and products with a `PENDING` row. A product with only a `REJECTED` row is excluded without `includeAttempted` and allowed with it. **Photo:** given images of mixed sources, it returns the lowest-`sortOrder` `STAFF_UPLOAD`/`STAFF_CONFIRMED_PHOTO` image, and returns none when only `UNKNOWN`, `AI_GENERATED`, `OPEN_FOOD_FACTS` or `PLACEHOLDER` images exist. R28's second run proves the filter live. |
| R15 | Integration | Unit tests with a stubbed suggester cover three things: not configured exits non-zero with no row written; a transport error writes no row and increments the failed count; 3 consecutive transport errors stop the run. Then, after R28's run, query dev's `NetContentSuggestion` rows from that run. Each `PENDING` row has all six value fields non-null. Each `NO_ANSWER` row has all six null. `model`, `latencyMs` and `createdAt` are set on every row. |
| R16 | Unit | A unit test covers the budget stop: with stubbed usage, the run stops starting calls once the estimate reaches the budget. `npx tsx scripts/suggest-net-content.ts --env-file .dev.vars --model @cf/unknown/model --limit 1` exits non-zero and makes no AI call. R28's run output shows all six summary figures. |
| R17 | Unit | `npx vitest run tests/panel-refusal-coverage.test.ts` passes. Read the page: `requireVendorRole("STAFF", "ADMIN")`, `redirect("/login")` on 401, and `PanelRefusal` otherwise. |
| R18 | E2E | Under preview as `demo-staff`, after R28's run, `/staff/net-content` shows each `PENDING` row with every listed field, and the name links to `/staff/products/<id>`. Vendor scoping: in a unit or integration test, SriMart's rows are absent from Aheed's list. |
| R19 | E2E | Covered live by R30's Accept. Refusals come from a test or a live check. Accepting an already-accepted suggestion returns an error. Accepting where the product was given net content first (set it on the product page) returns an error and leaves the suggestion `PENDING`. |
| R20 | E2E | Covered live by R30's Edit. An automated test proves two things: amount `0` or `1.5` is refused, and values identical to the suggestion produce `ACCEPTED`. |
| R21 | E2E | Covered live by R30's Reject. An automated test proves a second Reject of the same row refuses. |
| R22 | E2E | After R30, the summary on `/staff/net-content` shows one each of `ACCEPTED`, `EDITED` and `REJECTED`, plus the run's `PENDING`/`NO_ANSWER` counts. It shows acceptance rate `1 / 3` (about 33%), the model id `@cf/google/gemma-4-26b-a4b-it`, and non-zero token totals when the model reported usage. Recompute each figure with a direct DB query and confirm they match. |
| R23 | Unit | `npx vitest run tests/staff-nav-parity.test.ts tests/operator-doc-coverage.test.ts tests/panel-refusal-coverage.test.ts` passes. Read `PanelNav.tsx`: the link is in both tier branches. |
| R24 | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` passes. Read each `"use server"` file touched: every export is an `async function`, with no `const` export. |
| R25 | Unit | Read `specs/architecture.md`'s AI bullet. It carries the new paragraph with all three points. |
| R26 | Unit | Read `docs/developer-portal/env-setup.md`. It names `NET_CONTENT_AI_MODEL`, its default and the run command, including `--limit` and `--neuron-budget`. |
| R27 | Integration | Read `build-notes.md`. It records the image request shape, the WebP result, and the date of the real call. If either failed, Build stopped: no staff UI commits exist after that note. |
| R28 | Integration | Count dev products with non-null `netContentAmount` (a Prisma count via `npx tsx -e`, or any read-only query). Run `npx tsx scripts/suggest-net-content.ts --env-file .dev.vars --vendor aheed-food-centre --limit 5`. The printed host is `ep-dry-morning-zab7dx08`. The number of new rows equals the printed `PENDING` plus `NO_ANSWER` counts. Recount: it is identical. Run the same command again: none of the first run's product ids appear in the new rows. |
| R29 | E2E | Under preview as `demo-staff`, on a dev Aheed product with null net content, upload a real front-of-pack photo whose printed net content is legible. For example, download an Open Food Facts front image by hand and note the printed value. The new `ProductImage` row reads `source = STAFF_UPLOAD`. Run `npx tsx scripts/suggest-net-content.ts --env-file .dev.vars --product <id> --include-attempted --limit 1`. The new row's `productImageId` equals that image's id. Record in the validation notes whether the suggestion matched the printed value. That is evidence, not a pass condition. |
| R30 | E2E | Under preview as `demo-staff` on `/staff/net-content`, take three steps. (1) Accept one row, then query the product: its net content equals the suggestion and `unitPricePencePerBaseUnit` is non-null. Its storefront page shows a derived unit price in the form `£x.xx / kg`, `/ litre` or `/ each`. (2) Edit another with different values: the product holds the staff values, and the row reads `EDITED`. (3) Reject a third: the row reads `REJECTED`, and the product's `netContentAmount` is still null. |
| R31 | Security | Under preview, `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:<port>/staff/net-content` with no cookie redirects to `/login`. Signed in as `demo-customer`, the page renders the `PanelRefusal` text, not the queue. |
| R32 | Unit | `npm run kms:validate` exits 0 with 0 failing. `npm run kms:build-index`, then `grep -n "p900-ai-net-content-suggestions-plan" ARTIFACT_INDEX.md` matches. Run `npm run kms:assemble:internal`, then `cd kms/site-internal` and `npx next build --webpack`. Read its real exit status, not a piped one: 0. |
| R33 | Gate 4 | `git diff origin/staging...HEAD -- CHANGELOG.md` shows an entry under `## [Unreleased]` citing `#900`. |
| R34 | Gate 3 | `npm run lint`, `npm run typecheck` and `npm run format:check` each exit 0. Then run `npx vitest run` **alone**, not beside or straight after a build. It exits 0, and its summary shows every test file executed. CI on the PR is ground truth. |
