# Running costs report for platform admins (requirements / acceptance criteria)

Issue `#1295`. Builds on the Platform Admin area (`#1269`: `components/staff/platform-nav-items.ts`,
`app/(admin)/staff/platform/*`) and the Workers AI meter (`#1017`, `#1028`, `#1029`). In one line: a
read-only page at `/staff/platform/costs`, visible only to platform admins, that lists what the
platform costs from a typed in-repo registry, totals it honestly, flags what needs attention, and
shows today's Workers AI usage. Read `plan.md` for the reasoning and the exclusions. There are no
alerts, notifications, emails, schema changes or new dependencies in this slice.

Terms used below:
- **Registry** - `RUNNING_COST_ITEMS` in `lib/running-costs.ts`.
- **Item** - one registry entry. Its fields: `id`, `name`, `provider`, `category`, `role` (string or
  `null`), `plan`, `costStatus` (`"actual" | "planned" | "estimate" | "unverified"`), `basis`
  (`"owner-stated" | "provider-dashboard" | "provider-pricing-page" | "not-confirmed"`), `asOf`
  (`YYYY-MM-DD`), `amountCents` (integer or `null`), `period` (`"month" | "year" | null`), `currency`
  (`"USD"`), `renewsOn` (`YYYY-MM-DD` or `null`), `autoRenew` (`boolean | null`), `priceChange`
  (`{ toCents, effectiveOn, note }` or `null`), `limits` (`null`, or `{ allowance, overage, sourceUrl,
  retrievedOn, confirmedByOwner }`), `usage` (`"workers-ai"` or `null`), `note` (string or `null`).
- **Annual cents of an item** - `amountCents x 12` when `period` is `"month"`, `amountCents` when
  `"year"`, and not counted when `amountCents` is `null`.
- **Today** - the `now` date passed to `buildCostReport`, compared as a UTC calendar date.

## A. The registry and the report

R1. `lib/running-costs.ts` exists, has no `"use client"`/`"use server"` directive, and imports nothing
    from `react`, `next/*`, `@/lib/db` or `@prisma/*`. It exports `RUNNING_COST_ITEMS` (a readonly
    array), the item types, `formatCostStatus` and `buildCostReport(items, now)`.

R2. Every registry item satisfies: `id` unique across the registry; `amountCents` is `null` or a
    non-negative integer; `period` is non-null exactly when `amountCents` is non-null; `currency` is
    `"USD"`; `asOf` and any `renewsOn`, `priceChange.effectiveOn` and `limits.retrievedOn` match
    `YYYY-MM-DD`; `priceChange` is non-null only when `period` is `"year"`, and then
    `priceChange.toCents` is a positive integer and, when `renewsOn` is also non-null,
    `priceChange.effectiveOn` is on or before `renewsOn`; `costStatus: "actual"` never has
    `basis: "not-confirmed"`.

R3. The registry holds exactly these 11 items (id - `costStatus` - `basis` - `amountCents`/`period` -
    `renewsOn` - `autoRenew` - `priceChange`):
    - `cloudflare-workers` - `actual` - `owner-stated` - `500`/`month` - `null` - `null` - `null`
    - `domain-nocaped` - `actual` - `provider-dashboard` - `1046`/`year` - `2027-08-15` - `false` -
      `{ toCents: 1117, effectiveOn: "2026-11-01" }`
    - `domain-merqify` - `planned` - `provider-pricing-page` - `1046`/`year` - `null` - `null` -
      `{ toCents: 1117, effectiveOn: "2026-11-01" }`
    - `domain-aheedfoodcentre` - `planned` - `provider-pricing-page` - `530`/`year` - `null` - `null` -
      `null`
    - `neon`, `cloudflare-r2`, `cloudflare-access`, `github` - each `actual` - `owner-stated` -
      `0`/`month` - `null` - `null` - `null`
    - `workers-ai` - `estimate` - `provider-pricing-page` - `null`/`null`, with `usage: "workers-ai"`
    - `stripe` - `unverified` - `not-confirmed` - `null`/`null`
    - `cloudflare-email` - `unverified` - `not-confirmed` - `null`/`null`

    The `role` of the three domain items is respectively "dev and staging", "main platform domain" and
    "client domain"; the `neon` item's `note` contains `#1289`; the `domain-nocaped` and `domain-merqify`
    `priceChange.note` each contain "Verisign".

