# Public docs boundary and loyalty-gated Rewards launcher (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
> 
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**
   - *When needed:* Every feature.
   - *Purpose:* Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - *When needed:* Every feature. (Includes Contract testing).
   - *Purpose:* Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - *When needed:* For critical user journeys and validation testing.
   - *Purpose:* Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - *When needed:* Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - *Purpose:* Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - *When needed:* Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - *Purpose:* Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - *When needed:* Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - *Purpose:* Ensure the system is safe and accessible to all users.

---

## Validation Steps

All `npm run preview` rows: stop any previous preview's whole `node`/`workerd` chain first, start
`npm run preview`, wait for `http://127.0.0.1:8787/api/health` to answer, and read with
`curl -s -o out.html -w "%{http_code}" -H "Host: <host>" http://127.0.0.1:8787<path>` signed out
(no cookie jar). Aheed is `localhost:8787`, SriMart is `srimart.localhost:8787`. Before trusting a
SriMart result, confirm the dev database still has SriMart at `loyaltyEnabled: false` (seeded so in
`prisma/seed.ts`) — e.g. its `/account/loyalty` returns 404 when signed in, or read
`LoyaltyConfig` for SriMart's vendor with a short `tsx` script against `DIRECT_URL`.

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | Read `lib/public-docs.ts`: no `"use server"` line; exports `getPublicShopperGuide`, whose single parameter is optional and defaults to the imported `DOC_ARTICLES`. `npm run typecheck` exits 0. |
| R2  | Unit | Read the function body: the match is `id` strict-equals the guide id **and** `visibility` strict-equals `"public"`; there is no `audience` test and no positional index (`[0]`, `.at(0)`, `find` over a filtered list by anything but id). Then rely on R3's tests for behaviour. |
| R3  | Unit | `npx vitest run <the helper's test file>` run alone exits 0; read it and confirm all four cases named in R3 are present as separate assertions. |
| R4  | Unit | Read `app/(storefront)/help/page.tsx`: no `import` statement whose specifier ends in `staff/runbook/docs` (comments mentioning it do not count); the guide section's rendered content comes from `getPublicShopperGuide()`'s return value; the section, heading included, is inside a condition on that value being non-null. R6's test passing is the mechanical confirmation of the import half. |
| R5  | Integration | `npx vitest run tests/help-vendor-facts.test.tsx` (or the new file) run alone exits 0; read it and confirm assertions for the presence of `Guest Checkout` and the absence of both `PENDING_PAYMENT` and `Known Trap` on the rendered page. |
| R6  | Unit | Read `tests/public-docs-boundary.test.ts`: it imports `typescript`, walks the four roots, handles the five import forms, normalises extensions, exempts only paths under `app/(admin)/` and the single file `lib/public-docs.ts`, and has no other allowlist. |
| R7  | Unit | In the same file, confirm in-memory cases for: relative static import, `@/` alias import, `export ... from`, dynamic `import()` (each flagged), and a comment-only mention (not flagged). `npx vitest run tests/public-docs-boundary.test.ts` run alone exits 0. |
| R8  | Unit | Run `npx vitest run tests/public-docs-boundary.test.ts` alone: exits 0. Add `import { DOC_ARTICLES } from "@/app/(admin)/staff/runbook/docs";` as the first line of `app/(storefront)/cart/page.tsx`, re-run: exits non-zero naming that file. Revert with `git checkout -- "app/(storefront)/cart/page.tsx"` and confirm `git status --short` shows it clean. |
| R9  | Unit | Read `components/layout/StorefrontChrome.tsx`: `RewardsLauncher` is inside a condition on `initialRewardsData.loyaltyEnabled`; `git diff origin/staging -- components/layout/StorefrontChrome.tsx` shows no other change. |
| R10 | Unit | Run the chrome test file alone with `npx vitest run <file>`: exits 0; read it and confirm the `false` case asserts zero and the `true` case asserts exactly one element with `aria-label="Open rewards and loyalty panel"`. |
| R11 | E2E | `npm run preview`, then four reads as described above: SriMart `/` and `/help` are `200` and `grep -c "Open rewards and loyalty panel" out.html` prints `0`; Aheed `/` and `/help` are `200` and the same grep prints `1` or more. |
| R12 | E2E | Same preview: for each host, `/help` is `200`, `grep -c "Guest Checkout" out.html` prints `1` or more, and `grep -c "PENDING_PAYMENT\|Known Trap" out.html` prints `0`. |
| R13 | Unit | Read `docs/developer-portal/app-conventions.md`: the bullet beginning "A shopper-facing render of KMS documentation filters on `visibility`" names both `lib/public-docs.ts` and `tests/public-docs-boundary.test.ts` within that same bullet (wrapped lines count as one bullet); `git diff origin/staging -- docs/developer-portal/app-conventions.md` shows the `version:` line incremented from `1.7.0`. |
| R14 | Integration | `npm run kms:validate` exits 0 with `invalid front-matter (failing): 0`; `npm run kms:check-generated` prints `all 2 generated artefact(s) current`; `npm run kms:assemble:internal` exits 0; then `cd kms/site-internal && npx next build --webpack; echo "exit=$?"` prints `exit=0` (read the real exit status, never through a pipe). |
| R15 | Acceptance | `git diff origin/staging -- CHANGELOG.md` shows an `[Unreleased]` entry naming `#1022` and `#1023`. |
| R16 | Regression | `npm run lint`, `npm run typecheck` and `npm run format:check` each exit 0; `npx vitest run` run alone (not beside a build) exits 0 with every test file executed. CI on the PR (`docs-gates`, `quality / kms`, `quality / quality`) is green — CI is ground truth. |
