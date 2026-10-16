# Privacy and consent honesty — banner copy, cookie settings, hashed-IP disclosure (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice is UI copy, a client-side consent control and a constants refactor. No schema change, no
migration, no server action. Unit and component tests carry R1–R12, R14–R22; R13 and R24 need a
real browser under `npm run preview` because they depend on layout and on real `document.cookie`
attribute handling, which jsdom does not reproduce. The refactor in R2 changes no value, so the
existing repository tests (`tests/search-query-log.test.ts` and the rate-limit tests) are the
regression guard.

**Before any preview step:** `npm run build`, then `npm run preview`; local hosts are
`http://localhost:8787` (Aheed) and `http://srimart.localhost:8787` (SriMart). Clear the site's
cookies before each browser row. Run `npx vitest run` on its own, never beside a build (CLAUDE.md).

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `grep -c "^import" lib/data-retention.ts` prints `0`; read the file: exactly the three named exports with values 90, 90, 1. A test in `tests/data-retention.test.ts` asserts the three values. |
| R2  | Unit | For each of the seven files: `grep -n "data-retention" <file>` matches an import, and `grep -n "RETENTION_MS =" <file>` shows an initialiser whose only numeric literals are `1000`, `60`, `24`. `tests/data-retention.test.ts` asserts the same by reading each file's source. |
| R3  | Unit | `npx vitest run tests/data-retention.test.ts` passes, and the test file contains one assertion per attempt table (five) comparing an imported window constant with `ATTEMPT_RECORD_RETENTION_HOURS * 3_600_000`. `git diff origin/staging -- lib/repositories/` shows no changed window value. |
| R4  | Unit | `npx vitest run tests/cookie-banner-consent.test.tsx` passes, including a case asserting the R4 body text exactly (whitespace-normalised) and both link hrefs. |
| R5  | Unit | `grep -n 'CONSENT_SETTINGS_OPEN_EVENT = "store-consent-open"' lib/storage-keys.ts` matches. |
| R6  | Unit | A test renders `CookieSettingsButton`, finds `getByRole("button", { name: "Cookie settings" })` with `type="button"`, clicks it, and receives one `store-consent-open` event on `window`. First line of the file is `"use client";`. |
| R7  | Unit | `tests/cookie-banner-consent.test.tsx`: with `store_cookie_consent=essential` set, render → banner absent; dispatch `store-consent-open` → banner present with "Your current choice: Essential Only."; repeat with `accepted` → "Your current choice: Accept All." |
| R8  | Unit | Same file: with no consent cookie, render → banner present and `queryByText(/Your current choice/)` is null. |
| R9  | Unit | Same file: after the reopen in R7, `document.activeElement` is the "Essential Only" button. On a first-visit render, `document.activeElement` is `document.body`. |
| R10 | Unit | Same file: after a reopen with `accepted` stored, click "Essential Only" → a write of `store_cookie_consent=essential` is recorded by the cookie-setter spy, the banner is absent, and one `store-consent-change` event with `{ value: "essential" }` is received. Repeat in the other direction. |
| R11 | Unit | Same file, rendering `CookieBanner` alone: clicking "Essential Only" records writes containing `store_referral_code=; max-age=0; path=/` and the legacy referral name with `max-age=0; path=/`. Clicking "Accept All" records no write whose name is either referral cookie. |
| R12 | Unit | `npx vitest run tests/storefront-footer.test.tsx` passes, including a case reading the children of `nav[aria-label="Legal"]` in order: links "Terms", "Privacy", "Cookies", then a button "Cookie settings". |
| R13 | E2E | Preview. In a browser at 360×740, open `/` on each host, scroll to the footer, run `document.documentElement.scrollWidth` (must be ≤ 360) and, for each child of `nav[aria-label="Legal"]`, `getBoundingClientRect()` with `left >= 0` and `right <= 360`. Record both hosts' numbers in build notes / validation output. |
| R14 | Unit | `npx vitest run tests/privacy-cookies-section.test.tsx` passes, including a case that the `#cookies` section's last paragraph is "You can change your choice at any time." and is followed by a button named "Cookie settings". |
| R15 | Unit | `git diff origin/staging -- components/checkout/CheckoutForm.tsx lib/checkout-details-storage.ts` prints nothing. The existing `privacy-cookies-section` cases asserting `CHECKOUT_DETAILS_KEY` and the closing sentence still pass unchanged. |
| R16 | Unit | A section-5 test (new file `tests/privacy-retention-section.test.tsx`) asserts the R16 paragraph exactly, and that "Searches." is inside `<strong>`. |
| R17 | Unit | Same file: the R17 paragraph exactly, with its lead inside `<strong>`. |
| R18 | Unit | Same file: the assistant paragraph's text ends with the R18 sentences exactly, and starts with the unchanged "The help assistant. If a store offers a help assistant and you use it," prefix. |
| R19 | Unit | Same file: the feedback paragraph's text ends with the R19 sentence exactly. |
| R20 | Unit | Same file: a case with `vi.mock("@/lib/data-retention", ...)` returning 30 / 45 / 2 renders "after 30 days" in R16, "after 45 days" in R18 and "after 2 hours" in R17. |
| R21 | Unit | `npx vitest run tests/vendor-neutral-copy.test.ts` passes; `git diff origin/staging -- tests/vendor-neutral-copy.test.ts` prints nothing. |
| R22 | Accessibility | `npx vitest run tests/a11y/cookie-banner.test.tsx` passes, and the file has a case that sets a stored choice, dispatches `store-consent-open`, and runs axe with zero violations. |
| R23 | Docs | Read `docs/developer-portal/app-conventions.md`: one bullet/paragraph names `lib/data-retention.ts`, `/privacy` and `#1041`, in the same bullet or paragraph (not necessarily the same physical line). `npm run kms:validate` exits 0. |
| R24 | E2E | Preview, Aheed host, real browser, cookies cleared. Steps exactly as R24. Read cookies from DevTools Application → Cookies (or `document.cookie`) at both checkpoints: after Accept All `store_referral_code=TESTREF` is present; after Essential Only via the footer's Cookie settings, `store_cookie_consent=essential` and `store_referral_code` is absent. |
| R25 | Docs | `git diff origin/staging -- CHANGELOG.md` shows an entry citing `#1107` and `#1041`. |
| R26 | Gate | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0; `npx vitest run` run alone exits 0 and its summary shows no file "failed to start". CI's `quality / quality` is the ground truth. |
