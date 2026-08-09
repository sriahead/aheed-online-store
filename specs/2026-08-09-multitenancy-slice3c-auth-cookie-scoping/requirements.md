# ADR-004 slice 3c — data-driven auth cookie scoping (requirements)

Make Better Auth's `baseURL`, `trustedOrigins` and cookie domain per-request from the resolved host
(issue #74; ADR-004 slice 3, sibling of 3a/3b). Isolated (host-only, same-vendor-only trust) by
default; a config-gated `AUTH_COOKIE_FAMILY_DOMAIN` arms the parent-domain family cookie, off today.
ADR-002 Better Auth otherwise unchanged.

> **Correction (#83, discovered during this slice's own `/ship` staging verification):** R2/R3/R6/R7/R9
> originally specified `trustedOrigins` as every `VendorDomain.host` (DB-driven, cross-vendor).
> Confirmed with the human that trusting every vendor's origin on every other vendor's auth endpoints
> reopens a cross-tenant CSRF-adjacent surface that isolated-by-default exists to close — no DB call is
> needed at all; `trustedOrigins` is **same-vendor-only** (current origin + family wildcard when armed).
> Requirements below reflect the corrected design.

R1. `lib/config.ts` adds `AUTH_COOKIE_FAMILY_DOMAIN: z.string().optional()` to the schema and
    `getEnv()` reads it via `readEnv("AUTH_COOKIE_FAMILY_DOMAIN")`. Unset is valid (the default in
    every environment today). `npx tsc --noEmit` passes.

R2. `lib/auth-origin.ts` exports a **pure** `buildAuthOrigin(input: { host: string; proto: string;
    familyDomain?: string }): { baseURL: string; trustedOrigins: string[]; crossSubDomainCookies?:
    { enabled: true; domain: string } }` that performs **no** I/O (no `headers()`, no DB, no
    `getEnv()`), such that:
    - `baseURL === \`${proto}://${host}\``.
    - `trustedOrigins` contains **only** `\`${proto}://${host}\`` (the current origin) — no other
      vendor's host is ever included.
    - When `familyDomain` is a non-empty string **and** `host` equals it or ends with `\`.${familyDomain}\``
      (dot boundary — a bare suffix substring does **not** match): the result includes
      `crossSubDomainCookies: { enabled: true, domain: familyDomain }` and `trustedOrigins` also
      contains the wildcard `\`https://*.${familyDomain.replace(/^\\./, "")}\``.
    - Otherwise (`familyDomain` unset, or `host` not under it — e.g. a custom domain):
      `crossSubDomainCookies` is `undefined` (host-only).

R3. `lib/auth-origin.ts` exports an async `resolveAuthOrigin()` that reads the request host and
    protocol from `await headers()` (`host` lowercased/port-stripped; `proto` from
    `x-forwarded-proto`, defaulting to `"https"`), reads `AUTH_COOKIE_FAMILY_DOMAIN` via `getEnv()`,
    and returns `buildAuthOrigin(...)`. **No DB access** — `lib/auth-origin.ts` does not import
    `lib/db`. Constructed fresh per call and never cached across requests (Workers I/O rule).

R4. `getAuth()` in `lib/auth.ts` is `async` and sets, from `await resolveAuthOrigin()`: Better Auth's
    `baseURL`, `trustedOrigins`, and `advanced.crossSubDomainCookies` (the latter only when the
    resolver returned it). The prior `baseURL: env.BETTER_AUTH_URL` line is removed; `BETTER_AUTH_URL`
    is used only as the baseURL fallback when no host header is present. `getAuth()` still constructs
    Better Auth fresh on every call (no cross-request singleton).

R5. Every `getAuth()` call site is updated to `await getAuth()` and still type-checks:
    `app/api/auth/[...all]/route.ts`, `lib/auth-rbac.ts` (×2), `features/reviews/submit-review.ts`,
    `features/reviews/delete-review.ts`, `app/(storefront)/products/[slug]/page.tsx`,
    `app/(storefront)/account/page.tsx`, `components/layout/Header.tsx`. `grep -rn "getAuth()" app lib
    features components` shows no un-awaited call. `npx tsc --noEmit` passes and the no-direct-Prisma
    ESLint guard stays green.

R6. Default (no `AUTH_COOKIE_FAMILY_DOMAIN`): for any vendor host, `resolveAuthOrigin()` returns no
    `crossSubDomainCookies`, so Better Auth issues a **host-only** session cookie (no `Domain=`
    attribute) — an isolated session per vendor host. Covered by R9's unit tests. Live `Set-Cookie`
    confirmation needs a successful sign-in on a real environment (credentials-gated; see
    `validation.md`).

R7. `trustedOrigins` at runtime equals **only** the current request origin (+ the family wildcard when
    `AUTH_COOKIE_FAMILY_DOMAIN` is armed and the host is under it). A sign-in/sign-up POST whose
    `Origin` matches the current host is accepted; a POST whose `Origin` is **any other host —
    including another live vendor's** — is rejected by Better Auth's origin check, same as a wholly
    unknown origin. Verified live on staging (#83): same-origin → 401 (wrong-password, origin
    accepted); cross-vendor origin (a real, seeded `VendorDomain` host) → 403 `INVALID_ORIGIN`,
    identical to an unknown origin.

R8. Family path (unit-level, config armed): with `familyDomain` set, `buildAuthOrigin` enables
    `crossSubDomainCookies` with `domain === familyDomain` **only** for a host under that suffix, and
    keeps a custom-domain host (not under the suffix) host-only — proving SriMart-style vendors stay
    isolated even when the family config is on.

R9. `tests/auth-origin.test.ts` unit-tests `buildAuthOrigin` and passes (`npx vitest run
    tests/auth-origin.test.ts`), covering: config unset → `trustedOrigins` contains only the current
    origin for a family-shaped host and for a custom host (no other vendor's host is ever included);
    config set → family host enables `crossSubDomainCookies` (correct `domain`) + wildcard trusted
    origin; config set → custom host stays host-only; dot-boundary matching (a bare-suffix
    non-subdomain does not match); `baseURL`/proto derivation.

R10. **Docs (standing decisions):** ADR-004 gains a slice-3c breadcrumb noting the deployed topology
     has no subdomain family and that isolated-by-default is the implemented posture (family SSO
     config-gated), with its front-matter `version`/`updated` bumped; `specs/architecture.md` notes
     data-driven auth origin/cookie scoping; `docs/env-setup.md` documents `AUTH_COOKIE_FAMILY_DOMAIN`
     (optional, unset = host-only) with its front-matter bumped; `ARTIFACT_INDEX.md` regenerated to
     include this slice's `plan.md` and matches the committed copy.

R11. **Roadmap catch-up:** `specs/roadmap.md`'s change log gains dated entries recording ADR-004 slices
     3a (#68), 3b (#70) and 4 (#73 + follow-ups #77/#78/#79) shipped, the #81 staging→production
     promotion, and this slice 3c — satisfying #65's roadmap-note item (the #65 migration-drift check
     stays open). Front-matter `version`/`updated` bumped.

R12. `CHANGELOG.md` `[Unreleased]` has a new entry naming ADR-004 slice 3c and referencing `#74`
     (Gate 4), in the terse existing style, noting the per-host Google OAuth redirect-URI onboarding
     caveat.

R13. `npm run lint`, `npm run typecheck`, `npm run test`, `npm run format:check`, and
     `npm run kms:validate` all exit 0.
