# Configurable Workers AI models, a dated degradation signal, and per-vendor AI metering (requirements / acceptance criteria)

Slice 2 of the chatbot programme (`#1015`), closing **`#1016`** and **`#1017`**. The two text-model
ids hardcoded in `lib/list-normalisation.ts` and `lib/search-synonym-proposals.ts` become config
overrides on top of an unchanged default. When the `/shop-your-list` AI pre-pass fails because the
model stops answering, it now writes an `ErrorEvent`. Every Workers AI call, across all four call
sites, is recorded in a per-vendor neuron ledger (`AiUsageEvent`) and refused once the vendor's
`VendorConfig.aiDailyNeuronBudget` for the UTC day is spent. Read `plan.md` for the reasoning and
the owner decisions behind each item.

"Text call sites" means `normaliseList`, `proposeSynonyms` and the net-content suggester. "Image call
sites" means `runProductImagePipeline`'s AI fallback and `app/api/admin/campaign-images/generate/route.ts`.

## Shared Workers AI module

R1. `lib/workers-ai.ts` exists and exports `WORKERS_AI_TEXT_RATES`, `WORKERS_AI_IMAGE_NEURONS`,
    `WORKERS_AI_MODEL_REQUEST_OPTIONS`, `extractWorkersAiReplyText`, `extractWorkersAiUsage` and
    `neuronsForTextCall`. It imports nothing from `@/lib/db`, `next/headers` or `@/lib/tenant`.
R2. `WORKERS_AI_TEXT_RATES` has numeric `input` and `output` entries for
    `@cf/meta/llama-3.1-8b-instruct`, `@cf/google/gemma-4-26b-a4b-it` and
    `@cf/meta/llama-4-scout-17b-16e-instruct`. `WORKERS_AI_IMAGE_NEURONS` has a positive numeric
    entry for `@cf/black-forest-labs/flux-1-schnell`. A comment beside each table states the date
    its figures were read from Cloudflare's Workers AI pricing page. The flux comment states the
    tile/step arithmetic behind its constant. If the pricing page no longer lists
    `llama-3.1-8b-instruct` (it is delisted), the comment says so and names where its figure came
    from instead.
R3. `NET_CONTENT_MODEL_RATES` (`lib/net-content-run.ts`) is the same object as
    `WORKERS_AI_TEXT_RATES`, and `NET_CONTENT_MODEL_REQUEST_OPTIONS` (`lib/net-content-suggester.ts`)
    is the same object as `WORKERS_AI_MODEL_REQUEST_OPTIONS`. A unit test asserts both identities
    with `toBe`.
R4. `extractWorkersAiReplyText` returns:
    - a string `result.response` unchanged;
    - a non-null, non-string `result.response` as `JSON.stringify` of it;
    - otherwise a string `result.choices[0].message.content`;
    - otherwise `""`.
    A unit test covers all four cases. `lib/list-normalisation.ts` no longer defines its own
    `extractReplyText`.
R5. `neuronsForTextCall(model, usage)` returns `{ neurons, source }`:
    - (a) reported `usage.neurons` with source `REPORTED` when it is a number;
    - (b) otherwise `(inputTokens × rate.input + outputTokens × rate.output) / 1,000,000` with
      source `ESTIMATED`, when the model is in `WORKERS_AI_TEXT_RATES` and both token counts are
      numbers;
    - (c) otherwise, for an unlisted model with both token counts, the same formula using the
      highest `input` and highest `output` rate in the table, source `ESTIMATED`;
    - (d) otherwise an exported positive constant `UNMETERED_CALL_NEURONS`, source `ESTIMATED`.
    A unit test covers all four branches. No branch returns `0` or `null`.

## Configurable models (#1016)

R6. `lib/config.ts`'s `getAiEnv()` returns optional `LIST_NORMALISATION_AI_MODEL` and
    `SEARCH_SYNONYM_AI_MODEL` (non-empty string or `undefined`, an empty value read as `undefined`),
    in the same way it returns `NET_CONTENT_AI_MODEL`.
