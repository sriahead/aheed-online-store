# Running costs report for platform admins (build notes)

Written at the end of Build, **before** the Clear. Issue `#1295`, branch
`feature/1295-running-costs-report` (cut from `origin/staging` at `204d86a`, the `#1288` merge).
Commits: `0524071` (spec), `3384ab2` (build), then the CHANGELOG, handoff and these notes. The branch
also carries `01c5e6a`, the unpushed `#1288` Document commit (roadmap row, handoff, KMS index), as the
carry-forward rule requires; it is not part of this slice's review.

Spec and Build both ran on **Sonnet 5.5**, not Opus 5 as `CLAUDE.md` prescribes for those stages. The
owner was told repeatedly and chose to continue. Validation should be read with that in mind: the
spec and the code were written by the same model, in the same session.

Local checks at `3384ab2` (build hygiene, **not** validation): `lint` 0, `tsc --noEmit` 0,
`format:check` clean, and 216 tests passed across `running-costs`, `running-costs-page`,
`ai-usage-service` and the structural tests this change touches. A mutation (Workers `500` -> `600`)
failed exactly the four tests that pin it, and passed again after the revert. **Not run:** the full
`vitest` suite, `npm run build`, `kms:validate` after the final edits, any `npm run preview`, and the
two live rows (R19, R20).

## What changed and why

- **`lib/running-costs.ts` (new, pure).** The types, the 11-item `RUNNING_COST_ITEMS` registry,
  `formatCostStatus` and `buildCostReport(items, now)`. A typed file rather than a table: about a dozen
  rows that change a few times a year do not justify a migration or an editor. Money is integer cents,
  USD only (no conversion, because that would be an invented rate). Totals count only fixed `actual` and
  `planned` amounts; `amountCents: null` items are listed as `unpriced` and never summed. `now` is a
  parameter and dates are compared as UTC calendar days, so every number is testable.
- **`lib/ai-usage-service.ts`.** One new export, `getPlatformAiNeuronsToday()`, built on the existing
  `sumPlatformMilliNeuronsSince` (already allow-listed for platform-wide reads) and
  `getAiEnv().WORKERS_AI_PLAN`. `lib/repositories/` has no diff.
- **`app/(admin)/staff/platform/costs/page.tsx` (new).** A copy of the `platform/health` gate
  (`requireVendorRole("ADMIN")`, 401 -> `/login`, then `auth.via !== "platform-admin"` -> `PanelRefusal`),
  `PageContainer width="wide"`, force-dynamic. It renders six totals, a Needs attention list, an Upcoming
  renewals list and one card per item. `getPlatformAiNeuronsToday()` is awaited inside a `try`; a failure
  becomes "Usage unavailable". The refusal branches return before any registry value or usage read.
- **`components/staff/platform-nav-items.ts`.** One entry ("Running Costs", icon `coins`). The hub and
  `PanelNav` pick it up through the existing loops, so `nav-items.ts`, `PanelNav.tsx` and the hub are
  untouched and `tests/staff-nav-parity.test.ts` is unchanged.
- **Tests the repo's own guards demanded.** `"costs"` added to the hard-coded `platformSubdirs` in
  `tests/operator-doc-coverage.test.ts`; one entry in `tests/page-container.test.ts`. New:
  `tests/running-costs.test.ts` (R1-R8), `tests/running-costs-page.test.tsx` (R10-R14 and the four
  access cases), `tests/ai-usage-service.test.ts` (R9; no test file for that service existed).
- **Docs.** `docs/platform-admin-guide/platform-admin-guide.md` v1.3.0 (updated 2026-10-27): a seven-part
  section for `/staff/platform/costs`. `CHANGELOG.md` entry (Gate 4). `docs/model-handoff.md` top entry
  updated with `#1295` and its follow-ups. No ADR, `architecture.md`, `tech-stack.md` or
  `design-system.md` change: no standing decision changed.
- **Provider limits (R4) were fetched, not remembered.** WebFetch read four pages on 2026-10-27:
  Workers (10M requests, 30M CPU ms, $0.30 and $0.02 per extra million), Neon (1 GB per project, 20 GB
  total, 100 CU-hours, 100 projects), R2 (10 GB-month, 1M Class A, 10M Class B, then $0.015, $4.50, $0.36)
  and Workers AI (10,000 neurons a day, $0.011 per 1,000). Cloudflare Access (page did not state the
  numbers), GitHub and Stripe (fetch blocked) have `limits: null`, so the page says "Limits not
  recorded". The Workers AI numbers match the repo's own `WORKERS_AI_DAILY_ALLOWANCE_NEURONS` and
  `estimatedPaidChargeCents`.
