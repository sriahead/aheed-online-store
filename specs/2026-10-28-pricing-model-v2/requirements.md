# Pricing model v2: scaling costs, partner time, volume-linked models, add-ons and launch recommendation (requirements / acceptance criteria)

Issue `#1313`. This builds on `#1309` (`specs/2026-10-27-pricing-business-model/`) and `#1295`.
In one line: the advisory `/staff/platform/costs` page replaces its vendor-count break-even model
with a volume model (shops × orders × basket) that prices production infrastructure, Stripe Connect,
business costs and partner time. It compares four volume-linked pricing models (no percentage of
sales) with the alternatives a shop has, and adds an add-on catalogue, a risks register, a launch
recommendation, and what-if inputs that recalculate in the browser and save nothing. Read `plan.md`
for the reasoning, the owner decisions and the exclusions.

Terms used below:
- **Pure module**: as `#1309` defines it. It has no `"use client"`/`"use server"` directive, imports
  nothing from `react`, `next/*`, `@/lib/db`, `@/lib/config` or `@prisma/*`, and calls no `fetch(`.
- **Round half up**: `roundHalfUp` from `lib/pricing/money.ts`, applied to a non-negative value. A
  negative value is negated, rounded, and negated back.
- **Date**: a `YYYY-MM-DD` string. **Build date**: the date of the slice's first implementation
  commit.
- **Platform admin**: a session for which `requireVendorRole("ADMIN")` returns `ok` with
  `via: "platform-admin"`.
- **Published-source entry**: a registry entry with `basis: "published-source"`. Its `sourceUrl` is an
  `https://` URL on the provider's own domain or a subdomain of it, and every non-null figure it
  states appears on that page as read on its date.
- **Reference scenario**: `reference-shops` shops × `reference-orders-per-shop` orders a month at
  `average-basket-pence`, from R1.

## A. Assumptions and grids (`lib/pricing/assumptions.ts`)

R1. `lib/pricing/assumptions.ts` remains a pure module. `AssumptionBasis` is exactly
    `"owner" | "published-source" | "proposal" | "estimate" | "missing"`. `ASSUMPTIONS` holds exactly
    these ids, with these `basis` and `value` (`*` means the value is set at Build from the source):
    - `usd-cents-per-gbp`: published-source, `*` (as `#1309`)
    - `card-fee-bps`: published-source, 150
    - `card-fee-fixed-pence`: published-source, 20
    - `card-fee-eea-bps`: published-source, `*`
    - `dispute-fee-pence`: published-source, `*`
    - `dispute-rate-bps`: estimate, `*`
    - `partner-hourly-rate-pence`: owner, 2500, `asOf` 2026-10-28
    - `partner-rate-yearly-increase-bps`: missing, `null`
    - `partner-pay-target-pence`: missing, `null` (both partners together, per month)
    - `partner-minutes-per-shop-month`: estimate, `*`
    - `onboarding-minutes-per-shop`: estimate, `*`
    - `onboarding-amortisation-months`: proposal, 12
    - `average-basket-pence`: estimate, 2500
    - `payouts-per-shop-month`: estimate, `*`
    - `reference-shops`: proposal, 10
    - `reference-orders-per-shop`: proposal, 500

    Each published-source entry has `sourceUrl` on `stripe.com` (or, for the exchange rate, the
    central-bank domain `#1309` used). The rules of `#1309`'s R8 still hold: `basis: "missing"`
    exactly when `value` is `null`, and `sourceUrl` non-null exactly when `basis` is
    `"published-source"`. Every `value` is an integer or `null`.

R2. `lib/pricing/assumptions.ts` exports `SCENARIO_SHOPS = [1, 5, 10, 25, 50, 100]`,
    `SCENARIO_ORDERS = [100, 500, 2000]` and `SCENARIO_BASKETS_PENCE = [1500, 2500, 4000]`, each
    with a doc comment stating `basis: "proposal"`. `SCENARIO_VENDOR_COUNTS` is no longer exported.

## B. Cost drivers and Connect

