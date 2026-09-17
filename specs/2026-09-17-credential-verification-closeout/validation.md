# Credential verification closeout (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

1. **Unit Testing** — the pure version-state function and the pure primitives validator. Both are
   DB-free and network-free by requirement, so both are genuinely unit-testable.
2. **Integration Testing** — a real run of `scripts/verify-storage-credentials.ts` against the four
   env files and the live Cloudflare API.
3. **System / End-to-End Testing** — one row only, and it is the important one: the duplicate-theme-
   name path must be driven through a real `npm run preview` request, because the defect being fixed
   is precisely that a hand-constructed error object does not have the shape the real adapter throws.
4. **Regression & Acceptance Testing** — the Gate-3 catch-all, plus confirming the probe is still
   read-only.
5. **Performance & Resilience Testing** — not applicable. No request-path code, no query, no route.
   The one new network call is in a developer script.
6. **Security & Accessibility Testing** — no UI surface changes and no new authenticated path. The
   security-relevant property is R2's "no target performs a write", which is covered below.

---

## Before you start

**Do not paste any secret into a terminal that echoes it.** Every command below reads credentials
from files that are already gitignored; none of them print a value. `CLAUDE.md`'s own warning about
anchoring env-file greps applies if you deviate from these commands.

**Two traps these rows are written around**, both recorded in `CLAUDE.md` and both hit during this
slice's own investigation:

- **`app/(admin)/staff/runbook/docs.ts` embeds the full text of `CLAUDE.md`.** Any repository-wide
  grep for a phrase in `CLAUDE.md` matches twice. Every row below that checks `CLAUDE.md` greps
  **that file directly** rather than the repository.
- **`plan.md` in this very directory quotes the sentence R9 requires to be absent from
  `CLAUDE.md`.** A repo-wide absence check would therefore fail even after a correct fix. R9 is
  scoped to `CLAUDE.md` for that reason.

**Network flakiness is expected on the Windows dev machine.** `fetch failed` moved between
environments across consecutive runs during this slice's investigation. If a row fails with a
transport error rather than an assertion, re-run it before treating it as a real failure — that is
exactly the case R5 and R6 exist to keep out of the exit code.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Integration  | `npx tsx scripts/verify-storage-credentials.ts` and confirm the output contains a row whose label is `dev.vars`, alongside `dev`, `staging` and `production` — four probe rows, not three. |
| R2  | Regression   | `grep -c 'method: "HEAD"' scripts/verify-storage-credentials.ts` prints at least `1`, and `grep -cE 'method: "(PUT\|POST\|DELETE)"' scripts/verify-storage-credentials.ts` prints `0`. Confirms the probe is still read-only for every target, including the new one. |
| R3  | Integration  | In the same run as R1, confirm one line per Worker for `aheed-store-staging` and `aheed-store-production`, each naming a deployed version id, a newest version id, and whether they match. |
| R4  | Unit         | `grep -n "export" scripts/verify-storage-credentials.ts` shows the version-state function is exported, and reading its body confirms it contains no `fetch`, no `await`, and no `readFileSync`. |
| R5  | Unit         | `npx vitest run tests/worker-version-state.test.ts` exits 0, including its case where the lookup failed **and** the two ids differ, which must return `unknown` rather than `stale`. |
| R6  | Unit         | Covered by the same test file as R5 for the outcome mapping. For the exit-code half: with all environments healthy, `npx tsx scripts/verify-storage-credentials.ts > /dev/null 2>&1; echo $?` prints `0`. Note `$?` must be read from the script directly — piping into `head`/`tail` reports the **pipe's** status, which is how this script's exit code was misread during the investigation. |
| R7  | Integration  | `grep -n "CLOUDFLARE_API_TOKEN" .env` returns no match, and the R1 run still completes with a `dev` row — proving the script does not require that variable for a file-only target. |
| R8  | Unit         | `npx vitest run tests/worker-version-state.test.ts` and confirm at least three test cases, one per outcome (in-sync, stale, unknown). |
| R9  | Regression   | `grep -c 'the one command that answers' CLAUDE.md` prints `0`, **and** `grep -c 'verify-storage-credentials' CLAUDE.md` still prints at least `1` — the claim is corrected, not deleted. Scope to `CLAUDE.md` only: `plan.md` quotes the old sentence deliberately. |
| R10 | Regression   | `grep -c 'Secret edit failed' CLAUDE.md` prints at least `1`. |
| R11 | Regression   | `awk '/Secret edit failed/{f=40} f&&f--' CLAUDE.md` prints the 40 lines following the new error text; confirm that window contains all three of `deploy-staging`, `deploy-production` and `wrangler secret put`. A bare `grep -c 'wrangler secret put' CLAUDE.md` is **not** a valid check here — it already prints `6` before this slice and so cannot discriminate. |
| R12 | Regression   | `grep -c 'wrangler versions deploy' CLAUDE.md` prints at least `1` and `grep -c 'configure-env' CLAUDE.md` prints at least `1`. |
| R13 | Unit         | `grep -c 'throw' lib/brand-colour-form.ts` prints `0`, and `grep -cE '@/lib/db\|PrismaClient' lib/brand-colour-form.ts` prints `0`. Confirms the validator stayed pure. |
| R14 | E2E          | Under `npm run preview`, signed in as a store admin, drive `saveStorefrontTheme` with an invalid primitive (e.g. `green-dark` set to `2e4d26`, no `#`). Confirm the action returns an error, and confirm via a direct database query that **no new `VendorTheme` row was created** for that vendor. The row count before and after must be identical. |
| R15 | Unit         | `grep -cE '[=!]==\s*"P2002"' features/admin/storefront.ts` prints `0`, and `grep -c 'isUniqueViolation' features/admin/storefront.ts` prints at least `1`. |
| R16 | Regression   | `grep -rnE '[=!]==\s*"P2002"' app components features lib scripts --include=*.ts --include=*.tsx \| grep -v 'runbook/docs.ts'` returns no output. The code-shaped pattern is deliberate — a bare `P2002` substring matches the docstrings in `lib/repositories/prisma-errors.ts`, `brands.ts`, `bundles.ts`, `delivery-areas.ts` and `search-synonyms.ts`, none of which are defects. |
| R17 | Unit         | `npx vitest run tests/brand-colour-validation.test.ts` exits 0 and its test count has increased relative to the pre-slice file, covering missing `#`, wrong length, non-hex characters and empty string. |
| R18 | Acceptance   | `git diff origin/staging -- CHANGELOG.md` shows a new entry for this slice (Gate 4). |
| R19 | Acceptance   | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` all exit 0. For the test run, confirm the reported file/test totals are at or above `CLAUDE.md`'s recorded baseline — a shortfall means forks-pool workers failed to start and the run is a non-result to repeat, not a pass. |

---

## Two rows that deserve extra care

**R14 is the only row that can actually fail for an interesting reason.** The whole point of Part 3
is that the HTTP adapter throws a different error code than the one the code checked for. Verifying
it through a unit test with a fabricated error would reproduce whichever shape the test author
assumed — the exact mistake that let this bug survive. Drive it through `npm run preview` and a real
database, and confirm the *absence* of a written row rather than only the presence of an error
message.

**R16's pattern is scoped, not broad, on purpose.** An unanchored `grep -rn P2002` returns five
files whose docstrings discuss the `P2002`/`23505` divergence at length. Those are documentation of
the fix, not instances of the bug. Matching `=== "P2002"` distinguishes the two; the
`runbook/docs.ts` exclusion removes the generated bundle that embeds `CLAUDE.md`.
