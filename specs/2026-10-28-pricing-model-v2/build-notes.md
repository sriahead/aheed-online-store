# Pricing model v2: scaling costs, partner time, volume-linked models, add-ons and launch recommendation (build notes)

Issue `#1313`. Branch `feature/1313-pricing-model-v2`. It was cut from `docs/carry-forward-1309`, so
it also carries the unpushed Document commits for `#1295`, `#1305` and `#1309` (see
`docs/model-handoff.md`). Spec commit `b329c07`, implementation commit `98e5678`. Build date
**2026-10-28**. Orient, Propose, Spec and Build all ran in one Opus 5.5 context. Validation has not
started.

## What changed and why

**New pure modules under `lib/pricing/`:**

- `volume-model.ts` is the engine. It holds `PricingModelParams` (four kinds), `evaluate`,
  `driverMonthlyPence`, `cardFees`, `connectPence`, `partnerTimePence`, `partnerRateByYear`,
  `startupCosts`, `firstFreeTierLimit`, `breakEvenShopsForPayTarget`, `breakEvenShopsIncludingTime`
  and `vatThresholdShops`.
  - It imports nothing from React, so `components/staff/PricingWhatIf.tsx` runs the same functions
    in the browser.
  - Every search runs over shops 1..1000 (`MAX_SEARCH_SHOPS`).
- `cost-drivers.ts` holds the 18 production cost lines.
- `connect.ts` holds the two Stripe Connect UK options and `CONNECT_MODELLED`.
- `add-ons.ts` holds the 12 add-ons plus `addOnMarginBps` and `HIGH_MARGIN_BPS`.
- `risks.ts` holds the 11 required risks.

**Rewritten modules:**

- `assumptions.ts` has 16 ids, the new basis `"estimate"`, and three scenario grids;
  `SCENARIO_VENDOR_COUNTS` is gone.
- `business-models.ts` has 4 models, `COMPARATORS`, `comparatorShopPays` and the new
  `RECOMMENDATION`. `comparatorShopPays` lives here, not in `volume-model.ts`, because it needs
  `COMPETITORS` and the engine stays registry-free.
- `committed.ts`:
  - `Registries` now bundles every registry, including the recommendation, so a test can swap one.
  - `analyseV2` replaces `analyse`.
  - The staleness logic moved here from the deleted `analysis.ts`.
  - It adds `inputsFromRegistries`, `referenceScenario` and `recommendationDisagrees`.

**Deleted:** `lib/pricing/analysis.ts` and `lib/pricing/proposed-plans.ts` (R14).

**Moved onto `analyseV2`:**

- `refresh.ts`: `compareAnalyses` now returns `{ models, recommendationDisagreesChanged }` and the
  ranking concept is gone. `refreshSources` is untouched.
- `csv.ts`: seven sections; `plans` and `scenarios` now return 400.
- The export route.
- `scripts/pricing-review.ts`.
- `components/staff/PricingReviewPanel.tsx`: the deltas list.

**The page:**

- `app/(admin)/staff/platform/costs/page.tsx` renders nine sections.
- `components/staff/PricingDashboardSections.tsx` was rewritten:
  - `ProductionSection`, `ModelsSection` (with `ComparisonTable`), `AddOnsSection`, `RisksSection`
    and `RecommendationSection`;
  - `CompetitorsSection` without the 64-row table;
  - `pence()` and `describePricing()` are exported, and the tests reuse them so that formatting and
    figures are compared like-for-like.
- `components/staff/PricingWhatIf.tsx` is new. It is a client component with 8 inputs and no
  storage or request. Pounds and percentages are typed and multiplied by 100. An empty optional
  field (yearly increase, pay target) means `null`; any other empty, negative or non-numeric entry
  shows the error and turns the outputs into "—".
- `docs/platform-admin-guide/platform-admin-guide.md` is now version 1.5.0, with the costs section
  rewritten.

**The numbers at the reference scenario** (10 shops, 500 orders each, £25, 2026-10-28):

| Model | Shop pays / month | Our revenue / month | Our cost / month | Our margin / month |
|---|---|---|---|---|
| order bands | £376.50 | £790.00 | £1,016.98 | -£226.98 |
| allowance per order | £360.50 | £630.00 | £1,016.98 | -£386.98 |
| capped per order | £387.50 | £900.00 | £1,016.98 | -£116.98 |
| customer fee (recommended) | £314.75 | £1,650.00 | £1,016.98 | **£633.02** |