- **Issues filed for everything deferred:** `#1296` alerts and expiry notices, `#1297` provider-API usage
  pulls, `#1298` owner data updates after the domain purchases (set `renewsOn`, move `planned` to
  `actual`, confirm limits, decide `nocaped.com` auto-renew), `#1299` `RESEND_*` still required in
  production and the `WORKERS_AI_PLAN` mismatch with Workers Paid.

## Decisions taken during the build

- **Status "estimate" exists alongside actual, planned and unverified.** The spec's `CostStatus` has four
  values; Workers AI is the only `estimate` and is never in a total. The page shows its live neurons and,
  on the Paid plan, today's estimated charge from the existing `estimatedPaidChargeCents`.
- **Cards, not a table.** Each item is an `<article data-costs-item>` in a two-column grid, which reads on
  a phone without horizontal scroll. The three-column totals block stacks on small screens.
- **`formatUsdCents` and `estimatedPaidChargeCents` are reused** from `lib/ai-budget-message.ts` (import-free,
  already used by `/staff/ai-usage`). `lib/running-costs.ts` imports nothing, so it stays R1-pure; the page
  does the formatting.
- **Attention text is generated, not stored.** One sentence per kind, built from the item: auto-renew
  off (with the expiry date), renews on a date, price changes to an amount on a date.
- **Neuron counts use `Math.ceil` and `en-GB` grouping** (`4,200`, `12,000`), matching `/staff/ai-usage`.
- **Role is appended to the provider line with a comma.** I first typed a middle dot, which is a
  non-ASCII character; this session's output corrupted non-ASCII characters once already (an em dash in
  `requirements.md`, repaired), so the page source is ASCII-only.
- **`requireVendorRole("ADMIN")` then a second `auth.via` check**, not one combined check, to mirror
  `platform/health` exactly and keep `tests/operator-doc-coverage.test.ts`'s `enforcedAccess` reading it
  as "Platform admins only".
- **Test for the unavailable case asserts no digit appears in the row**, which is stricter than the spec's
  "no neuron count and no 0".
- **Rejected:** a database table (migration for a dozen rows), a client component (nothing interactive),
  and fetching provider prices at request time (the page makes no network call; R18 forbids `fetch(`).

## Deviations from the spec

None of substance. Three small points a validator might trip on:

- **R14 "provider, plan and role"** are rendered on one line ("Cloudflare Registrar | Domain registration,
  dev and staging" with a middle dot between provider and plan and a comma before the role); every value is present.
- **R12's "attention list with one entry per R6 result"** also renders a fallback sentence when the list is
  empty ("Nothing needs attention in the next 60 days."). It sits outside the `<ul data-costs-attention>`,
  so the entry count is still exact.
- **The `neon` `note` says the production project went over quota "from about 2026-10-26"**, taken from
  `docs/model-handoff.md` and `#1289`. It is a repo-sourced claim, not something I checked against Neon.

## Known-shaky areas

- **Nothing ran live.** R19 (preview as platform admin, vendor ADMIN, STAFF and signed-out) and R20
  (staging after deploy) are untested. In particular the real `requireVendorRole` result shape for a
  platform admin (`via: "platform-admin"`) is only mocked here; `platform/health` uses the same check, so
  it should hold, but the preview is the proof. The dev DB also lacks the previous slice's migration
  `20261027080000_category_and_system_assets`; `AiUsageEvent` predates it, so the usage read should work,
  and if it does not the page must say "Usage unavailable".
- **The provider limit text came through WebFetch, which summarises with a small model.** Treat the
  allowance and overage strings as unverified until compared with the live pages (R4's row opens two
  `sourceUrl`s for exactly this). The Neon "first paid plan is usage-based" line is the loosest.
- **The visuals were never seen.** Totals in a three-column grid, cards at phone width, and the colours of
  the status badges have not been looked at in a browser. jsdom proves content, not layout.
- **`kms:coverage` reports "misc: baseline 0, measured 1" on this checkout even with the slice folder
  removed.** It is not caused by this slice, but I did not find the file or confirm it on a clean
  `staging`. CI's `kms` check passed on PR #1292, so it may be local. Check before concluding this slice
  broke the gate.
- **Full-suite timing.** `tests/icon-imports.test.ts` and `add-to-cart-feedback` timed out under a full
  parallel run during `#1288` validation and pass alone (`#1294`). If either fails here, run it alone first.
- **The registry is a snapshot.** Nothing prompts the owner to update it, so each figure is only as
  current as its "As of" date. `#1298` lists the owner actions that are due now.
- **`WORKERS_AI_PLAN` may read "free"** on staging or production even though the owner pays for Workers
  Paid (`#1299`); the page will then show the Free-plan wording. That is the setting, not a page bug.
- **Both `.com` domains carry the same `priceChange`.** `merqify.com` is not bought yet; if its first
  renewal price turns out different, the "at renewal prices" total is wrong by the difference.
