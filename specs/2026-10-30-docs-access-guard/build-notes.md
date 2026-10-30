# Docs Access guard and the `docs-shoplocal.merqify.com` host (build notes)

Written at the end of Build, **before** the Clear. Spec commit `0a4e9468`, build commit `287cbdbf`,
branch `feature/p1328-docs-access-guard` (from `staging` at `3df7a57`). Issue `#1328` is
`In Progress` on Project #2.

## What changed and why

- **`scripts/verify-docs-access.ts` (new).** Shape copied from `scripts/verify-worker-routes.ts`:
  exported pure functions, a `main()` behind the run-as-script guard, no TOML dependency.
  - Pure functions: `parseDocsRoutePatterns`, `appHostnames`, `entryCoversHost`, `policyProblem`,
    `evaluateAccess`, `classifyProbe`.
  - Two I/O functions take an injectable fetcher (and `probeUrl` an injectable `sleep`, attempts and
    delay) so the pagination and retry behaviour are unit-testable: `fetchAccessApps`, `probeUrl`.
  - `--env-file` reuses `scripts/lib/env-file.ts`'s `parseEnvFile`; without it the process
    environment is read (CI).
  - Every message goes to stderr (`console.error`), including the final OK line. Only the last six
    characters of the account id are printed; the token never is.
- **`tests/docs-access-guard.test.ts` (new):** 20 tests covering every R11 case, plus pagination
  (R5), the 403 message and `success: false` (R7), the retry count (R9), the workflow order and
  `workers_dev = false` (R12).
- **`.github/workflows/deploy-docs-internal.yml`:** `--pre` step straight after the root `npm ci`
  (before assemble, build and deploy), with both `CLOUDFLARE_*` secrets; `--post` step after the
  build-and-deploy step, with no secrets (it needs none). The header comment no longer describes the
  old Nocaped host; it describes the two checks.
- **`kms/site-internal/wrangler.toml`:** the only route is `docs-shoplocal.merqify.com`; comment
  names the guard. `tests/worker-routes.test.ts` R4 follows (amends `#1323`'s R4).
- **Docs:** `env-setup.md` 1.25.0 (hosts table; owner step 2 now says how to scope the Access app,
  describes both checks and gives the local `--pre` command; step 4 adds the token permission on the
  staging token; cut-over step 7), `specs/architecture.md` 1.45.0 (docs host and guard),
  `docs/model-handoff.md` 1.154.0 (host in the `#1323` entry, plus a 2026-10-30 entry written at this
  stage).

## Decisions taken during the build

- **Every covering application must be clean**, not just one: a second, permissive app on the same
  host would still expose it. `plan.md` says "no covering application fails"; this is that rule,
  pinned by a test.
- **Only `self_hosted` applications count as covering.** A `saas` or other type with a matching
  hostname is ignored (tested).
- **`destinations` without a `type` are treated as `public`.** Cloudflare's docs show `type` on
  every destination, so this should not arise. If it did, an untyped private destination could
  count as coverage; judged acceptable because the `--post` probe proves what visitors really get.
- **Pagination stops** when `page >= result_info.total_pages` (default 1 when absent) or a page is
  empty; `per_page=100`.
- **`--post` retries on everything except a pass or a 2xx**, including a 404 or a redirect to
  another host. A first custom-domain deploy can answer oddly for a minute; the last attempt's
  verdict is what is reported. Six attempts, 20 s apart (about 100 s of waiting).
- **A 2xx stops at once** with a message naming the custom domain and where in the dashboard to
  remove it (owner chose a loud failure over an automatic undo at Gate 1).
- **401 is not given the permission hint**, only 403, exactly as R7 states. An invalid token gets
  the generic "Cloudflare API error … HTTP 4xx" message with Cloudflare's own error text.
- **`--pre` runs before `kms:assemble:internal` and the site build**, not just before
  `wrangler deploy`: it fails fast and costs nothing when it refuses.

## Deviations from the spec

None.

## Known-shaky areas

- **The Access API response shape is only fixture-tested.** Field names (`domain`,
  `self_hosted_domains`, `destinations[].type/uri`, `policies[].decision/include`,
  `result_info.total_pages`) come from Cloudflare's API reference read on 2026-10-30, not from a
  real response. R13 is the first real call. **Check in particular whether the list endpoint
  returns `policies` inline on each application.** If it does not, every covering app would fail
  with "it has no allow policy", which is fail-closed (safe) but would block the positive run
  (R15); the fix would be a per-app `GET …/access/apps/<id>/policies`.
- **R13's message depends on the Merqify token's permissions.** If the token lacks Access read, the
  403 path fires instead of "no Access application covers"; both are passes for R13, but record
  which.
- **R10's grep reads the token out of `secrets/merqify-staging.vars` into a shell variable** inside a
  command substitution. Do not echo it; the row's output is a count only.
- **R14 depends on `example.com` answering 200** to a signed-out GET with redirects off. If it
  redirects, the probe retries for about 100 s and still exits 1 ("not a redirect to the Access
  login"); the row still passes, just slowly.
- **R18's site build** was run at Spec time and passed; it must be re-run after the last doc edit
  (this stage edits `CHANGELOG.md` and the handoff, and `kms:build-index` must follow the last edit).
- **After merge, `deploy-docs-internal` stays red** on `staging`: the `staging` environment's
  secrets still name Nocaped (last updated 2026-08-08 / 2026-09-08), so `--pre` refuses. That is the
  guard working (`plan.md`, "Expected effect on merge"). R15 cannot pass until `#1339`.
