# Platform costs, competitor pricing, profitability and business models (requirements / acceptance criteria)

Issue `#1309`. Builds on `#1295` (`specs/2026-10-27-running-costs-report/`), the `/staff/platform/costs`
page and the `lib/running-costs.ts` registry. In one line: the same page, still visible only to
platform admins, gains competitor pricing, proposed plans, a break-even and scenario profitability
model, a business-model comparison, an AI-assisted refresh that only *suggests*, CSV export, a print
layout, and a quarterly GitHub workflow that opens a review issue. Read `plan.md` for the reasoning,
the two departures from the issue text (one enum migration; no AI in the workflow) and the exclusions.

Terms used below:
- **Registries**: `RUNNING_COST_ITEMS` (`lib/running-costs.ts`), `COMPETITORS`
  (`lib/pricing/competitors.ts`), `ASSUMPTIONS` (`lib/pricing/assumptions.ts`), `PROPOSED_PLANS`
  (`lib/pricing/proposed-plans.ts`), `BUSINESS_MODELS` and `RECOMMENDATION`
  (`lib/pricing/business-models.ts`).
- **Pure module**: a file with no `"use client"`/`"use server"` directive that imports nothing from
  `react`, `next/*`, `@/lib/db`, `@/lib/config`, `@prisma/*` and calls no `fetch(`.
- **Round half up**: `Math.floor(x + 0.5)` on a non-negative value. **Round up**: `Math.ceil`.
- **Date**: a `YYYY-MM-DD` string. "Older than N days" compares UTC calendar dates: `now` minus the
  date in whole days is greater than N.
- **Platform admin**: a session for which `requireVendorRole("ADMIN")` returns `ok` with
  `via: "platform-admin"`.

## A. Costs registry and report (`lib/running-costs.ts`)

R1. `lib/running-costs.ts` remains a pure module. `CostItem` gains `group`
    (`"platform-fixed" | "platform-usage" | "dev-tools"`) and `reviewEvery` (`"month" | "quarter"`), and
    `CostBasis` gains `"open-licence"`. Every rule in `#1295`'s R2 still holds for every item, and in
    addition: `reviewEvery` is `"quarter"` exactly when `period` is `"year"` or `basis` is
    `"open-licence"`, and `"month"` otherwise; an item with `basis: "open-licence"` has
    `amountCents: 0` and a non-null `limits` whose `sourceUrl` is the licence or terms page.

R2. The 11 items of `#1295`'s R3 keep their ids, `costStatus`, `basis`, `amountCents`, `period`,
    `renewsOn`, `autoRenew` and `priceChange` unchanged, and have these `group`s:
    `cloudflare-workers`, `domain-nocaped`, `domain-merqify`, `domain-aheedfoodcentre`, `neon` →
    `platform-fixed`; `cloudflare-r2`, `workers-ai`, `stripe`, `cloudflare-email` → `platform-usage`;
    `cloudflare-access`, `github` → `dev-tools`. The `workers-ai` item's `note` states that product and
    campaign image generation is billed under it.

R3. The registry holds exactly 17 items: the 11 of R2 and these 6 (id - group - `costStatus` - `basis` -
    `amountCents`/`period`):
    - `postcode-reference` - `platform-fixed` - `actual` - `owner-stated` - `0`/`month` (its `note`
      names the `uk-location-reference` Neon project)
    - `os-opendata` - `platform-fixed` - `actual` - `open-licence` - `0`/`month`
    - `iconify-icons` - `platform-fixed` - `actual` - `open-licence` - `0`/`month`
    - `open-food-facts` - `platform-fixed` - `actual` - `open-licence` - `0`/`month`
    - `claude` - `dev-tools` - `unverified` - `not-confirmed` - `null`/`null`
    - `gemini-pro` - `dev-tools` - `unverified` - `not-confirmed` - `null`/`null`

