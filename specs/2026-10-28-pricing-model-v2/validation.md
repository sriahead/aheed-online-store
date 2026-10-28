# Pricing model v2: scaling costs, partner time, volume-linked models, add-ons and launch recommendation (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice is a pure calculation engine plus one admin page. It needs no database change and no
payment change, and it makes no network call of its own. The risk is concentrated in three places:

- **The arithmetic.** It is covered by hand-computed fixtures (R13, R16) asserted verbatim.
- **The honesty of the inputs.** Every published figure must really be on its source page (R37),
  and every estimate must be labelled.
- **The page.** It must render the engine's own numbers (R29), save nothing (R30), stay gated (R38,
  R39) and fit a phone (R34).

1. **Unit**: the volume model, registries, analysis, refresh, CSV and what-if component.
2. **Integration**: the page rendered with the real registries and compared with `analyseV2`, and the
   export route.
3. **System**: `npm run preview` as a platform admin and as a non-admin, the phone measurement, and the
   staging gate after deploy.
4. **Regression**: `#1309`'s costs section, refresh, print and quarterly workflow keep working.
5. **Security and accessibility**: the gate on the page and CSV, no new fetch, and labelled inputs.

## Setup for the live rows

- **Preview, not dev.** Use `npm run preview` (`npm run dev` cannot load the WASM Prisma engine).
  Before starting it, check `DIRECT_URL` and `DATABASE_URL` **one at a time**, and print the host
  only (see `CLAUDE.md`, Config & secrets).
- **Accounts.** The platform admin and vendor ADMIN demo accounts, and the password in `.dev.vars`,
  are in `docs/developer-portal/local-dev-playbook.md`. Sign in with `curl` as that playbook
  describes, keeping a cookie jar per account.
- **Git Bash.** Prefix commands with `MSYS_NO_PATHCONV=1` wherever an argument starts with `/`, and do
  not use `curl -o /dev/null` (`CLAUDE.md`, Windows shell).
