# Reference coverage reconciliation — decommission, observability and production bootstrap (build notes)

Written at the end of Build, **before** the Clear. This is the one artifact the Clear bets on:
the validating context is fresh and has only the spec, the artifact, and this file.

## What changed and why

**The shape of the problem, first, because it explains every choice below.** `#764`'s pipeline
converges an environment *towards* its configured coverage and can never converge it back down.
That is not a bug in either half: `apply` reads and retires only within the areas being imported, so
one area's import cannot damage another's, and `findOutstandingAreas` only ever considers the
*required* areas. Together they mean an area that leaves `UK_LOCATION_REF_POSTCODE_AREAS` is never
touched by any later run — it freezes at whatever release imported it, while its
`ReferenceAreaCoverage` row goes on asserting authority, so a postcode issued there afterwards is
answered `INVALID`. Adding a decommission path is therefore not tidying; it is closing the one hole
in the `UNVERIFIED`/`INVALID` model.

- **`lib/reference-data/source.ts`** — `decommissionAreas(prisma, areas)` on the port, plus
  `DecommissionOutcome`. Putting it on the port rather than in the service means each source owns
  its own table and its own `where`, exactly as `apply` does; the orchestrator never names a table.
- **`sources/code-point.ts` / `sources/open-names.ts`** — `decommissionPostcodeAreas` and
  `decommissionPlaceAreas`, each a single `deleteMany` filtered on `postcodeArea`, exported so they
  can be driven from a test with a stub client. `decommissionPlaceAreas` carries a note that
  `PlaceReference.postcodeArea` is nullable, so unattributable rows match no area and are never
  removed — which is why the two sources can legitimately report different deletion counts for the
  same decommission.
- **`lib/repositories/reference-coverage.ts`** — `removeAreaCoverage`, `deleteMany` rather than
  `delete` so a retry after a partial run does not throw on a row that is already gone.
- **`lib/reference-data/sync-service.ts`** — `decommissionUnsupportedAreas`. Computes *covered minus
  required* from `listCoveredAreas`, and for each area removes the coverage row **before** the data
  rows. It writes a `ReferenceDataSyncRun` (`requestedAreas` = removed areas, `retired` = rows
  deleted), recalculates `recordCount`, and increments `cacheVersion` — the same activation signal a
  successful import moves, for the same reason: what this environment serves has changed.
- **`scripts/sync-reference-data.ts`** — `--decommission` and `--dry-run`. The decommission path
  returns before the sync path, so it downloads nothing and imports nothing.
- **`lib/reference/reference-status-service.ts`** and the `/api/health` `reference` block — the
  observability half. Reports `configured`, `reachable`, `requiredAreas`, and per source the covered
  areas plus drift in both directions.
- **`scripts/verify-reference-coverage.ts`** — the same question asked of a *database* named by an
  env file rather than of a deployed Worker, which is the form needed before a deploy exists and
  against production's reference branch (whose application does not yet serve the route at all).
  Read-only; exits non-zero on drift.
- **Three docstrings scoped** (`sync-service.ts`, `source.ts`, `code-point.ts`) so their "nothing is
  ever deleted" guarantees stay true of the refresh path they actually describe, and
  `lib/repositories/reference-data.ts`'s `listDatasetStatuses` no longer claims it is "never used on
  the request path", because `/api/health` now uses it.
- **Tests** — `reference-decommission.test.ts` (13), `reference-decommission-safety.test.ts` (3),
  `reference-status-service.test.ts` (10).

## Decisions taken during the build

- **Coverage row first, and it is a requirement (R6) with a dedicated test, not a comment.**
  Deleting data while coverage survives publishes `INVALID` for the duration of the run — an
  authoritative claim that a real address is wrong. The reverse order degrades to `UNVERIFIED`. The
  ordering test records call order against a stubbed client rather than asserting on end state,
  because the end state is identical either way; only the window differs.
- **`--decommission` runs decommission ONLY, and returns before the sync path.** Considered running
  both in one invocation so a single command converges coverage in both directions. Rejected: it
  would make a destructive step a side effect of a routine one, and the scheduled workflow invokes
  the routine one unattended against production every month.
- **Two refusals rather than one.** An empty required list refuses (an environment that has not said
  what it needs has not said it needs nothing), and a required area is never removed even if it
  somehow reaches the unsupported set. The second is unreachable as written — `unsupported` is built
  by excluding `required` — and is kept deliberately so a future edit to that filter fails loudly.
