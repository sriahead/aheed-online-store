# P10 — Eleven quick UI and copy fixes from the 2026-10-13 user-testing pass (validation)

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

## How to run the two environments these rows use

**Unit rows.** Run `npx vitest run <file>` **on its own** — not beside or immediately after a build.
Under load its forks pool can silently fail to start workers, so whole files never execute while the
run still exits 0 (CLAUDE.md, Windows shell section). A row that reports "0 tests" has not passed.

**Browser and `curl` rows.** Start `npm run preview` — **not** `npm run dev`, which cannot load the
WASM Prisma engine. Then:

- **Aheed** is `http://localhost:8787`.
- **SriMart** is `http://srimart.localhost:8787` in Chrome. For `curl` or Node on Windows,
  `srimart.localhost` may not resolve: use `127.0.0.1:8787` with an explicit
  `-H "Host: srimart.localhost:8787"`. **The port is required** — a bare
  `Host: srimart.localhost` matches no seeded row and falls through to Aheed, which is how `#729`'s
  validation once measured the wrong vendor.

After stopping `npm run preview`, kill the whole `node`/`workerd` chain before the next build, or it
fails with `EBUSY`.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | In `tests/header-brand.test.tsx`, assert `render(LOGO, MARK) === render(LOGO, null)` — the two markup strings are identical. `npx vitest run tests/header-brand.test.tsx` exits 0. |
| R1  | E2E | With `npm run preview` up: `npx tsx scripts/verify-mobile-layout.ts --base http://localhost:8787 --path / --widths 360,768`. At 360 the reported `brand.file` ends `.webp` (the logo), `brand.width` is 72 plus or minus 2, `brand.height` is 40, and `brand.requested` contains no `192.png`. At 768 `brand.height` is 64. |
| R2  | Unit | `npx vitest run tests/header-brand.test.tsx` — the "mark only" and "neither" cases pass unchanged from their current assertions. |
| R3  | Unit | `npx vitest run tests/header-brand.test.tsx` prints `4 passed`, and `git diff origin/staging...HEAD -- tests/header-brand.test.tsx` shows the logo-and-mark case no longer asserting `min-width: 768px` or `size-10`. |
| R4  | Regression | `git diff --name-only origin/staging...HEAD` lists none of `app/favicon.ico/route.ts`, `app/layout.tsx`, `app/manifest.ts`, `lib/vendor-icons.ts`. Then `curl -sI http://localhost:8787/favicon.ico` returns a 3xx with a `location` header pointing at a `mark-` path. |
| R5  | E2E | `curl -s http://localhost:8787/ \| grep -o 'tel:[0-9]*' \| head -1` prints `tel:` followed by digits matching the `contactPhone` shown at `/staff/storefront`. |
| R5  | Unit | The `null` branch is checked at source, not by mutating vendor data: `grep -n "contactPhone" components/layout/Header.tsx` shows the anchor rendered inside a truthiness guard on `profile.contactPhone`, so no phone element exists when it is `null`. (SriMart's live check in R24 exercises a differing value on a real second vendor.) |
| R6  | E2E | `curl -s http://localhost:8787/ \| grep -o '<a[^>]*href="tel:[^>]*>'` — the printed anchor's `class` attribute contains neither `hidden` nor `md:` nor `lg:`. |
| R7  | Security & Accessibility | `curl -s http://localhost:8787/ \| grep -o 'aria-label="Call[^"]*"'` prints one match. |
| R8  | Unit | `grep -n "01908" components/layout/Header.tsx` exits 1 (no match). |
| R9  | Unit | `npx vitest run tests/department-hero.test.tsx` — the new fake-timer case passes: `mouseEnter` on the `Department spotlight` region, click the pause control, click it again, `vi.advanceTimersByTime(ROTATE_MS)`, then assert the dot control whose `aria-current` is `"true"` is a different one (the dots are `getByRole("button", { name: "Show <name>" })`, as the existing R13 case reads them). |
| R10 | Unit | Same file: the new hover case passes — `mouseEnter`, no click on the control, `vi.advanceTimersByTime(ROTATE_MS * 2)`, then assert the same dot control still has `aria-current` of `"true"`. |
| R11 | Security & Accessibility | `npx vitest run tests/department-hero.test.tsx` — the existing `gives the pause control an accessible name (R10)` case still passes. Then read the `prefers-reduced-motion` effect in `components/layout/DepartmentHero.tsx` and confirm it still runs at mount and is not conditional on the explicit-choice state. |
| R12 | Unit | `grep -n "ROTATE_MS = 4000" components/layout/DepartmentHero.tsx` prints one line. |
| R13 | Unit | `grep -n "placeholder:text-primary-muted" components/cart/ShopYourList.tsx` exits 1, and `git diff --name-only origin/staging...HEAD` does not list `design-system/tokens/tokens.css`. |
| R14 | Unit | A static-markup test renders `ShopYourList` and asserts `html.indexOf(hintText) < html.indexOf("<textarea")`. `npx vitest run` on that file exits 0. |
| R15 | Unit | `grep -n 'value=""' components/cart/ListReview.tsx` still prints the first-option line, and a test asserts that option's text matches `/choose\|select/i` and `/skip/i`. |
| R16 | Unit | `npm run typecheck` exits 0 with `maxMultiplier` required on `RewardsData`, and `grep -n "maxMultiplier" components/rewards/RewardsPanel.tsx` prints both the type field and the prop pass. |
| R17 | Integration | `grep -n "maxMultiplier" lib/rewards-service.ts` prints the signed-in computation and the signed-out `1`. Confirm no new query by diffing the `Promise.all` call: `git diff origin/staging...HEAD -- lib/rewards-service.ts` shows no added `await` and no added member in that array. |
| R18 | Unit | `npx vitest run tests/rewards-components.test.tsx` — cases asserting `point` at `pointsPerPoundEarned` of 1 and `points` at 2 both pass. |
| R19 | Unit | Same file: a case asserting the referral sentence contains `£20.00`, plus `grep -n "20\\.00\\|£20" components/rewards/ReferralCard.tsx` exits 1 (the figure is formatted, not literal). |
| R20 | Unit | Same file: a case asserting the referral sentence does not match `/first order/i`. |
| R21 | Unit | `grep -nE "\\b(500\|1000)\\b" components/rewards/AvailableRewardsSection.tsx` exits 1. |
| R22 | Unit | `npx vitest run tests/rewards-components.test.tsx` — with `minRedeemPoints` of 100 and `pencePerPointRedeemed` of 1, the section renders cards for 100, 200 and 500 points showing £1.00, £2.00 and £5.00. |
| R23 | Unit | Same file: with `minRedeemPoints` of 0 the component renders nothing; and `grep -ni "voucher" components/rewards/AvailableRewardsSection.tsx` exits 1. |
| R24 | E2E | With `npm run preview` up, in Chrome open `http://srimart.localhost:8787/` and confirm SriMart's own logo in the header brand box. Then `npx tsx scripts/verify-mobile-layout.ts --base http://srimart.localhost:8787 --path / --widths 360` reports a `brand.file` that is **not** Aheed's logo filename. Then `curl -s -H "Host: srimart.localhost:8787" http://127.0.0.1:8787/ \| grep -c "Milton Keynes"` prints `0`, and any `tel:` match on that page is not Aheed's number. |
| R25 | Regression | `git diff origin/staging...HEAD -- CHANGELOG.md` is non-empty and names `#1077`. |
| R26 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0, and `npx vitest run` — run alone — exits 0 reporting a non-zero test count. |
