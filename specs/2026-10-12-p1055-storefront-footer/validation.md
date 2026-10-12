# Storefront footer — three-column, vendor-configured (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Give enough testing for confidence without unnecessary or duplicate tests. Avoid testing the same behaviour at several levels unless doing so adds confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Risk profile: UI change on every storefront page, a schema migration, and two new server actions
that write vendor data inside an `href`. Unit tests cover the parsers and the palette. Integration
checks use `npm run preview` against the staging database, never `npm run dev`. E2E checks drive a
real browser at 1280px and 375px.

## Setup (once, before the E2E rows)

1. Diff `.env` and `.dev.vars` against `secrets/staging.vars` (CLAUDE.md). The diff must show they
   point at the staging project.
2. Apply the migration to staging through CI, or locally against `DIRECT_URL` only if the user
   approves. Then run the seed (`npx prisma db seed`) with `SEED_AHEED_HOST` and `SEED_SRIMART_HOST`
   set.
3. Kill any leftover `node`/`workerd` processes, then run `npm run preview`.
4. Reach the Aheed and SriMart hosts through the preview's host mapping, or check on staging after
   the merge to `staging`.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Unit | Read `model VendorConfig` in `prisma/schema.prisma`. It contains `contactPhone String?`, `contactEmail String?`, `companyNumber String?`, `vatNumber String?`, `registeredOffice String?`, `openingHoursNote String?` and `showSecureCheckoutNote Boolean @default(false)`. |
