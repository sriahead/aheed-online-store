# Slice B — feature switches and marketing consent (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice touches auth (a sign-up hook), the database (a migration and a new table), personal-data
rights and UI copy, so unit, integration and live two-vendor checks all apply. Risk is concentrated
in R18–R20 (a hook on the sign-up path) and R24 (erasure), so those get both a unit test and a live
check. Accessibility of the new checkbox is covered by its `<label>` association (R16) and the
mobile layout script (R29); this repo has no axe dependency.

## Setup for the live rows

1. `npm ci && npm run db:generate`, then apply this branch's migration to the **dev** database
   (`npx prisma migrate deploy` with `.env`'s `DIRECT_URL`; first diff `.env` and `.dev.vars`
   against `secrets/staging.vars`, per CLAUDE.md, and confirm you are on the dev database, never
   staging or production).
2. Kill any leftover `node`/`workerd` processes, then `npm run preview` (never `npm run dev`).
3. Sign in as the seeded Aheed ADMIN and set switches through the real staff pages:
   `/staff/storefront` → Marketing consent **on** for Aheed; leave SriMart's **off** (its default).
   `/staff/loyalty` is used to flip `loyaltyEnabled` for R2/R3/R5. Record each switch's starting
   value and restore it at the end.
4. SriMart requests carry `-H "Host: srimart.localhost:8787" -H "x-forwarded-proto: http"`, and
   `MSYS_NO_POSIX_PATHCONV=1` in Git Bash (local-dev playbook).

## Validation Steps