R7. `NORMALISATION_MODEL` in `lib/list-normalisation.ts` still equals
    `"@cf/meta/llama-3.1-8b-instruct"`. `lib/search-synonym-proposals.ts` exports
    `DEFAULT_SYNONYM_MODEL` equal to the same string and no longer declares a module-level `MODEL`
    constant.
R8. With `LIST_NORMALISATION_AI_MODEL` set, `normaliseList` POSTs to
    `…/ai/run/<that value>`. With it unset, it POSTs to `…/ai/run/@cf/meta/llama-3.1-8b-instruct`.
    The same holds for `proposeSynonyms` with `SEARCH_SYNONYM_AI_MODEL`. Unit tests assert the
    fetched URL in all four cases.
R9. When the resolved model is `@cf/google/gemma-4-26b-a4b-it`, the JSON body `normaliseList` and
    `proposeSynonyms` send contains `chat_template_kwargs: { enable_thinking: false }`. For
    `@cf/meta/llama-3.1-8b-instruct` the body contains no `chat_template_kwargs` key. Unit tests
    assert both bodies for both functions.
R10. `proposeSynonyms` parses proposals from a reply whose `result.response` is `null` and whose
     `result.choices[0].message.content` holds the JSON array. A unit test asserts that a
     choices-shaped reply carrying two valid pairs yields two proposals.

## Dated degradation signal (#1016)

