---
id: running-costs-report-plan
title: "Running costs report for platform admins (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-27
visibility: internal
summary: "A read-only /staff/platform/costs page for platform admins: what the platform costs now, what is planned, what changes at renewal, and today's Workers AI usage, from a typed in-repo registry (#1295)."
tags: [spec, platform-admin, costs, domains, cloudflare, staff-admin]
related: [platform-admin-guide, roadmap]
---

# Running costs report for platform admins (plan)

Issue `#1295`. Gate 1 approved by the owner on 2026-10-27 as a **display-only** report: no alerts, no
notifications, no email, no schema change.

**Goal:** a platform administrator can open one page and answer three questions without leaving the
app: what does the platform cost now, what will it cost once the planned domains exist and the `.com`
renewal price rises, and what needs attention soon (a renewal, a price change, an auto-renew switch
that is off). Every figure says whether it is `Actual`, `Planned`, an `Estimate` or `Unverified`, and
a service with no usage source says "usage not monitored", never zero.

## Where this lives (corrected from the proposal)

The proposal said `/staff/costs`, modelled on `/staff/errors`. Orient of the repo found a dedicated
Platform Admin area (`#1269`) that the proposal missed: `components/staff/platform-nav-items.ts`
(`PLATFORM_NAV_ITEMS`) feeds both `PanelNav` and the hub's "Platform Administration" section, and the
pages live under `app/(admin)/staff/platform/<name>/`. So the report is **`/staff/platform/costs`**,
registered once in `PLATFORM_NAV_ITEMS`. This avoids the `/staff/errors` special case entirely: the
`EXCLUDED` set and hub allow-list in `tests/staff-nav-parity.test.ts` stay unchanged.

## What the owner told us (2026-10-27, the only source for the seed data)

- Cloudflare Workers is on the **Paid plan, $5 per month**. Everything else is on a free tier.
- Dev and staging run on `nocaped.com`: from the Cloudflare Registrar page, **$10.46/yr**, expires
  **2027-08-15**, **auto-renew off**, with a Cloudflare notice that Verisign raises `.com` from $10.46
  to **$11.17 on 2026-11-01** for registrations, renewals and transfers.
- Two domains are being bought on 2026-10-27 from the same registrar: `merqify.com` (the main platform
  domain, shown at $10.46/yr) and `aheedfoodcentre.co.uk` (the client domain, shown at $5.30/yr). Until
  bought they are **Planned**.
- Email will move to Cloudflare's email service. It is not integrated yet and its price is not known.
- Stripe has never traded (`#113` open), so no transaction fees exist yet.

Nothing else is assumed. Provider free-tier allowances and overage prices are **not** in the owner's
facts, so they are fetched from each provider's own pricing page at Build, recorded with the page URL
and the retrieval date, and shown as "not confirmed by the owner" until the owner confirms them.

## Scope (this slice)

- **`lib/running-costs.ts`** (new, pure): the types, the `RUNNING_COST_ITEMS` registry (11 items, listed
  in `requirements.md` R3) and `buildCostReport(items, now)`. Money is integer cents with an explicit
  currency (CLAUDE.md), USD only, because Cloudflare quotes USD and any conversion would be an invented
  rate. A typed file, not a database table: ten rows that change a few times a year do not justify a
  migration, an editor UI or a seed; the owner edits the file and ships, and every figure carries its
  own `asOf` date and `basis`.
- **Totals** (`buildCostReport`): *current* counts only `Actual` fixed costs; *with planned* adds the
  `Planned` ones; *at renewal prices* swaps in each item's `priceChange` amount. Annual is exact; the
  monthly figure is the annual figure divided by twelve, rounded to the cent. For the seed: current
  **$70.46/yr, $5.87/mo**; with planned **$86.22/yr, $7.19/mo**; at renewal prices **$87.64/yr, $7.30/mo**.
  Usage-based and not-yet-priced items (Workers AI, Stripe, email) are excluded from totals and listed
  as such, so the totals never silently include a guess.
