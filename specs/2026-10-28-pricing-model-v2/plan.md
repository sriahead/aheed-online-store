---
id: pricing-model-v2-plan
title: "Pricing model v2: scaling costs, partner time, volume-linked models, add-ons and launch recommendation (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-28
visibility: internal
summary: "Reworks the advisory /staff/platform/costs dashboard (#1313): a production cost model over shops x orders x basket, partner time, Stripe Connect, four volume-linked pricing models, add-ons, a risks register, a launch recommendation and browser-only what-if inputs."
tags: [spec, platform-admin, costs, pricing, business-model, stripe-connect, staff-admin]
related: [pricing-business-model-plan, running-costs-report-plan, platform-admin-guide, roadmap]
---

# Pricing model v2: scaling costs, partner time, volume-linked models, add-ons and launch recommendation (plan)

Issue `#1313`. The owner approved Gate 1 on 2026-10-28. This builds on `#1309`
(`specs/2026-10-27-pricing-business-model/`), which turned `/staff/platform/costs` into an advisory
dashboard, and on `#1295`, which created the page and `lib/running-costs.ts`.

**Goal:** the two partners can see what the platform will cost **in production** as shops and
orders grow, what each candidate price costs a shop (including the shop's own card fees under Stripe
Connect), what we earn and keep after costs including our own time, how that compares with the
alternatives a shop actually has, and one recommended launch offer. Every figure says where it came
from. The page stays **advisory**: nothing on it changes a price, a subscription, a Stripe setting or
a store's settings.

## Why v1 has to be reworked, not extended

`#1309`'s model counts **vendors only**. It has no orders, no basket and no partner time, and it
treats card fees as **our** cost (one platform Stripe account, ADR-005). A council review of its
proposals found four problems, which the owner's brief (2026-10-28, recorded on `#1313`) accepts:

1. One platform account taking money for vendors' sales is a legal and Stripe-terms risk. The model
   now **assumes Stripe Connect**, with each shop as the seller paying its own card fees.
2. The 20p per-order card fee was left out of every figure. On a small grocery basket it is larger
   than a 1% margin.
3. Partner time, support, refunds, disputes, VAT and production infrastructure were all priced at 0.
4. "Growth" cost a small shop more than Square Online Free, and the comparison named only Shopify.

None of these can be fixed by adding rows. The break-even-by-vendor-count engine
(`lib/pricing/analysis.ts`) and its four percentage-based plans (`lib/pricing/proposed-plans.ts`)
are **replaced** by a volume model. The parts that still hold are kept: the costs registry and its
section, the competitor registry, the refresh, CSV export, print, and the quarterly workflow.

## Owner decisions

From Propose (2026-10-28):

1. **One slice**, covering all five sections of the brief.
2. **What-if inputs on the page.** The rate, yearly increase, hours, pay target, basket, orders and
   shop count are input boxes that recalculate **in the browser** and save nothing (no request, no
   storage). Their defaults come from the committed files, which remain the only source of truth.
   `#1309`'s owner decision 2 still holds: registries are files, edited by PR.
3. **`#1312` item 3 (phone layout) is folded in**, because this slice changes the comparison table
   anyway. Items 1 and 2 (refresh name matching and noise) stay on `#1312`.
4. **Partner rate: £25 an hour in year one, rising every year.** The owner gave neither the yearly
   increase nor the partners' monthly pay target. Both are committed as `missing` (no value). The
   page shows "Enter a value" until someone types one, and the figures that depend on them are
   unavailable rather than 0.

From the brief:

- **Stripe Connect is a planning assumption.** It changes neither ADR-005 nor any payment code; the
  decision itself stays on `#1310`, where the brief has been recorded.
- UK pounds, **excluding VAT**, said on the page. The 20p per order appears wherever card fees do.
- Every price comes from the provider's own pricing page, with its URL and the date it was read, or is
  marked `estimate`.

## What the repo told us at Spec

