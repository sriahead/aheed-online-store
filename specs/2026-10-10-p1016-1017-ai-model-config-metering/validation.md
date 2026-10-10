# Configurable Workers AI models, a dated degradation signal, and per-vendor AI metering (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**: isolated logic (rates, reply/usage extraction, day boundary, meter decisions, call-site wiring with stubs).
2. **Integration Testing**: the repository against the real dev database; the migration.
3. **System / End-to-End Testing**: R35–R37 under `npm run preview` against the dev database with real Workers AI credentials.
4. **Regression & Acceptance Testing**: the full suite, plus R15's "degradation is invisible to the shopper" comparison.
5. **Performance & Resilience Testing**: the fail-closed meter read (R24) and the never-throwing ledger/ErrorEvent writes (R14, R25).
6. **Security & Accessibility Testing**: no personal data in the ledger (R16); the budget is read from the session's vendor only (R22, R31).

## Before you start

- **Use `npm run preview`, never `npm run dev`**, for R35–R37. `next dev` cannot load the WASM
  Prisma engine (`CLAUDE.md`).
- **Diff `.env` and `.dev.vars` against `secrets/staging.vars` and `secrets/production.vars` first**
  (`CLAUDE.md`, "Config & secrets"). R35–R37 must run against the **dev** database, never staging
  or production. `scripts/ai-usage.ts` prints the database host before it reads anything; confirm
  that host is dev's.
- R35–R37 spend real Workers AI neurons. They spend a few calls' worth, not a batch. Do not run
  the image backfill as part of validation.
- SriMart is reached locally with `-H "Host: srimart.localhost:8787"` against
  `http://127.0.0.1:8787`. A cookie jar does not work for that host
  (`docs/developer-portal/local-dev-playbook.md`), but `/shop-your-list` needs no sign-in.
- Signed-in staff actions are driven with curl over the Server Actions protocol, as in previous
  slices (`specs/sdd-workflow.md`, Validate section). A browser is not required.