In the table, `\|` is a Markdown-escaped `|`: type a plain `|` when running the command (a shell
pipe, or alternation inside `grep -E`).

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | A test renders `AccountNav` with `loyaltyEnabled={false}` and finds no link to `/account/loyalty`, and with `true` finds one. `npx tsc --noEmit` passes, proving both callers pass the prop (it is required). |
| R2  | E2E | Loyalty **off** for Aheed: as a signed-in seeded customer, `curl` `/account` HTML contains neither `Loyalty &amp; Rewards` nor `not enabled for this store`, and the `<p>` under "Your account" does not contain `loyalty`. Loyalty **on**: the HTML contains `href="/account/loyalty"`. |
| R3  | E2E | Loyalty **off**: `curl -s` of `/privacy` and of `/account/data` (signed in) each piped to `grep -c "loyalty points"` prints `0`. Loyalty **on**: both print a count of at least `1`. |
| R4  | Integration | `npx vitest run tests/data-rights` (the existing data-rights tests) passes unchanged in the loyalty assertions; `git diff origin/staging -- lib/repositories/data-rights.ts` shows no change to the loyalty export or erasure statements. |
| R5  | E2E | Loyalty **off**: for each of `/`, `/help`, `/account`, `/account/orders`, `/account/data` (signed-in cookie), `curl -s ... \| grep -c 'href="/account/loyalty"'` prints `0`. |
| R6  | Unit | A footer test renders with `offerDeliverySlots: true` and finds the link text `Delivery areas & slots`, and with `false` finds exactly `Delivery areas`. |
| R7  | Review | Open `build-notes.md`: a section names all four switches, the surfaces checked for each, and the result; every unfixed mismatch cites an issue number, and `gh issue view <n>` shows it open on Project #2. |
| R8  | Review | Read the `VendorConfig`, `MarketingConsentSource` and `MarketingConsentEvent` blocks in `prisma/schema.prisma`: fields, FK `onDelete: Cascade` on `userId`, the `(vendorId, userId, createdAt)` index, and no `Json` type all match R8. `npx prisma validate` exits 0. |
| R9  | Review | `git diff --name-only origin/staging -- prisma/migrations` lists exactly one new `migration.sql`. `grep -inE '^\s*(DROP\|UPDATE\|INSERT)\b' <that file>` prints nothing, and every statement is one of the kinds R9 allows. (Anchored on statement starts at Document: the unanchored first version matched the `ON UPDATE CASCADE` clause inside each foreign-key `ADD CONSTRAINT`.) |
| R10 | Unit | A vendor-profile test (or the existing one, extended) asserts `marketingConsentEnabled` is returned, and is `false` when there is no config row; `graft grep "marketingConsentEnabled"` shows it selected in the same query as `assistantEnabled`. |
| R11 | Unit | A test asserts `marketingConsentStatement("Test Store")` equals the exact R11 sentence with `Test Store`. `head` of the module shows no `"use server"`; `grep -inE 'aheed\|srimart'` on the file prints nothing. |
| R12 | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` passes; `git diff origin/staging -- tests/repository-purity.test.ts tests/repository-client-injection.test.ts` shows no allowlist added. Read `recordMarketingConsent`: a singular `create` with no nested relation writes. |
| R13 | Unit | `npx vitest run` on the marketing-consent repository test file passes and its test names cover the five cases listed in R13. |
| R14 | E2E | As the seeded Aheed ADMIN, `/staff/storefront` shows the Marketing consent section; toggle it on and save, reload and see it checked. Then `npx tsx scripts/verify-marketing-consent.ts <any email>` prints Aheed `true` and SriMart `false`. `head -3` of the action file shows `"use server"`, and every line `grep -nE '^export ' <action file>` prints begins `export async function` (simplified at Document from an obscure negated-class regex). |
| R15 | Integration | A unit test of the save action with a non-ADMIN role returns an error state and the repository setter is not called. Signed in as a seeded non-ADMIN staff user, `/staff/storefront` still renders `PanelRefusal`. |
| R16 | E2E | SriMart (switch off): `curl -s` of `/register` piped to `grep -c 'type="checkbox"'` prints `0`. Aheed (switch on): the HTML has one checkbox with no `checked` and no `required` attribute, its label text equals the R11 sentence with Aheed's vendor name, and it appears after the password input and before the submit button in source order. |
| R17 | Unit | A `RegisterForm` test (mocking `signUp.email`) asserts the call carries `marketingOptIn: true` when ticked and carries no `marketingOptIn: true` when not. |
| R18 | Unit | Tests of the pure decision function: returns "record" only for path `/sign-up/email` + `marketingOptIn === true` + resolved vendor + switch on; returns "skip" for each condition failing in turn, including `marketingOptIn: "true"` (string). A test asserts the written statement comes from the vendor name, not from a body field. |
| R19 | E2E | Run R28's script after: a SriMart sign-up with `marketingOptIn: true` (no SriMart event), an Aheed sign-up without the flag (no event), and a second Aheed sign-up with the flag for an email that already exists (no new event). Google sign-up: covered by R18's path test (`/callback/google` → skip), since OAuth cannot be driven locally. |
| R20 | Unit | A test makes the consent write throw and asserts the hook resolves (does not throw) and `recordErrorEvent` was called once. |
| R21 | E2E | Signed in as a seeded verified Aheed customer with no events: `/account/data` shows "Marketing emails", "not opted in" state, an "Opt in" control and the statement. Opt in → state shows opted in with "Withdraw", and R28's script shows the event's statement names Aheed. Withdraw → back to not opted in. Calling the action with no session cookie returns without writing (event count unchanged via R28's script). |
| R22 | E2E | Turn Aheed's switch **off**. A customer with no current consent: `/account/data` has no "Marketing emails" section. A customer whose newest event is granted (opt in before switching off): the section shows "Withdraw"; withdrawing writes a `granted: false` event. |
| R23 | Unit | An export test with events for two vendors asserts only the requested vendor's events appear, newest first, with all four fields. Live: the `/account/data/export` download for R21's customer contains the two `ACCOUNT` events. |
| R24 | Integration | An erasure test asserts this vendor's events are deleted and another vendor's survive; a `countOtherVendorData` test asserts a user whose only other-vendor data is one consent event counts as `1`. |
| R25 | E2E | Aheed switch **on**: `curl -s .../privacy` contains `If you opt in, we may use your details for marketing and promotional purposes.`, a link to `/account/data` inside section 3, and section 3 (text between the `3. How We Use Your Data` and `4. Cookies` headings) does not contain `solely`. Section 5 mentions the marketing-consent record and section 6's erasure paragraph mentions marketing preferences. |
| R26 | E2E | SriMart (switch off): `curl -s .../privacy \| grep -c "marketing and promotional"` prints `0`, and section 3's text matches `git show 02b25cc:"app/(storefront)/privacy/page.tsx"`'s section 3 wording (read side by side). |
| R27 | Unit | `npx vitest run` on the user-facing-copy guard test named in `docs/developer-portal/app-conventions.md` passes; `git diff origin/staging` of new or changed `components/` and `app/` files, grepped for `-iE 'aheed\|srimart\|grocer'`, matches only comments or test fixtures. |
| R28 | E2E | With the setup above, run the three sign-ups (Aheed ticked, SriMart ticked, Aheed opt-in then withdraw for a seeded customer), then `npx tsx scripts/verify-marketing-consent.ts <email>` for each email. It exits 0 and prints: one Aheed `REGISTRATION granted` event with Aheed's name in the statement; nothing for SriMart; two Aheed `ACCOUNT` events, `granted` then `withdrawn`. `grep -nE '\.(create\|update\|delete\|upsert)' scripts/verify-marketing-consent.ts` prints nothing. |
| R29 | E2E | `npx tsx scripts/verify-mobile-layout.ts` (per its usage line) on Aheed's `/register` and `/account/data` with the section visible reports no overflow at both widths. |
| R30 | Review | Read the `/staff/storefront` and `/staff/loyalty` sections of `docs/store-admin-guide/admin-tabs-guide.md`; trace each new capability sentence to a control in `app/(admin)/staff/storefront/page.tsx` or `/staff/loyalty`. |
| R31 | Integration | `npm run sdd:audit` prints `✓ roadmap change-log entry cites` for the three named slices and no "row pending carry-forward" line for PR #1151. |
| R32 | Review | `grep -n "sitemap" specs/2026-10-18-p1145-quick-shop/requirements.md specs/2026-10-18-p1145-quick-shop/validation.md` shows R5 saying the route is absent from the sitemap; `grep -n "/shop-your-list" app/sitemap.ts` shows only the explanatory comment, not a listed URL. |
| R33 | Review | `gh issue view <n>` for the issue cited in `build-notes.md` is open and names all three obligations; `gh project item-list 2 --owner sriahead --format json --limit 600` shows it with a Phase and Status `Backlog`. |
| R34 | Integration | `npm run kms:validate` exits 0; `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` exits 0. |
| R35 | Review | `git diff origin/staging -- CHANGELOG.md` shows an entry citing `#1134`. |
| R36 | Unit | CI `gates` on the PR is green (CI is ground truth). Locally: `npm run lint`, `npm run typecheck`, `npm run format:check`, then `npx vitest run` **alone** (not beside a build), each exit 0, and the vitest summary reports no failed or skipped-to-start test files (see `#1125` for the known nondeterminism; a local run that never started a file is not a pass). |
