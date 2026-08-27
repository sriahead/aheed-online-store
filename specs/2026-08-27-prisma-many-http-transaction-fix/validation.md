# updateMany/createMany + direct $transaction HTTP-mode crash fix (validation)

| Req | How to verify |
|-----|---------------|
| R1  | `grep -n "upsertBundle(" lib/bundles-service.ts` shows `upsertBundle(getPrismaWs(),` — no `getPrisma()` on that line. |
| R2  | `grep -n "setBundleImage(" lib/bundles-service.ts` shows `setBundleImage(getPrismaWs(),` — no `getPrisma()` on that line. |
| R3  | `grep -n "deactivateCode(" lib/repositories/discounts.ts` shows the call inside `deactivateCodeForVendor` passes `getPrismaWs()`, not `getPrisma()`. |
| R4  | `grep -n "\$transaction(" lib/repositories/vendor.ts` shows `getPrismaWs().$transaction(`, not `getPrisma().$transaction(`. |
| R5  | `npx vitest run tests/repository-transaction-safety.test.ts` exits 0. Read the test to confirm it implements both R5a (updateMany/createMany outside a `.$transaction(` callback) and R5b (`getPrisma().$transaction(` literal) as whole-file/whole-pattern checks with no allowlist. |
| R6  | Temporarily hand-edit the 4 fixed call sites back to `getPrisma()` (undoing R1-R4 only, in your working tree — do not commit): `lib/bundles-service.ts`'s two calls, `lib/repositories/discounts.ts`'s one call, `lib/repositories/vendor.ts`'s one call. Run `npx vitest run tests/repository-transaction-safety.test.ts` and confirm it FAILS, naming exactly `bundles.ts` (x2), `discounts.ts`, and `vendor.ts` and no other files. Revert the hand-edit (`git checkout -- lib/bundles-service.ts lib/repositories/discounts.ts lib/repositories/vendor.ts`) before continuing. |
| R7  | Live on staging: sign in as `demo-admin@example.com`, open `/staff/bundles/b7a978f5-3a46-4d43-9e78-0c00332401fb`, upload an image (e.g. `public/images/brand/logo.png`) with alt text, click Upload — **5 times in a row**, each completing without "This page couldn't load". Cross-check with `wrangler tail --env staging` (retry the connection if it drops — see CLAUDE.md's Windows section) that no `Transactions are not supported in HTTP mode` line appears during the run. |
| R8  | Live, same session: on the same bundle's edit page, change the tagline and click "Save bundle" — 3 times in a row, each completing without error. |
| R9  | Live, same session: on `/staff/discounts`, deactivate any active discount code — completes without error, confirmed via the page's own success state (no "This page couldn't load"). |
| R10 | Live, same session: on `/staff/storefront`, change the banner note or hero subtitle and save — completes without error. |
| R11 | `grep -rn "382-diag" lib/auth.ts lib/db.ts features/admin/bundle-image.ts` returns no matches. |
| R12 | `grep -n "rateLimit" lib/auth.ts` still shows `rateLimit: { enabled: false }`, unchanged from before this slice — `git diff origin/staging -- lib/auth.ts` shows no change to that line (only the diagnostic-removal lines from R11 touch this file). |
| R13 | `git diff origin/staging -- CHANGELOG.md` is non-empty. |
| R14 | `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run format:check` each exit 0. |

## Note on live checks (R7-R10)

Run these against `npm run preview` first if convenient for a fast local iteration loop, but the
authoritative pass/fail is the **staging** run — per CLAUDE.md, DB-touching behavior under
`next dev` is unreliable (`@prisma/client/wasm` doesn't load), and this bug's whole nature (an
adapter-level crash) makes a real Workers deploy the only fully faithful reproduction of what a
shopper or staff member would actually hit. R7 in particular follows the prior slice's own lesson:
its `R5`/`R9` distinction exists because a single clean live attempt passed once while the bug was
still present — 5 consecutive clean attempts is the bar, not "it worked."

## Note on scope vs. the original #382 spec

This spec supersedes `specs/2026-08-26-auth-http-transaction-fix/requirements.md`'s R1-R9 as the
actual fix for the live crash — that slice's `authDb()` Proxy (R1-R4) and rate-limiter disable
(R8) are real, correct, and left in place (R12 confirms R8's change specifically is untouched), but
neither was sufficient on its own, which is why #382 stayed open and this slice exists. Do not
re-run that spec's R5/R9 as a substitute for this spec's R7 — they exercise the same user-facing
flow but were written against the wrong root cause and don't cover R8-R10's three additional call
sites at all.
