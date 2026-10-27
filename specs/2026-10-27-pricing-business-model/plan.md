---
id: pricing-business-model-plan
title: "Platform costs, competitor pricing, profitability and business models (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-27
visibility: internal
summary: "Extends /staff/platform/costs (#1295) into an advisory dashboard: grouped costs, sourced competitor pricing, proposed plans, break-even profitability, business models, AI refresh as unconfirmed suggestions, quarterly review issue, CSV/print export (#1309)."
tags: [spec, platform-admin, costs, pricing, business-model, workers-ai, staff-admin]
related: [running-costs-report-plan, platform-admin-guide, roadmap]
---

# Platform costs, competitor pricing, profitability and business models (plan)

Issue `#1309`. Gate 1 approved by the owner on 2026-10-27. Builds on `#1295`
(`specs/2026-10-27-running-costs-report/`), which shipped the read-only `/staff/platform/costs` page
and the `lib/running-costs.ts` registry.

**Goal:** one page where a platform administrator can see what the platform costs, what competitors
charge, what we could charge, whether that would cover the costs and at what scale, and which business
model fits best. Every figure says where it came from and how old it is. A missing figure shows as
missing, not as zero. The page is **advisory**. Nothing on it changes a price, a subscription, a
vendor's settings or any live behaviour.

## Owner decisions (Propose, 2026-10-27)

1. **One slice**, not phased. The owner accepted the larger review surface.
2. **Data stays in typed files in the codebase**, extending `#1295`'s "file, not table" decision. An
   administrator updates costs, competitor research, assumptions and proposed prices by editing those
   files and merging a PR. "Manual update" in the brief means exactly that. There is no editor UI.
3. **Refresh is AI-assisted and produces drafts only.** It fetches the pricing pages already named in
   the registries, asks Workers AI to extract figures, and shows the result as **unconfirmed
   suggestions** compared against the committed files. It writes nothing. Accepting a suggestion means
   copying it into the registry in a PR, so the committed files are always the verified state and the
   page's "last updated" dates are always the files' own dates.
4. **Competitor set:** store builders (Shopify, Wix, Square Online, Ecwid), marketplaces (Uber Eats,
   Deliveroo, Just Eat), a UK local-shop platform (Snappy Shopper), and a payment-only baseline
   (Stripe, SumUp).

## Two departures from the issue text, and why

- **One migration.** The issue says "no schema change". Workers AI calls are metered in
  `AiUsageEvent`, whose `feature` column is the Postgres enum `AiFeature`. A refresh that is not
  metered would be invisible to the shared free-tier cap (`lib/ai-meter.ts` fails closed for exactly
  this reason) and to the costs page's own "Workers AI used today" figure. That would be an odd result
  on a page about costs. So this slice adds **one enum value, `PRICING_REVIEW`**, in a hand-authored
  migration (`#895`: `migrate dev` refuses on dev). No table and no column are added. The usage is
  recorded against the vendor of the host the administrator is signed in on (`auth.vendorId`), because
  `AiUsageEvent.vendorId` is required. This means a refresh counts against that vendor's daily AI
  budget, and the guide says so.
- **The quarterly workflow does not call AI.** It runs the deterministic review (stale figures,
  analysis age, break-even, whether the recommendation still matches the numbers) and opens one issue
  that tells the owner to press **Refresh Recommendations** on the page. Running the AI extraction
  from GitHub Actions would need the Cloudflare credentials in a GitHub environment for an unattended
  job that reads untrusted web pages. The interactive button does the same work under a person's eyes.
  It needs no new secret: the workflow uses only `GITHUB_TOKEN`.

## What the repo told us at Spec (facts the requirements rely on)

- Workers AI is called over the Cloudflare REST API with `CLOUDFLARE_ACCOUNT_ID` and
  `CLOUDFLARE_API_TOKEN` (`lib/search-synonym-proposals.ts`, `lib/image-generation.ts`). There is no
  binding. Reply text and usage are read through `lib/workers-ai.ts`, and metering goes through
  `createAiMeter` (`lib/ai-meter.ts`), whose `check()` fails closed.
- **Stripe is one platform-level account** (`STRIPE_SECRET_KEY` in `lib/config.ts`; no Connect,
  `stripeAccount` or `application_fee` anywhere in `lib/` or `app/`). Under today's architecture, card
  fees on every vendor's orders are therefore a **platform** cost, and vendors' takings pass through the
  platform's account. That changes the business model: a commission or transaction-fee model is
  mechanically easy (the platform already holds the money), but card fees scale with every vendor's
  sales. The profitability model treats the card fee as a variable cost on GMV. The plan records the
  architecture question in "Open items" and does not resolve it.
