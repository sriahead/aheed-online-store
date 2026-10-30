# Docs Access guard and the `docs-shoplocal.merqify.com` host (requirements / acceptance criteria)

Closes `#1328` (P12-A, `#1336`). The internal docs Worker deploys on every push to `staging` or
`main`, and Cloudflare Access is its only authentication. This slice makes `deploy-docs-internal`
refuse to deploy unless an Access application guards every docs route host, proves after the deploy
that signed-out requests are redirected to the Access login, and moves the host to
`docs-shoplocal.merqify.com`. Narrative and definitions: `plan.md` ("What covers the host means",
"What lets everyone in means").

**Host and config**

R1. `kms/site-internal/wrangler.toml` declares exactly one `pattern`, `docs-shoplocal.merqify.com`,
    with `custom_domain = true`, and keeps `workers_dev = false`.
R2. `tests/worker-routes.test.ts`'s R4 test asserts the route list equals
    `["docs-shoplocal.merqify.com"]` and passes.

**The script: `scripts/verify-docs-access.ts`**

R3. The script takes exactly one of `--pre` or `--post` (neither or both: exit 1 with a usage line).
    It reads the hosts to check from the `pattern` lines of `kms/site-internal/wrangler.toml`, or of
    the file given by `--config <path>`. A config with zero patterns exits 1.
R4. `--pre` reads `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from the process environment, or
    from the file given by `--env-file <path>` (parsed with `scripts/lib/env-file.ts`) when that flag
    is present. A missing or blank value exits 1 naming the variable, without calling the API.
R5. `--pre` lists the account's Access applications with
    `GET https://api.cloudflare.com/client/v4/accounts/<id>/access/apps`, following pagination until
    every page is read.
R6. `--pre` exits 0 only if every host is covered by at least one application of type `self_hosted`
    under `plan.md`'s "covers the host" rule, and no covering application fails `plan.md`'s "lets
    everyone in" rule. Otherwise it exits 1 and names each failing host with its reason
    (`no Access application covers <host>`, or the application name and the offending policy).
R7. `--pre` fails closed: a network error, a non-2xx response, or a body with `success: false` exits
    1. A 403 response's message contains the text `Access: Apps and Policies Read`.
R8. `--post` sends, for every host, a GET to `https://<host>/` and to
    `https://<host>/dev/runbook/local-dev-playbook` with redirects not followed and no credentials.
    A URL passes only if the response status is 301, 302, 303, 307 or 308 and the `Location`
    header's host ends with `.cloudflareaccess.com`. `--post` exits 0 only if every URL passes.
R9. In `--post`, a 2xx response exits 1 at once, with a message saying the docs are publicly served
    and naming the route to remove. A network error or any other status is retried, at least 6
    attempts spaced 20 seconds apart, before exiting 1.
R10. The script never writes the value of `CLOUDFLARE_API_TOKEN` to stdout or stderr.
R11. The decisions in R6, R8 and R9 are made by exported pure functions (no network, no file I/O),
     covered by `tests/docs-access-guard.test.ts`, which includes at least: an exact-host app passes;
     a `H/*` app passes; a `*.merqify.com` app passes; a path-scoped `H/admin` app fails; an app on
     another host fails; a `bypass` policy fails; an `allow` + `everyone` policy fails; an app with
     only a `deny` policy fails; a 302 to `x.cloudflareaccess.com` passes; a 200 fails without retry;
     a 302 to any other host fails.

**Workflow**

R12. In `.github/workflows/deploy-docs-internal.yml`, a step running
     `npx tsx scripts/verify-docs-access.ts --pre` with `CLOUDFLARE_API_TOKEN` and
     `CLOUDFLARE_ACCOUNT_ID` from secrets appears after the root `npm ci` step and before the step
     that runs `wrangler deploy`; a step running `--post` appears after it. A test in
     `tests/docs-access-guard.test.ts` asserts that order and that `kms/site-internal/wrangler.toml`
     contains `workers_dev = false`.

**Live behaviour against real systems**

R13. `--pre --env-file secrets/merqify-staging.vars`, run before the owner has created the Access
     application, exits 1 against the real Cloudflare API, and its message is either the
     `no Access application covers docs-shoplocal.merqify.com` reason or the R7 permission message.
R14. `--post --config <a temporary toml whose only pattern is example.com>` exits 1 and reports a
     non-redirect response, against the real host.
R15. **Owner-gated, reported UNVERIFIED until `#1339` is done:** once the Access application exists
     and the token has the permission, `--pre --env-file secrets/merqify-staging.vars` exits 0; after
     the first deploy to the Merqify account, the `deploy-docs-internal` run's `--post` step passes.

**Docs**

R16. No file under `.github/`, `docs/developer-portal/`, `kms/site-internal/wrangler.toml` or
     `specs/architecture.md` contains `docs.merqify.com` (scoped absence check; the string
     `docs-shoplocal.merqify.com` does not match it).
R17. `docs/developer-portal/env-setup.md`'s "Merqify account" section names
     `docs-shoplocal.merqify.com` in its hosts table, in owner step 2 and in cut-over step 7, and
     describes the guard, both checks and the `Access: Apps and Policies Read` token permission.
R18. `npm run kms:validate` exits 0, `npm run kms:check-generated` passes after
     `npm run kms:build-index` is run after the last doc edit, and
     `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` exits 0.

**Gates**

R19. `CHANGELOG.md` updated (Gate 4).
R20. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