R4. Every non-null `limits` has an `https://` `sourceUrl`, a non-empty `allowance`, and a boolean
    `confirmedByOwner`; no registry item has `confirmedByOwner: true` at this slice (the owner has
    confirmed none). An item whose pricing page could not be read at Build has `limits: null`.

R5. `buildCostReport(items, now)` returns `current`, `withPlanned` and `atRenewal`, each
    `{ annualCents, monthlyCents }`, where: `current.annualCents` is the sum of annual cents of items with
    `costStatus: "actual"`; `withPlanned.annualCents` is that plus the annual cents of `"planned"` items;
    `atRenewal.annualCents` is the sum over `"actual"` and `"planned"` items of their annual cents with
    `priceChange.toCents` replacing `amountCents` for an item that has a `priceChange`; and each
    `monthlyCents` is `Math.round(annualCents / 12)`. Items with `amountCents: null` and items with
    `costStatus` `"estimate"` or `"unverified"` are in no total. For the registry in R3 the results are:
    `current` 7046 / 587, `withPlanned` 8622 / 719, `atRenewal` 8764 / 730.

R6. `buildCostReport` returns `attention`, a list of `{ id, kind }` where `kind` is `"auto-renew-off"` for
    an item with `autoRenew === false`; `"renewal-soon"` for an item whose `renewsOn` is 0 to 60 days
    after today inclusive; and `"price-change-soon"` for an item whose `priceChange.effectiveOn` is 0 to
    60 days after today inclusive. For the registry in R3 and `now` = 2026-10-27 it is exactly
    `domain-nocaped` `auto-renew-off`, `domain-nocaped` `price-change-soon`, `domain-merqify`
    `price-change-soon`; for `now` = 2027-07-20 it is exactly `domain-nocaped` `auto-renew-off` and
    `domain-nocaped` `renewal-soon` (the price change has taken effect, so no `price-change-soon`).

R7. `buildCostReport` returns `renewals`, a list of `{ id, renewsOn, amountCents }` for each item with a
    non-null `renewsOn`, ascending by date, where `amountCents` is `priceChange.toCents` when the item has
    a `priceChange` and its `amountCents` otherwise. For the registry in R3 it is exactly
    `[{ id: "domain-nocaped", renewsOn: "2027-08-15", amountCents: 1117 }]`.

R8. `buildCostReport` returns `unpriced`, the ids of items with `amountCents: null`. For the registry in R3
    it is exactly `workers-ai`, `stripe`, `cloudflare-email`. For a registry whose only items are free
    (`amountCents: 0`), `current.annualCents` is `0`.

## B. Live usage

R9. `lib/ai-usage-service.ts` exports `getPlatformAiNeuronsToday()`, which resolves
    `{ plan, neurons }` where `plan` is `getAiEnv().WORKERS_AI_PLAN` and `neurons` is
    `sumPlatformMilliNeuronsSince(prisma, startOfUtcDay(now))` divided by 1000, using a client built inside
    the call. `lib/repositories/` has no diff in this slice.

R10. The page's `workers-ai` row shows the neurons used today next to
     `WORKERS_AI_DAILY_ALLOWANCE_NEURONS` and the configured plan labelled "Free" or "Paid". On the Paid
     plan it also shows `formatUsdCents(estimatedPaidChargeCents(neurons))` as an estimate. When
     `getPlatformAiNeuronsToday()` rejects, the row shows the text "Usage unavailable" and no neuron count
     and no `0`. Every other row shows the text "Usage not monitored".

## C. The page

R11. `app/(admin)/staff/platform/costs/page.tsx` exists, exports `dynamic = "force-dynamic"` and metadata
     with title "Running Costs", calls `requireVendorRole("ADMIN")`, calls `redirect("/login")` for a 401,
     and renders `PanelRefusal` with the title "Platform admin only" for any other refusal and for any
     result whose `auth.via` is not `"platform-admin"`, without rendering any registry value in those
     cases. It renders inside `PageContainer` with `width="wide"` and imports nothing from `@/lib/db` or
     `@prisma/*`.

R12. For a platform admin the page renders these elements, each with its data attribute:
     `data-costs-total="current-monthly"`, `"current-annual"`, `"planned-monthly"`, `"planned-annual"`,
     `"renewal-monthly"`, `"renewal-annual"` (money formatted with `formatUsdCents`; for the R3 registry:
     $5.87, $70.46, $7.19, $86.22, $7.30, $87.64); one `data-costs-item="<id>"` element per registry item;
     a `data-costs-attention` list with one entry per R6 result; a `data-costs-renewals` list with one entry
     per R7 result showing the renewal date and amount; and a `data-costs="currency-note"` sentence stating
     that prices are US dollars as quoted by the provider and that the card is charged in pounds.