R11. `normaliseList` never throws, and resolves to one of two shapes:
     - `{ kind: "ok", items, usage }`;
     - `{ kind: "degraded", reason, status?, usage? }`, where `reason` is one of `not-configured`,
       `over-input-cap`, `timeout`, `network`, `http`, `unreadable` or `unparseable`, and `status`
       is present exactly when `reason` is `http`.
     The reasons are defined as follows:
     - `http`: a non-OK response;
     - `unreadable`: a 2xx response whose body is not JSON;
     - `unparseable`: a 2xx JSON response from which `parseNormalisationResponse` yields zero items
       for a non-empty list (today's code silently treats that as "no enrichment");
     - `timeout`: the abort deadline;
     - `network`: any other rejected `fetch`.
     A unit test produces each of the seven reasons with a stubbed `fetch`.
R12. When `normaliseList` degrades with reason `http`, `unreadable` or `unparseable`,
     `features/cart/match-list.ts` writes exactly one `ErrorEvent`. That row has:
     - `path` `"/shop-your-list"`;
     - `method` `"POST"`;
     - `routerKind` `"App Router"`;
     - `routeType` `"action"`;
     - `stack` and `digest` both `null`;
     - a `message` that contains the reason, the resolved model id, and (for `http`) the status
       number.
     A unit test asserts this for each of the three reasons.
R13. For reasons `timeout`, `network`, `not-configured` and `over-input-cap`, and for the
     rate-limited and over-budget skips, `features/cart/match-list.ts` writes no `ErrorEvent`. A
     unit test asserts zero `recordErrorEvent` calls for each.
R14. If the `ErrorEvent` write itself rejects, the list submission still resolves with the
     deterministic match result. A unit test makes `recordErrorEvent` reject and asserts the
     action resolves without throwing.
R15. For every degradation reason, the matched lines `matchList` returns are identical to those it
     returns when AI is not configured for the same input. A unit test compares the two for at
     least the `http` and `timeout` reasons.

## Ledger and budget schema (#1017)

R16. `prisma/schema.prisma` defines:
     - enum `AiFeature` with exactly `LIST_NORMALISATION`, `SEARCH_SYNONYMS`, `NET_CONTENT`,
       `PRODUCT_IMAGE`, `CAMPAIGN_IMAGE`;
     - enum `AiNeuronSource` with exactly `REPORTED`, `ESTIMATED`;
     - model `AiUsageEvent` with `vendorId` (relation to `Vendor`, `onDelete: Cascade`),
       `feature AiFeature`, `model String`, `inputTokens Int?`, `outputTokens Int?`,
       `milliNeurons Int`, `neuronSource AiNeuronSource`, `createdAt DateTime @default(now())`,
       and `@@index([vendorId, createdAt])`.
     `AiUsageEvent` has no field referencing `User`, and none of its fields is `Json`, `Float` or
     `Decimal`.
R17. `VendorConfig` has `aiDailyNeuronBudget Int @default(3000)`.
R18. Exactly one new migration directory exists under `prisma/migrations/` for this slice. Its
     `migration.sql` contains `CREATE TYPE` for both enums, `CREATE TABLE "AiUsageEvent"`, the
     index, the foreign key, and an `ALTER TABLE "VendorConfig" ADD COLUMN "aiDailyNeuronBudget"`
     with default `3000`. It contains no `DROP` statement of any kind. `npx prisma migrate status`
     against the dev database reports it applied.
R19. `lib/repositories/ai-usage.ts` exports `recordAiUsage`, `sumVendorMilliNeuronsSince` and
     `getVendorAiDailyBudget`. Each takes the Prisma client as its first parameter and `vendorId`
     as its second, and the file reads no request context. `tests/repository-purity.test.ts` and
     `tests/repository-client-injection.test.ts` pass with this file present and with no
     allowlist entry added for it.
R20. `getVendorAiDailyBudget` returns the vendor's `aiDailyNeuronBudget`, or the exported
     `DEFAULT_AI_DAILY_NEURON_BUDGET` (`3000`) when the vendor has no `VendorConfig` row.
     `sumVendorMilliNeuronsSince` returns `0` when no rows match. Both rules are unit-tested.
R21. `recordAiUsage` stores `milliNeurons` as `Math.ceil(neurons × 1000)`. It also runs a
     `deleteMany` of rows older than 90 days with probability `0.01`. Both are unit-tested (the
     sweep with `Math.random` stubbed).

## Meter (#1017)

R22. `lib/ai-meter.ts` exports `createAiMeter(prisma, vendorId, feature)`, `startOfUtcDay`,
     `describeAiBudgetRefusal` and the `AiMeter` type. The meter has `check()`, `record(...)` and
     `recordImage(...)`. `lib/ai-meter-service.ts` exports `getCurrentAiMeter(feature)`, which
     builds a meter from `getPrisma()` and `getCurrentVendorId()` on each call, and
     `getVendorAiMeter(vendorId, feature)`, which builds one from `getPrisma()` for a vendor the
     caller already holds (a route's `auth.vendorId`). No module holds a meter or a Prisma client at
     module scope.
     *Amended at Build (2026-10-10):* `getVendorAiMeter` was added because ESLint's
     `no-restricted-imports` rule forbids `@/lib/db` in `app/` and `features/` (ADR-004 slice 2), so
     the three image routes cannot call `createAiMeter(getPrisma(), …)` themselves. For the same
     reason, R12's `ErrorEvent` is written through `recordHandledErrorEvent` in
     `lib/error-events-service.ts`, a thin facade over the same `recordErrorEvent(getPrisma(), …)`.
R23. `startOfUtcDay(new Date("2026-10-10T23:59:59.999+01:00"))` equals
     `2026-10-10T00:00:00.000Z`, and `startOfUtcDay(new Date("2026-10-11T00:30:00+01:00"))` equals
     `2026-10-10T00:00:00.000Z`. A unit test asserts both.
R24. `check()` resolves `{ allowed, usedNeurons, budgetNeurons }`:
     - `usedNeurons` is the vendor's summed `milliNeurons` since `startOfUtcDay(now)`, divided by
       1000;
     - `allowed` is `usedNeurons < budgetNeurons`;
     - a budget of `0` always gives `allowed: false`;
     - a rejected database read resolves `allowed: false` and does not throw.
     A unit test covers under budget, exactly at budget, budget `0` and a rejected read.
R25. `record` and `recordImage` each write one `AiUsageEvent` row for the meter's vendor and
     feature, with neurons from `neuronsForTextCall` or `WORKERS_AI_IMAGE_NEURONS` respectively. An
     image model missing from `WORKERS_AI_IMAGE_NEURONS` is recorded at the highest value in that
     table. A rejected write resolves without throwing. A unit test covers all three.
R26. `describeAiBudgetRefusal({ usedNeurons, budgetNeurons })` returns exactly
     `This store has used its AI allowance for today (<used> of <budget> neurons). It resets at 00:00 UTC.`
     `<used>` is `Math.ceil(usedNeurons)` and `<budget>` is `budgetNeurons`, both formatted with
     `toLocaleString("en-GB")`. A unit test asserts the string for `(3012.4, 3000)` as
     `This store has used its AI allowance for today (3,013 of 3,000 neurons). It resets at 00:00 UTC.`

## Wiring the four call sites (#1017)

R27. Shop your list (`features/cart/match-list.ts`):
     - the AI pre-pass consults the `LIST_NORMALISATION` meter's `check()` after the input-cap and
       configured checks and before `checkListNormalisationAllowed()`;
     - when refused, `normaliseList` is not called, the rate limiter is not called, and the skip is
       logged with reason `over-budget`;
     - after any `normaliseList` result that carries `usage`, `record` is called once with the
       resolved model.
     A unit test asserts the call order and the refused path.
R28. Synonym proposals (`lib/search-synonyms-service.ts`'s `generateSynonymProposals`):
     - consults a `SEARCH_SYNONYMS` meter before `proposeSynonyms`;
     - when refused, returns `{ ok: false, error: describeAiBudgetRefusal(check) }` without calling
       `proposeSynonyms`;
     - otherwise records the call's usage once `proposeSynonyms` has received a reply.
     A unit test covers both paths.
R29. Net content (`runNetContentSuggestions`, `lib/net-content-run.ts`):
     - takes a required `aiMeter` dependency and calls `check()` before each suggester call;
     - when refused, starts no further call and finishes with outcome `vendor-budget-reached`;
     - calls `record` after every suggester result that carries `usage`.
     `describeStaffNetContentRun` returns the `describeAiBudgetRefusal` text as its `error` for that
     outcome. `lib/net-content-suggestions-service.ts` and `scripts/suggest-net-content.ts` both
     pass a `NET_CONTENT` meter for the run's vendor. Unit tests cover the stop rule and the
     message.
R30. Product images (`runProductImagePipeline`):
     - its options parameter is required and carries a required `aiMeter`;
     - before calling `generateImage`, it calls `check()`. When refused it resolves
       `{ budgetRefused: <the check result> }` without calling `generateImage` or writing to
       storage;
     - after `generateImage` returns bytes, it calls `recordImage` once;
     - when Open Food Facts supplies the image, neither `check()` nor `recordImage` is called;
     - every other outcome is unchanged (`PipelineResult`, or `null`).
     `app/api/admin/jobs/backfill-images/route.ts`, `app/api/admin/product-images/generate/route.ts`
     and `scripts/fill-product-images.ts` each pass a `PRODUCT_IMAGE` meter for the product's
     vendor. On `budgetRefused`:
     - the backfill route processes no further product, does **not** call
       `recordImageAttemptFailure`, and responds 200 with `message` set to the
       `describeAiBudgetRefusal` text plus its usual `processed` and `totalFound`;
     - the product-image route responds 429 with that text as `error`;
     - the script stops that vendor's loop and prints the text.
     Unit tests cover the pipeline's refused, generated and Open-Food-Facts paths, and the
     backfill route's refused path (no failure recorded, loop stopped).
R31. Campaign images (`app/api/admin/campaign-images/generate/route.ts`):
     - consults a `CAMPAIGN_IMAGE` meter for `auth.vendorId` before `generateImage`;
     - when refused, responds with HTTP 429 and a JSON body whose `error` is the
       `describeAiBudgetRefusal` text, and does not call `generateImage`;
     - after bytes return, calls `recordImage` once.
     A unit test covers both paths.
R32. Every `fetch` to `https://api.cloudflare.com/client/v4/accounts/…/ai/run/…` in `lib/`, `app/`
     and `features/` sits in a code path that R27–R31 meter. `grep -rn "ai/run/" lib app features
     --include=*.ts --include=*.tsx` lists only `lib/list-normalisation.ts`,
     `lib/search-synonym-proposals.ts`, `lib/net-content-suggester.ts` and
     `lib/image-generation.ts`, plus generated `app/(admin)/staff/runbook/docs.ts` content.

## Owner script

R33. `npx tsx scripts/ai-usage.ts --env-file .dev.vars --vendor <slug>` prints:
     - the database host;
     - the vendor's `aiDailyNeuronBudget`;
     - the vendor's neurons since 00:00 UTC today;
     - a per-`AiFeature` breakdown of those neurons.
     It exits 0. Without `--vendor` it prints one such line per vendor. An unknown slug exits
     non-zero with a message naming the slug.
R34. `npx tsx scripts/ai-usage.ts --env-file .dev.vars --vendor <slug> --set-budget <n>` sets that
     vendor's `aiDailyNeuronBudget` to `n` for a non-negative integer `n`, prints the old and new
     values, and exits 0. A negative or non-integer `n` exits non-zero and changes nothing.

## Live behaviour (proved under `npm run preview` against the dev database)

R35. Under `npm run preview` with real Workers AI credentials in `.dev.vars`, one `/shop-your-list`
     submission for Aheed creates exactly one `AiUsageEvent` row with feature `LIST_NORMALISATION`,
     model `@cf/meta/llama-3.1-8b-instruct` and `milliNeurons` greater than 0. `scripts/ai-usage.ts`
     shows today's figure for Aheed rising by that amount.
R36. With Aheed's budget set to `0` via `scripts/ai-usage.ts`, a `/shop-your-list` submission still
     returns matched results and creates no `AiUsageEvent` row. The synonym "Suggest from recent
     searches" button, driven as a signed-in Aheed admin, shows the R26 refusal text and creates no
     row and no `SearchSynonym` row. During the same window, SriMart (budget unchanged, reached
     with `Host: srimart.localhost:8787`) still creates an `AiUsageEvent` row on its own
     `/shop-your-list` submission. Afterwards, Aheed's budget is restored to its prior value.
R37. With `LIST_NORMALISATION_AI_MODEL` set in `.dev.vars` to a model id that does not exist (for
     example `@cf/meta/not-a-real-model`), a `/shop-your-list` submission still returns matched
     results and `/staff/errors` (platform admin) shows one new `ErrorEvent` whose message contains
     `@cf/meta/not-a-real-model`. Afterwards the key is removed from `.dev.vars`.

## Docs, gates

R38. `specs/architecture.md`'s bullet beginning "AI does not sit on a public request path" states:
     - every Workers AI call is metered per vendor in `AiUsageEvent` against
       `VendorConfig.aiDailyNeuronBudget`;
     - the account's Workers plan (Free or Paid) is unverified;
     - a fifth criterion for a future request-path exception, that its spend is metered against the
       vendor's daily budget.
     All three sit within that bullet.
R39. `docs/developer-portal/env-setup.md` names `LIST_NORMALISATION_AI_MODEL` and
     `SEARCH_SYNONYM_AI_MODEL` as optional runtime keys, in the same section as
     `NET_CONTENT_AI_MODEL`. `docs/staff-playbook/staff-tabs-guide.md` states, for each of search
     synonyms, net content and image generation, that the action can be refused once the store's
     daily AI allowance is used and that it resets at 00:00 UTC.
R40. `npm run kms:validate` exits 0, and `npm run kms:assemble:internal` followed by
     `npx next build --webpack` in `kms/site-internal` both exit 0.
R41. `CHANGELOG.md` has an entry for this slice naming `#1016` and `#1017` (Gate 4).
R42. `npm run lint`, `npm run typecheck`, `npm run format:check` and `npx vitest run` (run alone) all
     exit 0, and `npm run build` exits 0.
