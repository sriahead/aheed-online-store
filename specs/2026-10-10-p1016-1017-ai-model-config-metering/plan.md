---
id: p1016-1017-ai-model-config-metering-plan
title: "Configurable Workers AI models, a dated degradation signal, and per-vendor AI metering (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-10
visibility: internal
summary: Makes the two hardcoded Workers AI model ids configurable, makes the shop-your-list AI pre-pass write an ErrorEvent when the model stops answering, and meters every AI call per vendor against a per-vendor daily neuron budget.
tags: [workers-ai, multi-tenant, cost-control, observability, chatbot-prerequisite]
related: [architecture, roadmap, sdd-workflow]
---

# Configurable Workers AI models, a dated degradation signal, and per-vendor AI metering (plan)

Slice 2 of the chatbot programme (`#1015`). It covers two findings from the ninth Discover pass
(`docs/research/discovery-log.md`, 2026-10-10). Both describe **already-shipped production code**,
not the chatbot:

- **`#1016`**: `lib/list-normalisation.ts:37` and `lib/search-synonym-proposals.ts:31` hardcode
  `@cf/meta/llama-3.1-8b-instruct`. Cloudflare deprecated that id on 2026-05-30 and it is gone
  from the account's model catalogue, though it still answers a real call (verified 2026-10-10).
  Neither site can be overridden from config. When the id is finally withdrawn, `/shop-your-list`
  will fall back to its deterministic matcher **with no trace anywhere**, so nobody could say when
  it happened.
- **`#1017`**: every Workers AI call uses one platform credential (`getAiEnv()`,
  `lib/config.ts:158`), so the account's daily neuron allowance is one unmetered pool shared by
  every vendor. One vendor can exhaust it for all the others, and no vendor's AI spend can be
  attributed, capped or reported.

**Owner decisions at `/propose` (2026-10-10, recorded on both issues):**

1. Keep `llama-3.1-8b-instruct` as the default. It was the best of five candidates measured on
   2026-10-10: 3/3 on both prompt rules, and the fastest accurate one. Make it configurable now.
   `gemma-4-26b-a4b-it` is the validated successor, but switching to it needs a timeout decision,
   so it is not switched here.
2. A per-vendor **ledger plus an enforced daily budget**, not a ledger alone and not a call-count
   cap.
3. The budget is a **`VendorConfig` column** with a platform default (ADR-004: vendor rules come
   from the database).
4. **The account's Workers plan (Free or Paid) is unknown.** The design must be safe under both.
   On Free, an exhausted pool stops every vendor's AI until 00:00 UTC. On Paid, it bills without
   attribution. A per-vendor budget that refuses before the shared pool runs out is what makes
   either plan safe.

**Goal:** a model withdrawal becomes a config change with a dated `ErrorEvent`, not an
undateable silent regression. No vendor can spend more than its own daily neuron budget on any of
the platform's four Workers AI features, and each vendor's AI spend becomes a figure someone can
read. This has to land before `#1015`, because a chatbot is the first AI feature whose call volume
scales with customer traffic.

## What the code actually holds (read at `/propose` and `/spec`, 2026-10-10)

There are **four** Workers AI call sites, not three. `#1017` named three.

| Site | Model | Trigger | Vendor known from | Usage in reply |
| --- | --- | --- | --- | --- |
| `lib/list-normalisation.ts` `normaliseList` | llama-3.1-8b (hardcoded) | public `/shop-your-list` submit, via `features/cart/match-list.ts` | `getCurrentVendorId()` | tokens (shape to confirm at Build) |
| `lib/search-synonym-proposals.ts` `proposeSynonyms` | llama-3.1-8b (hardcoded) | staff button, via `generateSynonymProposals(vendorId)` | caller's `vendorId` | tokens (to confirm) |
| `lib/net-content-suggester.ts` | gemma-4 (configurable) | staff button and script, via `runNetContentSuggestions` | caller's `vendorId` | tokens plus `neurons` (measured on #900) |
| `lib/image-generation.ts` `generateImage` | flux-1-schnell (hardcoded) | backfill route, product-image route, campaign-image route, `scripts/fill-product-images.ts` | `auth.vendorId` or the script's vendor loop | **none**, the reply is image bytes |

