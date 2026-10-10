# Configurable Workers AI models, a dated degradation signal, and per-vendor AI metering (build notes)

Written at the end of Build, **before** the Clear. Branch `feature/p1016-1017-ai-model-metering`,
cut from `origin/staging` at `09eb799`. Spec commit `47e9f30`, build commit `c0c4c1e`.

## What changed and why

**One shared Workers AI module, `lib/workers-ai.ts`.** It holds the text rates, the per-image flux
figure, per-model request options, `extractWorkersAiReplyText` (moved verbatim from
`lib/list-normalisation.ts`), `extractWorkersAiUsage`, `neuronsForTextCall` and `neuronsForImage`.
`NET_CONTENT_MODEL_RATES` and `NET_CONTENT_MODEL_REQUEST_OPTIONS` are now the same objects, so the
net-content code and its tests did not move. Rates were read from the Workers AI pricing page on
2026-10-10:

- llama-3.1-8b: 25,608 / 75,147 neurons per million tokens. **It is still listed there, although
  it is delisted from the catalogue.**
- gemma-4: 9,091 / 27,273, unchanged.
- llama-4-scout: 24,545 / 77,273, unchanged.
- flux: 4.80 per 512×512 tile plus 9.60 per step. With the model defaults (4 steps documented,
  1024×1024 assumed, so 4 tiles) that is **57.6 neurons per image**. The model page does not
  document the default output size; the assumption is the larger plausible one, so it
  over-counts if wrong.

**#1016, configuration.**

- `LIST_NORMALISATION_AI_MODEL` and `SEARCH_SYNONYM_AI_MODEL` are added to `getAiEnv()`.
- `normaliseList` resolves its model per call (`resolveNormalisationModel()`).
- `proposeSynonyms` uses `DEFAULT_SYNONYM_MODEL` or the override. It now merges the model's request
  options and reads replies through the shared extractor; before, it read only a string `response`.

**#1016, the degradation signal.**

- `normaliseList` returns `NormalisationResult`, a discriminated union carrying `model` and, when
  a body arrived, `usage`. Its seven reasons are defined in R11.
- `features/cart/match-list.ts`'s `recordModelFailure` writes an `ErrorEvent` for `http`,
  `unreadable` and `unparseable` only, through the new `recordHandledErrorEvent` in
  `lib/error-events-service.ts`.
- **`unparseable` changed what counts as a failure.** A 2xx reply that parses to zero items for a
  non-empty list used to be silently treated as "no enrichment". It now writes an `ErrorEvent`.
  A healthy model always returns one item per line.

**#1017, metering.**

- **Schema and migration:**
  - `AiFeature` and `AiNeuronSource` enums.
  - `AiUsageEvent`: vendor FK with cascade, no user link, `milliNeurons Int` rounded up, and an
    index on `(vendorId, createdAt)`.
  - `VendorConfig.aiDailyNeuronBudget Int @default(3000)`.
  - One migration, `20261010150000_p1016_1017_ai_usage_metering`. It is purely additive, with
    no `DROP`.
- **`lib/repositories/ai-usage.ts`** is pure: client and `vendorId` are explicit. It does a
  singular `create` plus a 90-day sweep at probability 0.01, an `aggregate` `_sum`, and a budget
  read.
- **`lib/ai-meter.ts`:**
  - `createAiMeter(prisma, vendorId, feature)`. `check()` fails closed. `record` and `recordImage`
    never throw.
  - `startOfUtcDay`, and a re-export of `describeAiBudgetRefusal`.
  - The refusal text and the `AiBudgetCheck` type live in the import-free
    `lib/ai-budget-message.ts`. `lib/net-content-review-form.ts` imports it, and client
    components import that form module; pulling `lib/ai-meter.ts` in would have dragged the
    ledger repository into the browser bundle.
- **`lib/ai-meter-service.ts`:** `getCurrentAiMeter(feature)` for the shop-your-list action, and
  `getVendorAiMeter(vendorId, feature)` for the routes.
- **Wiring, all four call sites:**
  - **match-list:** the free checks, then the meter, then the throttle, then the call; it records
    any result with usage.
  - **`generateSynonymProposals`:** checks the meter after its three reads and before the call,
    then records.
  - **`runNetContentSuggestions`:** a required `aiMeter` dependency and a new
    `vendor-budget-reached` outcome. It records on both reply and billed-transport-error paths.
    `scripts/suggest-net-content.ts` treats one vendor's spent budget as "move to the next
    vendor", not "stop the run".
  - **`runProductImagePipeline`:** options are now required and carry a required `aiMeter`.
    A refusal returns `{ budgetRefused }`, a third outcome beside a result and `null`, so the
    backfill route and `scripts/fill-product-images.ts` stop **without**
    `recordImageAttemptFailure`. The `barcode` parameter became `string | null | undefined`
    because a required parameter cannot follow an optional one. All callers already passed `null`.
  - **Campaign route:** checks before `generateImage`, records after bytes, and answers 429 with
    the refusal text.
