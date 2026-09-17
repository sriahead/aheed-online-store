# Credential verification closeout (requirements / acceptance criteria)

Closes the three defects found while resolving the R2 credential outage (`#755`) on 2026-09-16:
`scripts/verify-storage-credentials.ts` reports on env files only and skips `.dev.vars` (`#780`);
`CLAUDE.md` documents the silent half of an undeployed Worker version but not the deploy wedge it
causes (`#781`); and `saveStorefrontTheme` writes eight unvalidated colour columns while its
duplicate-name branch can never fire under the HTTP adapter (`#782`). Builds on `#713`'s
`lib/brand-colour-form.ts` and on the shared `isUniqueViolation()` predicate from `#347`/`#374`.

## Part 1 — verifier covers both stores (`#780`)

R1. `scripts/verify-storage-credentials.ts`'s `TARGETS` array contains a `.dev.vars` entry, and a
    run of the script prints a result row labelled `dev.vars`.

R2. The script probes R2 for every configured target exactly as before: a `HEAD` for a key that
    does not exist, treating `404` as accepted and `403` as rejected. No target performs a write.

R3. The script reads, for the `staging` and `production` Workers only, the deployed version id and
    the newest version id from the Cloudflare REST API, and prints a line per Worker naming both
    and whether they match.

R4. The decision about a Worker's version state is made by a pure exported function that takes the
    deployed id, the newest id and whether the lookup succeeded, and returns one of exactly three
    outcomes: in-sync, stale, or unknown. It performs no network access and no file access.

R5. That function returns `stale` only when the lookup succeeded and the two ids differ; it returns
    `unknown` whenever the lookup failed, regardless of the id values. An unreachable API is never
    reported as a mismatch.

R6. A `stale` outcome makes the script's exit code non-zero and prints a message naming
    `wrangler versions deploy` as the recovery. An `unknown` outcome prints that the check could not
    run and does not, on its own, change the exit code.

R7. The deployed-version check is not attempted for the `dev` or `dev.vars` targets, and the script
    does not require `CLOUDFLARE_API_TOKEN` to be present in `.env`.

R8. Unit tests cover the function from R4 across all three outcomes, including the case where the
    lookup failed and the two ids happen to differ.

R9. `CLAUDE.md`'s Storage section no longer states that
    `scripts/verify-storage-credentials.ts` is "the one command that answers" whether credentials
    work, and instead states which stores the script does and does not cover.

## Part 2 — deploy wedge documented (`#781`)

R10. `CLAUDE.md`'s deployed-version section states that a secret edited only through the Cloudflare
    dashboard leaves the newest Worker version undeployed, and contains the literal string
    `Secret edit failed` from wrangler's own error.

R11. That same section states that both deploy workflows begin their deploy step with
    `wrangler secret put`, and therefore that every subsequent deploy on that environment fails
    until the pending version is deployed.

R12. That same section names `wrangler versions deploy` as the recovery command and
     `scripts/configure-env.mjs` as the path that avoids the problem.

## Part 3 — `saveStorefrontTheme` (`#782`)

R13. `lib/brand-colour-form.ts` exports a function that validates a `BrandPrimitives` object and
     returns a `ParseResult`, rejecting any value not matching `^#[0-9a-fA-F]{6}$`. It contains no
     `throw` statement and performs no database access.

R14. `saveStorefrontTheme` in `features/admin/storefront.ts` calls that function and returns its
     error without writing when any of the eight primitives is invalid.

R15. `saveStorefrontTheme` determines a duplicate-name failure using `isUniqueViolation` from
     `lib/repositories/prisma-errors.ts`, and `features/admin/storefront.ts` contains no direct
     comparison of an error code to the literal `P2002`.

R16. A repository-wide search for a direct `P2002` comparison across `app/`, `components/`,
     `features/`, `lib/` and `scripts/` returns no match outside
     `lib/repositories/prisma-errors.ts` (comments and docstrings excluded).

R17. Unit tests cover the new primitives validator: at least one rejecting case per malformed shape
     (missing `#`, wrong length, non-hex characters, empty string) and one accepting case.

## Gates

R18. `CHANGELOG.md` updated (Gate 4).

R19. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