Other facts that shape this design:

- The only neuron machinery is `NET_CONTENT_MODEL_RATES` and `neuronsForCall()` in
  `lib/net-content-run.ts`. They cover gemma-4 and llama-4-scout, not llama-3.1-8b and not flux.
  They are per run of one feature, not per vendor.
- The reply-shape handling is split. `extractReplyText` in `lib/list-normalisation.ts` already
  reads both `result.response` and `result.choices[0].message.content`. `proposeSynonyms` reads
  only a string `result.response`, so pointing it at gemma would silently return zero proposals.
  Gemma also needs `chat_template_kwargs: { enable_thinking: false }`, which lives in
  `NET_CONTENT_MODEL_REQUEST_OPTIONS` (`lib/net-content-suggester.ts`). A model override is only
  "config only" once both of those are shared.
- `runProductImagePipeline` takes no vendor. All four of its callers have one in hand.
- `ErrorEvent` (`prisma/schema.prisma`) is platform-wide (no `vendorId`), shown on `/staff/errors`
  to platform admins only, and written today only by `instrumentation.ts`. Its `routerKind`/
  `routeType` values come from Next's `onRequestError` context (`App Router`, `action`).
- `#588` (Workers AI credentials never reach the Worker) looks stale. Both deploy workflows run
  `wrangler secret put CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`
  (`.github/workflows/deploy-production.yml:66-67`). It is not in scope, but it matters for live
  proof.

## Scope (this slice)

### 1. One shared Workers AI module: `lib/workers-ai.ts`

A plain module (no request context, no Prisma) that becomes the single home for:

- **`WORKERS_AI_TEXT_RATES`**: neurons per million input and output tokens, per model id. It holds
  at least `@cf/meta/llama-3.1-8b-instruct`, `@cf/google/gemma-4-26b-a4b-it` and
  `@cf/meta/llama-4-scout-17b-16e-instruct`. Every figure is re-read from Cloudflare's Workers AI
  pricing page at Build, with the date in a comment. `NET_CONTENT_MODEL_RATES` stays exported from
  `lib/net-content-run.ts` as the same object, so its callers and tests do not move.
- **`WORKERS_AI_IMAGE_NEURONS`**: neurons per generated image, per image model id. It holds at
  least `@cf/black-forest-labs/flux-1-schnell`. Flux is priced per 512×512 tile and per diffusion
  step, so this is one per-image constant computed at Build from the published rates and the
  parameters `lib/image-generation.ts` actually sends. The arithmetic goes in a comment.
- **`WORKERS_AI_MODEL_REQUEST_OPTIONS`**: the extra request fields per model, moved from
  `NET_CONTENT_MODEL_REQUEST_OPTIONS` (which stays exported as the same object).
- **`extractWorkersAiReplyText(payload)`**: the existing `extractReplyText` logic moved here
  unchanged. It reads a string `result.response`, a non-string `result.response` serialised as
  JSON, then `result.choices[0].message.content`, then falls back to `""`.
- **`extractWorkersAiUsage(payload)`**: input tokens, output tokens and reported neurons, each
  `number | null`. It uses the same fields `readWorkersAiReply` reads today
  (`usage.prompt_tokens`, `usage.completion_tokens`, `usage.neurons`).
- **`neuronsForTextCall(model, usage)`**: neurons and their source. If neurons are reported, use
  them (`REPORTED`). Otherwise tokens × the model's rate (`ESTIMATED`). Otherwise, for a model
  missing from the table or a reply with no token counts, the most expensive rate in the table
  applied to the call's own token counts, with a fixed floor when even tokens are missing
  (`ESTIMATED`). **An unpriced model is never refused and never counted as free.** It is
  over-counted, which is the safe direction for a budget. This is deliberately different from the
  net-content script, whose own per-run refusal of unpriced models is unchanged. The vendor meter
  must not turn a mistyped override into a silently disabled feature, because that would hide
  exactly the misconfiguration `#1016` is about.

### 2. Configurable models (`#1016`)

- `lib/config.ts`'s AI schema gains two optional keys, following `NET_CONTENT_AI_MODEL` exactly:
  **`LIST_NORMALISATION_AI_MODEL`** and **`SEARCH_SYNONYM_AI_MODEL`**.
