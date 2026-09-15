# P613 Postcode & Address Lookup (build notes)

Written retroactively at Document (final). PR #743 (this slice's own PR) was **closed without
merging** — everything it shipped reached `staging` anyway, through PR #744 instead. This file
records what actually happened rather than treating the closed PR as if the work never landed.

## What changed and why

- `lib/postcodes-api.ts` — `lookupPostcode()` calls `api.postcodes.io/postcodes/{postcode}` (R1)
  with a 3-second timeout, mapping `admin_district`→City and `admin_county`→County (R2).
  `PostcodeNotFoundError` on a 404 (R4); any other failure (timeout, 5xx, network) throws
  `PostcodeApiError`, which the checkout UI catches to fall back to local regex validation and
  manual entry (R5) rather than blocking checkout.
- `components/checkout/CheckoutForm.tsx` / `app/(storefront)/checkout/page.tsx` — Address Line
  1/2 stay manually editable at all times (R3); delivery-area eligibility is untouched and still
  goes through `lib/delivery.ts`'s `isDeliverable()` against local vendor prefixes (R6), never the
  postcode API.
- `components/layout/LocationControl.tsx` — a "Change postcode" action reopens the location
  flow and resets postcode state (R7).
- `prisma/schema.prisma` — `Address.county` (nullable), one migration.

## Decisions taken during the build

- **`react-hooks/set-state-in-effect` on `LocationControl.tsx`'s `setMode("DELIVERY")` call was
  suppressed with an inline `eslint-disable-next-line`, not restructured away from the effect**
  (commit `e315301`) — syncing local `mode` state from server-derived props once a pending
  transition settles is the intended shape here, matching the existing pattern in
  `CartDrawerShell.tsx`/`CheckoutSummary.tsx`/`CookieBanner.tsx`.

## Deviations from the spec

None against R1–R7 as written. **The PR itself deviated from the normal Ship flow**, which is
the notable part of this slice's history:

- PR #743 and PR #744 (P401) shared the same two ancestor commits (`8cbcfc5` docs, `2e3aabd` feat
  — this slice's own spec and implementation), because both were branched from the same point
  before P401 was split into its own commits. When PR #744 merged first (2026-09-14), every line
  of P613's actual code was already on `staging` — confirmed by an empty
  `git diff origin/staging..origin/feat/p613-address-lookup` except for a single CHANGELOG.md
  entry. PR #743 was closed as superseded rather than merged; that CHANGELOG entry (documenting
  #744's own CI-readiness fix, not P613 itself) was preserved by carrying it forward onto the P402
  branch instead (`52ccd0d`, part of PR #746).
- No code from this slice needed any further fix beyond what #744 already did — `#743`'s own CI
  run (after merging current `staging` into it, before closing) was fully green
  (`quality/kms`, `quality/quality`, `docs-gates` all pass) with zero additional changes.

## Known-shaky areas

- **`tests/postcodes-api.test.ts`'s "successfully fetches and maps a valid postcode" test makes a
  real network call to `api.postcodes.io`.** Observed failing intermittently under full local
  `vitest run` suite load (fails ~50% of the time in that context) while passing every time run in
  isolation — consistent with the 3-second client timeout racing against resource contention from
  126 other test files running concurrently, not a real defect in `lookupPostcode()` itself. Not
  reproducible in CI one way or the other, since CI's `quality/quality` job has never been observed
  failing on this specific test (the two real runs so far both passed it). Flag if it starts
  failing CI, rather than assuming it is code-level flakiness.