- **Cost split:** current fixed £5.37, production drivers £199.11 (Sentry, Resend Pro, Neon Launch
  and the business costs dominate), partner time **£812.50**.
- **Comparators** at 500 orders (£25): Shopify Basic £400.00, Grow £402.50, Square Free £300.00,
  Square Plus £320.00, Ecwid Starter £291.23, Uber Eats £1,625.00 (+ £650 one-off).
- **First free allowance to run out:** `r2-storage` at 10 shops (100 and 500 orders per shop);
  `email-transactional` (the Pro plan's 50,000) at 9 shops (2,000 orders).
- **Start-up one-off costs:** £600.

## Decisions taken during the build

- **The recommendation is `customer-fee`, not `order-bands`.** I drafted order bands first. The
  numbers then showed that every shop-paid model loses money at the reference scenario once partner
  time is included: two hours a month per shop at £25 an hour is £81 per shop. They also showed
  that `customer-fee` dominates every other model on both counts, so R21's rule would have flagged
  any other choice. The reasoning text says this plainly. The model cannot be collected until
  checkout supports it and Connect exists (`#1314`, `#1310`). The founding offer therefore charges
  Aheed nothing until then (£0 a month and a 25p fee once collectable), and order bands are named as
  the fall-back for shop two.
- **Prices were set by hand, not tuned to the disagreement rule.** The shop-paid models are priced to
  compete with Shopify and Square at a grocer's volume (£39/£79/£149 bands; £39 including 300
  orders then 12p; £15 plus 15p capped at £150; £15 plus a 30p customer fee). They were not raised
  until they covered partner time. That honestly shows they do not cover it at 120 minutes per shop.
- **Connect option modelled:** "Stripe handles pricing for your users", which has no platform fee and
  under which the shop bears card fees, refunds and chargebacks with direct charges. This matches the
  brief. The other option's £2 per active account plus 0.25% + 10p per payout is shown but not
  costed.
- **Neon production** is costed on the Launch plan, because the Free plan's 100 CU-hours ran out on
  2026-10-26 with no trading (`#1289`). The baseline is 150 CU-hours a month.
- **Email** is costed on Resend Pro (a fixed $20) from day one. The Free plan's 100 emails a day is
  reached at about 33 orders a day across all shops.
- **Error tracking** is costed at Sentry Team ($29). The free plan allows one user and there are two
  partners. Today's `/staff/errors` page sends no alerts.
- **SMS** has 0 usage in the base model and is costed only through the `sms-alerts` add-on.
- **`custom-domain` is "Included in" `customer-fee`**, the recommended model. Its packaging target is
  a model id; R17 allowed either a model id or a band label.
- **The `order-bands` bands carry a `label`.** R7 named only `upToOrders` and `monthlyFeePence`; the
  label is needed for display and for R17's packaging target. It is an extra field, not a different
  shape.
- **The What if panel clamps shops to at least 1**, so a typed 0 never divides by zero. 0 is accepted
  as input because R30 says "0 or more".
- **Partner time is the same at every order volume.** It depends only on shops, so the production
  section shows it once per shop count, not as a second 6×3 grid. R28 asked for a "Partner time line
  for the same grid"; this renders the six distinct values.
- **The comparison table uses the reference shop count (10)** for our models' shop totals. A shop's
  own total does not depend on the number of shops, so any count gives the same figures.

### Sources read at Build (R37, table 1)

All read on **2026-10-28** unless marked. Competitor plans and the exchange rate were not re-read:
they are `#1309`'s figures from 2026-10-27 and 2026-10-23, and this slice did not change them.

