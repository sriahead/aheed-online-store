# Phase 6.5 Build Notes

## What was changed and why
- Executed an autonomous self-review across 10 application domains to identify gaps before Phase 7.
- Found 4 gaps (2 High, 1 Medium, 1 Low).
- Fixed host resolution truncation in `lib/tenant.ts`.
- Fixed local preview auth origin mismatch in `lib/auth-origin.ts`.
- Added missing `app/not-found.tsx` page.
- Rebuilt KMS index (`ARTIFACT_INDEX.md`).

## Decisions taken during build
- Resolved to document all findings in `docs/sdd/self-review/GAP-REGISTER.md` and the final exit gate matrix in `docs/sdd/self-review/SELF-REVIEW.md`.

## Deviations from spec
- None.

## Known shaky areas
- Local preview auth bug (#176) still requires upstream fixes or manual workarounds for deep testing.