| R2 | Unit | Read `prisma/schema.prisma`. `model VendorOpeningHours` has the listed fields and `@@index([vendorId, sortOrder])`. `enum PaymentBadgeMethod` has exactly the five values. `model VendorPaymentBadge` has `@@unique([vendorId, method])`. Both relations are `onDelete: Cascade`. Neither model has a `Json` field. |
| R3 | Integration | Run `git diff --name-only origin/staging -- prisma/migrations`. It lists exactly one new directory. Read its `migration.sql` in full. It has no `DROP INDEX` naming a `_trgm` index and no `DROP TABLE` / `DROP COLUMN` for any pre-existing object. |
| R4 | Unit | Read `fetchVendorProfile`. It contains exactly one `prisma.` call, the `vendor.findUnique`. Its `select` includes the seven new config fields, `location`, `openingHours` (`orderBy: { sortOrder: "asc" }`) and `paymentBadges`. The returned object's fallbacks are `null` / `false` / `[]`. `paymentBadges` is sorted by enum order in code. `npm run typecheck` exits 0. |
| R5 | Unit | Run `grep -n "<footer" components/layout/StorefrontChrome.tsx`. There is no match. Run `grep -n "StorefrontFooter" components/layout/StorefrontChrome.tsx`. It matches both the import and the JSX use. |
| R6 | E2E | In the browser at 1280×800, open Aheed `/` and Aheed `/help`. Each has exactly one `footer` element (`document.querySelectorAll('footer').length === 1`), containing the three headings. Compare the three column elements' `getBoundingClientRect().top` values: they are within 8px of each other. Resize to 375×800 and reload. Each column's `top` is greater than the previous column's `bottom`, and `document.documentElement.scrollWidth <= 375`. |
| R7 | E2E | On Aheed at 1280px, column 1 shows "Aheed Food Centre" and "13 N 11th St", "Milton Keynes", "MK9 3BU". The "Get directions" `href` equals `https://www.google.com/maps/search/?api=1&query=` + `encodeURIComponent("Aheed Food Centre, 13 N 11th St, Milton Keynes, MK9 3BU")`, allowing for whatever trailing `VendorLocation` values the database actually holds. The phone anchor is `href="tel:01908239130"`. The text `[YOUR EMAIL]` is present and is **not** inside any `<a>`. Then set the email to `shop@example.com` on `/staff/storefront`, reload, and confirm an `<a href="mailto:shop@example.com">` exists. Restore `[YOUR EMAIL]` afterwards. |
| R8 | E2E | At 375px on Aheed, a "Call" control (`href="tel:01908239130"`) and a "Get directions" control render above the first column. At 1280px, neither of those two mobile controls is visible (`offsetParent === null` or `display:none`). |
| R9 | E2E | On Aheed, column 2 lists, in order, "Monday – Friday / [OPEN] – 8pm", "Saturday / [OPEN] – 8pm", "Sunday / [OPEN] – [CLOSE]" and "Bank holidays / [HOURS]", then the Click & Collect note. On SriMart, the text "Shop opening hours" is absent from the page. |
| R10 | E2E | On Aheed, column 3 contains anchors with `href` values `/help`, `/help#delivery`, `/terms#refunds`, `/account/loyalty` (Aheed has loyalty on), `/feedback`, plus an anchor named "Facebook" pointing at Aheed's `facebookUrl` if one is set. On SriMart, check whether its config has loyalty on. If it is off, `/account/loyalty` is absent from the footer. If SriMart has no `facebookUrl`, no "Facebook" anchor appears. |
| R11 | Unit | Run `grep -n 'id="delivery"' "app/(storefront)/help/page.tsx"`, `grep -n 'id="refunds"' "app/(storefront)/terms/page.tsx"` and `grep -n 'id="cookies"' "app/(storefront)/privacy/page.tsx"`. Each returns one match on, or wrapping, the named section. In the browser, opening `/help#delivery` scrolls to "Delivery & Minimums". |
| R12 | E2E | On Aheed, the bottom bar contains `© 2026 Aheed Food Centre`, "Company no. [NUMBER]", "VAT [NUMBER]", "Powered by [PLATFORM NAME]", the anchors `/terms`, `/privacy` and `/privacy#cookies`, and "Secure checkout powered by Stripe". It has five `<img>` elements whose `src` values end, in order, `visa.svg`, `mastercard.svg`, `amex.svg`, `apple-pay.svg`, `google-pay.svg`, each with non-empty `alt`. "Registered office" is absent, because it is unseeded. Unchecking Amex on `/staff/storefront` and reloading leaves four images. Re-check Amex afterwards. |
| R13 | Unit | Run `ls public/payment-methods/`. It lists exactly the five files. Each one starts with `<svg` and parses as XML (`node -e` with `DOMParser`, or open each one in the browser). |
| R14 | E2E | At 375px on Aheed, run in the console: `[...document.querySelectorAll('footer a, footer button')].filter(e => e.getBoundingClientRect().height < 44).length`. It returns `0`. |
| R15 | Unit | `npx vitest run lib/footer-palette.test.ts` passes, and the test file asserts ≥ 4.5 for `text`, `heading` and `muted` with both vendors' primitives. Run `grep -nE "#[0-9a-fA-F]{3,8}\b" components/layout/StorefrontFooter.tsx`. There is no match. Run `git diff origin/staging -- design-system/tokens/tokens.css`. It is empty. `npx vitest run tests/token-alpha-purity.test.ts tests/vendor-neutral-copy.test.ts` passes. |
| R16 | Unit | `npx vitest run lib/footer-contact-form.test.ts` passes. Read the test file: it has at least one case per row of R16's table, including `[YOUR EMAIL]` accepted, `bob@` rejected, a 21-character company number rejected, and blank → `null`. |
| R17 | Unit | `npx vitest run lib/footer-hours-form.test.ts` passes. The tests cover: 9 rows rejected, an all-blank row dropped, a half-filled row as a field error, a 41-character label rejected, `sortOrder` assigned from submit order, duplicate badges deduplicated, and an unknown badge ignored. |
| R18 | Integration | Read `features/admin/storefront.ts`. Both new actions start with `requireVendorRole("ADMIN")`, read no vendor id from `formData`, and pass only their own fields. Run `grep -n "^export" features/admin/storefront.ts`; every match is `export async function`. Read the repository replace function: it uses `getPrismaWs()` (or a client of that type) and `$transaction`. Run `grep -n "createMany\|updateMany" lib/repositories/vendor.ts`; every match sits in a function whose client parameter is typed `ReturnType<typeof getPrismaWs>`. As an unauthenticated user, `curl` a POST to the action. It returns the refusal message, and the database row is unchanged. |
| R19 | E2E | Under `npm run preview` as an Aheed admin, `/staff/storefront` shows both section headings, pre-filled with the seeded values. Change the VAT field to `GB123456789` and save. The form shows a saved state, and Aheed `/` shows "VAT GB123456789". Enter `bob@` as the email and save. A field error appears against the email input, and the storefront email is unchanged. Clear the company-number field and save. "Company no." disappears from the footer. Save the hours form; the social-links and delivery-rule values on the same page are unchanged. Restore the seeded values afterwards. |
| R20 | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` passes. |
| R21 | Unit | Read the `/staff/storefront` entry in `app/(admin)/staff/runbook/docs.ts`. It names "Footer contact & legal" and "Opening hours & payment badges" and says what each one controls. Run `git diff --name-only origin/staging -- "app/(admin)/staff"`. It shows no new `page.tsx`. `npx vitest run tests/staff-nav-parity.test.ts` passes. |
| R22 | Unit | Read `lib/config.ts`. `getPlatformBrandingEnv` exists, uses `readEnv("PLATFORM_NAME")` and its own schema. Run `grep -n "PLATFORM_NAME" wrangler.toml`. It shows two matches, under the staging and production vars. Run `grep -rn "process.env.PLATFORM_NAME" app components lib features`. There is no match. |
| R23 | Integration | Run the seed. Query staging through a Node script against `DIRECT_URL` or a read-only check: Aheed has the listed config values, 4 opening-hours rows and 5 badges. Change Aheed's VAT number on `/staff/storefront`, re-run the seed, and confirm the VAT value is still the edited one and the row counts are still 4 and 5. Confirm SriMart has 0 hours rows and 0 badges. Restore the VAT value afterwards. |
| R24 | E2E | Open SriMart `/` at 1280px. The © line names SriMart. The page text contains none of "Aheed", "MK9 3BU", "01908" or "Shop opening hours". There is no "Secure checkout powered by Stripe" text and no `img[src^="/payment-methods/"]`. The always-on column 3 links and the Terms/Privacy/Cookies links are present. The footer's computed `background-color` differs from Aheed's. |
| R25 | Unit | Run `git diff origin/staging -- CHANGELOG.md`. It shows an added entry containing `#1055`. |
| R26 | Unit | `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` and `npm run kms:validate` each exit 0. `npx vitest run`, run alone with no build running, exits 0 and its summary shows no "failed to start" or skipped files. CI on the PR is green. |