| Entry | URL | Readable | Figure taken |
|---|---|---|---|
| assumption `card-fee-eea-bps` | https://stripe.com/gb/pricing | yes | 2.5% + 20p |
| assumption `dispute-fee-pence` | https://stripe.com/gb/pricing | yes | £20.00 per dispute; original fees not returned on refund |
| driver `neon-production` (compute) | https://neon.com/pricing | yes | Launch $0.106 per CU-hour |
| driver `neon-production` (storage), `neon-dev-staging` | https://neon.com/pricing | yes | $0.35 per GB-month; Free: 100 CU-hours and 1 GB per project, 100 projects |
| driver `backups` | https://neon.com/pricing | yes | Launch: point-in-time restore up to 7 days, no separate charge |
| driver `workers-requests` | https://developers.cloudflare.com/workers/platform/pricing/ | yes | 10M requests a month included, then $0.30 per million |
| driver `workers-cpu` | same | yes | 30M CPU ms included, then $0.02 per million |
| driver `r2-storage` | https://developers.cloudflare.com/r2/pricing/ | yes | 10 GB-month free, then $0.015 per GB-month |
| driver `r2-operations` | same | yes | Class A $4.50 per million (1M free); Class B $0.36 per million (10M free) |
| driver `workers-ai` | https://developers.cloudflare.com/workers-ai/platform/pricing/ | yes | 10,000 neurons a day free, then $0.011 per 1,000; flux-1-schnell 4.80 per tile and 9.60 per step |
| driver `email-transactional` | https://resend.com/pricing | yes | Pro $20 a month for 50,000, then $0.90 per 1,000; Free 3,000 a month, 100 a day |
| driver `sms` | https://www.twilio.com/en-us/sms/pricing/gb | yes | $0.056 per UK message |
| driver `error-tracking` | https://sentry.io/pricing/ | yes | Team $29 a month billed monthly, 50k errors; Developer free with 1 user |
| driver `company-formation` | https://www.gov.uk/limited-company-formation/register-your-company | yes | £100 online |
| Connect `stripe-pricing` | https://stripe.com/gb/connect/pricing | yes | "Stripe handles pricing for your users": no platform or payout fees |
| Connect `platform-pricing` | same | yes | "You handle pricing for your users": £2 per monthly active account, 0.25% + 10p per payout (plus 0.25% funds routing, not modelled) |
| risk `vat-registration-threshold`, `vat-on-fees` | https://www.gov.uk/vat-registration/when-to-register | yes | Over £90,000 in 12 months, or expected in the next 30 days |
| risk `allergen-information` | https://www.gov.uk/government/publications/allergen-guidance-for-food-businesses/allergen-guidance-for-food-businesses | yes (food.gov.uk 301-redirects here) | 14 allergens, before purchase and at delivery |
| risk `refunds-and-disputes` cost | https://stripe.com/gb/pricing | yes | £20 per dispute |
| add-on `custom-domain` run cost | running-costs registry `domain-nocaped` (Cloudflare Registrar) | n/a | $10.46 a year, about 65p a month |
| add-on `ai-content`, `sms-alerts`, `marketing-emails` run costs | from the drivers above | n/a | see the drivers |
| **driver `ico-fee`** | https://ico.org.uk/for-organisations/data-protection-fee/ and `/how-much-is-the-fee/`, `/self-assessment/` | **no**: 404, or no amounts shown | none; it became an estimate |
| uptime (UptimeRobot) | https://uptimerobot.com/pricing/ | yes | Solo €12 a month; Free "for hobby and non-profit". Euro is not a registry currency, so it is an estimate |
| age-restricted guidance | https://www.gov.uk/government/publications/age-restricted-products, https://www.gov.uk/guidance/selling-alcohol-online | **no** (404) | none; the risk has `sourceUrl: null` |

### Estimates (R37, table 2)

