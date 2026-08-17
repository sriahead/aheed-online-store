# Phase 6.5 Build Notes

> **Headings corrected 2026-08-17** by `specs/2026-08-17-p6.5-residual-validation/` (#192). All four
> section headings were near-misses of the template's required text ("What **was** changed and why",
> "Decisions taken during build", "Deviations from spec", "Known **shaky** areas"), so
> `npm run sdd:preclear` failed on this slice the first time it was ever run against it — P6.5
> shipped during the ungated period, before that check existed. Wording below is otherwise unchanged
> except where the record was wrong; see the note under "Known-shaky areas".

## What changed and why

- Executed an autonomous self-review across 10 application domains to identify gaps before Phase 7.
- Found 4 gaps (2 High, 1 Medium, 1 Low).
- Fixed host resolution truncation in `lib/tenant.ts`.
- Fixed local preview auth origin mismatch in `lib/auth-origin.ts`.
- Added missing `app/not-found.tsx` page.
- Rebuilt KMS index (`ARTIFACT_INDEX.md`).

## Decisions taken during the build

- Resolved to document all findings in `docs/sdd/self-review/GAP-REGISTER.md` and the final exit gate matrix in `docs/sdd/self-review/SELF-REVIEW.md`.
- **Superseded 2026-08-17:** those four findings now live in the single master register at
  `docs/gap-register.md`; the self-review file keeps its narrative and points there. Two approved
  registers had been sharing one GAP-ID space with no cross-reference.

## Deviations from the spec

- None.

## Known-shaky areas

- ~~Local preview auth bug (#176) still requires upstream fixes or manual workarounds for deep
  testing.~~ **Corrected 2026-08-17:** this was already wrong when written. GAP-002 *was* the fix for
  #176 — `splitHostPort` and `inferProto` landed in `lib/auth-origin.ts` in this very slice — so no
  workaround was needed. What was actually missing was evidence: the fix's only validation was 26
  unit tests, and the reported symptom (a real browser sign-in against `npm run preview`) was never
  re-fired. So #176 stayed open, this note told readers to work around a defect that no longer
  existed, and `specs/sdd-workflow.md` carried the same wrong guidance for four days. Live-verified
  and closed on 2026-08-17.
