# Phase 6.5 Validation

| Req | How to verify |
|---|---|
| R1 | Inspect `docs/sdd/self-review/GAP-REGISTER.md` to ensure it exists and lists 0 unresolved CRITICAL or HIGH gaps. |
| R2 | Inspect `docs/sdd/self-review/SELF-REVIEW.md` to ensure it exists and summarizes the audit results. |
| R3 | Run `npm run typecheck` and ensure it exits with code 0. |
| R4 | Run `npm run test` and ensure all test suites pass. |
| R5 | Run `npm run lint` and ensure it exits with code 0. |
| R6 | Run `npm run kms:validate` and ensure it exits with code 0. |