- **"Needs attention"**: computed, not stored: auto-renew off, a renewal within 60 days, a price change
  taking effect within 60 days. On 2026-10-27 that shows `nocaped.com` (auto-renew off, and the `.com`
  rise five days away) and `merqify.com` (the rise).
- **Live usage, one service**: Workers AI. `lib/ai-usage-service.ts` gains
  `getPlatformAiNeuronsToday()`, built on the existing `sumPlatformMilliNeuronsSince` (already allow-listed
  in `tests/repository-vendor-scoping.test.ts` for exactly this platform-wide read) and the existing
  `estimatedPaidChargeCents`/`formatUsdCents` helpers, so the page does not invent a second formula.
  If that read throws, the row says "Usage unavailable"; it never renders 0.
- **The page**: `app/(admin)/staff/platform/costs/page.tsx`, a copy of the `platform/health` page's gate
  (`requireVendorRole("ADMIN")` then `auth.via === "platform-admin"`, `PanelRefusal`), `PageContainer`
  width `wide`, force-dynamic.
- **Wiring the repo's own tests demand**: one `PLATFORM_NAV_ITEMS` entry (icon `coins`);
  `"costs"` added to `platformSubdirs` in `tests/operator-doc-coverage.test.ts` (that list is
  hard-coded for `platform/*`); one entry in `tests/page-container.test.ts`; a seven-part section in
  `docs/platform-admin-guide/platform-admin-guide.md`.
- No new dependency, environment variable, workflow, migration or table.

## Deliberately excluded

- **Alerts** at 75/90/100 %, dashboard notifications, email, and "do not repeat an alert". Owner
  decision 2026-10-27: display only for now. They would need a state table and a delivery path, which
  is a separate slice.
- **Automated pulls from provider APIs** (Cloudflare analytics, Neon, R2, GitHub). Only Workers AI has
  usage in our own database today; adding the others needs per-provider credentials the owner has not
  created. Those rows say "usage not monitored".
- **A cost projection calculator.** "What could it cost as usage grows" is answered per service by the
  recorded overage price text, plus the renewal-price view; modelling usage growth needs usage data we
  do not have.
- **Expiring trials and credits.** The owner has none; the registry has no field for them.
- **Currency conversion or GBP.** Everything is USD as quoted by Cloudflare. The card is charged in
  GBP, so the real amounts differ slightly; the page says so.
- **Deriving the domain rows from the database.** The registry names `aheedfoodcentre.co.uk` as a
  literal. Vendor domains already live in the database (the Domain Registry page), so ADR-004 would
  prefer the vendor-facing ones to be read from there. It is acceptable for this slice because the row is
  a platform operator's cost, shown only to platform admins, in a `lib/` file that
  `tests/vendor-neutral-copy.test.ts` does not scan (it covers `.tsx` and four named modules); but a
  second client domain would mean editing code, which is the thing to fix if that becomes frequent.
- **Editing the registry from the UI**, per-vendor cost allocation, and tracking spend on backups or
  monitoring beyond a note on the Neon row.
- **Removing the Resend requirement.** `lib/config.ts` still demands `RESEND_API_KEY` and
  `RESEND_FROM_EMAIL` in production while the owner plans Cloudflare email. The report only shows email
  as "not integrated"; the config change is separate work.

## Open items carried forward

- **Owner confirmations:** each provider's allowance/overage text is "not confirmed by the owner" until
  the owner sets `confirmedByOwner: true` in the registry.
- **After the two domains are bought today:** set their `renewsOn`, `autoRenew`, and change `costStatus`
  from `planned` to `actual`. Until then the page shows them as Planned with "not yet registered".
- **Neon production is over its free quota** (`#1289`, production down since ~2026-10-26). The Neon row
  carries that as a note: the "everything else is free" assumption is already being tested. Moving off
  the free tier would be a new cost the report does not yet model.
- **`WORKERS_AI_PLAN`** (`lib/config.ts`) defaults to `free` unless set to exactly `paid`, while the
  owner is on Workers Paid. The page displays whatever the setting says and labels it as the configured
  plan; whether staging and production set it correctly is for the owner to check.