R3. `lib/pricing/cost-drivers.ts` (pure) exports `COST_DRIVERS`. Each driver has `id`, `name`,
    `provider`, `group` (`"infrastructure" | "messaging" | "operations" | "business"`), `fixed`
    (`{ amount: Money, period: "month" | "year" }` or `null`), `oneOff` (`Money` or `null`), `usage`
    (`null` or an array of parts `{ unit, baseUnits, perShopUnits, perOrderUnits, freeUnits, price: {
    minor, perUnits, currency } }`, where every number is at least 0, `perUnits` is a positive
    integer, and `minor` is an integer; amended at Build: Neon bills compute and storage separately
    and R2 two operation classes, so one driver can have more than one part, each costed by R9 and
    summed), `basis` (`"published-source" | "estimate"`), `sourceUrl`, `asOf` and
    `note`. At least one of `fixed`, `oneOff` or `usage` is non-null. A driver with non-null `usage`
    has a `note` stating that its usage quantities are estimates.

R4. `COST_DRIVERS` holds exactly these 18 ids (amended at Build: the list below always named 18;
    "17" was a counting error), in these groups:
    - `infrastructure`: `neon-production`, `neon-dev-staging`, `workers-requests`, `workers-cpu`,
      `r2-storage`, `r2-operations`, `workers-ai`
    - `messaging`: `email-transactional`, `sms`
    - `operations`: `error-tracking`, `uptime-monitoring`, `backups`
    - `business`: `company-formation`, `accountant`, `ico-fee`, `insurance-public-liability`,
      `insurance-professional-indemnity`, `legal-templates`

    The 7 `infrastructure` drivers and `email-transactional` are published-source.
    `company-formation` is published-source with a `sourceUrl` on `gov.uk`. (Amended at Build:
    `ico-fee` was to be published-source on `ico.org.uk`, but on 2026-10-28 one ICO fee page returned
    404 and the other showed no amounts, so by the rule in the next sentence it is an `estimate`.) `company-formation` and `legal-templates` have a non-null `oneOff` and
    a `null` `fixed`. Any driver whose price could not be read from a provider page is `estimate`
    with a `null` `sourceUrl` and a note saying why.

R5. `lib/pricing/connect.ts` (pure) exports `CONNECT_OPTIONS`, with exactly two entries
    (`id` `"stripe-pricing"` and `"platform-pricing"`). Each has `stripeName` (Stripe's own label as
    read at Build), `platformFee` (`null`, or `{ activeAccountPence, payoutBps, payoutFixedPence }`),
    `whoBearsCardFeesAndDisputes` (`"shop" | "platform"`), `sourceUrl` on `stripe.com` and
    `retrievedOn`. `"stripe-pricing"` has `platformFee: null`. It also exports
    `CONNECT_MODELLED`, one of the two ids.

R6. `lib/pricing/money.ts` exports `toPence(money, usdCentsPerGbp)`. For GBP it returns `minor`; for
    USD it returns `roundHalfUp(minor * 100 / usdCentsPerGbp)`, or `null` when `usdCentsPerGbp` is
    `null` or not above 0.

## C. The volume model (`lib/pricing/volume-model.ts`)

R7. `lib/pricing/volume-model.ts` is a pure module. It exports `PricingModelParams`, a union
    discriminated on `kind`:
    - `{ kind: "order-bands", bands: { upToOrders, monthlyFeePence }[], abovePerOrderPence }`.
      Bands are ascending by `upToOrders`. The fee is the first band with `upToOrders >= orders`;
      above the last band it is that band's fee plus `(orders - lastUpToOrders) * abovePerOrderPence`.
    - `{ kind: "allowance-per-order", monthlyFeePence, includedOrders, perOrderPence }`: the fee is
      `monthlyFeePence + max(0, orders - includedOrders) * perOrderPence`.
    - `{ kind: "capped-per-order", monthlyFeePence, perOrderPence, capPence }`: the fee is
      `monthlyFeePence + min(orders * perOrderPence, capPence)`.
    - `{ kind: "customer-fee", monthlyFeePence, customerFeePerOrderPence }`: the shop's fee is
      `monthlyFeePence`, and the platform also receives `orders * customerFeePerOrderPence`.

    No variant has a field whose name ends in `Bps` or contains `percent` or `commission`.