- Postcode lookup is our own reference database (`uk-location-reference`, a separate Neon project) fed
  from OS OpenData by `.github/workflows/sync-reference-data.yml`, with no API key. Icons are
  open-source Iconify packages (`@iconify-json/*`) built into the bundle. Product and campaign images
  are generated by Workers AI (`flux-1-schnell`) and stored in R2, with Open Food Facts as a free data
  source. Claude and Gemini Pro are the owner's development tools; the repo holds no price for either.
- The platform has **never traded** (`#113`, `#104`), so no revenue, order count or GMV exists.
  Every revenue and profit figure is a **projection** and is labelled so.

## Scope (this slice)

### 1. Costs (`lib/running-costs.ts`, extended)

- Each item gains `group`: `"platform-fixed"` (a subscription or registration the platform needs to
  run), `"platform-usage"` (billed by use), `"dev-tools"` (used to build the platform, not to run
  it), and `reviewEvery`: `"month"` or `"quarter"`. A new `basis` value, `"open-licence"`, covers
  free, open-source data and assets, where the "price page" is a licence.
- New items from the brief's audit list (`requirements.md` R3 names them all): the postcode reference
  database, OS OpenData, Iconify icon sets, Open Food Facts, Claude and Gemini Pro. **The owner has
  stated no price for Claude or Gemini Pro**, so both are `unverified` with `amountCents: null`. The
  page lists them under "Owner to confirm", and no total includes them. Workers AI image generation is
  already the `workers-ai` item; its note says so rather than adding a duplicate row.
- `buildCostReport` gains per-group totals and a `stale` list: items whose `asOf` is older than their
  `reviewEvery` interval (month = 31 days, quarter = 92 days).

### 2. Competitors (`lib/pricing/competitors.ts`, new)

Ten competitors in four segments. Each has zero or more published plans with: monthly fee, setup fee,
commission (basis points), card or transaction fee (basis points plus fixed minor units), add-ons,
extra charges, headline features, the source URL and the date it was read. Money is integer minor
units with an explicit currency (`GBP` or `USD`). **Figures are researched at Build** from each
provider's own page, using the date it was read. Where a provider does not publish a figure (marketplace
commissions are often quoted per merchant), the competitor has `researchStatus: "not-published"` and
no invented plan. Where a page could not be read, the status is `"not-readable"`. A third-party article
is not a source.

### 3. Assumptions and proposed plans (`lib/pricing/assumptions.ts`, `lib/pricing/proposed-plans.ts`, new)

- **Assumptions** are the model's inputs, each with `value` (integer or `null`), `unit`, `basis`
  (`"owner"`, `"published-source"`, `"proposal"` or `"missing"`), a source URL when published, and
  `asOf`. Seed: the USD-per-GBP rate (published source, read at Build with URL and date), the Stripe UK
  standard card rate as the platform's variable cost (published source), and the scenario vendor
  counts `1, 5, 10, 25, 50` (basis `"proposal"`, because they are what-if inputs, not forecasts).
  **No GMV or order-count assumption is seeded**: none exists, so the model computes break-even GMV
  instead of assuming one.
- **Proposed plans** are our candidate prices (GBP pence), each marked as a proposal. There is one per
  viable model (subscription, commission, hybrid, freemium), and each names the competitor figures it
  is positioned against. They are recommendations written at Build from the competitor research.
  Nothing reads them outside this page.

### 4. Profitability (`lib/pricing/analysis.ts`, new, pure)

`buildPricingAnalysis(input, now)` converts the cost report into GBP pence at the dated FX rate. If
there is no rate, every cross-currency figure is `null`. For each proposed plan it computes:
- revenue per vendor per month: the fixed part, plus the commission rate applied to GMV, kept symbolic
  as a rate;
- break-even vendor count at zero GMV, for plans with a fixed fee;
- break-even platform GMV per month, for plans with a commission net of the card-fee cost;
- a scenario table over the seeded vendor counts: fixed revenue, platform cost, profit, and margin
  (margin is `null` when revenue is 0);
- a **ranking** of the plans by break-even vendor count. Plans with no fixed fee rank by break-even
  GMV in a separate list, because the two numbers are not comparable;
- `recommendationDisagrees`: true when the recommended model's representative plan is not first in
  its own list. When the numbers stop supporting the written recommendation, the page says so.

Rounding is stated once: every division rounds half up to whole pence, and break-even counts round
**up**.

### 5. Business models (`lib/pricing/business-models.ts`, new)

Six models: subscription, commission, freemium, transaction fee, usage-based and hybrid. Each has a
description, advantages, disadvantages and risks, and its representative proposed plan where one exists
(usage-based and transaction-fee have none, and say so). One `RECOMMENDATION` names the recommended
model with its reasoning, `reviewedOn` and `nextReviewDue` (`reviewedOn` plus 92 days). "Expected
profitability" for each model is the analysis output for its representative plan. A model with no
plan shows "Not modelled".

### 6. Refresh (`lib/pricing/refresh.ts` pure, `lib/pricing-refresh-service.ts` facade, `actions.ts`, client panel)