R4. `buildCostReport(items, now)` keeps every output of `#1295`'s R5-R8 (for the R3 registry
    `current` is still 7046 / 587, `withPlanned` 8622 / 719, `atRenewal` 8764 / 730, and `unpriced` is
    exactly `workers-ai`, `stripe`, `cloudflare-email`, `claude`, `gemini-pro`), and adds:
    - `byGroup`: for each of the three groups, `{ annualCents, monthlyCents }` computed by `#1295`'s R5
      `current` rule restricted to that group. For the R3 registry: `platform-fixed` 7046 / 587,
      `platform-usage` 0 / 0, `dev-tools` 0 / 0.
    - `stale`: the ids of items whose `asOf` is older than 31 days (`reviewEvery: "month"`) or 92 days
      (`"quarter"`). For the R3 registry it is empty at `now` = 2026-10-27, and at `now` = 2026-12-01
      it is exactly the ids whose `reviewEvery` is `"month"`.
    - `ownerToConfirm`: the ids with `costStatus: "unverified"`. For R3: `stripe`, `cloudflare-email`,
      `claude`, `gemini-pro`.

## B. Pricing registries (`lib/pricing/`)

R5. `lib/pricing/money.ts` (pure) exports `type Currency = "GBP" | "USD"`, `interface Money { minor:
    number; currency: Currency }`, `roundHalfUp(x)`, and `formatMoney(m)` returning `£` or `$`
    followed by `minor / 100` with exactly two decimals and thousands separators (`{ minor: 123456,
    currency: "GBP" }` → `£1,234.56`). Every `minor` in every registry is a non-negative integer.

R6. `lib/pricing/competitors.ts` (pure) exports `COMPETITORS` with exactly these 10 ids and segments:
    `shopify`, `wix`, `square-online`, `ecwid` → `"store-builder"`; `uber-eats`, `deliveroo`,
    `just-eat` → `"marketplace"`; `snappy-shopper` → `"local-platform"`; `stripe-payments`,
    `sumup` → `"payments"`. Each competitor has `name`, `segment`, `website` (`https://`),
    `researchStatus` (`"published" | "not-published" | "not-readable"`), `researchedOn` (a date),
    `note` (string or `null`), and `plans`. `plans` is non-empty exactly when `researchStatus` is
    `"published"`.