- **Stopping preview.** Kill the whole `node`/`workerd` chain when you are done.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/pricing-registries.test.ts --maxWorkers=4` passes. Read `lib/pricing/assumptions.ts`: the ids are exactly the 16 listed, with `partner-hourly-rate-pence` = 2500 (`owner`, `asOf` 2026-10-28), `partner-rate-yearly-increase-bps` and `partner-pay-target-pence` both `null`/`missing`, `average-basket-pence` = 2500 (`estimate`), `reference-shops` 10 and `reference-orders-per-shop` 500. |
| R2  | Unit | Same test file. `grep -rn "SCENARIO_VENDOR_COUNTS" lib app components scripts tests` prints nothing. |
| R3  | Unit | Same test file asserts the shape, including that every driver with `usage` has a note containing the word "estimate". |
| R4  | Unit | Same test file asserts the 17 ids and groups, and which drivers are published-source. Then read `lib/pricing/cost-drivers.ts` and confirm every `estimate` driver's note says why. |
| R5  | Unit | Same test file. Then open `CONNECT_OPTIONS`' `sourceUrl` in a browser and confirm the `platform-pricing` fee figures appear on it. |
| R6  | Unit | `npx vitest run tests/pricing-volume-model.test.ts --maxWorkers=4` covers `toPence` for GBP, USD, a `null` rate and a 0 rate. |
| R7  | Unit | Same file covers each `kind`. `grep -nE "Bps\|percent\|commission" lib/pricing/volume-model.ts` may match only the card-fee input names and comments, never a field of `PricingModelParams`. Read the type to confirm. |
| R8  | Unit | Same file: R13's Model A and Model B fixture values. |
| R9  | Unit | Same file: D1 = 800, D2 = 1000, D3 excluded from monthly cost and counted in `startupCosts` = 5000. |
| R10 | Unit | Same file: `connectPence` = 10480 for the fee option and 0 for `null`. |
| R11 | Unit | Same file: `partnerTimePence` = 15000; `partnerRateByYear` `[2500, 2750, 3025]` and `[2500, null, null]`. |
| R12 | Unit | Same file: first limits 2, 11 and 1; pay-target break-even 25 and `null` for a `null` target; VAT threshold 167; a case where nothing qualifies within 1,000 returns `null`. |
| R13 | Unit | Every number in R13 appears as a literal expectation in `tests/pricing-volume-model.test.ts`: `grep -cE "56500\|50000\|2000\|9000\|1800\|15000\|16800\|-7800\|-3900\|-8667\|5000\|50750\|53250\|101000\|84200\|3500\|3000\|7000\|10480\|25\|167\|2750\|3025" tests/pricing-volume-model.test.ts` is non-zero. Read the test to confirm each one is asserted against the named output, not just present. |
| R14 | Unit | `npx vitest run tests/pricing-registries.test.ts --maxWorkers=4`. `test ! -e lib/pricing/proposed-plans.ts && test ! -e lib/pricing/analysis.ts` exits 0. `grep -rnE "pricing/(proposed-plans\|analysis)['\"]" lib app components scripts tests` prints nothing. |
| R15 | Unit | Same file asserts the 7 comparators and that each `{ competitorId, planName }` resolves. |
| R16 | Unit | `tests/pricing-volume-model.test.ts`: 67500, 260000 and `setupPence` 65000; `do-nothing` gives 0 and 0. |
| R17 | Unit | `tests/pricing-registries.test.ts` asserts the 12 ids, their shape, and that every `available: false` entry has a note. |
| R18 | Unit | Same file recomputes every add-on's margin and checks its `marginClass` and that no margin is negative. |
| R19 | Unit | Same file asserts the 11 required ids, the 400-character cap, the `gov.uk` source and £90,000 for the threshold, and the `1200` and `1310` links. Then read `refunds-and-disputes` and confirm it names who bears disputes under the modelled Connect option. |
| R20 | Unit | Same file: `nextReviewDue` = `reviewedOn` + 92 days, the `foundingOffer` date rules, exactly three `trackMonthly` ids, and that `launchAddOnIds` resolve. `grep -n "publicPrice" lib/pricing/business-models.ts` prints nothing, because the list is not duplicated. |
| R21 | Unit | `npx vitest run tests/pricing-analysis.test.ts --maxWorkers=4` passes. It includes the two-branch disagreement test (A gives `true`, B gives `false`) and a `null`-FX case that gives `false`. |
| R22 | Unit | Same file: with `now` 93 days after the Build date, every new registry contributes entries under its `registry` name. |
| R23 | Unit | `npx vitest run tests/pricing-refresh.test.ts --maxWorkers=4` passes, including a card-fee change that moves every model's reference `cardFeesPence`, and `refreshSources` output equal to a literal URL list copied from `#1309`'s committed registries. |
| R24 | Integration | `npx vitest run tests/pricing-export-route.test.ts --maxWorkers=4` passes, with 216 `models` rows, 54 `production` rows, 400 for `plans` and `scenarios`, and the 401/403/injection cases. |
| R25 | Unit / System | `npx tsx scripts/pricing-review.ts > out.md 2> err.txt; echo $?` prints 0. `out.md` contains "Partner pay target not set" and "Yearly rate increase not set". `git diff --stat origin/staging -- .github/workflows/pricing-review.yml` prints nothing. |
| R26 | Integration | `npx vitest run tests/running-costs-page.test.tsx --maxWorkers=4` asserts the section order, the absence of `pricing` and `profitability`, and the banner's VAT and Connect sentences. |
| R27 | Regression | Same file: `#1309`'s costs-section assertions still pass unchanged, and there are 17 `data-costs-item` elements. |
| R28 | Integration | Same file: 18 `data-production-cell` elements, 3 `data-first-limit` elements, 17 `data-cost-driver` elements, and both Connect options with the modelled one marked. |
| R29 | Integration | Same file compares every `data-model` reference figure and every `data-comparison` cell with `analyseV2(COMMITTED, now)`, and checks that the £15 and £40 `<details>` have no `open` attribute. |
| R30 | Unit | `npx vitest run tests/pricing-what-if.test.tsx --maxWorkers=4` passes. `grep -nE "fetch\(\|localStorage\|sessionStorage\|document\.cookie\|useRouter\|use server" components/staff/PricingWhatIf.tsx` prints nothing. In the preview session (R38), type 1500 into the pay-target box and confirm a break-even shop count replaces "Enter a pay target". The browser's network panel shows no request on input. |
| R31 | Integration | `tests/running-costs-page.test.tsx`: 12 `data-add-on` elements, class labels matching `marginClass`, and the launch-set labels matching `RECOMMENDATION.launchAddOnIds`. |
| R32 | Integration | Same file: `data-risk` count equals `RISKS.length`, 3 `data-track` elements, the founding-offer dates rendered, and both warnings toggled by a mocked `RECOMMENDATION`. |
| R33 | Regression | Same file: 10 `data-competitor` elements, and no element of the removed v1 comparison table. |
| R34 | System | With preview running and a platform-admin cookie, run `MSYS_NO_PATHCONV=1 npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path /staff/platform/costs --widths 360 --header "cookie:<jar value>" --measure '[data-comparison],[data-section="competitors"]'`. In the JSON, `documentScrollWidth` is at most 360, the `[data-comparison]` `height` is at most 1600, and the competitors `height` is below 4200. The class `overflow-x-auto` being present is not the requirement: the numbers are. |
| R35 | Unit | `npx vitest run tests/operator-doc-coverage.test.ts --maxWorkers=4` passes. Read the guide's costs section: its version is 1.5.0, and each listed item from R35 is present. Every capability sentence traces to an element in the page test. |
| R36 | Regression | `git diff origin/staging --stat -- package.json prisma lib/payments* lib/stripe* app/api "app/(storefront)"` shows no `package.json` dependency change and no file under the other paths. `git diff origin/staging -U0 -- lib app components scripts \| grep '^+' \| grep -c 'fetch('` prints 0. |
| R37 | Unit / Manual | `tests/pricing-registries.test.ts` asserts that every published-source entry has a URL and a date. Then open `specs/2026-10-28-pricing-model-v2/build-notes.md` and confirm both tables exist. Spot-check at least 6 published rows (Neon, Workers, R2, Resend, Stripe Connect, ICO fee) by opening each URL and finding the stated figure. Record any figure not found as a failure. |
| R38 | System | With preview running and the platform-admin jar, run `curl -s -b admin.jar http://localhost:8787/staff/platform/costs`. Count each attribute with `grep -o 'data-section="[a-z-]*"' \| sort -u \| wc -l` (expect 9) and similar greps for the other counts. Repeat the page and `/staff/platform/costs/export?section=models` with the vendor-ADMIN jar and with no jar: none contains `data-section`, `data-model` or `model,shops`. |
| R39 | System | After `deploy-staging` succeeds, run `curl -s -w '\n%{http_code}\n' https://staging.aheedfoodcentre.nocaped.com/staff/platform/costs`: it is not a 200 with `data-section` in the body. The same with `/staff/platform/costs/export?section=models` prints 401. |
| R40 | Unit | Each named test file exists, and `npx vitest run --maxWorkers=4` passes. |
| R41 | Gate | `git diff origin/staging -- CHANGELOG.md` shows a `#1313` entry, and `grep -cP '\x08' CHANGELOG.md` prints 0. |
| R42 | Gate | Run each command and read its own exit status, not a piped `tail`'s. Then run `npm run kms:assemble:internal`, followed by `(cd kms/site-internal && npx next build --webpack); echo $?`, which prints 0. The PR's `gates` checks are green in `gh pr checks`. |
