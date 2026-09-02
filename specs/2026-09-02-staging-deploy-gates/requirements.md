# The staging deploy path is gated, and its own comment becomes true (requirements / acceptance criteria)

Closes #539. `.github/workflows/deploy-staging.yml` runs no checks at all, justified by a comment
asserting that `gates` already ran on the pull request that produced the merge — a premise nothing
enforces, because the `protect-main` ruleset's condition is `~DEFAULT_BRANCH` and no ruleset covers
`staging`. This slice creates a `protect-staging` ruleset mirroring `protect-main`, adds a blocking
`quality` job to the staging deploy path with `kms_blocking: false`, and corrects every place that
records the old state. See `plan.md` for why both halves are needed and why the ruleset half is
affordable on this plan.

R1. A repository ruleset named `protect-staging` exists on `sriahead/aheed-online-store` with
    `target` of `branch`, `enforcement` of `active`, and `conditions.ref_name.include` equal to
    exactly one entry, `refs/heads/staging`, with an empty `exclude` array.

R2. The `protect-staging` ruleset's `rules` array contains exactly three rule types —
    `pull_request`, `non_fast_forward` and `deletion` — its `pull_request` rule has
    `required_approving_review_count` of `0` and `require_code_owner_review` of `false`, and its
    `bypass_actors` array is empty.

R3. `gh api repos/sriahead/aheed-online-store/rules/branches/staging` returns an array containing
    an entry whose `type` is `pull_request`, proving the ruleset is evaluated for `staging` rather
    than merely declared.

R4. `gh api repos/sriahead/aheed-online-store/rules/branches/main` still returns an array containing
    an entry whose `type` is `pull_request`, and `gh api repos/sriahead/aheed-online-store/rulesets`
    still lists the `protect-main` ruleset with `enforcement` of `active` — this slice adds a
    ruleset and changes no existing one.

R5. `gh api` for the rules applying to this slice's own feature branch
    (`repos/sriahead/aheed-online-store/rules/branches/feature%2Fstaging-deploy-gates`) returns no
    entry whose `type` is `pull_request`, proving the new ruleset's ref condition matches `staging`
    alone and not every branch.

R6. `.github/workflows/deploy-staging.yml` declares a job named `quality` whose `uses` value is
    `./.github/workflows/quality.yml` and which passes `kms_blocking: false` under `with`.

R7. `.github/workflows/deploy-staging.yml`'s `deploy` job declares `needs: quality`.

R8. Within `.github/workflows/deploy-staging.yml`'s `deploy` job, the step running
    `npx opennextjs-cloudflare build` appears before the step running `npx prisma migrate deploy`,
    which appears before the step running `npx wrangler deploy` (the #434 ordering, unchanged).

R9. No file under `.github/` states that `deploy-staging` deliberately runs no quality job. The
    comment in `.github/workflows/deploy-staging.yml` that formerly said so instead names the
    `protect-staging` ruleset as what makes a pull request mandatory, and states that this workflow
    also runs `quality.yml`. (Scoped to `.github/` deliberately: this slice's own `plan.md` quotes
    the removed comment verbatim as historical context, and that quotation propagates into the
    generated `app/(admin)/staff/runbook/docs.ts` and the assembled internal-docs MDX. A
    repository-wide grep therefore returns matches for a correct implementation — the same
    false-positive shape #537's R2 hit when it grepped a file whose doc comment legitimately named
    the paths it was asserting were absent.)

R10. `CLAUDE.md`'s "Branch strategy & CI/CD" section states that `staging` is covered by an active
     repository ruleset named `protect-staging` requiring a pull request with zero approving
     reviews, no status checks and no bypass actors, and no longer states that only `main` is
     covered or that `staging` is not covered at all.

R11. `CLAUDE.md`'s "Branch strategy & CI/CD" section states that neither ruleset carries a
     `required_status_checks` rule, so a pull request whose checks are red can still be merged into
     either branch, and names **#472** as the open issue tracking that.

R12. `CLAUDE.md`'s "Branch strategy & CI/CD" section states that `.github/workflows/deploy-staging.yml`
     calls `quality.yml` with `kms_blocking: false`, so the staging deploy path is gated on lint,
     format, typecheck and tests, with the KMS checks non-blocking.

R13. `npm run kms:check-generated` exits 0, and `git status --porcelain` afterwards reports no
     modification to `ARTIFACT_INDEX.md` or `app/(admin)/staff/runbook/docs.ts` — the artefacts
     committed on this branch already reflect this slice's `CLAUDE.md` body edits.

R14. `npm run kms:validate` exits 0, and the internal docs site builds: `npm run kms:assemble:internal`
     followed by `npx next build --webpack` in `kms/site-internal` completes with exit status 0.

R15. **Verified after merge, not before** (by construction — `deploy-staging` triggers only on a
     push to `staging`): the `deploy-staging` workflow run produced by merging this slice shows a
     `quality` job and a `kms` job that both completed, and a `deploy` job that started only after
     `quality` concluded successfully.

R16. `CHANGELOG.md` updated (Gate 4).

R17. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.