- `lib/pricing/money.ts` already has `Money`, `roundHalfUp`, `formatMoney`, `gbp`, `usd`,
  `formatBps`. `lib/pricing/committed.ts` bundles the registries so the page, CSV route, refresh and
  quarterly script compute from the same inputs. Keep both patterns.
- The competitor registry already holds Shopify Basic (£25) and Grow (£65), Square Online Free and
  Plus, four Ecwid plans and Uber Eats Self-Delivery (13% and a £650 activation fee), all read on
  2026-10-27. **The comparisons reuse these plans by name** instead of retyping figures.
- `lib/pricing/refresh.ts`'s `ifAccepted` reruns `analyse()`. That call has to move to the new model,
  so `deltas` change shape (see Scope 8).
- `scripts/verify-mobile-layout.ts` prints `documentScrollWidth` and, with `--measure`, element
  boxes. The phone requirements are measured with it, not inferred from classes.
- `tests/vendor-neutral-copy.test.ts` walks `.tsx` files and a few named `lib` modules. A shop name in
  a `lib/pricing/*.ts` registry, rendered from data, is outside its reach and correct for a
  platform-admin page. No `.tsx` file may contain a vendor's name as a literal.
- Transactional email is configured through `RESEND_*` (`lib/config.ts`; see `#1299`), so the email
  cost driver is priced from Resend's page.

## Scope (this slice)

### 1. Assumptions (`lib/pricing/assumptions.ts`, extended)

`AssumptionBasis` gains `"estimate"`: our own figure, with no published source. The new ids are partner
time (rate, yearly increase, minutes per shop per month, onboarding minutes, amortisation months, pay
target), the average basket (£25, estimate), dispute fee and dispute rate, the EEA card rate (shown in
notes, not computed), the payouts per shop per month, and the **reference scenario** (10 shops × 500
orders a month at the default basket), which the page uses for its headline figures and for the
disagreement check. Partner time is in **minutes**, so every value stays an integer.
`SCENARIO_VENDOR_COUNTS` becomes three grids: shops `1, 5, 10, 25, 50, 100`, orders `100, 500,
2000`, baskets `£15, £25, £40`.

### 2. Production cost drivers (`lib/pricing/cost-drivers.ts`, new)

`lib/running-costs.ts` stays "what we pay **now**" and keeps its section. The new registry describes
what each cost will be **in production as it scales**. One formula covers every usage cost:

```
units = baseUnits + shops * perShopUnits + shops * ordersPerShop * perOrderUnits
cost  = fixed monthly part + max(0, units - freeUnits) * price.minor / price.perUnits
```

A fixed cost has no usage, an annual cost is divided by 12, and a one-off cost goes to "start-up
costs" instead of the monthly figure. USD is converted to pounds per driver at the dated exchange
rate. Usage quantities (requests per order, MB per shop, emails per order and so on) are always our
estimates. The note on each driver says so, even when the unit price is published.

Seventeen drivers, in five groups:

- **infrastructure**: Neon production, Neon dev and staging, Workers requests, Workers CPU, R2
  storage, R2 operations, Workers AI;
- **messaging**: transactional email, SMS;
- **operations**: error tracking, uptime monitoring, backups;
- **business**: company formation, accountant, ICO fee, public liability insurance, professional
  indemnity insurance, legal templates.