- `lib/list-normalisation.ts` keeps `NORMALISATION_MODEL` as the named default (value unchanged,
  so `tests/list-normalisation.test.ts:222` still holds). It resolves the model per call from
  config and falls back to the default. `lib/search-synonym-proposals.ts` does the same with a new
  exported `DEFAULT_SYNONYM_MODEL`.
- Both build their request body with that model's entry from `WORKERS_AI_MODEL_REQUEST_OPTIONS`
  merged in, and read the reply through `extractWorkersAiReplyText`. Pointing either key at
  gemma-4 is then a config change only: no code edit, no deploy beyond the secret.

### 3. A dated degradation signal (`#1016`)

`normaliseList` stops returning bare `null` on failure. It returns a discriminated result: either
the items plus the call's usage, or a degradation with a reason. The reason is one of
`not-configured`, `over-input-cap`, `timeout`, `network`, `http` (with the status), `unreadable`
(body not JSON) or `unparseable` (a JSON reply from which the parser recovers zero items for a
non-empty list, including an empty reply text). It still
never throws. The caller (`features/cart/match-list.ts`) still falls through to the deterministic
matcher for every reason. The shopper sees nothing different.

For **`http`, `unreadable` and `unparseable` only**, the caller also writes one `ErrorEvent` via
`recordHandledErrorEvent` (`lib/error-events-service.ts`, over `recordErrorEvent(getPrisma(), …)`). The message names the reason, the HTTP status when there is
one, and the model id. The other fields are `path: "/shop-your-list"`, `method: "POST"`,
`routerKind: "App Router"`, `routeType: "action"`, `stack: null` and `digest: null`. That write is
wrapped so it can never throw into the submission. These three reasons are what a withdrawn or
mis-set model produces. `timeout`, `network`, `not-configured`, `over-input-cap`, `rate-limited`
and `over-budget` are expected, transient or deliberate degradations, and logging them would bury
the signal. They stay on the existing `logSkip` console line.

Synonym proposals already surface every failure to the admin who pressed the button, so they get
no `ErrorEvent`.

### 4. Per-vendor metering (`#1017`)

**Schema** (one additive migration, generated `--create-only` and read before it applies; drop any
`pg_trgm` `DROP INDEX` lines Prisma proposes):

- New enum **`AiFeature`**: `LIST_NORMALISATION`, `SEARCH_SYNONYMS`, `NET_CONTENT`,
  `PRODUCT_IMAGE`, `CAMPAIGN_IMAGE`.
- New enum **`AiNeuronSource`**: `REPORTED`, `ESTIMATED`.
- New model **`AiUsageEvent`**: `id`, `vendorId` (FK to `Vendor`, `onDelete: Cascade`),
  `feature AiFeature`, `model String`, `inputTokens Int?`, `outputTokens Int?`,
  `milliNeurons Int` (neurons × 1000, rounded up: integers only, no floats, the same discipline as
  money), `neuronSource AiNeuronSource`, `createdAt`, and `@@index([vendorId, createdAt])`. It has
  **no user link**: the ledger is a vendor cost record, not personal data, so it stays outside
  `lib/repositories/data-rights.ts`'s scope (the `SearchQueryLog` precedent, `#570`).
- **`VendorConfig.aiDailyNeuronBudget Int @default(3000)`**. `0` means AI is off for that vendor.

**Why 3,000.** The free daily allowance is 10,000 neurons per account. At 3,000, three vendors at
full spend still leave headroom, so one vendor cannot reach the shared cliff alone. That is the
property the owner chose. It is a row value, not a constant: the owner can change any vendor's
figure with the script below, no deploy. At the rates Build records, 3,000 is on the order of
dozens of AI-generated images or a few hundred shop-your-list submissions a day. Build records the
exact per-call figures it measures so the owner can judge the default.

**Repository** `lib/repositories/ai-usage.ts` (pure, with `prisma` and `vendorId` explicit, per
`tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts`):