| Entry | Value | Reasoning |
|---|---|---|
| `dispute-rate-bps` | 10 (0.1%) | Typical card-not-present rate for low-risk local retail; no trading data exists |
| `partner-minutes-per-shop-month` | 120 | Two hours a month of support, fixes and catalogue changes per trading shop. **The largest single input**; tracked monthly |
| `onboarding-minutes-per-shop` | 900 | 15 hours: setup, catalogue import and checks, training. Large catalogues buy the catalogue-setup add-on |
| `average-basket-pence` | 2500 | £25 from the brief's framing; the page also shows £15 and £40 |
| `payouts-per-shop-month` | 20 | About one per working day; matters only for the platform-pricing Connect option |
| Driver usage quantities | per note | Requests per order (80), CPU per request (15 ms), image GB per shop (1), Class B reads per order (20), neurons per shop (5,000), emails per order (3), Neon baseline 150 CU-hours, about 10 KB per order kept for 12 months |
| `uptime-monitoring` | £10 a month | €12 Solo plan, converted by estimate |
| `accountant` | £100 a month | Small limited company's accounts, confirmation statement and VAT returns |
| `ico-fee` | £52 a year | Tier 1 (micro) figure; **unverified**, because the ICO pages could not be read |
| `insurance-public-liability` | £120 a year | Two-person software business |
| `insurance-professional-indemnity` | £300 a year | Same |
| `legal-templates` | £500 one-off | Platform terms, privacy notice, data processing agreement |
| Add-on run costs marked estimate | per `derivation` | Partner minutes at £25 an hour, or a nominal infrastructure allowance |
| Risk costs (`customer-data-ownership` £52 a year, `out-of-hours-support` £25 a month) | per entry | The ICO estimate above; 60 partner minutes a month |

`#1317` asks the owner to replace these with real figures.

## Deviations from the spec

All of these are recorded in `requirements.md` as "amended at Build":

- **R4: 18 drivers, not 17.** The spec's own list named 18 (7 + 2 + 3 + 6); "17" was a counting
  error. R38's `data-cost-driver` count is 18, and `plan.md` and `validation.md` were corrected to
  match.
- **R3: `usage` is an array of parts.** Neon bills compute and storage separately, and R2 bills two
  operation classes. Each part is costed by R9's formula and summed. `firstFreeTierLimit` reports
  the part's `unit`.
- **R4: `ico-fee` is an estimate**, not published-source. Its pages could not be read, and R4's own
  rule ("any driver whose price could not be read ... is `estimate`") governs.
- **R17: `runCost` carries `driverId`, and each add-on carries `asOf`.** R22's add-on staleness needs
  the id, and R26's "newest `asOf`" for the add-ons section needs a date.

None of the following is an amendment, but it is worth knowing:

- **R7's `order-bands` bands have an extra `label`** (see Decisions).
- **R28's partner-time line** shows six values, not 18 (see Decisions).
- **R30: "Number of shops" of 0 is clamped to 1** (see Decisions).

## Known-shaky areas

- **R34 (phone layout) has not been measured.** The comparison block is three `table-fixed` tables of
  11 rows and 4 columns, with two inside closed `<details>`, and each sits in an `overflow-x-auto`
  wrapper. The production grid and the What if results table also scroll inside their wrappers. I
  expect `documentScrollWidth` to be at most 360 and the comparison height to be well under 1,600,
  but only `scripts/verify-mobile-layout.ts` under `npm run preview` proves it. The likeliest page
  overflow is the What if input grid (`sm:grid-cols-2` with long labels) or a long unbroken URL in a
  cost-driver note.