- **Sources are an allow-list**: the distinct `sourceUrl`s already in the registries (cost limits,
  competitor plans, assumptions). The action takes no URL from the request. That rules out SSRF and
  stops anyone from turning the button into an open fetcher.
- Per source: fetch with a 10-second timeout, strip the HTML to text, truncate to 12,000 characters,
  and send one Workers AI call with a fixed prompt asking for JSON of the published fees. The reply is
  validated with zod; anything invalid is "Could not read". The fetched page is untrusted input. The
  model has no tools, and its output only ever becomes a labelled suggestion, so a page that tries
  to steer the model can at worst produce a wrong suggestion. A human reviews every suggestion before
  any PR. At most 25 sources and 4 concurrent requests are processed per run, and the meter is checked
  before each AI call. A refused check stops the run and reports "AI budget reached" for the remaining
  sources.
- **Refresh Costs** covers the cost-limit sources. **Refresh Recommendations** covers every source,
  then recomputes the analysis with the suggested figures substituted ("if accepted") and shows what
  changed: suggested-vs-committed values, break-even and ranking deltas, whether the recommendation
  would now disagree, plus a list of recommended actions and the committed analysis date.
  Recommended actions are generated by fixed rules, not by AI: re-verify stale items, investigate
  unreadable sources, review changed figures by PR, and revisit the recommendation if it disagrees.
- The result lives only in the browser tab. Leaving the page discards it. The panel says so and offers
  the result as a CSV download.

### 7. Export and print

- `GET /staff/platform/costs/export?section=<costs|competitors|plans|scenarios|models>` returns
  `text/csv` for a platform admin, and 401/403 with no data otherwise. Values are minor units plus a
  currency column, so a spreadsheet never re-parses a formatted amount. Cells that start with `=`,
  `+`, `-` or `@` are prefixed with `'` to stop formula injection.
- PDF is the browser's own "Save as PDF". The page has a **Print / Save as PDF** button, and print
  styles hide the staff navigation, the buttons and the refresh panel. No PDF library is added.

### 8. Quarterly review

`.github/workflows/pricing-review.yml`: `schedule` at 06:00 UTC on 1 January, April, July and October,
plus `workflow_dispatch`, with `permissions: { contents: read, issues: write }`. It runs
`npx tsx scripts/pricing-review.ts`, which prints a markdown summary from the pure modules (no
database, no network, no AI). If no open issue has the same title, the workflow opens one with
`gh issue create`. Like every scheduled workflow, it does nothing until it reaches `main`.

### 9. The page

`/staff/platform/costs` keeps its gate, URL and nav entry, and gains sections in this order:
**Costs**, **Competitors**, **Proposed pricing**, **Profitability**, **Business models**, and the
**Review** panel with the refresh buttons. The heading becomes "Costs, Pricing & Business Model", and
the nav label in `PLATFORM_NAV_ITEMS` changes to match. Each section shows its own "last updated"
(the newest `asOf` or `retrievedOn` in it) and its stale count. A banner at the top states that
everything here is advisory and that no figure is realised revenue.

## Deliberately excluded

- **Editing from the UI**, and storing refresh results or analysis history in the database. These
  are owner decision 2. Analysis history is the git history of `lib/pricing/`.
- **Changing any live price, plan, Stripe configuration or vendor setting.** Nothing on the page writes.
- **AI-written recommendations or prose.** AI extracts numbers only. Recommendations and model
  write-ups are authored text in the registry, and the "actions" list is rule-based.
- **AI in the scheduled workflow** (see "Two departures").
- **Live provider usage pulls beyond Workers AI** (`#1297`), **alerts and expiry notices** (`#1296`),
  and the owner's data updates after the domain purchases (`#1298`).
- **GMV, order-count or vendor-count forecasts.** None exist, and inventing one is exactly what the
  brief forbids. The model reports thresholds (break-even) and what-if scenarios instead.
- **Resolving the Stripe architecture** (one platform account versus Stripe Connect) and VAT
  treatment of platform fees. These are surfaced as open items, not decided.
- **Per-vendor cost allocation** beyond dividing the platform cost by the scenario vendor count.

## Open items carried forward

- **Claude and Gemini Pro prices:** the owner must supply the plan and amount, then set
  `costStatus: "actual"`.
- **Stripe architecture:** a single platform account makes the platform the holder of every vendor's
  takings and the payer of every card fee. Whether to move to Stripe Connect, and who bears card fees,
  is an owner decision with legal and accounting weight. A new issue is filed at Build.
- **VAT:** proposed prices are shown excluding VAT, and the page says so. Whether the platform must
  register for VAT is not assessed.
- **#1196** (is the platform sold with inventory management?) may change which competitors are a
  fair comparison. The competitor registry has room for more entries.
- **#1289** (production down, Neon over quota): if the owner moves Neon to a paid plan, that is a cost
  change for the registry.
