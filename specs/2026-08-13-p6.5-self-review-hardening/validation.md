# Phase 6.5 Validation

> **Corrected 2026-08-17** by `specs/2026-08-17-p6.5-residual-validation/` (issue #192). The previous
> version of this table had six rows labelled `R1..R6` that matched no numbered requirement in
> `requirements.md`, and its first two rows were satisfied by a document's own claim about itself
> ("ensure it lists 0 unresolved CRITICAL or HIGH gaps"). Every row below now names a command to
> run, a file property to inspect, or a behaviour to exercise against the artifact.

| Req | How to verify |
|-----|---------------|
| R1  | `grep -E '^\| GAP-00[1-4]' docs/gap-register.md` returns four rows; each has a non-empty Category, Severity and Status cell. |
| R2  | `docs/sdd/self-review/SELF-REVIEW.md` exists; read its "Final Phase 6 Exit Gate Statement" section and confirm it states a decision. |
| R3  | `grep -n 'splitHostPort' lib/tenant.ts` matches, and `grep -n 'split(":")\[0\]' lib/tenant.ts` returns nothing. |
| R4  | `grep -n 'export function splitHostPort\|export function inferProto' lib/auth-origin.ts` matches both. Then start `npm run preview` and sign in through a real browser at `http://localhost:8787/login`: the POST to `/api/auth/sign-in/email` must not return 403, and the response must not contain `Invalid origin`. Record the status code. |
| R5  | `app/not-found.tsx` exists; under `npm run preview`, request an unknown route (e.g. `http://localhost:8787/definitely-not-a-route`) and confirm the response body contains the vendor-branded 404 markup rather than Next's default. |
| R6  | `cp ARTIFACT_INDEX.md /tmp/before.md && npm run kms:build-index && diff <(sed -E 's/Last build: `[^`]+`/Last build: TS/; s/commit `[^`]+`/commit SHA/' /tmp/before.md) <(sed -E 's/Last build: `[^`]+`/Last build: TS/; s/commit `[^`]+`/commit SHA/' ARTIFACT_INDEX.md)` exits 0. |
| R7  | For each row in `docs/gap-register.md` with severity `P1`/High and Status `Open`, read its detailed section and confirm the "Recommended Fix" names an action outside this repo (credential, DNS, bucket policy). Any P1 row whose fix is a code change fails this row. |
| R8  | `npm run typecheck` exits 0. |
| R9  | `npm test` exits 0. |
| R10 | `npm run lint` exits 0. |
| R11 | `npm run kms:validate` exits 0 and reports `invalid front-matter (failing): 0`. |