- **`tests/reference-decommission-safety.test.ts` allow-lists by FUNCTION NAME, not by file.** A
  file-level exemption would let a second delete appear in `code-point.ts` beside the sanctioned
  one. It matches AST call expressions rather than text because these files discuss deletion at
  length in prose, and a grep-based check could only be satisfied by deleting the explanations —
  the trap `CLAUDE.md` records three times. Its third test asserts the exact set of deleting
  functions, so removing the feature cannot leave the check passing by absence.
- **`enclosingName` in that test resolves the nearest *function*, not the nearest named node.** The
  first version returned `result` for `const result = await prisma.x.deleteMany(...)`, which no
  allow-list would ever contain — every delete would have read as a violation and the allow-list
  would have stopped meaning anything. Caught by the test failing on the real source on first run.
- **`/api/health` reports reference state and never changes the verdict.** `body.status` is
  untouched by the new block. `lib/config.ts` deliberately declines to make these variables
  required-in-production; failing the health check on them would invert that decision and make a
  provisioning gap look like an outage.
- **`verify-reference-coverage.ts` uses `@neondatabase/serverless` directly rather than the
  generated client.** It has to report usefully on a database with *no schema at all* — production's
  exact state — and a Prisma client answers that with `P2021` rather than a report. Raw SQL is
  permitted here on the same grounds as in migrations: `CLAUDE.md`'s ban governs application code,
  not scripts.
- **It also checks for rows in a non-required area with no coverage row**, which the
  coverage-vs-configuration comparison alone would miss — exactly what a half-finished decommission
  would leave behind.

## Deviations from the spec

- **R27–R30 (production) were executed from a local Node run, not by dispatching
  `sync-reference-data.yml`.** The dispatch is impossible: the workflow has never existed on `main`,
  and GitHub resolves both `workflow_dispatch` and `schedule` from the default branch
  (`gh workflow run` → `HTTP 404: workflow not found on the default branch`). Same script, same
  `--env-file secrets/production.vars` the workflow would have materialised, preceded by
  `prisma migrate deploy --schema prisma/reference/schema.prisma` against production's
  `UK_LOCATION_REF_DIRECT_URL` — which is what the workflow's own migrate step runs. **R30 as
  written is therefore satisfied in the narrow sense (the workflow needs no change) and misleading
  in the broad one**: it needs a promotion, tracked as **#772**.
- **The staging redeploy needed `wrangler versions deploy`, not a CI re-run.** The first re-run
  failed at the workflow's own first step with `Secret edit failed. You attempted to modify a
  secret, but the latest version of your Worker isn't currently deployed` — the secrets had been
  added through the Cloudflare dashboard, which creates a version and does not deploy it. That
  pending version was both the reason staging served `UNVERIFIED` and, from that moment, the reason
  **every** `deploy-staging` run would fail. Deploying the newest version at 100% cleared both, and
  the re-run then went green.
- **The newest version is not always the one you listed a minute ago.** The first
  `versions deploy` targeted `a8dfd1fa`, which had been newest when listed — a newer dashboard edit
  (`5655536e`, "Updated variable: UK_LOCATION_REF_POSTCODE_AREAS", converting it from a secret to a
  readable plain-text variable) had appeared in between, so CI still failed. Re-list immediately
  before deploying.
- Nothing else. R1–R26 and R31–R38 are as specified.

## Known-shaky areas

- **`/api/health`'s `reference` block has not been exercised against a deployed Worker**, only
  locally. It is on this branch; staging runs the pre-merge build. Verify after merge.
- **The decommission has been run exactly once, against one database, removing one area from one
  source.** Untested in anger: an area covered by *both* sources (only Code-Point had `LU`), and a
  failure part-way through a multi-area run — the run row is closed as `FAILED` in the catch, but
  the areas already removed stay removed, which is correct and idempotent on retry but has never
  happened for real.
- **`decommissionPlaceAreas` has never deleted a row in any environment.** Its unit test uses a stub.
- **Production's reference data has never been served to anyone.** `#764` is not promoted, so
  production does not route `/api/address/lookup` at all; the database is correct and the
  application in front of it is from before the feature existed. Do not read a production 404 on
  that path as a reference-data failure.
