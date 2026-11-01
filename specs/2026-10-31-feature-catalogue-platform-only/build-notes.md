# Feature Catalogue restricted to platform admins (build notes)

Branch `fix/feature-catalogue-platform-admin` from `staging` at `349a857`. Issue `#1379`. Small
owner-requested change, validated in the same session.

## What changed and why

- Page: the platform-admin refusal pattern already used by `/staff/errors`.
- Menu: moved to `platform-nav-items.ts`; `tests/staff-nav-parity.test.ts` excludes the route.
- Catalogue entry and guide section moved to the platform side.
- Also carries the overdue roadmap row for `#1374`'s promotion (PR #1378).

## Decisions taken during the build

- The URL is kept, as `/staff/errors` is, rather than moved under `/staff/platform/`.

## Deviations from the spec

None.

## Known-shaky areas

- R6 needs the staging deploy and a browser sign-in.

## Validation record

Targeted tests: 270 pass. Full run recorded in the PR.