- **R38/R39 (preview and staging) have not been run.** The page has never rendered under
  `npm run preview` or on a Worker, only in jsdom.
  - Serialising `analysis.inputs` into the client component crosses the server/client boundary. It
    is plain data (numbers, strings, nested objects), but check for an RSC serialisation error in
    the preview log.
  - The dev database still lacks the `PRICING_REVIEW` migration (`#1309`'s known gap), which affects
    only the refresh, not this page.
- **R37's spot-check will find figures behind JavaScript-rendered pages** (Neon, Resend, Sentry).
  WebFetch read them, but a validator's `curl` may see an empty shell. Use a browser or WebFetch.
- **The disagreement rule is sensitive to the estimates.** Raising `partner-minutes-per-shop-month`
  far enough makes `customer-fee` lose money too, and the warning appears. That is intended, but a
  reviewer changing an estimate should expect it.
- **`tests/running-costs-page.test.tsx` pins the clock to 2026-10-27** for the `#1295` tests and to
  2026-10-28 for the dashboard tests. A future registry date edit will move several "Last updated"
  assertions.
- **`kms/site-internal` build (R42)** was not run in this context; the two-command check is
  Validate's.

## Validation record

**Pass 1, 2026-10-28, NOT independent.** It ran in the same Opus 5.5 context that built the slice:
the owner chose to validate in place rather than `/clear`. Commit under test: `692ed20`.

- **Pre-flight:** `npm run lint`, `npm run format:check` and `npx tsc --noEmit` exit 0.
  `npx vitest run --maxWorkers=4` gives 356 files and 5,046 tests passed. `npm run build` exits 0.
- **R1-R33, R35, R40 (unit and integration):** every named test file passes inside the full run
  above. The rows' extra reads and greps were done:
  - R7: the `Bps` matches are `ModelInputs` and comment lines only; `PricingModelParams` has none.
  - R14: both v1 files are absent, and nothing imports them.
  - R20: no `publicPrice` in `lib/pricing/business-models.ts`.
  - R25: the script exits 0, the body contains both "not set" lines, and stderr carries one progress
    line. The workflow has no diff against `origin/staging`.
  - R30's grep prints nothing.
  - R41: one `#1313` entry, and the backspace count is 0.
- **R2 and R36: pass in substance; spec-check defect.** Both rows grep `app/`, which includes the
  generated `app/(admin)/staff/runbook/docs.ts`.
  - That file embeds spec and handoff prose, so R2 matches the plan's own sentence about
    `SCENARIO_VENDOR_COUNTS`, plus the test that asserts its absence.
  - R36's count of added `fetch(` is 2: both lines are the handoff and roadmap prose inside
    `docs.ts`.
  - Excluding `docs.ts`, both are 0. This is the absence-grep trap `specs/sdd-workflow.md` already
    describes (the `#539` instance). The fix belongs in the spec's wording (exclude the generated
    file), not in the code.
- **R34: pass.** Measured under `npm run preview`, signed in as `demo-admin` through the script's own
  `--sign-in`, at 360 px:
  - `documentScrollWidth` is 360;
  - `[data-comparison]` height is 660 (limit 1,600);
  - `[data-section="competitors"]` height is 4,150, which is below 4,200 but only just.
  - **The third clause is weak.** The 4,200 px it compares against was `#1312`'s measurement of the
    comparison table alone, and the competitors section is now 4,150 px from its 10 cards without
    that table. The real improvement is the comparison block, roughly 4,200 to 660.
  - A `--header "cookie:..."` attempt silently measured `/login` (every selector `null`), the trap
    the script's own header comment describes. `--sign-in` is the working route.
- **R37: pass.** Both tables exist. Six published rows were re-read on 2026-10-28 and each figure was
  found as stated:
  - Neon (all five figures);
  - Workers (requests and CPU);
  - R2 (storage and Classes A/B);
  - Resend (Pro and Free);
  - Stripe Connect (both labels and the £2 / 0.25% + 10p figures);
  - Companies House (£100).
  - Companies House replaced the ICO row, because `ico-fee` is an estimate after the R4 amendment.
- **R38: pass**, under `npm run preview`. `demo-admin` gets 200 with all 9 `data-section` values, 17
  `data-costs-item`, 18 `data-cost-driver`, 4 `data-model`, 12 `data-add-on`, 3 `data-track`, 11
  `data-risk` and 10 `data-competitor` elements, and the advisory banner. `demo-store-admin` (a store
  ADMIN who is not a platform admin):
  - the page is 200 with "Platform admin only" and zero `data-section`/`data-model`;
  - the CSV gets 403 "Platform admin only".
  Unauthenticated: the page is 307 to `/login` with zero matches, and the CSV is 401. The admin's
  `models` CSV has 217 lines (a header plus 216). The preview log has no serialisation or render
  error.
- **R42: pass locally.** `npm run kms:assemble:internal` and
  `(cd kms/site-internal && npx next build --webpack)` both exit 0. `kms:validate` and
  `kms:check-generated` exit 0. The PR's `gates` result is still to come.
- **R30, live part: unverified.** Typing into the What if panel in a real browser, and watching the
  network panel, was not done; it would need a signed-in browser session. The component test drives
  real React change events (defaults, the empty optional inputs, recalculation equal to `evaluate`,
  the invalid-entry error and recovery), and the source grep shows no request or storage API. A
  manual check on staging is cheap.
- **R39: pending until Ship.** It needs `deploy-staging` first.

**Verdict: pass, with R39 pending and R30's live check unverified.** The spec-wording issues in R2,
R34 and R36 are recorded above rather than patched under `/fix`. None hides a defect in the artifact.