- `recordAiUsage(prisma, vendorId, entry)` does a singular `create` with no nested writes, so
  `getPrisma()` is correct per `CLAUDE.md`. It is followed by the low-probability retention sweep
  (`deleteMany` older than **90 days**, probability 0.01), the same pattern as
  `lib/repositories/list-normalisation-rate-limit.ts`.
- `sumVendorMilliNeuronsSince(prisma, vendorId, since)` returns the `_sum` aggregate, `0` when
  there are no rows.
- `getVendorAiDailyBudget(prisma, vendorId)` returns the vendor's `aiDailyNeuronBudget`, or
  `DEFAULT_AI_DAILY_NEURON_BUDGET` (3000) when the vendor has no `VendorConfig` row.

**The meter** `lib/ai-meter.ts` (a plain module that takes `prisma` explicitly, so scripts can use
it):

- `createAiMeter(prisma, vendorId, feature)` returns an `AiMeter` with two methods:
  - `check()` resolves to `{ allowed, usedNeurons, budgetNeurons }`. `allowed` is
    `usedNeurons < budgetNeurons`, where `usedNeurons` is the vendor's spend since **00:00 UTC
    today**, the moment Cloudflare's allowance resets. A budget of `0` always refuses. If the
    database read throws, `check()` resolves to refused and logs: it fails closed, because the
    meter exists to stop spend.
  - `record({ model, usage })` for text calls and `recordImage({ model })` for image calls compute
    neurons through `lib/workers-ai.ts` and write one `AiUsageEvent`. **They never throw**: a
    ledger write failure is logged and swallowed, so it cannot fail the feature that already spent
    the neurons.
- `startOfUtcDay(now)` is exported and pure, so the day boundary is unit-tested.
- The check is **best-effort, not compare-and-set**, the same trade as the existing rate limiters.
  Concurrent calls can each pass a check just under budget, so the overshoot is bounded by
  in-flight calls, not unbounded. A `$transaction` around every AI call would cost more than it
  protects.
- A meter is created per request (or per script run) and **never held at module level**, per
  `CLAUDE.md`'s fresh-client rule. `lib/ai-meter-service.ts`'s `getCurrentAiMeter(feature)` is the
  request-scoped facade (`getPrisma()` plus `getCurrentVendorId()`), and `getVendorAiMeter(vendorId,
  feature)` serves routes that already hold `auth.vendorId` (`app/` may not import `@/lib/db`).

**Wiring.** Each site checks before the call and records after any reply that carries a body:

| Site | Check refused means | Record |
| --- | --- | --- |
| `match-list.ts` `normaliseParsed` | `logSkip("over-budget", …)`, deterministic match. Checked **after** the two free checks and **before** the rate limiter, so an over-budget vendor never spends a shopper's throttle slot | after any `normaliseList` result that carries usage |
| `generateSynonymProposals` | `{ ok: false, error }` with the budget message below, and no call | after any reply |
| `runNetContentSuggestions` | a new outcome `vendor-budget-reached`. No new call starts, rows already written stay | after every call whose result carries usage |
| `runProductImagePipeline` | the AI fallback is skipped and the pipeline resolves `{ budgetRefused }`, a third outcome beside a result and `null`. The backfill route then stops its loop and reports the budget message **without** `recordImageAttemptFailure`: a budget refusal is not a product the pipeline can never fill. Open Food Facts is unaffected because it costs no neurons | `recordImage` after `generateImage` returns bytes |
| `campaign-images/generate` route | a non-200 JSON error with the budget message, and no call | `recordImage` after bytes |

`runProductImagePipeline`'s options gain a **required** `aiMeter`, so the type checker finds all
four callers: the two routes, the backfill route and `scripts/fill-product-images.ts`. The
net-content run's dependencies gain a required `aiMeter` too, wired by
`lib/net-content-suggestions-service.ts` and `scripts/suggest-net-content.ts`. The script creates
its meter from its own `PrismaClient` and the vendor it is running for.

**Staff-facing budget message** (synonyms, net-content button, campaign image, image backfill), as
one exported builder `describeAiBudgetRefusal(check)` in `lib/ai-meter.ts`:

> This store has used its AI allowance for today (`<used>` of `<budget>` neurons). It resets at
> 00:00 UTC.