The provider for error tracking, uptime and SMS is chosen at Build. The choice must have a readable
UK or USD price page, or the driver is an `estimate` with a note. If backups are included in the Neon
plan, the driver costs 0 and its note names the plan feature. The current fixed bill (the costs
section's `withPlanned` monthly total) is added to every scenario as one line, so domains and Workers
Paid are not counted twice.

### 3. Stripe Connect (`lib/pricing/connect.ts`, new)

Two options read from Stripe's UK Connect pricing page: the one where Stripe charges the shop
directly (no platform fee) and the one where the platform handles pricing (a fee per monthly active
account and per payout). The model computes the platform's Connect cost for the option named in
`CONNECT_MODELLED`, and the page shows both options side by side, saying which one has no platform
fees. Stripe's own names for the options are used as read at Build. Under the modelled option, card
fees, refunds and disputes fall on the shop. The risks register explains this in plain English.

### 4. The volume model (`lib/pricing/volume-model.ts`, new, pure)

`evaluate(scenario, inputs)` returns, for one model at one (shops, orders, basket):

- what the shop pays a month: the platform fee, its own card fees (`orders × 20p + card % × charge`),
  its expected dispute fees, and the total. For the customer-fee model, the customer's per-order fee
  is shown on its own, and card fees are charged on the basket plus that fee;
- our revenue, and our cost split into current fixed, production drivers, Connect, business and
  partner time;
- our margin in total, per shop and in basis points.

Around it: `firstFreeTierLimit` (for each order volume, which driver's free allowance runs out first
and at how many shops), `breakEvenShopsForPayTarget` (the fewest shops whose revenue minus non-people
costs covers the partners' monthly pay target, searching 1 to 1,000), `breakEvenShopsIncludingTime`,
`vatThresholdShops` (the fewest shops at which our annual fee revenue exceeds £90,000), and
`partnerRateByYear` (years 1 to 3). Rounding is half up to whole pence for each money figure. Every
shop count rounds **up**.

The model has **no percentage of sales anywhere in our own pricing.** That is the brief's constraint
for thin-margin grocers. Percentages appear only in card fees and in competitors' prices.

### 5. Business models (`lib/pricing/business-models.ts`, rewritten)

There are exactly four models, each with a priced `pricing` proposal:

| id | Shape |
|---|---|
| `order-bands` | Tiered monthly fee by monthly orders (for example up to 300, 1,000 and 3,000), with a pence fee per order above the top band. |
| `allowance-per-order` | A flat fee that includes N orders, then a fixed pence fee per order. |
| `capped-per-order` | A low fee plus a pence fee per order, capped each month. |
| `customer-fee` | A low fee for the shop, plus a fixed service fee per order that the customer pays at checkout and the platform keeps. |

Prices are set at Build from the numbers. The `COMPARATORS` list names the competitor plans each
model is compared with: Shopify Basic and Grow, Square Online Free and Plus, Ecwid (one plan), Uber
Eats Self-Delivery, and "Do nothing". It also says how each one's card fees are counted: from its own
plan, at Stripe's standard rate where the plan brings none (Ecwid), or included in the commission (Uber
Eats). One-off setup fees are shown beside the monthly figure and never folded into it.

### 6. Add-ons (`lib/pricing/add-ons.ts`, new)

There are twelve add-ons: custom domain, AI product photos and descriptions, catalogue setup (one-off),
extra staff accounts, SMS order alerts, marketing emails, loyalty and rewards, driver app or route
planning, POS or stock sync, analytics reports, priority support, and multi-branch. Each has a price
(monthly, one-off or per use), our running cost (a provider unit price × stated usage, or partner
minutes × the default rate, with its basis), whether it is included in a tier or sold separately, and
its class. The class is **`cheap-high-margin` exactly when the computed margin is 70% or more**, and
`usage-heavy` otherwise. An add-on the platform cannot deliver today (for example a driver app or
POS sync) is marked `available: false` and says so. Its price is still shown, as a proposal.

### 7. Risks (`lib/pricing/risks.ts`, new)

This is the brief's "what we are missing", as a register. It has at least these entries: VAT on our
fees, the £90,000 VAT registration threshold, weighed items and substitutions (authorise-then-capture,
partial refunds), allergen information, age-restricted items (`#1200`), domain ownership, customer-data
ownership, delivery liability, out-of-hours support, refunds and disputes under Connect, and card
payments under one platform account (ADR-005, `#1310`). Each entry has who bears it, a cost where one
can be stated (published or estimate), a plain-English action, a source (gov.uk, ico.org.uk,
food.gov.uk, stripe.com) where one exists, and related issues.

### 8. Recommendation, disagreement and refresh

`RECOMMENDATION` names one of the four models (its `pricing` **is** the public price list for shop
number two onwards), the launch add-on set, a dated **founding-partner offer** for the first client
with a review clause, exactly three metrics to track monthly (cost per order, partner minutes per
shop, margin per shop), what would change the recommendation, its reasoning, `reviewedOn` and
`nextReviewDue`.

`recommendationDisagrees` is now true when, at the reference scenario, the recommended model **loses
money** (including partner time at the year-one rate), **or another model is better on both counts**
(higher margin for us *and* lower total cost for the shop). The page warns when that happens. The
refresh's "if accepted" rerun moves to this model, and `deltas` list each model whose reference
margin or shop total changes, plus whether `recommendationDisagrees` changes. The refresh source list
is unchanged: adding the new registries' pages to it belongs with `#1312`.

### 9. The page

The sections, in order (`data-section`): `costs` (unchanged), `production`, `competitors`, `models`,
`what-if`, `add-ons`, `risks`, `recommendation`, `review`. `#1309`'s `pricing` and `profitability`
sections are removed, and their content moves into `models` and `production`. The competitors
section keeps its per-competitor cards but **loses the 64-row comparison table**. Its replacement is
a compact `data-comparison` table in `models`: one row per model and comparator, one column per
order volume, at £25, with the £15 and £40 tables in closed `<details>`. That is the phone-layout fix,
and it is **measured** at 360 px.

### 10. CSV, the quarterly script, the guide

The CSV sections become `costs`, `competitors`, `production`, `models`, `comparison`, `add-ons`
and `risks`. `plans` and `scenarios` are removed and return 400. `models` is the full grid: 4 models
× 6 shop counts × 3 order volumes × 3 baskets. `scripts/pricing-review.ts` prints the v2 figures,
while `.github/workflows/pricing-review.yml` is unchanged. Version 1.5.0 of the platform admin guide
describes the new sections and the what-if panel.

## Deliberately excluded

- **Any change to payments.** There is no Connect onboarding, no `application_fee`, no
  authorise-then-capture and no customer service fee at checkout. These are modelled and described,
  not built. The ADR-005 decision stays on `#1310`.
- **Changing a live price, subscription or store setting**, or billing any shop.
- **Saving what-if values** anywhere (database, `localStorage`, URL). Owner decision 2.
- **`#1312` items 1 and 2** (refresh name aliases, null-vs-0 noise, billing period), and adding the
  new registries' URLs to the refresh's source list.
- **Live usage pulls** from Neon, R2, Resend or Stripe (`#1297`) and alerts (`#1296`). Usage
  quantities stay estimates.
- **A forecast.** The scenario grids are what-ifs (`basis: "proposal"`), not a prediction of how many
  shops or orders there will be. The platform has never traded (`#113`, `#104`).
- **VAT registration advice** beyond stating the published threshold and when the model crosses it.
  This is not tax or legal advice, and the risks register says to take advice.
- **EEA card mix in the totals.** The EEA rate is recorded and named in notes. The totals use the UK
  rate, as stated on the page.
- **Refund fee loss as a number.** It is explained in the risks register (Stripe does not return the
  card fee on a refund), but not modelled, because there is no refund rate to use.

## Open items carried forward

- **Partner rate yearly increase and pay target:** owner to supply. Until then they are `missing`,
  and the page and quarterly issue say so.
- **`#1310`:** Connect decision (which option, and the VAT treatment of our fees).
- **`#1289`:** the Neon plan the owner buys to bring production back is the first real production
  cost. When it is known, `neon-production`'s figures become `actual` in `lib/running-costs.ts`.
- **Accountant and insurance prices** will be `estimate` until the owner has quotes.
- **`#1196`, `#1199`, `#1200`:** inventory, VAT per product and age-restricted lines. These are
  referenced from the risks register, not resolved.