R8. `evaluate(scenario, model, inputs)`, with `scenario = { shops, ordersPerShop, basketPence }`,
    returns:
    - `shopPays` (per shop, per month): `platformFeePence` (R7); `cardFeesPence =
      ordersPerShop * cardFeeFixedPence + roundHalfUp(ordersPerShop * chargePence * cardFeeBps /
      10000)`, where `chargePence` is `basketPence`, plus `customerFeePerOrderPence` for
      `customer-fee`; `disputeFeesPence = roundHalfUp(ordersPerShop * disputeRateBps * disputeFeePence
      / 10000)`; `totalPence`, the sum of those three; and `customerPaysPerOrderPence` (0 except for
      `customer-fee`).
    - `revenuePence` (all shops): `shops * platformFeePence`, plus `shops * ordersPerShop *
      customerFeePerOrderPence` for `customer-fee`.
    - `cost`: `currentFixedPence` (the costs registry's `withPlanned.monthlyCents` through
      `toPence`); `driversPence` (the sum over every driver of R9's monthly cost); `connectPence`
      (R10); `partnerTimePence` (R11); and `totalPence`, the sum of all four. Startup one-off costs
      are excluded.
    - `marginPence = revenuePence - cost.totalPence`; `marginPerShopPence = roundHalfUp(marginPence
      / shops)`; `marginBps`, computed by `#1309`'s R13 sign rule, or `null` when `revenuePence` is 0.

    When `usd-cents-per-gbp` is `null`, every value that depends on a USD figure is `null`, and so is
    every sum that contains one.

R9. A driver's monthly cost in its own currency is `fixedMonthly + usageCost`. `fixedMonthly` is
    `fixed.amount.minor` for `period: "month"`, `roundHalfUp(minor / 12)` for `"year"`, or 0.
    `usageCost` is `roundHalfUp(max(0, units - freeUnits) * price.minor / price.perUnits)`, with
    `units = baseUnits + shops * perShopUnits + shops * ordersPerShop * perOrderUnits`. The result is
    converted with `toPence` once per driver. `startupCosts(drivers, fx)` returns the sum of every
    `oneOff` in pence.

R10. `connectPence` is 0 when the modelled option's `platformFee` is `null`. Otherwise it is
     `shops * (activeAccountPence + payoutsPerShopMonth * payoutFixedPence + roundHalfUp(ordersPerShop
     * basketPence * payoutBps / 10000))`.

R11. `partnerTimePence = roundHalfUp(shops * (partnerMinutesPerShopMonth + onboardingMinutesPerShop /
     onboardingAmortisationMonths) * partnerHourlyRatePence / 60)`, or `null` when the rate is
     `null`. `partnerRateByYear(rate, increaseBps)` returns three entries for years 1, 2 and 3:
     `roundHalfUp(rate * (1 + increaseBps / 10000) ^ (year - 1))`. When `increaseBps` is `null`,
     year 1 is `rate` and years 2 and 3 are `null`.

R12. The module exports these four search functions. Each searches `shops` from 1 to 1,000 inclusive
     and returns `null` when no count in that range qualifies:
     - `firstFreeTierLimit(drivers, ordersPerShop)` returns `{ driverId, shops }`, the lowest
       `shops` at which a driver's `units` exceeds its `freeUnits`, among drivers with `usage` and
       `freeUnits > 0`. Ties are broken by driver id.
     - `breakEvenShopsForPayTarget(...)` returns the lowest `shops` with `revenuePence -
       (currentFixedPence + driversPence + connectPence) >= partnerPayTargetPence`. It returns `null`
       without searching when the target is `null`.
     - `breakEvenShopsIncludingTime(...)` returns the lowest `shops` with `marginPence >= 0`.
     - `vatThresholdShops(...)` returns the lowest `shops` with `12 * revenuePence > 9000000`.

R13. Worked fixture, asserted verbatim in `tests/pricing-volume-model.test.ts`:
     - **Inputs.** `usd-cents-per-gbp` 125. `currentFixed` is 0. Card fee 150 bps + 20p. Dispute
       rate 10 bps, dispute fee 2000. Partner rate 2500, 120 minutes per shop per month, 720
       onboarding minutes amortised over 12 months. Connect `platformFee: null`.
     - **Drivers.** `D1`: `fixed` 500 USD cents a month, `usage` `{ baseUnits 0, perShopUnits 0,
       perOrderUnits 10, freeUnits 10000, price { minor 50, perUnits 1000, USD } }`. `D2`: `fixed`
       12000 GBP pence a year. `D3`: `oneOff` 5000 GBP pence.
     - **Scenario.** 2 shops, 1,000 orders each, basket 2000.
     - **Model A** (`allowance-per-order`, 1000 / 300 / 5).
       - `shopPays`: `platformFeePence` 4500, `cardFeesPence` 50000, `disputeFeesPence` 2000,
         `totalPence` 56500.
       - `revenuePence` 9000.
       - `driversPence` 1800 (D1 800, D2 1000), `partnerTimePence` 15000, `cost.totalPence` 16800.
       - `marginPence` -7800, `marginPerShopPence` -3900, `marginBps` -8667.
       - `startupCosts` 5000.
     - **Model B** (`customer-fee`, 500 / 50).
       - `cardFeesPence` 50750, `shopPays.totalPence` 53250.
       - `revenuePence` 101000, `marginPence` 84200.
     - **Other model kinds**, at 1,000 orders:
       - `capped-per-order` 500 / 10 / 3000 gives `platformFeePence` 3500.
       - `order-bands` `[{300, 1500}, {1000, 3000}, {3000, 6000}]` above 2 gives 3000, and 7000
         at 3,500 orders.
     - **Connect.** `platformFee` `{ 200, 25, 10 }` with 4 payouts gives `connectPence` 10480.
     - **Search functions, Model A.**
       - `firstFreeTierLimit`: `D1` at 2 shops for 1,000 orders, 11 shops for 100 orders and 1 shop
         for 2,000 orders.
       - `breakEvenShopsForPayTarget` (target 100000, 1,000 orders, basket 2000): 25.
       - `vatThresholdShops`: 167.
     - **Partner rate.** `partnerRateByYear(2500, 1000)` gives `[2500, 2750, 3025]`;
       `partnerRateByYear(2500, null)` gives `[2500, null, null]`.
     - **No exchange rate.** With `usd-cents-per-gbp` `null`: `driversPence`, `cost.totalPence` and
       `marginPence` are `null`, and `shopPays.totalPence` is still 56500.

## D. Business models and comparisons (`lib/pricing/business-models.ts`)

R14. `lib/pricing/business-models.ts` (pure) exports `BUSINESS_MODELS`, with exactly 4 ids:
     `order-bands`, `allowance-per-order`, `capped-per-order` and `customer-fee`. Each has a `name`,
     a `description`, non-empty `advantages`, `disadvantages` and `risks` arrays, `pricing` (a
     `PricingModelParams` whose `kind` equals the id), `status: "proposal"`, and a `vatNote` stating
     that prices exclude VAT. Every pence value in `pricing` is a non-negative integer. The
     `order-bands` pricing has at least 3 bands. `lib/pricing/proposed-plans.ts` and
     `lib/pricing/analysis.ts` no longer exist, and no file under `lib/`, `app/`, `components/`,
     `scripts/` or `tests/` imports either path.

R15. It exports `COMPARATORS`, one entry per comparison with `id`, `label` and a `source`. `source`
     is `{ competitorId, planName, cardFees: "plan" | "stripe-standard" | "included" }`, or
     `{ kind: "do-nothing" }`. The entries are, exactly: Shopify `Basic` and `Grow`, Square Online
     `Free` and `Plus`, Ecwid `Starter` (with `cardFees: "stripe-standard"`), Uber Eats
     `Self-Delivery` (with `cardFees: "included"`), and `do-nothing`. Every `{ competitorId,
     planName }` names a plan that exists in `COMPETITORS`.

R16. `comparatorShopPays(comparator, scenario, inputs)` returns `{ monthlyPence, setupPence }` per
     shop:
     - `monthlyPence` is the plan's `monthlyFee` through `toPence`, plus
       `roundHalfUp(ordersPerShop * basketPence * commissionBps / 10000)` when `commissionBps` is
       non-null, plus card fees: the plan's own `cardFee` for `"plan"`, R8's formula for
       `"stripe-standard"`, or 0 for `"included"`.
     - `setupPence` is the plan's `setupFee` through `toPence`, or 0.
     - `do-nothing` gives `{ 0, 0 }`.

     Fixture: a GBP plan of 2500 with `cardFee` 200 bps + 25p, at 1,000 orders and basket 2000,
     gives `monthlyPence` 67500. A plan with commission 1300 and `"included"` gives 260000, with a
     `setupFee` of 65000 giving `setupPence` 65000.

## E. Add-ons (`lib/pricing/add-ons.ts`)

R17. `lib/pricing/add-ons.ts` (pure) exports `ADD_ONS` with exactly these 12 ids: `custom-domain`,
     `ai-content`, `catalogue-setup`, `extra-staff-accounts`, `sms-alerts`, `marketing-emails`,
     `loyalty`, `driver-routing`, `pos-stock-sync`, `analytics-reports`, `priority-support` and
     `multi-branch`. Each has:
     - `name` and a `price` (`{ pence, billing: "month" | "one-off" | "per-use", unit }`, where `pence`
       is a positive integer);
     - a `runCost` (`{ pence, basis: "published-source" | "estimate", driverId, derivation }`),
       where `derivation` is a string naming what it is computed from and `driverId` is the cost
       driver it comes from, or `null` (amended at Build: R22's add-on staleness needs the id);
     - `packaging` (`"separate"`, or `{ includedIn: <a BUSINESS_MODELS id or band label> }`);
     - `available` (boolean), and a `note` that is non-empty when `available` is `false`;
     - `marginClass`;
     - `asOf`, a date (amended at Build: R26's "newest `asOf`" for this section needs one).

     `catalogue-setup` has `billing: "one-off"`.

R18. `addOnMarginBps(addOn) = roundHalfUp((price.pence - runCost.pence) * 10000 / price.pence)` (with
     R8's sign rule). For every add-on, `marginClass` is `"cheap-high-margin"` exactly when
     `addOnMarginBps >= 7000`, and `"usage-heavy"` otherwise. No add-on has a negative margin.

## F. Risks (`lib/pricing/risks.ts`)

R19. `lib/pricing/risks.ts` (pure) exports `RISKS`. Its ids include at least: `vat-on-fees`,
     `vat-registration-threshold`, `weighed-items-substitutions`, `allergen-information`,
     `age-restricted-items`, `domain-ownership`, `customer-data-ownership`, `delivery-liability`,
     `out-of-hours-support`, `refunds-and-disputes` and `card-payments-merchant-of-record`. Each entry
     has:
     - `title`;
     - `summary` (a non-empty string of at most 400 characters);
     - `whoBears` (`"platform" | "shop" | "customer" | "shared"`);
     - `cost` (`null`, or `{ pence, period, basis: "published-source" | "estimate", sourceUrl }`);
     - `action` (non-empty);
     - `sourceUrl` (`https://` or `null`);
     - `asOf`;
     - `issues` (an array of issue numbers).

     `vat-registration-threshold` has a `sourceUrl` on `gov.uk` and its summary names £90,000.
     `age-restricted-items` lists 1200 in `issues`, and `card-payments-merchant-of-record` lists 1310.
     `refunds-and-disputes` names who bears disputes under the `CONNECT_MODELLED` option.

## G. Recommendation (`lib/pricing/business-models.ts`)

R20. `RECOMMENDATION` has:
     - `modelId` (one of R14's ids);
     - `launchAddOnIds` (a non-empty subset of R17's ids);
     - `foundingOffer`: `{ shopName, pricing, startsOn, reviewOn, terms, reviewClause }`, where
       `pricing.kind` equals `modelId`, `reviewOn` is after `startsOn` and at most 365 days after it,
       and `terms` and `reviewClause` are non-empty;
     - `trackMonthly`: exactly 3 entries with ids `cost-per-order`, `partner-minutes-per-shop` and
       `margin-per-shop`, each with a non-empty `definition` and `rePriceWhen`;
     - non-empty `changeTriggers` and `reasoning`;
     - `reviewedOn` (the Build date), and `nextReviewDue`, which is `reviewedOn` plus 92 days.

     The public price list for shop number two onwards is `BUSINESS_MODELS[modelId].pricing`. There
     is no second copy of it.

R21. `lib/pricing/committed.ts` exports `analyseV2(registries, now)`, which returns:
     - `reference`: R8's `evaluate` for every model at the reference scenario;
     - `grid`: R8 for every model × `SCENARIO_SHOPS` × `SCENARIO_ORDERS` × `SCENARIO_BASKETS_PENCE`;
     - `comparisons`: R16 for every comparator × `SCENARIO_ORDERS` × `SCENARIO_BASKETS_PENCE`, with
       `reference-shops`;
     - `firstLimits`: R12 for each of `SCENARIO_ORDERS`;
     - `startupPence`;
     - `vatThresholdShops`, `breakEvenForPayTarget` and `breakEvenIncludingTime` for each model at
       the reference orders and basket;
     - `partnerRates`;
     - `recommendationDisagrees`;
     - `recommendationOverdue` (as `#1309`'s R16);
     - `stale`.

     `recommendationDisagrees` is true exactly when, at the reference scenario, the recommended
     model's `marginPence` is below 0, or some other model has both a higher `marginPence` and a
     lower `shopPays.totalPence`. It is false when the recommended model's `marginPence` is `null`.
     A unit test proves both branches with the R13 fixture: recommending A gives `true`, because B
     dominates it, and recommending B gives `false`.

R22. `stale` keeps `#1309`'s R16 entries and adds `{ registry, id }` for:
     - every cost driver whose `asOf` is older than 92 days (`registry: "cost-drivers"`);
     - every add-on whose `runCost` is published-source and whose underlying driver is stale
       (`"add-ons"`);
     - every risk whose `asOf` is older than 92 days (`"risks"`);
     - every Connect option whose `retrievedOn` is older than 92 days (`"connect"`).

## H. Refresh, CSV, quarterly script

R23. `lib/pricing/refresh.ts` keeps `#1309`'s R17-R20 except for these changes:
     - `ifAccepted` is `analyseV2` rerun with the same two substitutions (a cost item's monthly fee,
       and the card-fee assumptions from the `derivedFrom` plan);
     - `deltas` lists each model whose reference `marginPence` or `shopPays.totalPence` differs from
       the committed `analyseV2`, plus whether `recommendationDisagrees` changed;
     - `refreshSources` returns the same URLs as before this slice for both scopes.

     `tests/pricing-refresh.test.ts` asserts that a suggested `card-fee-bps` change moves every
     model's reference `shopPays.cardFeesPence`.

R24. `GET /staff/platform/costs/export` keeps `#1309`'s R24 access rules (401, 403 and 400, the
     injection prefix, minor units plus a `currency` column, and RFC 4180 quoting). The accepted
     `section` values are exactly `costs`, `competitors`, `production`, `models`, `comparison`,
     `add-ons` and `risks`; `plans` and `scenarios` now return 400. For the committed registries:
     - `models` has exactly 216 data rows (4 × 6 × 3 × 3), with the columns `model`, `shops`,
       `orders_per_shop`, `basket_pence`, `shop_pays_pence`, `revenue_pence`, `cost_pence`,
       `partner_time_pence`, `margin_pence` and `as_of`;
     - `production` has 54 rows (6 × 3 × 3), one per scenario, with the cost split of R8;
     - `comparison` has one row per comparator × order volume × basket.

R25. `scripts/pricing-review.ts` imports only pure modules. It writes to stdout a markdown body
     containing:
     - the committed analysis date, and the `stale` list or "Nothing stale";
     - each model's reference `marginPence` and `shopPays.totalPence`, or "No exchange rate";
     - "Partner pay target not set" when `partner-pay-target-pence` is `null`, and "Yearly rate
       increase not set" when `partner-rate-yearly-increase-bps` is `null`;
     - whether the recommendation disagrees, and whether it is overdue;
     - `#1309`'s staging link and instruction.

     It exits 0, and writes progress or errors only to stderr. `.github/workflows/pricing-review.yml`
     is unchanged by this slice.

## I. The page

R26. `app/(admin)/staff/platform/costs/page.tsx` keeps:
     - `#1295`'s gate (a redirect to `/login` on 401, and `PanelRefusal` for everyone who is not a
       platform admin);
     - the "Costs, Pricing & Business Model" title and `h1`;
     - the `data-costs="advisory"` banner, whose text now also states that prices exclude VAT and
       that Stripe Connect is a planning assumption.

     For a platform admin it renders these `data-section` values in this order: `costs`,
     `production`, `competitors`, `models`, `what-if`, `add-ons`, `risks`, `recommendation`,
     `review`. It renders no `data-section="pricing"` and no `data-section="profitability"`. Each
     section except `what-if` and `review` shows "Last updated" and a stale count, and has a
     "Download CSV" link to its R24 section (`recommendation` links to `models`).

     "Last updated" is:
     - for `production`, the newest of the cost drivers' `asOf` and the Connect options'
       `retrievedOn`;
     - for `add-ons` and `risks`, the newest `asOf` in that registry;
     - for `models` and `recommendation`, `RECOMMENDATION.reviewedOn`;
     - for `costs` and `competitors`, as in `#1309`.

R27. The `costs` section is unchanged from `#1309` (its R30, with 17 `data-costs-item` elements).

R28. The `production` section renders:
     - a table with one row per `SCENARIO_SHOPS` value and one column per `SCENARIO_ORDERS` value, at
       `average-basket-pence`. Each cell is a `data-production-cell="<shops>-<orders>"` showing our
       monthly cost excluding partner time, and the cost per order;
     - a "Partner time" line for the same grid, at the year-1 rate;
     - one `data-first-limit="<orders>"` line per order volume, naming the driver and the shop count,
       or "No free allowance runs out below 1,001 shops";
     - the start-up one-off total;
     - both `CONNECT_OPTIONS` side by side, marking the one with no platform fee and the one modelled;
     - one row per `COST_DRIVERS` entry (`data-cost-driver="<id>"`) with its price, its free allowance,
       its source link and date, or "Estimate".

R29. The `models` section renders:
     - one `data-model="<id>"` per business model, with its prices, advantages, disadvantages, risks,
       its reference-scenario figures (shop pays, our revenue, cost, margin, margin per shop), and
       its break-even shops for the pay target (or "Enter a pay target in What if"), break-even
       including partner time, and VAT-threshold shops (each `null` shown as "More than 1,000
       shops");
     - a `data-comparison` element containing one table at £25 (open), and £15 and £40 tables each
       inside a closed `<details>`. Each table has one row per model and per comparator and one column
       per `SCENARIO_ORDERS` value, showing the shop's monthly total (the platform fee plus card fees
       plus disputes for our models; R16 for comparators), with any `setupPence` shown in the same
       cell as "+ £N one-off".

     Every figure equals `analyseV2(COMMITTED, new Date())`. The words "Includes the shop's own card
     fees (1.5% + 20p per order, UK cards)" appear in the section, with the percentage and pence
     values rendered from the assumptions.

R30. The `what-if` section renders `components/staff/PricingWhatIf.tsx`, a client component with
     labelled numeric inputs:
     - "Partner hourly rate (£)", "Yearly rate increase (%)", "Partner minutes per shop per month",
       "Onboarding minutes per new shop", "Partners' monthly pay target (£, both partners)";
     - "Average basket (£)", "Orders per shop per month" and "Number of shops".

     Each input's initial value comes from the committed assumption, or from `reference-shops` and
     `reference-orders-per-shop`. An assumption whose value is `null` starts empty, with the
     placeholder "Enter a value". On every valid change the component recomputes, with R8, R11 and
     R12 in the browser, one row per model (shop pays, revenue, cost, margin), the break-even shops
     for the pay target ("Enter a pay target" while it is empty), and the partner rate for years 1-3
     ("Enter a yearly increase" for years 2-3 while that is empty). A negative or non-numeric entry
     shows "Enter a number of 0 or more" beside that input, and the outputs show "—" until it is
     corrected. The component file contains no `fetch(`, `localStorage`, `sessionStorage`,
     `document.cookie`, `useRouter` or `"use server"` import, and the section states "These figures
     are not saved".

R31. The `add-ons` section renders one `data-add-on="<id>"` per add-on with:
     - its price and billing, our running cost and its basis, and the margin as a percentage;
     - "Cheap to run, high margin" or "Usage-heavy: priced to cover use";
     - `Included in <model name>` or "Sold separately", and "Not available yet" when `available` is
       `false`;
     - "In the launch set" for the ids in `RECOMMENDATION.launchAddOnIds`.

R32. The `risks` section renders one `data-risk="<id>"` per risk with its title, summary, who bears
     it, its cost (or "No figure"), action, source link and issue links. The `recommendation` section
     renders:
     - the recommended model and its public prices;
     - the founding-partner offer (shop name, prices, `startsOn`, `reviewOn`, terms and review clause);
     - the launch add-ons;
     - the three `data-track="<id>"` metrics, and the change triggers;
     - the reasoning, `reviewedOn` and `nextReviewDue`.

     A `data-costs="recommendation-disagrees"` warning is present exactly when
     `recommendationDisagrees` is true, and `data-costs="recommendation-overdue"` exactly when
     `recommendationOverdue` is true.

R33. The `competitors` section keeps one `data-competitor="<id>"` per competitor, as `#1309`'s R31,
     but no longer renders the proposed-plan × competitor-plan comparison table.

R34. Phone layout, measured under `npm run preview` as a platform admin by
     `scripts/verify-mobile-layout.ts --widths 360` against `/staff/platform/costs`:
     - `documentScrollWidth` is at most 360;
     - the `[data-comparison]` box's `height` is at most 1,600;
     - the `[data-section="competitors"]` box's `height` is below the 4,200 px that `#1312` measured
       for the comparison table alone.

     A wide table may scroll inside its own `overflow-x-auto` wrapper.

R35. `docs/platform-admin-guide/platform-admin-guide.md` is version `1.5.0`, with `updated` set to the
     Build date. Its `/staff/platform/costs` section describes each R26 section, which file holds each
     registry (`cost-drivers.ts`, `connect.ts`, `business-models.ts`, `add-ons.ts`, `risks.ts`,
     `assumptions.ts`), that the what-if inputs are not saved, that the figures assume Stripe Connect
     and exclude VAT, and the new CSV sections. Every capability it states corresponds to a control
     or element in R26-R34. `tests/operator-doc-coverage.test.ts` passes.

## J. Boundaries

R36. This slice adds no dependency (the `package.json` dependencies and devDependencies are
     unchanged). It adds nothing under `prisma/` and changes no file under `lib/payments*`,
     `lib/stripe*`, `app/api/` or `app/(storefront)/`. Among the lines it adds under `lib/`, `app/`,
     `components/` and `scripts/`, `fetch(` appears in none.

R37. Every published-source entry added or changed by this slice (assumptions, cost drivers,
     Connect options, risk costs, add-on run costs, competitor plans) has a `sourceUrl` and a date. The
     Build notes contain a table with one row per such entry: the URL, the date read, whether it was
     readable, and the figure taken. They also contain a second table, one row per `estimate`, with
     the reasoning behind its number.

## K. Live behaviour

R38. Under `npm run preview`, signed in as a platform admin, `GET /staff/platform/costs` returns 200.
     The HTML contains:
     - all nine `data-section` values;
     - 17 `data-costs-item`, 18 `data-cost-driver`, 4 `data-model`, 12 `data-add-on` and 3
       `data-track` elements;
     - at least 11 `data-risk` elements, and 10 `data-competitor` elements;
     - `data-costs="advisory"`.

     Signed in as a vendor ADMIN who is not a platform admin, and unauthenticated, neither the page
     nor `/staff/platform/costs/export?section=models` returns any of `data-section`, `data-model`
     or a CSV header row.

R39. After the merge to `staging` and a successful `deploy-staging`:
     - an unauthenticated `GET https://staging.aheedfoodcentre.nocaped.com/staff/platform/costs` does
       not return 200 with `data-section` in its body;
     - `/staff/platform/costs/export?section=models` returns 401.

## Gates

R40. Unit tests exist and pass under `npx vitest run --maxWorkers=4`:
     - `tests/pricing-volume-model.test.ts` (R6-R13, R16 and R18, with the R13 and R16 fixtures
       verbatim);
     - `tests/pricing-registries.test.ts` (rewritten for R1-R5, R14, R15, R17 and R19-R20, plus the
       structural part of R37);
     - `tests/pricing-analysis.test.ts` (rewritten for R21-R22);
     - `tests/pricing-refresh.test.ts` (R23), `tests/pricing-export-route.test.ts` (R24) and
       `tests/pricing-review-workflow.test.ts` (R25);
     - `tests/running-costs-page.test.tsx` (R26-R29 and R31-R33);
     - `tests/pricing-what-if.test.tsx` (R30: defaults, an empty `missing` input, an invalid entry,
       and an output that equals `evaluate`).

R41. `CHANGELOG.md` is updated (Gate 4) with the Edit tool, so `grep -cP '\x08' CHANGELOG.md` prints
     0.

R42. All of these pass: `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4`,
     `npm run format:check`, `npm run kms:validate`, `npm run kms:check-generated` and
     `npm run build`. So does a real Next build in `kms/site-internal` after
     `npm run kms:assemble:internal`. The PR's `gates` workflow is green.
