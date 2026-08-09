# ADR-004 slice 3c — data-driven auth cookie scoping (validation)

Pure-logic requirements are proven by unit tests (no DB). Cookie/origin behavior is verified on
`npm run preview` (local Workers/Miniflare) with a spoofed `Host` header — never `npm run dev`
(Prisma WASM engine can't load there). DB-touching checks run against a seeded DB via `DIRECT_URL`.

| Req | How to verify |
|-----|---------------|
| R1  | `grep -n "AUTH_COOKIE_FAMILY_DOMAIN" lib/config.ts` shows the optional schema field **and** the `readEnv` line in `getEnv()`; `npx tsc --noEmit` exits 0. |
| R2  | `grep -n "export function buildAuthOrigin" lib/auth-origin.ts` exists; the function body references no `headers`/`getEnv` (only `resolveAuthOrigin` does). `lib/auth-origin.ts` has no `getPrisma`/`lib/db` import at all (`grep -n "getPrisma\|lib/db" lib/auth-origin.ts` → no match). Behavior asserted by R9 unit tests. |
| R3  | `grep -nE "headers\\(\\)|x-forwarded-proto|getEnv\\(" lib/auth-origin.ts` shows the host/proto read and the config read inside `resolveAuthOrigin`; no module-level cache of the result; no DB query. |
| R4  | `grep -n "export async function getAuth" lib/auth.ts` shows it is async; `grep -n "resolveAuthOrigin\|trustedOrigins\|crossSubDomainCookies\|baseURL" lib/auth.ts` shows the wiring; the old `baseURL: env.BETTER_AUTH_URL` line is gone (`grep -n "env.BETTER_AUTH_URL" lib/auth.ts` → only the fallback path, not an unconditional baseURL). |
| R5  | `grep -rn "getAuth()" app lib features components` shows every occurrence preceded by `await`; `npx tsc --noEmit` exits 0; `npm run lint` reports no direct-Prisma-import violation. |
| R6  | Unit test (R9) asserts no `crossSubDomainCookies` when `familyDomain` is unset. Live `Set-Cookie` confirmation needs a successful sign-in (`DEMO_ACCOUNT_PASSWORD`-gated) — not performed by the agent (credential not available); a human with the demo-accounts password can confirm via `curl -si -X POST <env>/api/auth/sign-in/email -d '{"email":"demo-customer@example.com","password":"<pw>"}'` → `Set-Cookie` has no `Domain=` attribute. |
| R7  | Unit test (R9) asserts `trustedOrigins` contains only the current origin. **Verified live on staging (#83):** `curl -si -X POST https://staging.aheedfoodcentre.nocaped.com/api/auth/sign-in/email -H "Origin: https://staging.aheedfoodcentre.nocaped.com" ...` → `401 INVALID_EMAIL_OR_PASSWORD` (origin accepted); same request with `-H "Origin: https://srimart-staging.nocaped.com"` (a real, seeded `VendorDomain` host, confirmed live by its storefront resolving with distinct branding) → `403 INVALID_ORIGIN`, identical to `-H "Origin: https://evil.example.com"`. |
| R8  | Unit test (R9): `buildAuthOrigin({ host: "shop.family.test", familyDomain: "family.test" })` → `crossSubDomainCookies.domain === "family.test"`; `buildAuthOrigin({ host: "srimart.nocaped.com", familyDomain: "aheedfoodcentre.nocaped.com" })` → `crossSubDomainCookies` undefined. |
| R9  | `npx vitest run tests/auth-origin.test.ts` is green across the config-on/off × family/custom-host matrix (asserting `trustedOrigins` never contains another host), dot-boundary matching, and `baseURL`/proto derivation. |
| R10 | `git diff specs/decisions/ADR-004-multi-tenancy.md specs/architecture.md docs/env-setup.md` shows the slice-3c breadcrumb, the auth-scoping note, and the `AUTH_COOKIE_FAMILY_DOMAIN` doc, with front-matter bumped; `npm run kms:build-index` leaves `ARTIFACT_INDEX.md` matching the committed copy and it contains the slice-3c `plan.md` id. |
| R11 | `git diff specs/roadmap.md` shows new change-log rows for slices 3a/3b/4, the #81 promotion, and slice 3c, with front-matter `version`/`updated` bumped. |
| R12 | `git diff CHANGELOG.md` shows a new `[Unreleased]` entry naming slice 3c, `#74`, and the Google redirect-URI caveat. |
| R13 | `npm run lint && npm run typecheck && npm run test && npm run format:check && npm run kms:validate` all exit 0. |