R13. When `current.annualCents` is `0` the page renders the sentence "Nothing is currently billed."
     (`data-costs="zero-notice"`) and still renders every item and the planned and renewal totals; when it
     is above `0` that sentence is absent.

R14. Each `data-costs-item` element shows: the item's name, provider, plan and `role`; its status as the
     text `Actual`, `Planned`, `Estimate` or `Unverified` (`data-costs-status`); its `asOf` date; its cost
     as `formatUsdCents(amountCents)` followed by `/month` or `/year`, or the text "Not priced" when
     `amountCents` is `null`; and, for `limits: null`, the text "Limits not recorded", otherwise the
     allowance text, the overage text when present, the `sourceUrl` host, the `retrievedOn` date and the
     text "Not confirmed by the owner" (or "Confirmed by the owner" when `confirmedByOwner`). An item with
     `autoRenew: false` shows "Auto-renew off"; one with a `priceChange` shows the new amount and its
     `effectiveOn` date; one with `renewsOn: null` and a `domain-` id shows "Not yet registered".

R15. `components/staff/platform-nav-items.ts` has one new entry with `href: "/staff/platform/costs"`,
     `label: "Running Costs"`, `icon: "coins"` and a non-empty `description`, and `/staff/platform/costs`
     appears in neither `components/staff/nav-items.ts`, `components/staff/PanelNav.tsx` nor
     `app/(admin)/staff/page.tsx` as a literal string.

R16. `tests/operator-doc-coverage.test.ts`'s `platformSubdirs` includes `"costs"` and
     `tests/page-container.test.ts` has an entry for `app/(admin)/staff/platform/costs/page.tsx` with
     `{ width: "wide", padY: "default" }`; both files, and `tests/staff-nav-parity.test.ts` unchanged,
     pass.

R17. `docs/platform-admin-guide/platform-admin-guide.md` has a heading containing
     `` `/staff/platform/costs` `` followed by the seven labelled parts `tests/operator-doc-coverage.test.ts`
     requires, with "Who can access" reading exactly "Platform admins only"; its version is `1.3.0` and
     `updated` is `2026-10-27`. The section states that figures come from `lib/running-costs.ts` and are
     updated by editing it, that only Workers AI usage is read live, what the four status labels mean, and
     what "Needs attention" lists; each stated capability corresponds to an element in R12 or R14.

## D. Boundaries

R18. This slice changes nothing in `prisma/`, `package.json`, `package-lock.json`, `lib/config.ts` or
     `.github/workflows/`; it adds no file whose name contains `email`, `notification` or `alert` under
     `lib/` or `app/`; and the page and `lib/running-costs.ts` contain no `fetch(` call.

## E. Live behaviour

R19. Under `npm run preview`, signed in as a platform admin, `GET /staff/platform/costs` returns 200 and
     the HTML contains `data-costs-total="current-annual"` with `$70.46`, a `data-costs-item` for each of
     the 11 ids in R3, and a `data-costs-item="workers-ai"` element that contains a neuron count or the text
     "Usage unavailable". Signed in as a vendor ADMIN who is not a platform admin, and unauthenticated, the
     response contains none of `$70.46`, `data-costs-item` or `domain-nocaped`.

R20. After the slice is merged to `staging` and `deploy-staging` has succeeded, an unauthenticated
     `GET https://staging.aheedfoodcentre.nocaped.com/staff/platform/costs` does not return 200 with a
     `data-costs-item` in its body.

## Gates

R21. `tests/running-costs.test.ts` covers R1-R8, `tests/running-costs-page.test.tsx` covers R10-R14 and the
     access cases of R11 (platform admin, vendor ADMIN, STAFF, unauthenticated), and
     `tests/ai-usage-service.test.ts` (or the file that already tests `lib/ai-usage-service.ts`) covers R9;
     each exists and passes under `npx vitest run --maxWorkers=4`.

R22. `CHANGELOG.md` updated (Gate 4), edited with the Edit tool so the file stays LF text with no control
     characters (`grep -cP '\x08' CHANGELOG.md` prints 0).

R23. `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4`, `npm run format:check`,
     `npm run kms:validate`, `npm run kms:check-generated` and `npm run build` all pass after this slice,
     and the PR's `gates` workflow is green.
