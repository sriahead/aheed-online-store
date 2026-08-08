# Dev View — Admin diagnostics page (requirements / acceptance criteria)

Minimal ADMIN-gated `/dev` diagnostics page — the safe core of issue #41 (the mockup's Developer
Control Toolbar), showing non-secret environment info and a KMS link. Closes #41. Builds on
`lib/auth-rbac.ts` (`related:` ADR-002).

R1. `lib/dev-diagnostics.ts` exports `getDevDiagnostics()` returning an object with: `commit`
    (string | null, from `GIT_COMMIT_SHA`), `integrations` (an object of booleans for
    `googleSignIn`, `storage`, `email`, `cdn`, `betterAuthUrl`), and `kmsUrl` (string | null).
    Every `integrations` value is a `boolean` (a presence check), never a secret value.

R2. `tests/dev-diagnostics.test.ts` passes, asserting: when the relevant env keys are set the
    matching `integrations` flag is `true` and when unset it is `false`; and that **no secret
    value** appears anywhere in the returned object (e.g. a sentinel `GOOGLE_CLIENT_SECRET` value
    is not found in `JSON.stringify(getDevDiagnostics())`).

R3. `app/(storefront)/dev/page.tsx` exists, exports `const dynamic = "force-dynamic"`, and gates
    with `requireRole("ADMIN")`: on `status: 401` it calls `redirect("/login")`; on `status: 403`
    it renders an "administrators only" message and **not** the diagnostics.

R4. For an ADMIN session the page renders: the environment name (Staging / Production / Local,
    derived from the request `host`), the deployed `commit`, each integration flag as a ✓/✗ row,
    and the signed-in admin's `id` / `email` / `role`.

R5. The page renders a link to `kmsUrl` when set, and a visible "pending setup" note (no broken
    link) when `KMS_INTERNAL_URL` is unset.

R6. The page contains no rendered secret values — `grep` of the page/component source shows it reads
    only booleans/commit/host/session/`kmsUrl`, never `S3_SECRET_KEY`/`GOOGLE_CLIENT_SECRET`/
    `BETTER_AUTH_SECRET`/`RESEND_API_KEY`/`DATABASE_URL` values into the markup.

R7. `CHANGELOG.md` updated (Gate 4).

R8. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice (Gate 3).