- **The monthly schedule remains dormant until `#764` reaches `main` (#772).** Nothing in this slice
  changes that, and no amount of correct configuration in the `production` GitHub environment will
  make a workflow absent from the default branch fire.
- **`wrangler deployments list` and `wrangler tail` both failed with `fetch failed` from Git Bash on
  this machine** while `wrangler secret list`, `wrangler versions deploy` and plain `curl` worked,
  and the Cloudflare REST API worked from PowerShell but intermittently returned `HTTP 000` from
  Bash. If a Cloudflare read fails, try the other shell before concluding the account is unreachable.

## Fix (2026-09-16) — R23 and R31 found failing at a fresh-context `/validate`

Two genuine defects, both confirmed live rather than assumed from the spec or build notes.

- **R23 failed live.** The Cloudflare API (`GET …/deployments` → `…/versions/<id>`, the exact
  method the `wrangler secret list` trap paragraph above prescribes) showed the currently deployed
  `aheed-store-staging` version carrying `UK_LOCATION_REF_DATABASE_URL` but **not**
  `UK_LOCATION_REF_POSTCODE_AREAS` — despite the "Deviations from the spec" section above claiming
  R23 was satisfied as of Build. **Root cause: a routine `deploy-staging` CI run fired between Build
  and this Validate** (`2026-09-16T06:51:40Z`, `gh run list --workflow=deploy-staging.yml`) and
  silently dropped the variable. `wrangler deploy` rebuilds a Worker version's `vars` entirely from
  `wrangler.toml`; the variable had only ever been added through the Cloudflare dashboard (per the
  "newest version" deviation note above, converted from a secret to a plain-text variable), never
  declared in `wrangler.toml`, never set via `wrangler secret put` in either deploy workflow. A
  genuine secret (`UK_LOCATION_REF_DATABASE_URL`) survives a bare `wrangler deploy`; a dashboard-only
  plain-text var does not — confirmed by the asymmetry in what the deploy actually dropped. This was
  not a one-off: every future `deploy-staging`/`deploy-production` run would repeat it.
  - **Fix**: added `[env.staging.vars]` / `[env.production.vars]` to `wrangler.toml`, each declaring
    `UK_LOCATION_REF_POSTCODE_AREAS = "MK,RG"` as committed config (not a secret — the value isn't
    sensitive, and `requirements.md`'s own framing already treats `MK,RG` as a fixed invariant "in
    every environment"). Verified with `wrangler deploy --env staging --dry-run` and `--env
    production --dry-run`: both print `env.UK_LOCATION_REF_POSTCODE_AREAS ("MK,RG")` as an
    `Environment Variable` binding, proving the config is syntactically and semantically correct
    without touching the live Worker.
  - **Not re-verified against a live deployed Worker in this Fix pass, deliberately.** Actually
    redeploying staging outside the normal branch → PR → CI path would be another out-of-band
    action layered on the one that caused this — and CI's own `deploy-staging` will apply this fix
    automatically on merge, the same routine run that silently broke it. **R23 must be re-checked
    live (Cloudflare API, not `wrangler secret list`) after this branch merges to `staging`**,
    before Ship treats the promotion as done — same posture already established for R27–R30's own
    deferred production verification above.
  - Documented as a third, related trap in `CLAUDE.md`'s Config & secrets section, alongside the
    `wrangler secret list` and `vars.X`/`secrets.X` traps this exact slice already found: a
    dashboard-only plain-text var is wiped by the next `wrangler deploy`, a dashboard-only secret is
    not. `CLAUDE.md`'s own front-matter (`1.22.0`/2026-09-07) hadn't been bumped despite this
    slice's Build already adding substantial content to it — bumped now (`1.23.0`/2026-09-16) along
    with this addition, rather than left stale for a later slice to notice.
- **R31 failed.** `docs/model-handoff.md` stated in one paragraph that production's reference data
  "matches the dev/staging branch row for row" (true, confirmed live via
  `verify-reference-coverage.ts --env-file secrets/production.vars`) and, a few lines later, that
  "Production's reference branch has NOT been migrated or synced" (false, and directly
  contradicting the paragraph above it) — a straight leftover from before `#767` ran, never
  reconciled against the paragraph written for the same edit. **Fix**: rewrote the paragraph to
  state the two facts this feature actually has — the reference *database* is bootstrapped (done,
  `#767`) and the *application* serving it is not yet promoted (`#764`, tracked separately) — rather
  than conflating them into one "dark" claim. Version bumped `1.7.0` → `1.7.1`.
- `npm run kms:build-index` re-run after both front-matter bumps (`ARTIFACT_INDEX.md` and
  `app/(admin)/staff/runbook/docs.ts` regenerated), then `npm run kms:check-generated` confirmed
  both current. Full local suite (`lint`, `typecheck`, `format:check`, `npx vitest run` — still
  139/1842, `npm run build`, `kms:assemble:internal` + the internal docs site build) re-run clean
  after the fix, not just the two failing rows.