R7. Every competitor plan has `name`, `monthlyFee` (`Money` or `null`), `setupFee` (`Money` or
    `null`), `commissionBps` (integer 0-10000 or `null`), `cardFee` (`{ bps, fixed: Money }` or `null`),
    `addOns` and `extraCharges` (string arrays), `features` (string array), `sourceUrl` (`https://`, on
    the competitor's own domain or a subdomain of it, as `new URL(...).hostname` ends with the
    hostname of `website` minus a leading `www.`), and `retrievedOn` (a date, not later than the
    slice's Build date). Every non-null figure in a plan appears on the page at `sourceUrl`. At least
    one of `monthlyFee`, `commissionBps` or `cardFee` is non-null.

R8. `lib/pricing/assumptions.ts` (pure) exports `ASSUMPTIONS` with exactly these ids, each with
    `label`, `value` (integer or `null`), `unit`, `basis` (`"owner" | "published-source" | "proposal" |
    "missing"`), `sourceUrl` (`https://` or `null`) and `asOf` (a date):
    - `usd-cents-per-gbp`: `basis: "published-source"`, a non-null `value` (US cents per £1), a
      `sourceUrl` on a central bank or official statistics domain;
    - `card-fee-bps` and `card-fee-fixed-pence`: `basis: "published-source"`, `sourceUrl` on
      `stripe.com`, the standard UK card rate, each with `derivedFrom: { competitorId:
      "stripe-payments", planName }` naming the `stripe-payments` plan whose `cardFee` holds the same
      figures (`cardFee.bps` and `cardFee.fixed.minor` respectively);
    - `scenario-vendor-counts` is a separate export `SCENARIO_VENDOR_COUNTS = [1, 5, 10, 25, 50]` with
      `basis: "proposal"` stated in its doc comment.
    `basis: "missing"` holds exactly when `value` is `null`, and `sourceUrl` is non-null exactly when
    `basis` is `"published-source"`. No assumption id contains `gmv`, `orders` or `aov`.

R9. `lib/pricing/proposed-plans.ts` (pure) exports `PROPOSED_PLANS` with exactly 4 plans whose `model`s
    are `"subscription"`, `"commission"`, `"hybrid"` and `"freemium"`, one each. Each has `id`, `name`,
    `status: "proposal"`, `monthlyFeePence` (integer), `commissionBps` (integer 0-10000), `includes`
    (string array), `addOns` (`{ name, monthlyFeePence }[]`), `positioning` (a non-empty string that
    names at least one competitor id from R6), and `vatNote` stating that prices exclude VAT. The
    `subscription` plan has `commissionBps: 0` and `monthlyFeePence > 0`; `commission` has
    `monthlyFeePence: 0` and `commissionBps > 0`; `hybrid` has both above 0; `freemium` has
    `monthlyFeePence: 0`.

R10. `lib/pricing/business-models.ts` (pure) exports `BUSINESS_MODELS` with exactly 6 ids:
     `subscription`, `commission`, `freemium`, `transaction-fee`, `usage-based`, `hybrid`. Each has
     `name`, `description`, and non-empty `advantages`, `disadvantages` and `risks` arrays, and
     `representativePlanId` (the id of the R9 plan with the same `model`, or `null` for
     `transaction-fee` and `usage-based`). It also exports `RECOMMENDATION` with `modelId` (one of the
     6, with a non-null `representativePlanId`), a non-empty `reasoning` array, `reviewedOn` (a date)
     and `nextReviewDue` equal to `reviewedOn` plus 92 days.

## C. Analysis (`lib/pricing/analysis.ts`)

R11. `lib/pricing/analysis.ts` is a pure module exporting `buildPricingAnalysis(input, now)`, where
     `input` is `{ costs: CostReport, assumptions, plans, scenarioVendorCounts, recommendation,
     models, competitors }` (amended at Build: R16's competitor staleness needs `competitors`). The analysis uses `costs.withPlanned.monthlyCents` as the platform's monthly cost
     (`costUsdCents`). `costPence` is `roundHalfUp(costUsdCents * 100 / usdCentsPerGbp)`, or `null`
     when `usd-cents-per-gbp` has a `null` value. When `costPence` is `null`, every value in R12-R14
     that depends on it is `null`.

R12. For each plan, the analysis returns `{ planId, fixedPencePerVendor: monthlyFeePence,
     netVariableBps: commissionBps - card-fee-bps, breakEvenVendors, breakEvenGmvPence }` where
     `breakEvenVendors` is `ceil(costPence / monthlyFeePence)` when `monthlyFeePence > 0`, otherwise
     `null`; and `breakEvenGmvPence` is `ceil(costPence * 10000 / netVariableBps)` when
     `monthlyFeePence` is 0 and `netVariableBps > 0`, otherwise `null`. The per-order fixed card fee is
     not in either figure, and each plan result carries `excludesPerOrderFee: true`.

R13. For each plan and each scenario vendor count `n`, the analysis returns `{ planId, vendors: n,
     revenuePence: n * monthlyFeePence, costPence, profitPence: revenuePence - costPence, marginBps }`
     where `marginBps` is `roundHalfUp(profitPence * 10000 / revenuePence)` when `revenuePence > 0`
     and `profitPence >= 0`, `-roundHalfUp(-profitPence * 10000 / revenuePence)` when
     `revenuePence > 0` and `profitPence < 0`, and `null` when `revenuePence` is 0. These figures are
     at zero sales, and the result carries `atZeroGmv: true`.

R14. The analysis returns `ranking: { byVendors: string[]; byGmv: string[] }`. `byVendors` is the ids of
     plans with a non-null `breakEvenVendors`, ascending by it, ties by id. `byGmv` is the ids of plans
     with `monthlyFeePence` 0, ascending by `breakEvenGmvPence` with `null` last, ties by id. It also
     returns `recommendationDisagrees`: true when the recommendation's representative plan is not
     the first id of the list it appears in, and false otherwise (also false when `costPence` is `null`).

R15. Worked fixture (asserted in the unit test): `costs.withPlanned.monthlyCents` 1000,
     `usd-cents-per-gbp` 125, `card-fee-bps` 150, plans `S` (fee 2000, commission 0), `C` (fee 0,
     commission 500), `H` (fee 1000, commission 200), `F` (fee 0, commission 100), scenarios `[5]`,
     recommendation representative plan `H`. Expected: `costPence` 800; `S` `breakEvenVendors` 1;
     `H` 1; `C` `breakEvenGmvPence` 22858, `netVariableBps` 350; `F` `netVariableBps` -50 and
     `breakEvenGmvPence` null; `S` at 5 vendors: revenue 10000, profit 9200, `marginBps` 9200;
     `byVendors` `["H", "S"]`; `byGmv` `["C", "F"]`; `recommendationDisagrees` false. With
     `usd-cents-per-gbp` `null`: `costPence`, every `breakEven*`, profit and margin are `null`.

R16. The analysis returns `stale`: entries `{ registry, id }` for every competitor whose `researchedOn`,
     and every assumption whose `asOf`, is older than 92 days, plus the cost report's `stale` ids
     (`registry: "costs"`). It also returns `recommendationOverdue`: true when `now` is after
     `RECOMMENDATION.nextReviewDue`.

## D. Refresh

R17. `lib/pricing/refresh.ts` is a pure module exporting `refreshSources(scope)`, where `scope` is
     `"costs"` or `"all"`. It returns the distinct `sourceUrl`s of cost items' non-null `limits`,
     excluding items with `basis: "open-licence"` (their URL is a licence, not a price page; amended
     at Build) (for `"costs"`), or those plus every competitor plan's `sourceUrl` (for `"all"`), in
     registry order,
     truncated to 25. It also exports `parseExtraction(json)`, which validates a model reply against the
     schema `{ plans: { name: string; monthlyFee: { amount: number; currency: "GBP" | "USD" } | null;
     commissionPercent: number | null; cardFeePercent: number | null; cardFeeFixed: number | null }[] }`
     with zod. It converts amounts to integer minor units and percents to integer basis points by
     `Math.round(x * 100)`, rejects negative numbers, and returns `null` for any invalid reply.

R18. `lib/pricing/refresh.ts` exports `diffSource(sourceUrl, extracted)`. For each committed target
     with that `sourceUrl` (a competitor plan, or a cost item whose `plan` is compared by name), it
     matches an extracted plan by name, compared case-insensitively after collapsing whitespace. It
     returns one row per compared field (`monthlyFee`, `commissionBps`, `cardFee.bps`,
     `cardFee.fixed`) with `{ target, field, committed, suggested, change }`, where `change` is
     `"same"`, `"changed"`, or `"missing"` (no extracted plan of that name). One more row,
     `change: "new"`, is added for each extracted plan that matches no committed target.

R19. `lib/pricing-refresh-service.ts` exports `runPricingRefresh(vendorId, scope)`. For each source
     of `refreshSources(scope)`, with at most 4 in flight, it:
     1. fetches the page with a 10-second timeout and strips the HTML to text, truncated to 12,000
        characters;
     2. calls `createAiMeter(prisma, vendorId, "PRICING_REVIEW", plan).check()` and, if refused,
        marks this and every not-yet-started source `"budget-refused"` without calling the model;
     3. otherwise calls the Workers AI REST endpoint with the model `PRICING_REVIEW_AI_MODEL`
        (default `@cf/google/gemma-4-26b-a4b-it`), its `WORKERS_AI_MODEL_REQUEST_OPTIONS`, and a
        fixed prompt;
     4. calls `meter.record` with the reply's usage;
     5. returns per source `{ sourceUrl, status, rows }`, where `status` is `"read"`,
        `"unreachable"` (fetch failed or non-2xx), `"unparseable"` (`parseExtraction` returned
        `null`), `"budget-refused"`, or `"ai-unavailable"` (credentials missing or the AI call
        failed).
     It never calls `fetch` on a URL that is not in `refreshSources(scope)`, and it writes nothing
     except `AiUsageEvent` rows.

R20. The result of `runPricingRefresh(…, "all")` also carries `ifAccepted`: `buildPricingAnalysis`
     rerun after substituting exactly two kinds of `"changed"` row: a cost item's `monthlyFee` row
     (its suggested USD minor amount replaces `amountCents` when the item's `period` is `"month"`; the
     cost report is rebuilt), and the `cardFee` rows of the plan named by the card-fee assumptions'
     `derivedFrom` (replacing `card-fee-bps` / `card-fee-fixed-pence`). Other competitor rows change no
     figure the analysis reads and are listed only. The result also has `deltas` listing each plan
     whose `breakEvenVendors` or `breakEvenGmvPence` differs from the committed analysis, whether
     `ranking` changed, and whether `recommendationDisagrees` changed. It also carries `actions`, the
     rule-generated list built from exactly these rules, in order: one entry per `stale` item ("Re-verify
     …"); one per source whose `status` is not `"read"` ("Check … manually"); one per `"changed"` or
     `"new"` row ("Review … and update the registry by PR"); and, when `recommendationDisagrees` is
     true in `ifAccepted` or `recommendationOverdue` is true, "Revisit the business-model
     recommendation". When none apply, `actions` is exactly `["No action needed"]`.

R21. `lib/config.ts`'s AI schema gains the optional `PRICING_REVIEW_AI_MODEL` (non-empty string) in the
     same shape as `SEARCH_SYNONYM_AI_MODEL`. `prisma/schema.prisma`'s `AiFeature` enum gains
     `PRICING_REVIEW`, and `lib/repositories/ai-usage.ts`'s `AiFeature` type and `AI_FEATURES` gain it
     last. One new migration directory under `prisma/migrations/` contains only a header comment saying
     it was hand-authored and why (`#895`), and `-- AlterEnum` followed by
     `ALTER TYPE "AiFeature" ADD VALUE 'PRICING_REVIEW';`. The `FEATURE_LABELS` in
     `app/(admin)/staff/ai-usage/page.tsx` gives it the label "Pricing review".

R22. `app/(admin)/staff/platform/costs/actions.ts` begins with `"use server"`, exports only async
     functions, and exports `refreshCostsAction()` and `refreshRecommendationsAction()`. Each calls
     `requireVendorRole("ADMIN")`. If the result is not `ok` or its `via` is not `"platform-admin"`, it
     returns `{ ok: false, error: "Platform admin only" }` without calling `runPricingRefresh`.
     Otherwise it returns `{ ok: true, result }` from `runPricingRefresh(auth.vendorId, "costs")` or
     `(…, "all")`. Neither function accepts a URL argument.

R23. `components/staff/PricingReviewPanel.tsx` is a client component with buttons labelled
     "Refresh Costs" and "Refresh Recommendations". Each is disabled while its action is pending.
     After a run, the panel renders: per source, the source host and its `status` text; every `rows`
     entry labelled "Unconfirmed suggestion"; and, for "Refresh Recommendations", the `deltas`,
     `actions` and the committed `RECOMMENDATION.reviewedOn` labelled "Last analysis". It also
     renders the sentence "Suggestions are not saved. Accept one by updating the registry in a pull
     request.", and a "Download suggestions (CSV)" control that builds the CSV in the browser. No
     suggestion value is ever rendered inside a total, the scenario table or the ranking on the page.

## E. Export and print

R24. `app/(admin)/staff/platform/costs/export/route.ts` exports `GET` and `dynamic = "force-dynamic"`.
     For a platform admin and `section` in `costs`, `competitors`, `plans`, `scenarios`, `models` it
     returns 200 with `content-type` starting `text/csv` and a `content-disposition` attachment named
     `<section>-<YYYY-MM-DD>.csv`. Unauthenticated requests get 401 and authenticated non-platform-admins
     get 403, each with no CSV body. An unknown `section` gets 400. Money columns are minor units plus a
     `currency` column, never a formatted string. Every row has an `as_of` or `retrieved_on` column.
     A **text** cell starting with `=`, `+`, `-` or `@` is written with a leading `'`, and values are
     quoted per RFC 4180. Numeric cells are written as numbers, so a negative profit stays `-700`
     (amended at Build: prefixing numbers would turn data into text, and a number cannot carry a
     formula).

R25. The page renders a "Print / Save as PDF" button that calls `window.print()`. The page's buttons, the
     review panel, and the staff navigation rendered by `components/staff/PanelNav.tsx` carry the
     Tailwind `print:hidden` class.

## F. Quarterly review

R26. `scripts/pricing-review.ts` imports only the pure modules of R1, R5-R11 and R16. It writes to
     stdout a markdown body containing: the committed analysis date, the `stale` list (or "Nothing
     stale"), the `ownerToConfirm` list, each plan's break-even figures (or "No exchange rate"),
     whether the recommendation disagrees, whether it is overdue, and a link to
     `https://staging.aheedfoodcentre.nocaped.com/staff/platform/costs` with the instruction to press
     "Refresh Recommendations". It exits 0, and writes progress or errors only to stderr.

R27. `.github/workflows/pricing-review.yml` has `on.schedule` with exactly the cron `0 6 1 1,4,7,10 *`
     plus `workflow_dispatch`, and `permissions` of exactly `contents: read` and `issues: write`. It
     references no `secrets.` other than `GITHUB_TOKEN`. It runs `npm ci` and
     `npx tsx scripts/pricing-review.ts`, then creates an issue titled `Quarterly pricing review
     <YYYY>-Q<n>` with that output as its body, only if `gh issue list --state open --search` finds no
     open issue with that exact title.

## G. The page

R28. `app/(admin)/staff/platform/costs/page.tsx` keeps `#1295`'s R11 gate behaviour unchanged. Its
     metadata title and `h1` are "Costs, Pricing & Business Model". Under the heading it renders a
     `data-costs="advisory"` banner stating that everything on the page is advisory, that no figure is
     realised revenue because the platform has not traded, and that nothing here changes live prices.

R29. For a platform admin the page renders, in this order, sections with `data-section` set to
     `costs`, `competitors`, `pricing`, `profitability`, `models` and `review`. Each of the first five
     shows "Last updated" with the newest date in its registry and a count of its stale entries, and
     has a "Download CSV" link to the R24 route for its section (`pricing` links to `plans`, and
     `profitability` to `scenarios`).

R30. The `costs` section keeps every element `#1295`'s R12-R14 require (the totals and their values,
     one `data-costs-item` per registry item, now 17, the attention and renewal lists, the currency
     note). It groups items under three headings, "Platform running costs (fixed)", "Platform running
     costs (usage-based)" and "Development tools", each with its `byGroup` monthly and annual total.
     It lists the `ownerToConfirm` items under "Owner to confirm", and shows an item with
     `basis: "open-licence"` as "Free (open licence)" with a link to its licence page.

R31. The `competitors` section renders one `data-competitor="<id>"` element per competitor, grouped by
     segment. A `published` competitor shows each plan's figures with `formatMoney` or a percentage,
     the `sourceUrl` as a link, and `retrievedOn`. A `not-published` competitor shows "Not published by
     the provider", and a `not-readable` competitor shows "Pricing page could not be read". Neither of
     those shows any figure. A comparison table puts each proposed plan's fee and commission beside
     every published competitor plan's fee and commission, each in its own currency.

R32. The `pricing` section renders each proposed plan with a "Proposal" label, its fee via
     `formatMoney`, its commission as a percentage, its add-ons, its `positioning` and its `vatNote`.
     The `profitability` section renders: the exchange rate with its `asOf` and source link, or "No
     exchange rate: GBP figures unavailable"; each plan's break-even figures, rendering `null` as "Not
     applicable" or "Commission does not cover card fees"; a scenario table labelled "At zero sales";
     the sentence "Excludes the per-order card fee"; and both ranking lists. Every figure in it equals
     the corresponding `buildPricingAnalysis` output for the committed registries and `new Date()`.

R33. The `models` section renders one `data-model="<id>"` element per business model with its
     description, advantages, disadvantages, risks, and its representative plan's break-even figure
     or "Not modelled". The recommended model is marked "Recommended" with its reasoning,
     `reviewedOn` and `nextReviewDue`. A `data-costs="recommendation-disagrees"` warning is present
     exactly when `recommendationDisagrees` is true, and a `data-costs="recommendation-overdue"`
     warning exactly when `recommendationOverdue` is true.

R34. `components/staff/platform-nav-items.ts`'s `/staff/platform/costs` entry has the label
     "Costs, Pricing & Business Model" and a description naming costs, competitors and pricing. The
     entry is still the only place the href is registered, and `tests/staff-nav-parity.test.ts`,
     `tests/page-container.test.ts` and `tests/operator-doc-coverage.test.ts` pass.

R35. `docs/platform-admin-guide/platform-admin-guide.md`'s `/staff/platform/costs` section keeps the
     seven labelled parts, with version `1.4.0` and `updated` set to the slice's Build date. It
     describes each of the six sections, which file holds each registry and that updates are made by
     PR, what each refresh button does and that it saves nothing, that a refresh uses Workers AI
     allowance and is recorded as "Pricing review" against the signed-in host's store, CSV export and
     Print / Save as PDF, and the quarterly review issue. Every capability it states corresponds to a
     control or element in R22-R33.

## H. Boundaries

R36. This slice adds no dependency (`package.json` dependencies and devDependencies unchanged), no
     table and no column (the only `prisma/` changes are R21's enum value and its migration). Among the
     lines this slice adds under `lib/`, `app/`, `components/` and `scripts/`, `fetch(` appears only in
     `lib/pricing-refresh-service.ts`. The CSV route and both actions write
     nothing to the database apart from `AiUsageEvent` rows created through `meter.record`.

R37. Under `lib/pricing/`, every figure that can be checked (each competitor plan's money and bps, each
     `published-source` assumption) has a `sourceUrl` and a date. The Build notes contain a table with
     one row per competitor and assumption listing the URL read, the date, and whether it was readable,
     and they name the issue filed at Build for the Stripe architecture question (one platform account
     versus Connect, and who bears card fees; `plan.md` "Open items").

## I. Live behaviour

R38. Under `npm run preview`, signed in as a platform admin, `GET /staff/platform/costs` returns 200 and
     the HTML contains all six `data-section` values, 17 `data-costs-item` elements, 10
     `data-competitor` elements, 6 `data-model` elements, and `data-costs="advisory"`. Signed in as a
     vendor ADMIN who is not a platform admin, and unauthenticated, neither the page nor
     `/staff/platform/costs/export?section=costs` returns any of `data-section`, `data-competitor` or a
     CSV header row.

R39. Under `npm run preview`, signed in as a platform admin with the dev environment's Workers AI
     credentials present, pressing "Refresh Costs" renders a status for every source of
     `refreshSources("costs")`. Afterwards `/staff/ai-usage` shows a "Pricing review" row whose
     today-figure is above 0, unless every source's status was `"unreachable"` or
     `"ai-unavailable"`, which is recorded. No file under `lib/` changes as a result.

R40. After merge to `staging` and a successful `deploy-staging` (which applies the R21 migration), an
     unauthenticated `GET https://staging.aheedfoodcentre.nocaped.com/staff/platform/costs` does not
     return 200 with `data-section` in its body, and `/staff/platform/costs/export?section=costs`
     returns 401.

## Gates

R41. Unit tests exist and pass under `npx vitest run --maxWorkers=4`: `tests/running-costs.test.ts`
     (updated for R1-R4), `tests/pricing-registries.test.ts` (R5-R10, R37's structural part),
     `tests/pricing-analysis.test.ts` (R11-R16 including the R15 fixture verbatim),
     `tests/pricing-refresh.test.ts` (R17-R20 with injected fetch and AI doubles, including a reply
     that is not JSON, a negative number, a URL outside the allow-list never fetched, and a refused
     meter), `tests/pricing-actions.test.ts` (R22 for platform admin, vendor ADMIN, STAFF and
     unauthenticated), `tests/pricing-export-route.test.ts` (R24 including the injection prefix and
     the 401/403/400 cases), `tests/running-costs-page.test.tsx` (updated for R28-R33),
     `tests/pricing-review-panel.test.tsx` (R23), and `tests/pricing-review-workflow.test.ts`
     (R26-R27; it reads the workflow as text, because no YAML parser is a declared dependency and
     adding one would break R36; amended at Build).

R42. `CHANGELOG.md` updated (Gate 4), edited with the Edit tool (`grep -cP '\x08' CHANGELOG.md` prints 0).

R43. `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4`, `npm run format:check`,
     `npm run kms:validate`, `npm run kms:check-generated` and `npm run build` all pass, and so does a
     real Next build in `kms/site-internal` after `npm run kms:assemble:internal`. The PR's `gates`
     workflow is green.
