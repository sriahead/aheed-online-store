# P8.1b — P8.1 Closeout (validation)

Work the blocks in order. A failure inside one block does not invalidate the blocks already proven —
they share no code. Live checks that touch a database or the network must run under
`npm run preview` or from a real shell, never `npm run dev` (CLAUDE.md: `next dev` cannot load
`@prisma/client/wasm` and renders a silent error state).

**Before any live-DB step**, confirm the target: the Neon host in `.env`/`.dev.vars` must match
neither `secrets/staging.vars` nor `secrets/production.vars`. Print hosts only, never whole lines —
`DATABASE_URL` ends in `BASE_URL`, so an unanchored grep prints the password (#175).

## Block A — Repository facade relocation

| Req | How to verify |
|-----|---------------|
| R1  | `npx vitest run tests/repository-purity.test.ts` exits 0. Cross-check by eye with three separate greps over `lib/repositories/*.ts` — `grep -n "next/headers"`, `grep -n "@/lib/tenant"`, `grep -n "@/lib/auth"` — and confirm every hit is either a line beginning `import type` or a comment. |
| R2  | For each of the nine new modules, `grep -n "^export" lib/<name>-service.ts` lists the expected names. Then `npx tsc --noEmit` exits 0 — a changed signature would fail here at every call site. |
| R3  | `grep -n "^export" lib/repositories/roles.ts` shows only functions whose first two parameters are `prisma` and `vendorId`. `grep -n "getCurrentVendorId\|requireVendorRole\|getAuth" lib/repositories/roles.ts` returns nothing outside comments. Then confirm the refusal still works live: under `npm run preview`, signed in as a non-admin staff user, attempt a role change on `/staff/team` and observe it refused. |
| R4  | For each of the thirteen names in R2, `grep -rn "<name>" app features components lib scripts tests --include=*.ts --include=*.tsx` — no hit outside `lib/<name>-service.ts` imports it from a `@/lib/repositories/*` path. `npx tsc --noEmit` exiting 0 backs this up: a stale import of a moved export would not resolve. |
| R5  | Add a line `import { getCurrentVendorId } from "@/lib/tenant";` to `lib/repositories/customers.ts`, run `npx vitest run tests/repository-purity.test.ts`, and confirm it **fails** naming that file. Revert the line and confirm it passes. Then **read** the test: confirm no data structure in it exempts a file or a symbol from the check. Do not grep for the absence of words like "allow" — the test's docstring explains why it deliberately has no allowlist, and that sentence is the most useful one in the file. |
| R6  | `grep -n "getCartRepository\|getCategoryRepository\|getLoyaltyRepository\|getOrderRepository\|getProductRepository\|getReviewRepository\|getVendorTeam\|setVendorRole" tests/repository-vendor-scoping.test.ts` returns no `ALLOWED` entries. `grep -n "countOtherVendorData\|hasVendorMembership\|findOrderForWebhook\|confirmPayment" tests/repository-vendor-scoping.test.ts` still returns four entries. `npx vitest run tests/repository-vendor-scoping.test.ts` exits 0. |
| R7  | Read `CLAUDE.md`'s repository-layer section end to end. Confirm it names `lib/<name>-service.ts` as the required location, names `tests/repository-purity.test.ts` as the enforcement, and describes the nine-factory list as closed. `grep -c "repository-purity" CLAUDE.md` returns at least 1. Judge the section by reading it — do not grep for the absence of the old sentence, which the corrected text may legitimately quote as history. |
| R8  | Read `lib/repositories/promotions.ts`'s header docstring. It names `tests/repository-purity.test.ts` as what enforces facade location. |
| R9  | `git diff origin/staging -- tests/` — the only changed expectation is `tests/repository-vendor-scoping.test.ts`'s `ALLOWED` map; every other change in `tests/` is an import path. |

## Block B — Dev and staging environment hygiene

| Req | How to verify |
|-----|---------------|
| R10 | `grep -E "^\s*(CDN_BASE_URL\|S3_BUCKET)\s*=" .env .dev.vars` shows `images.dev.aheedfoodcentre.nocaped.com` and `aheed-images-dev` in both, and neither shows a staging or production images host. |
| R11 | `grep -n "images.dev" .env.example docs/env-setup.md` returns a hit in each, and the surrounding text distinguishes the dev host from staging/production and states it has no hotlink rule. |
| R12 | From a real shell (not the assistant's sandbox — outbound DNS is blocked there): `curl -s -o /dev/null -w "%{http_code}\n" -H "Referer: http://localhost:3000/" https://images.dev.aheedfoodcentre.nocaped.com/<a key that exists in aheed-images-dev>` prints `200`. Obtain the key from the dev DB (a `Product.imageKey`) or from the bucket listing. A `000` is a local network failure, not a CDN result — retry from a network that resolves the host. |
| R13 | `npm run preview`, open the storefront homepage and one product page, and check the browser network panel: every `images.dev.aheedfoodcentre.nocaped.com` request returns 200, none returns 403, and the header logo renders. |
| R14 | Read the script: it resolves the `DIRECT_URL` host, prints it and the affected order numbers, and delegates the staging/production comparison to an exported pure function called before any client is constructed. **Do not prove this by running the script against staging** — R14a is the proof. |
| R14a | `npx vitest run tests/<guard>.test.ts` exits 0, with cases covering a staging host (refused), a production host (refused) and the dev host (permitted). |
| R15 | Run the script against the dev branch with `npx tsx scripts/<name>.ts` (a real file, never `npx tsx -e` — that fails silently on this Windows setup once it imports a package). Record the order numbers it prints. Then count: a `tsx` script printing `prisma.discountRedemption.count({ where: { seq: { gte: 888888 } } })` returns `0`. Under `npm run preview`, open each recorded order and confirm no discount line renders. |
| R16 | With `SEED_AHEED_HOST` set and `SEED_SRIMART_HOST` unset, run the seed and confirm stdout contains a warning naming SriMart. Re-run with both unset, and with both set, to confirm the existing two paths still behave as before. |
| R17 | Sign in to staging as an admin, copy the session cookie, then twice within a few seconds: `curl -sS -D - -o /dev/null -H "Cookie: <session cookie>" https://staging.aheedfoodcentre.nocaped.com/staff/reports`. Confirm the response is the real page (200), not a redirect to `/login` — a refusal response does not measure what R17 asks. Record both responses' `cache-control` and `cf-cache-status` verbatim in `build-notes.md`. Pass requires `private, no-store, must-revalidate` on both and `cf-cache-status` never `HIT`. A `HIT` fails R17 and becomes a new issue. |

## Block C — Guest machine-readable data export

| Req | How to verify |
|-----|---------------|
| R18 | `grep -n "export async function exportGuestOrderData" -A 6 lib/repositories/data-rights.ts` shows all four parameters explicit. Exercise it directly from a `tsx` script file against the dev DB: a correct pair returns a document, a wrong email for the same order number returns `null`. That the script can import the module at all is itself the proof it reads no request context. |
| R19 | `grep -n "exportGuestOrder" lib/data-rights-service.ts` shows the method on `GuestDataRightsService`. `ls lib/*guest*` shows no new service file was added. |
| R20 | Under `npm run preview`, against the preview URL wrangler prints (no port is pinned in `wrangler.toml`), with a real seeded order: `curl -sS -D - -o /dev/null "<preview-url>/orders/lookup/export?orderNumber=<n>&email=<e>"` returns 200 with `content-type: application/json`, `content-disposition: attachment; filename="...json"` and `cache-control: no-store`. The same URL with a wrong email returns 404. |
| R21 | `grep -n "checkOrderLookupRateLimit" app/\(storefront\)/orders/lookup/export/route.ts` returns a hit. Exceed the limit by repeating the R20 request past the configured threshold and confirm a 429. |
| R22 | Place (or find) two orders under the same email in the dev DB. Export one and read the JSON: it contains that order's number and no field of the other order. Confirm by searching the downloaded document for the second order's number and finding nothing. |
| R23 | Under `npm run preview`, load `/orders/lookup` with no search performed — no export link is present. Complete a successful lookup — the link appears beside the erase form and points at the export route. |
| R24 | Follow that link in the browser under `npm run preview` and open the downloaded file: it contains the order number and the order's line items. |

## Gates

| Req | How to verify |
|-----|---------------|
| R25 | `npm run kms:validate` exits 0. `npm run kms:build-index`, then `git status --porcelain` shows `ARTIFACT_INDEX.md` and the runbook `docs.ts` either unchanged or committed with the rebuilt counts. `grep -n "p8-1b-closeout-plan" ARTIFACT_INDEX.md` returns a hit. |
| R26 | `git diff origin/staging -- CHANGELOG.md` shows this slice's entry. |
| R27 | `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check` each exit 0. CI on the PR is the authority, not local output — a local `format:check` result that disagrees with CI is the Windows line-ending artifact, and CI on Linux wins. |
