# ADR-004 slice 3b — host→tenant resolver + routing (validation)

Host-dependent behavior is verified on staging (real hosts) or `npm run preview` with a spoofed
`Host` header; DB checks run against a seeded DB via `DIRECT_URL` — never `npm run dev`.

| Req | How to verify |
|-----|---------------|
| R1  | `grep -A8 "model VendorDomain" prisma/schema.prisma` shows `host String @unique`, `isCanonical`, cascade FK, `@@index([vendorId])`; `Vendor` has `domains`. `npx prisma validate` exits 0; the new `migration.sql` has `CREATE TABLE "VendorDomain"` + unique + FK; `DIRECT_URL=<branch> npx prisma migrate deploy` applies cleanly. |
| R2  | `grep -nE "headers\\(\\)|vendorDomain|cache\\(" lib/tenant.ts` shows the host read, the `VendorDomain` lookup, and React `cache()` wrapping; no module-level cache of the result. |
| R3  | `git diff lib/repositories lib/auth-rbac.ts` shows **no** changes (non-null `getCurrentVendorId()` preserved). `grep -n "getCurrentVendorIdOrNull" lib/tenant.ts` shows the nullable variant; `npx tsc --noEmit` passes. |
| R4  | Unit test (R10): fake `VendorDomain` miss + 1 active vendor → returns it; miss + 2 vendors → null. |
| R5  | `grep -n "getCurrentVendorIdOrNull\\|redirect(\"/coming-soon\")" app/(storefront)/layout.tsx` shows the gate. On `npm run preview` with an unknown `Host`, a storefront URL 307-redirects to `/coming-soon`. |
| R6  | `app/coming-soon/page.tsx` exists (not under `app/(storefront)/`); `curl -H "Host: nope.example.com" …/coming-soon` returns 200 with the message and an anchor to the default vendor's `https://<canonical-host>`. |
| R7  | After `SEED_AHEED_HOST=… SEED_SRIMART_HOST=… DIRECT_URL=<target> npm run db:seed`: `VendorDomain` has one row per host; a SriMart vendor + its products exist and differ from Aheed's; a second run adds no duplicates. |
| R8  | `grep -n "srimart" wrangler.toml` shows both routes under the correct `[env.*]`; `wrangler deploy` keeps the custom domains (they aren't torn down). |
| R9  | On seeded staging: `curl -s https://staging.aheedfoodcentre.nocaped.com/ ` lists Aheed products; `curl -s https://srimart-staging.nocaped.com/ ` lists SriMart's (different) products; `curl -s -H "Host: unknown.nocaped.com" https://staging.aheedfoodcentre.nocaped.com/ -o /dev/null -w "%{http_code} %{redirect_url}"` → redirect to `/coming-soon`. |
| R10 | `npx vitest run tests/tenant.test.ts` — green: exact match, single-vendor fallback, two-vendor miss → unresolved, `getCurrentVendorId()` throws on miss, default canonical host resolution. |
| R11 | `git diff docs/env-setup.md specs/architecture.md` shows the `SEED_*_HOST`/`VendorDomain` docs + host-resolution note, front-matter bumped; `npm run kms:build-index` leaves `ARTIFACT_INDEX.md` matching the committed copy. |
| R12 | `CHANGELOG.md` diff shows a new entry naming slice 3b and `#70`. |
| R13 | `npm run lint && npm run typecheck && npm run test && npm run format:check && npm run kms:validate` all exit 0. |