`<used>` and `<budget>` are whole numbers. The net-content button's `describeStaffNetContentRun`
renders this message for the new outcome.

### 5. An owner tool for the budget and the figure: `scripts/ai-usage.ts`

A Node script following `scripts/fill-product-images.ts`'s conventions: `--env-file`, the database
host printed before anything is read, and a bare `@prisma/client` with the Neon adapter.

- `--vendor <slug>` prints that vendor's budget, today's neurons (UTC), and today's neurons split
  by feature. Without `--vendor` it prints one line per vendor.
- `--vendor <slug> --set-budget <n>` sets `aiDailyNeuronBudget` to a non-negative integer and
  prints the old and new values. This is the "editable per row" mechanism. There is no staff UI
  for it in this slice.

This is how the owner reads a vendor's AI spend today, and how Validate drives the budget without
hand-written SQL.

### 6. Docs

- `specs/architecture.md`, in the bullet "AI does not sit on a public request path unless it is
  bounded, optional and argued". Add a paragraph saying every Workers AI call is metered per vendor
  against `VendorConfig.aiDailyNeuronBudget`, and that the ledger is the only per-vendor AI cost
  figure. Name the Free/Paid plan as unverified and say why the budget makes either plan safe. Add
  a fifth criterion for a future request-path exception: **its spend is metered against the
  vendor's daily budget.**
- `docs/developer-portal/env-setup.md`: the two new optional model keys, beside
  `NET_CONTENT_AI_MODEL`, and the reminder that a runtime override is a Cloudflare secret
  (`wrangler secret put`), not a GitHub secret.
- `docs/staff-playbook/staff-tabs-guide.md`: one sentence each where search synonyms, net content
  and image generation are described, saying the button can be refused once the store's daily AI
  allowance is used, and when it resets.
- `CHANGELOG.md` (Gate 4).

## Deliberately excluded

- **Switching the default model to gemma-4** (owner decision 1). It needs the
  `NORMALISATION_TIMEOUT_MS` decision recorded on `#1016`: 4.5 s measured against 6 s is not enough
  headroom. It also needs a wider accuracy fixture than the five-line screen, drawn from
  `SearchQueryLog`. This slice only makes the switch a config change.
- **A configurable image model.** Flux is not deprecated, and `#1016` is about the two text-model
  literals. Flux joins the rate table only so it can be metered.
- **A staff UI for the budget or a usage dashboard.** The budget is set per row through
  `scripts/ai-usage.ts`, and the figure is read there and quoted in every refusal. A `/staff/*`
  page would trigger the three-surface rule and needs its own design. It waits for a vendor
  onboarded on commercial terms.
- **Vendor billing, invoices or charging a vendor for AI.** The ledger makes it possible, but no
  vendor pays for anything yet (the platform has never traded).
- **Per-vendor Cloudflare credentials.** These are ruled out by ADR-004 decision 7 ("onboard with a
  row, no deploy"), as recorded on `#1017`.
- **An `ErrorEvent` from synonym proposals, net content or image generation.** All three are staff
  actions that already show their failure to the person who pressed the button.
- **Compare-and-set budget enforcement.** It is best-effort by design, see the meter section.
- **A Workers AI probe in `/api/health`.** That would be a paid call on an unauthenticated
  endpoint, which is the `#571` objection.
- **Deciding the Workers plan.** It is an owner dashboard fact; see Open items.
- **`#588`.** It looks stale (see above), but closing it needs its own check. It is not touched
  here.
- **`#619`'s reconciliation starvation.** It has the same shape but is a different mechanism.

## Open items carried forward

- **Which Workers plan the account is on** (owner, Cloudflare dashboard → Workers & Pages →
  Plans). The design is safe under both. The answer decides whether hitting the shared pool means
  an outage or a bill, and it belongs in `specs/architecture.md` once known.
- **The exact per-call neuron figures.** Build measures them, from at least one real call per text
  model and the computed flux per-image constant. If they make 3,000 a poor default, the owner
  changes rows with `scripts/ai-usage.ts`, not code.
- **The gemma-4 switch**, its timeout decision and a wider fixture (`#1016`, after this slice).
- **`#1015`** (the chatbot) consumes this meter as a sixth `AiFeature` value when it is built.
