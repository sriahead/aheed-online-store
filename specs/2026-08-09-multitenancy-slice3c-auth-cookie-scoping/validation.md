# ADR-004 slice 3c — data-driven auth cookie scoping (validation)

Pure-logic requirements are proven by unit tests (no DB). Cookie/origin behavior is verified on
`npm run preview` (local Workers/Miniflare) with a spoofed `Host` header — never `npm run dev`
(Prisma WASM engine can't load there). DB-touching checks run against a seeded DB via `DIRECT_URL`.

| Req | How to verify |
|-----|---------------|
| R1  | `grep -n "AUTH_COOKIE_FAMILY_DOMAIN" lib/config.ts` shows the optional schema field **and** the `readEnv` line in `getEnv()`; `npx tsc --noEmit` exits 0. |
| R2  | `grep -n "export function buildAuthOrigin" lib/auth-origin.ts` exists; the function body references no `headers`/`getPrisma`/`getEnv` (`grep -nE "headers\\(|getPrisma|getEnv" lib/auth-origin.ts` shows those only inside `resolveAuthOrigin`, not `buildAuthOrigin`). Behavior asserted by R9 unit tests. |
| R3  | `grep -nE "headers\\(\\)|x-forwarded-proto|vendorDomain|getEnv\\(" lib/auth-origin.ts` shows the host/proto read, the `VendorDomain` host query and the config read inside `resolveAuthOrigin`; no module-level cache of the result. |
| R4  | `grep -n "export async function getAuth" lib/auth.ts` shows it is async; `grep -n "resolveAuthOrigin\|trustedOrigins\|crossSubDomainCookies\|baseURL" lib/auth.ts` shows the wiring; the old `baseURL: env.BETTER_AUTH_URL` line is gone (`grep -n "env.BETTER_AUTH_URL" lib/auth.ts` → only the fallback path, not an unconditional baseURL). |
| R5  | `grep -rn "getAuth()" app lib features components` shows every occurrence preceded by `await`; `npx tsc --noEmit` exits 0; `npm run lint` reports no direct-Prisma-import violation. |
| R6  | Unit test (R9) asserts no `crossSubDomainCookies` when `familyDomain` is unset. On `npm run preview`: `curl -si -H "Host: staging.aheedfoodcentre.nocaped.com" <preview>/api/auth/... ` (a flow that sets the session cookie) shows a `Set-Cookie` with **no** `Domain=` attribute. |
| R7  | Unit test (R9) asserts `trustedOrigins` = current origin + all vendor hosts. On a seeded env: a sign-in POST with `Origin: https://srimart-staging.nocaped.com` succeeds; the same POST with `Origin: https://evil.example.com` is rejected (403/origin error). |
| R8  | Unit test (R9): `buildAuthOrigin({ host: "shop.family.test", familyDomain: "family.test", ... })` → `crossSubDomainCookies.domain === "family.test"`; `buildAuthOrigin({ host: "srimart.nocaped.com", familyDomain: "aheedfoodcentre.nocaped.com", ... })` → `crossSubDomainCookies` undefined. |
| R9  | `npx vitest run tests/auth-origin.test.ts` is green across the config-on/off × family/custom-host matrix, dot-boundary matching, trustedOrigins de-dup, and baseURL/proto derivation. |
| R10 | `git diff specs/decisions/ADR-004-multi-tenancy.md specs/architecture.md docs/env-setup.md` shows the slice-3c breadcrumb, the auth-scoping note, and the `AUTH_COOKIE_FAMILY_DOMAIN` doc, with front-matter bumped; `npm run kms:build-index` leaves `ARTIFACT_INDEX.md` matching the committed copy and it contains the slice-3c `plan.md` id. |
| R11 | `git diff specs/roadmap.md` shows new change-log rows for slices 3a/3b/4, the #81 promotion, and slice 3c, with front-matter `version`/`updated` bumped. |
| R12 | `git diff CHANGELOG.md` shows a new `[Unreleased]` entry naming slice 3c, `#74`, and the Google redirect-URI caveat. |
| R13 | `npm run lint && npm run typecheck && npm run test && npm run format:check && npm run kms:validate` all exit 0. |
