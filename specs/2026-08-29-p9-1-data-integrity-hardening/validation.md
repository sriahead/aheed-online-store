# P9.1 Data Integrity Hardening (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Integration  | `npm run test -- -t "upsertReview"` passes and correctly tests that cross-vendor writes fail. |
| R2  | Integration  | `npm run test -- -t "deleteReview"` passes and correctly tests that cross-vendor deletes fail. |
| R3  | Unit         | `npm run test -- tests/repository-vendor-scoping.test.ts` passes with the review functions removed from the allowlist. |
| R4  | DB           | `npm run db:reset` succeeds, proving the hand-authored migration is valid PostgreSQL. |
| R5  | DB           | Prisma introspect or test ensures `Product` -> `Category` composite foreign key works cleanly in DB. |
| R6  | System       | `npm run build && npm run typecheck && npm run test` passes. |
| R7  | Process      | `CHANGELOG.md` contains entries for #340, #433, and #432 Slice 1. |