- **Run `npx vitest run` alone**, never beside or straight after a build. Check that its summary
  counts every test file (`CLAUDE.md`, forks-pool trap).

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | Open `lib/workers-ai.ts` and confirm the six exports. `grep -n "from \"@/lib/db\"\|next/headers\|@/lib/tenant" lib/workers-ai.ts` prints nothing. |
| R2  | Unit | Read `WORKERS_AI_TEXT_RATES` and `WORKERS_AI_IMAGE_NEURONS` in `lib/workers-ai.ts`. The three text ids each have numeric `input`/`output`, flux has a positive number, and each table has a dated pricing-page comment. The flux comment shows its tile/step arithmetic. |
| R3  | Unit | `npx vitest run tests/workers-ai.test.ts` passes, and the file contains `toBe` assertions linking `NET_CONTENT_MODEL_RATES` to `WORKERS_AI_TEXT_RATES` and `NET_CONTENT_MODEL_REQUEST_OPTIONS` to `WORKERS_AI_MODEL_REQUEST_OPTIONS`. |
| R4  | Unit | `tests/workers-ai.test.ts` has a case for each of the four reply shapes and passes. `grep -n "function extractReplyText" lib/list-normalisation.ts` prints nothing. |
| R5  | Unit | `tests/workers-ai.test.ts` has one case per branch (a)–(d), asserting the value and `source`. None of them expects `0` or `null`. |
| R6  | Unit | Read `aiSchema`/`getAiEnv()` in `lib/config.ts`. Both keys are optional non-empty strings, read with the same `\|\| undefined` pattern as `NET_CONTENT_AI_MODEL`. |
| R7  | Unit | `grep -n "NORMALISATION_MODEL =" lib/list-normalisation.ts` shows the llama-3.1-8b literal. `grep -n "DEFAULT_SYNONYM_MODEL\|^const MODEL" lib/search-synonym-proposals.ts` shows the exported default and no `const MODEL`. `tests/list-normalisation.test.ts`'s existing `NORMALISATION_MODEL` assertion still passes. |
| R8  | Unit | The tests for `normaliseList` and `proposeSynonyms` assert the fetched URL with the key set and unset, four cases in total, and pass. |
| R9  | Unit | The same test files assert that the request body for gemma-4 contains `chat_template_kwargs.enable_thinking === false` and that the body for llama-3.1-8b has no `chat_template_kwargs`, for both functions, and pass. |
| R10 | Unit | A `proposeSynonyms` test with `result: { response: null, choices: [{ message: { content: "[…two pairs…]" } }] }` asserts two proposals and passes. |
| R11 | Unit | The `normaliseList` tests produce all seven reasons, assert `status` is present only for `http`, and assert no case throws. Each reason's trigger matches its definition in R11. |
| R12 | Unit | `tests/match-list-ai-metering.test.ts`, with `recordHandledErrorEvent` mocked, asserts exactly one call per reason (`http` with status 400, `unreadable`, `unparseable`) with the exact `path`/`method`/`routerKind`/`routeType`/`stack`/`digest` values, and a `message` containing the reason and model id (plus `400` for `http`). |
| R13 | Unit | The same tests assert zero `recordHandledErrorEvent` calls for `timeout`, `network`, `not-configured`, `over-input-cap`, rate-limited and over-budget. |
| R14 | Unit | One test makes `recordHandledErrorEvent` reject on an `http` degradation and asserts `matchList` resolves with matched lines. |
| R15 | Unit | One test runs `matchList` on the same list with AI not configured and with an `http` and a `timeout` degradation, and asserts that the three `lines` results are deep-equal. |
| R16 | Integration | Read `prisma/schema.prisma`: both enums carry exactly the listed values, and `AiUsageEvent` has the listed fields, the relation with `onDelete: Cascade` and the index. `grep -n "model AiUsageEvent" -A16 prisma/schema.prisma` shows no `User`, `Json`, `Float` or `Decimal`. |
| R17 | Integration | `grep -n "aiDailyNeuronBudget" prisma/schema.prisma` shows `Int @default(3000)` inside `model VendorConfig`. |
| R18 | Integration | `git diff --name-only origin/staging -- prisma/migrations` lists exactly one new `migration.sql`. Read it: both `CREATE TYPE`, `CREATE TABLE "AiUsageEvent"`, the index, the FK and the `ADD COLUMN … DEFAULT 3000` are present. `grep -in "drop" <that file>` prints nothing. `npx prisma migrate status` (dev `DIRECT_URL`) reports the database up to date. |
| R19 | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` passes. `git diff origin/staging -- tests/repository-purity.test.ts tests/repository-client-injection.test.ts` shows no allowlist addition. Read the three signatures `(prisma, vendorId, …)`. |
| R20 | Unit | The `ai-usage` repository tests cover the missing-`VendorConfig` default and the empty-sum `0`, and pass. |
| R21 | Unit | The repository tests assert `milliNeurons` for a fractional input (for example `4.0001` neurons stored as `4001`) and that the sweep runs when `Math.random` is stubbed below 0.01 and not above it. |
| R22 | Unit | Read `lib/ai-meter.ts` and `lib/ai-meter-service.ts`: the exports are present, and `getCurrentAiMeter` and `getVendorAiMeter` call `getPrisma()` (and `getCurrentVendorId()` for the former) inside the function body. `grep -n "^const .*= createAiMeter\|^let \|^const .*getPrisma()" lib/ai-meter.ts lib/ai-meter-service.ts` prints nothing. |
| R23 | Unit | `tests/ai-meter.test.ts` asserts both `startOfUtcDay` instants and passes. |
| R24 | Unit | `tests/ai-meter.test.ts` covers under budget (`allowed: true`), exactly at budget (`false`), budget `0` (`false`) and a rejected sum read (`false`, no throw), and passes. |
| R25 | Unit | `tests/ai-meter.test.ts` asserts the written row's vendor, feature, model and `milliNeurons` for `record` and `recordImage`, the highest-value fallback for an unlisted image model, and that a rejected write resolves. |
| R26 | Unit | `tests/ai-meter.test.ts` asserts the exact R26 string for `(3012.4, 3000)`. |
| R27 | Unit | The `match-list` tests assert the order: input cap, configured, meter `check`, rate limiter, `normaliseList`. When refused, they assert that `normaliseList` and the rate limiter are not called and that the logged skip reason is `over-budget`. They also assert `record` is called once after a usage-carrying result. |
| R28 | Unit | The `search-synonyms-service` tests cover the refused path (exact R26 text, `proposeSynonyms` not called) and the allowed path (`record` called once), and pass. |
| R29 | Unit | The `net-content-run` tests assert outcome `vendor-budget-reached` with no further suggester call after a refusal, and one `record` per usage-carrying result. The `net-content-review-form` tests assert `describeStaffNetContentRun` returns the R26 text as `error`. `grep -n "aiMeter" lib/net-content-suggestions-service.ts scripts/suggest-net-content.ts` shows a meter passed in both. |
| R30 | Unit | The `product-image-pipeline` tests cover the three paths, asserting no `putObject` on the refused path. A backfill-route test with the pipeline mocked to `{ budgetRefused }` on the first product asserts: no further pipeline call, no `recordImageAttemptFailure` call, status 200, and `message` equal to the R26 text. `npm run typecheck` passing with `aiMeter` required proves every caller passes one. `grep -n "aiMeter\|PRODUCT_IMAGE" app/api/admin/jobs/backfill-images/route.ts app/api/admin/product-images/generate/route.ts scripts/fill-product-images.ts` shows a meter in all three. |
| R31 | Unit | The `campaign-images` route tests assert 429 with the R26 `error` and no `generateImage` call when refused, and one `recordImage` call after bytes, and pass. |
| R32 | Unit | Run `grep -rln "ai/run/" lib app features --include=*.ts --include=*.tsx`. The only files listed are the four named plus `app/(admin)/staff/runbook/docs.ts`. |
| R33 | System | `npx tsx scripts/ai-usage.ts --env-file .dev.vars --vendor aheed-food-centre` prints host, budget, today's neurons and a per-feature breakdown, and exits 0. The same without `--vendor` prints one line per vendor. `--vendor no-such-vendor` exits non-zero naming `no-such-vendor`. Read each exit status with `echo $?`, not through a pipe. |
| R34 | System | `--vendor aheed-food-centre --set-budget 2500` prints old and new values and exits 0. A re-read shows 2500. `--set-budget -1` and `--set-budget 1.5` each exit non-zero, and a re-read still shows 2500. Restore the original value afterwards with `--set-budget <original>`. |
| R35 | E2E | `npm run preview`. Record Aheed's figure with `scripts/ai-usage.ts`. Submit `/shop-your-list` once for Aheed (`curl` or a browser at `http://localhost:8787/shop-your-list`) with a list such as `2kg atta` / `dhania`. Re-run the script: today's `LIST_NORMALISATION` figure has risen, and the newest row (Prisma Studio, or a read-only `tsx` query) shows feature `LIST_NORMALISATION`, model `@cf/meta/llama-3.1-8b-instruct` and `milliNeurons > 0`. |
| R36 | E2E | Record Aheed's budget. `--set-budget 0`. Submit `/shop-your-list` for Aheed: the result page shows matched lines and the row count for Aheed is unchanged. As a signed-in Aheed admin, POST the "Suggest from recent searches" action on `/staff/search-synonyms`: the response contains the R26 text with `of 0 neurons`, and the `AiUsageEvent` and `SearchSynonym` counts for Aheed are unchanged. Submit `/shop-your-list` with `-H "Host: srimart.localhost:8787"`: SriMart's row count rises by one. Then `--set-budget <original>` and re-read it. |
| R37 | E2E | Stop preview and kill the whole `node`/`workerd` chain (`CLAUDE.md`). Add `LIST_NORMALISATION_AI_MODEL="@cf/meta/not-a-real-model"` to `.dev.vars` and restart `npm run preview`. Submit `/shop-your-list` for Aheed: matched lines render. As a platform admin, open `/staff/errors`: a new row's message contains `@cf/meta/not-a-real-model`. Remove the key from `.dev.vars`, restart preview, and confirm that a further submission adds no new `ErrorEvent`. |
| R38 | Unit | Read the bullet beginning "AI does not sit on a public request path" in `specs/architecture.md`. The three statements are within that bullet, not elsewhere in the file. |
| R39 | Unit | `grep -n "LIST_NORMALISATION_AI_MODEL\|SEARCH_SYNONYM_AI_MODEL\|NET_CONTENT_AI_MODEL" docs/developer-portal/env-setup.md` shows all three in the same section. Read the three relevant sections of `docs/staff-playbook/staff-tabs-guide.md` for the allowance and 00:00 UTC sentence. |
| R40 | Unit | `npm run kms:validate` exits 0. Then run `npm run kms:assemble:internal` and `npx next build --webpack` in `kms/site-internal`, and read each command's own exit status, not through `tail`. |
| R41 | Unit | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1016` and `#1017`. |
| R42 | Regression | Run `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run build`. Then run `npx vitest run` **alone**. All exit 0, and the vitest summary counts every test file. CI's `quality / quality` on the PR is the ground truth. |