- **`IMAGE_GENERATION_MODEL`** is exported from `lib/image-generation.ts`, so the flux id exists
  in one place.
- **`scripts/ai-usage.ts`** follows the `fill-product-images.ts` conventions. Dev's Aheed slug is
  **`aheed-food-centre`**, not `aheed`; `validation.md` was corrected to match.

**Docs:**

- `specs/architecture.md`: a fifth public-path criterion and a metering paragraph, inside the
  bullet beginning "AI does not sit on a public request path".
- `docs/developer-portal/env-setup.md` 1.18.0: a new section on the three model overrides and
  the budget script.
- `docs/staff-playbook/staff-tabs-guide.md` 2.10.0: allowance sentences in Promotions
  (Auto-Generate), Catalogue (Auto-fill Missing Images and the photo generate button), Search
  dictionary and Net content.
- `CHANGELOG.md`.

**Tests.** New files:

- `tests/workers-ai.test.ts`
- `tests/ai-meter.test.ts` (meter and repository)
- `tests/match-list-ai-metering.test.ts`
- `tests/search-synonym-proposals-ai.test.ts`
- `tests/ai-image-routes-budget.test.ts`

Updated: `tests/list-normalisation.test.ts` (the `normaliseList` block rewritten for typed
results), `tests/product-image-pipeline.test.ts` and `tests/net-content-run.test.ts`.

Full suite run alone: **225 of 225 files, 2,920 of 2,920 tests**. That is 220 files before plus
5 new, so every file executed. `lint`, `typecheck` and `format:check` are clean.

## Decisions taken during the build

- **The migration reached dev by hand, the same way as `#1012`'s.** `#895`'s checksum drift on
  `20260820200500_p8_image_needs_review` makes `migrate dev --create-only` demand a reset. The
  route taken:
  1. SQL generated with `prisma migrate diff --from-schema-datasource --to-schema-datamodel`;
  2. read in full (no `DROP`, and no `pg_trgm` line proposed this time);
  3. applied with `prisma db execute`;
  4. recorded with `prisma migrate resolve --applied`.

  `prisma migrate status` reports dev up to date. **A validator does not need to apply anything.**
  Staging and production get it from CI as normal.
- **`fetch` rejections map to `timeout` when the error's `name` is `TimeoutError` or `AbortError`,
  and to `network` otherwise.** `AbortSignal.timeout` throws `TimeoutError`, and the existing
  never-settling test rejects with `AbortError`.
- **An empty line list returns `unparseable`.** It is unreachable, because `matchList` refuses an
  empty list first, and a comment says so.
- **`UNMETERED_CALL_NEURONS = 50`.** This is the charge for a text call with no reported neurons
  and no token counts, set deliberately generous.
- **An unlisted image model is charged the highest figure in `WORKERS_AI_IMAGE_NEURONS`**, mirroring
  the text rule (R25).
- **On a budget refusal, the backfill route still answers 200**, with the refusal as `message`
  plus `processed` and `totalFound`. The single product-image route and the campaign route answer
  429 with `error`. Both existing UIs already render those fields; no UI change was needed.
- **The meter check in `generateSynonymProposals` runs after its three parallel reads**, so a
  store with no failing searches over budget sees the budget refusal, not "No failed searches".
  This is harmless either way.

## Deviations from the spec

- **R22 / R12 amended in-branch (recorded inline in `requirements.md`).** ESLint's
  `no-restricted-imports` forbids `@/lib/db` in `app/` and `features/` (ADR-004 slice 2). So:
  - the routes use the new `getVendorAiMeter(vendorId, feature)` instead of
    `createAiMeter(getPrisma(), …)`;
  - match-list writes its `ErrorEvent` through `recordHandledErrorEvent`, a facade over the same
    `recordErrorEvent(getPrisma(), …)`, instead of calling the repository directly.

  `plan.md` and `validation.md` rows R12–R14 and R22 now name the facades.
- **`validation.md`'s `--vendor aheed` corrected to `--vendor aheed-food-centre`.** That is dev's
  real slug.

Nothing else differs.

## Known-shaky areas

