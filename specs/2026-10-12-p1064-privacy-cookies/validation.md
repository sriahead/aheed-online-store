# Privacy page — Cookies and Local Storage (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

The risk in this slice is not logic; it is **a privacy page that says something untrue**. So:

- **Unit** pins the text, the order, and the three names that already exist as exported constants.
- **E2E** is what proves the list is *true*: it observes the real cookie jar and `localStorage` in a
  real browser and compares them to the page. A unit test cannot do that, so R8–R11 are not
  optional.
- **Browser checks** use headless Chrome driven over the DevTools protocol
  (`chrome --headless=new --remote-debugging-port=<port>`, then `Runtime.evaluate` and
  `Network.getCookies`), or the Claude-in-Chrome extension. Add
  `--host-resolver-rules="MAP srimart.localhost 127.0.0.1"` for SriMart. Drive navigations to
  completion before the script exits; aborting a navigation mid-stream crashes the local preview.
- DB-touching flows run under `npm run preview`, never `npm run dev` (CLAUDE.md).

## Setup (once, before the E2E rows)

1. **Confirm which database is local.** Compare the `DATABASE_URL`/`DIRECT_URL` hosts in `.env` and
   `.dev.vars` with `secrets/staging.vars` and `secrets/production.vars`, printing hosts only. They
   must match neither file (the dev project).
2. **Seed if empty.** If `/` shows no products, run
   `SEED_AHEED_HOST=localhost:8787 SEED_SRIMART_HOST=srimart.localhost:8787 npm run db:seed`.
3. **Start the preview.** Kill leftover `node`/`workerd` preview processes, run `npm run preview`,
   wait for `GET / 200`.
4. **Customer sign-in.** Use `demo-customer@example.com` (a non-staff account; the staff accounts
   are `demo-admin`, `demo-staff`, `demo-store-admin` and `demo-srimart-admin`). The password is
   `DEMO_ACCOUNT_PASSWORD` from **`.dev.vars`** (the `.env` value is rejected under preview). In
   the browser, POST `{ email, password }` to `/api/auth/sign-in/email`. Never print the password.
5. This slice writes no database rows beyond the cart and session the flow itself creates; no
   snapshot or restore is needed.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Unit + E2E | Run `npx vitest run tests/privacy-cookies-section.test.tsx`; the heading and `id` assertions pass. Then in the browser on Aheed `/privacy`: `document.querySelectorAll('#cookies').length === 1` and `document.querySelector('#cookies h2').textContent === '4. Cookies and Local Storage'`. |
| R2, R3, R4 | Unit + E2E | Same test file passes. In the browser, read `document.querySelectorAll('#cookies > p')` (whitespace-normalised `textContent`): the first equals R2's string, the second equals R3's, the last equals R4's. Compare character for character, including the commas and the final full stop. |
| R5 | Unit + E2E | Same test file passes. In the browser, `document.querySelectorAll('#cookies ul > li').length === 7`, and for each `li`, `li.querySelector('code').textContent` and the text after ` — ` equal the R5 table row in order. Check the separator is U+2014 with a space either side: `li.textContent.includes(' — ')`. |
| R6 | E2E | Take the section's `textContent` on Aheed `/privacy` and on SriMart `http://srimart.localhost:8787/privacy`. They are identical strings. Neither contains `Food Centre`, `SriMart` or `Aheed ` (capital A, trailing space). Remove the four `aheed_`-prefixed names from the string; no `aheed` remains. |
| R7 | Unit + E2E | Same test file passes. On Aheed `/privacy`, the section's `textContent` contains none of `aheed_session`, `admin-tier`. No `li > code` has text exactly `session`, `cart` or `cookie_consent`. |
| R8 | E2E | In a **fresh browser profile** (`--user-data-dir=<new empty dir>`): open Aheed `/`; submit a delivery postcode the seed serves (read one from `prisma/seed.ts` delivery rules); choose Collection or Delivery in the header; open a category page and add one product; click the cookie banner's "Essential Only"; open `/?ref=TESTCODE` and wait 2s; POST the sign-in from Setup 4. Call `Network.getCookies` for `http://localhost:8787`. The names present include `aheed_cart`, `aheed_cookie_consent`, `delivery-postcode`, `fulfilment-method`, `aheed_referral_code` and `better-auth.session_token`. Each of the first five appears as an R5 `code` text; the last equals R5 row 1 with `__Secure-` removed. If a name from rows 1–6 is missing, say which, and treat R8 as failed. |
| R9 | E2E + source | From the same jar read the cookie holding the session: its name is exactly `better-auth.session_token`. Then run `grep -n "SECURE_COOKIE_PREFIX\|startsWith(\"https://\")" node_modules/better-auth/dist/cookies/index.mjs`; line ~21 shows the prefix is applied when the base URL starts with `https://`. Record both observations. |
| R10 | E2E | From the same jar, list every cookie name. Remove R5 rows 1–6 (row 1 as `better-auth.session_token`). The remainder is empty (the account in Setup 4 is not staff, so `admin-tier` is absent). Any leftover name is a failure; name it in the report. |
| R11 | E2E | In the same session open `/checkout` (the cart has an item), type a value into one text field of the form, then run `Object.keys(localStorage)` in the page. The result is exactly `["aheed_checkout_details"]`. |
| R12 | Unit | Run `npx vitest run tests/privacy-cookies-section.test.tsx`; it passes. Read the test: it imports `CART_COOKIE`, `DELIVERY_POSTCODE_COOKIE` and `FULFILMENT_METHOD_COOKIE` from their modules and asserts each value is a list item name; it does not write those three strings as literals for that assertion. |
| R13 | Unit | Run `git diff --name-only origin/staging`; every path is one of the R13 list. Run `git diff origin/staging -U0 -- "app/(storefront)/privacy/page.tsx"` and read each hunk header: all changed line numbers fall between the `<section id="cookies"` line and its closing `</section>` in the new file. `grep -n "<h2" "app/(storefront)/privacy/page.tsx"` shows the other section headings unchanged against `git show origin/staging:"app/(storefront)/privacy/page.tsx"`. |
| R14 | Unit | Run `npx vitest run tests/storefront-footer.test.tsx`; it passes, and `git diff origin/staging --stat -- tests/storefront-footer.test.tsx` is empty. |
| R15 | Unit | Run `git diff origin/staging -- CHANGELOG.md`; it shows an added entry containing `#1064`. |
| R16 | Unit | Run `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` and `npm run kms:validate`; each exits 0. Run `npx vitest run` alone, with no build running; it exits 0 with no "failed to start" or skipped files (a one-off failure of `tests/storefront-chrome-rewards-gate.test.tsx` or `tests/add-to-cart-feedback.test.tsx` that passes in isolation is a known load flake: re-run the whole suite once, and report it). Run `npm run kms:build-index` then `git status --short`: no uncommitted change to `ARTIFACT_INDEX.md` or `app/(admin)/staff/runbook/docs.ts`. Once pushed, the PR's `gates` check is green. |
| R9 (HTTPS half) | E2E, post-deploy | **Unverified until `staging` is deployed.** On `https://staging.aheedfoodcentre.nocaped.com`, sign in as a staging demo customer and read the session cookie name from the jar; it must be `__Secure-better-auth.session_token`. Also read the `Set-Cookie` headers on one `GET /` and note any cookie not in R5 (plan.md open item 2). Report this row as unverified, with the reason, if it is not run before `/ship`. |