- **Proved live at Build** under `npm run preview` against dev `ep-dry-morning-zab7dx08`, with
  real Workers AI. A validator should re-run these rather than trust them:
  - **R35.** One Aheed `/shop-your-list` submission wrote one row: `LIST_NORMALISATION`,
    `@cf/meta/llama-3.1-8b-instruct`, 354 in / 72 out, 3,969 milli-neurons, `REPORTED`.
    **This proves `aggregate` and `create` work over the HTTP adapter on a real Worker**, the
    risk this slice most needed to retire (compare `updateMany`, which does not).
  - **R36.** With Aheed at budget `0`:
    - Aheed's submission rendered matched lines and wrote no row;
    - `reason=over-budget` appeared in the Worker log;
    - SriMart (`Host: srimart.localhost:8787`) wrote its own row (5,552 milli-neurons);
    - the synonym button, as signed-in `demo-store-admin@example.com`, returned
      `This store has used its AI allowance for today (4 of 0 neurons). It resets at 00:00 UTC.`
      and wrote no row.

    The budget was restored to 3000 afterwards.
  - **R37.** With `LIST_NORMALISATION_AI_MODEL="@cf/meta/not-a-real-model"` in `.dev.vars`:
    - matched lines rendered;
    - one `ErrorEvent` was written: `Workers AI list normalisation degraded: http (HTTP 400),
      model @cf/meta/not-a-real-model`;
    - no ledger row was written (an unbilled 400 carries no usage).

    After removing the key and restarting, a submission wrote a normal row and no new
    `ErrorEvent`. **`.dev.vars` is restored byte-for-byte** from a backup.
- **Driving `/shop-your-list` from Node needs `node:http`, not `fetch`.** `fetch` silently drops a
  custom `Host` header, so Next's Server Actions check refused the POST: "x-forwarded-host … does
  not match origin", a 500 with a 21-byte body. **That one malformed attempt left an unrelated
  `ErrorEvent` ("Invalid Server Actions request.", 2026-10-10T17:25:32Z) on dev**, written by
  `instrumentation.ts`, not this slice. The working driver signs in through
  `/api/auth/sign-in/email` with `DEMO_ACCOUNT_PASSWORD`, scrapes the `$ACTION_REF_*`/`$ACTION_KEY`
  hidden inputs, and POSTs multipart through `node:http`. It lived in the session scratchpad and
  is not committed; rewrite it from this description if needed.
- **Not exercised live, deliberately (they cost real neurons or need data):**
  - a real synonym-proposal call (the live run was the refusal path);
  - a real net-content run under the meter;
  - any image generation, product or campaign.

  All three are covered by unit tests. The flux 57.6-neuron figure is computed, not measured.
- **Measured per-call cost.** A 3-line shop-your-list submission reported 4.0–5.6 neurons. At the
  3,000 default that is roughly 550–750 submissions per vendor per day; images at 57.6 come to
  about 52 a day. The owner can tune either with `scripts/ai-usage.ts`.
- **Cloudflare silently aliases the deprecated id.** The 2026-10-10 probe of
  `@cf/meta/llama-3.1-8b-instruct` came back with `"model": "@cf/meta/llama-3.1-8b-fast-v2"` in
  its body, and reported 0.43 neurons for 45/7 tokens, about a quarter of the listed rate. So the
  model actually answering is already not the one measured in `#1016`'s accuracy table, and could
  change again without notice. Recorded on `#1016`; the switch/re-measure is `#1027`.
- **The check is best-effort.** Concurrent calls can overshoot a budget by however many are in
  flight. This is by design (see `plan.md`).
- **The backfill button shows the budget refusal in its success tone**, because the route answers
  200 with `message`. This is cosmetic and follows the spec; it is tracked as `#1031`.
- **`#797`'s ~190 leftover test vendors on dev** make `scripts/ai-usage.ts` without `--vendor`
  print about 190 lines. This is expected; filter by `--vendor`.

## Follow-ups filed at this stage (2026-10-10)

All on Project #2, Phase `P10`, Status `Backlog`:

- `#1027`: switch the default model to gemma-4, with a timeout decision, a wider fixture and a
  re-measure of the aliased id.
- `#1028`: owner action, confirm the Workers plan (Free or Paid) and record it in
  `specs/architecture.md`.
- `#1029`: a staff view of today's AI allowance and a non-terminal way to set a vendor's budget.
- `#1030`: the campaign banner prompt hardcodes "UK grocery store". Pre-existing, found here.
- `#1031`: the backfill button shows the budget refusal in its success tone.

Comments posted: `#1016` (the aliasing finding) and `#588` (evidence it may be stale; not closed).
