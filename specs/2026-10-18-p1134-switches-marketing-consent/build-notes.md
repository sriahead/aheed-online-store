# Slice B — feature switches and marketing consent (build notes)

Written at the end of Build, before the Clear. Branch `feature/p1134-switches-marketing-consent`,
cut from `origin/staging` at `02b25cc`. Commits: `d6a2f37` (spec), `e8d0ee5` (code and tests),
`563671d` (admin guide, roadmap catch-up, `#1145` R5 fix), `038719a` (autocomplete test), plus the
build-notes commit that carries this file, `CHANGELOG.md` and `app-conventions.md`.

## What changed and why

**Rewards follows `loyaltyEnabled` (R1–R5).**
- `components/account/AccountNav.tsx` takes a required `loyaltyEnabled` prop. Both callers,
  `app/(storefront)/account/layout.tsx` (now `async`) and `app/(storefront)/feedback/page.tsx`, read
  it from `getCurrentVendorProfile()`.
- `app/(storefront)/account/page.tsx`: the greyed "not enabled" card is gone (`&&` instead of a
  ternary) and the intro sentence has two variants.
- `app/(storefront)/privacy/page.tsx` sections 5 and 6 and `app/(storefront)/account/data/page.tsx`
  name loyalty points only with the switch on. `lib/repositories/data-rights.ts`'s loyalty export and
  erasure are untouched (R4).

**Footer (R6).** `components/layout/StorefrontFooter.tsx` reads `profile.offerDeliverySlots`, which
is already on `VendorProfile`.

**Switch audit (R7).** Checked at Build against the storefront and checkout:
- `assistantEnabled`: already gated wherever it is used: `/help` (`HelpContactCard`), `FloatingContact`
  via `StorefrontChrome`, and `features/assistant/assistant.ts` (server). No mismatch.
- `offerCollection`: `/help`'s Click & Collect section, `Header`/`LocationControl`, `banner-headline.ts`,
  `/checkout` and `lib/assistant-content.ts` all gate on it. `CartContents`' "Ready for Click &
  Collect" and `CheckoutSummary`'s "Click & Collect" label render only when collection is the chosen
  method, which cannot be chosen when it is off. No mismatch.
- `offerDeliverySlots`: the footer link said "slots" regardless. **Fixed (R6).** `/help#delivery`
  itself does not mention slots. Checkout's `SlotPicker` is already gated.
- `expressCollectionEnabled`: only `/checkout`, `CheckoutForm` and `SlotPicker` mention express
  collection, all gated. `components/staff/ExpressCountdown.tsx` is staff-side. No mismatch.
- No unfixed mismatch, so R7 needs no new issue.

**Marketing consent (R8–R29).**
- Schema: `prisma/schema.prisma` adds the `marketingConsentEnabled` column, the enum, the
  `MarketingConsentEvent` model and the relation fields on `Vendor` and `User`.
  - `prisma format` realigned about 30 `User` field lines (whitespace only; `git diff -w` shows
    additions only).
- Migration: `prisma/migrations/20261018200000_p1134_marketing_consent/migration.sql`, generated with
  `prisma migrate diff --from-schema-datamodel <origin/staging schema> --to-schema-datamodel
  prisma/schema.prisma --script`. This is the `specs/architecture.md` route that cannot propose
  `pg_trgm` drops. It was read before saving: CREATE TYPE, ALTER TABLE ADD COLUMN, CREATE TABLE,
  CREATE INDEX and two ADD CONSTRAINT foreign keys.
- `lib/marketing-consent.ts` (pure, client-importable):
  - `marketingConsentStatement`.
  - `decideSignUpMarketingConsent`, which returns a discriminated decision with a `reason`.
  - The `MARKETING_OPT_IN_FIELD` and `SIGN_UP_EMAIL_PATH` constants.
- `lib/repositories/marketing-consent.ts`: `recordMarketingConsent`, `getMarketingConsentState` and
  `hasEffectiveMarketingConsent`, each taking an explicit client, vendor and user.
- `lib/marketing-consent-service.ts`: the request-scoped facade.
  - `forUser` returns the switch, the statement and the state.
  - `recordAccountChoice` enforces "opt in needs the switch, withdraw needs a current grant".
  - `setEnabled(vendorId, enabled)` is used by the staff action.
- `lib/marketing-consent-signup.ts`: the hook body, with its dependencies injected.
  - It runs a cheap pre-check with a placeholder vendor first, so Google sign-ups and unticked
    sign-ups never trigger the vendor read.
  - It never throws. A failed write goes to `recordHandledErrorEvent` (the request-scoped wrapper
    over `recordErrorEvent`), and a failed report goes to `console.error`.
- `lib/auth.ts`: `databaseHooks.user.create.after` wires the hook with
  - `getCurrentVendorProfile` (vendor resolution),
  - `recordMarketingConsent(getPrisma(), …, source "REGISTRATION")` (the write),
  - `recordHandledErrorEvent` (failure reporting).
- `/register`: `app/(storefront)/register/page.tsx` became `async`. It reads the profile and passes
  `marketingStatement` (or `null`) to `features/auth/components/RegisterForm.tsx`.
  - The form renders the checkbox after the password field and spreads `marketingOptIn: true` into
    `signUp.email` only when the box is ticked.
- `/account/data`:
  - New `components/account/MarketingConsentForm.tsx`.
  - New action `setMyMarketingConsent` added to the existing `"use server"` file
    `features/account/data-rights.ts`. It is async, like everything else there, and reuses
    `DataRightsFormState`.
  - The page shows the section when the switch is on **or** the shopper is currently granted.
- Staff switch:
  - Form state in the plain module `lib/marketing-consent-settings-form.ts`.
  - Action `features/admin/marketing-consent.ts` (`"use server"`, async only, ADMIN, keyed on
    `auth.vendorId`).
  - UI `components/staff/MarketingConsentSettingsForm.tsx`, rendered in a new section in
    `app/(admin)/staff/storefront/page.tsx` before the review links.
  - Setter `setVendorMarketingConsentEnabled` in `lib/repositories/vendor.ts`, mirroring
    `setVendorAssistantEnabled`.
- Data rights: `lib/repositories/data-rights.ts` changes three paths.
  - The export gains a `marketingConsent` field.
  - The erasure gains a `deleteMany` inside the existing transaction, plus a
    `marketingConsentEventsDeleted` count on `EraseResult`.
  - `countOtherVendorData` gains the consent count.
- `/privacy`, with the switch on: section 3 drops "solely" and adds the opt-in paragraph with a link
  to `/account/data`. Section 5 gains a "Marketing choices" paragraph, and section 6's erasure list
  gains "your marketing preferences". With the switch off, section 3 is byte-identical to `02b25cc`.
- Read-only script: `scripts/verify-marketing-consent.ts <email>` prints each active vendor's switch,
  then that user's events per vendor.

**Tests.**
- New: `tests/marketing-consent.test.ts`, `tests/marketing-consent-signup.test.ts`,
  `tests/marketing-consent-repository.test.ts` (an in-memory double honouring the real query shapes),
  `tests/data-rights-marketing-consent.test.ts`, `tests/register-form-marketing.test.tsx` and
  `tests/marketing-consent-settings-action.test.ts`.
- Extended: `tests/account-nav.test.tsx`, `tests/storefront-footer.test.tsx` and
  `tests/vendor-profile.test.ts`.
- Changed: `tests/autocomplete-tokens.test.ts` expects a trailing `null` for the consent checkbox.

**Docs on this branch.**
- `docs/store-admin-guide/admin-tabs-guide.md` 2.15.0 (R30).
- `specs/roadmap.md` 1.158.0 (R31). The `#1142` row is carried unchanged from `bc89de1`; the `#1145`,
  `#1147` and PR #1151 rows are new.
- The `#1145` spec's R5 and its validation row (R32).
- `docs/developer-portal/app-conventions.md` 1.16.0: four durable rules from this slice (absent not
  disabled, consent flags keep withdrawal, the three data-rights paths, the sign-up hook pattern).
- `CHANGELOG.md` (Gate 4).
- Regenerated `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts`.

**Follow-up filed (R33):** `#1152`, "Marketing email sending: check consent per recipient, carry an
unsubscribe link, honour withdrawal", on Project #2 as `P10` / `Backlog`.

## Decisions taken during the build

- **The account action lives in the existing `features/account/data-rights.ts`,** not a new
  `"use server"` file. It shares that file's `currentUser()` and `SIGNED_OUT`, and the marketing
  section sits on `/account/data` with the other data-rights forms.
- **The hook body is a separate module with injected dependencies.** Writing it inline in
  `lib/auth.ts` would have left R18 and R20 testable only through Better Auth.
- **Pre-check before resolving the vendor.** `decideSignUpMarketingConsent` runs first with a dummy
  vendor (switch on), so only a ticked email sign-up costs a profile read. The real decision then
  runs with the real vendor.
- **The client form sends `marketingOptIn: true` only when the statement is non-null and the box is
  ticked,** and omits the key otherwise rather than sending `false`. R17 says "no
  `marketingOptIn: true`", and omitting it keeps the body identical to before for every store that
  doesn't ask.
- **The `/account/data` section requires a non-null statement,** i.e. a resolvable vendor. With no
  vendor nothing renders, which is the same as every other vendor-scoped section.
- **Staff setter keyed on `auth.vendorId`,** passed explicitly through `setEnabled(vendorId, …)`,
  rather than resolving the vendor from the host the way `getAssistantService().setEnabled` does.
  This makes R14's "the ADMIN's vendor only" visible in the action and testable.
- **The autocomplete guard gets a `null` entry, not a token.** A consent checkbox has no WCAG 1.3.5
  input purpose. Adding `autoComplete="off"` would have satisfied the test's shape but not its
  intent.
- **Account status copy uses "this store",** not the vendor name. The statement shown before
  opting in already carries the name, and neutral copy needs no new prop (R27).

## Deviations from the spec

- **R20 names `recordErrorEvent`; the code calls `recordHandledErrorEvent`** in
  `lib/error-events-service.ts`. That is the request-scoped one-line wrapper over `recordErrorEvent`
  that `features/cart/match-list.ts` already uses for the same "degraded without a throw" case, and
  the row written is identical. The unit test asserts the injected `reportError` is called once;
  `lib/auth.ts` injects `recordHandledErrorEvent`.
- **R14's validation row says `grep -nE '^export (const|let|var|function [^a])'` on the action file
  prints nothing.** The intent (no non-async export) holds: the file's only export is
  `export async function saveMarketingConsentSettings`. Noted because `[^a]` is an odd pattern; read
  the file rather than trust the regex.

No requirement was dropped or widened.

## Known-shaky areas

- **THIS SLICE'S MIGRATION IS ALREADY APPLIED TO PRODUCTION, not to dev (2026-10-18, after the
  build-notes commit).** The owner ran `! npx prisma migrate deploy` at the assistant's request, and
  Prisma reported `ep-young-glitter-zadlkttm`, the **production** endpoint. Cause: this Claude Code
  session's process environment exports `DIRECT_URL` with the production URL, and an exported
  variable beats `.env` (which correctly names dev, `ep-dry-morning-zab7dx08`). It is not set at
  Windows User or Machine scope or in any settings file, so it was most likely inherited from the
  terminal that launched the session. The assistant's pre-check compared only the env **files**.
  - **Effect:** additive only: the `MarketingConsentSource` enum, the empty `MarketingConsentEvent`
    table and `VendorConfig.marketingConsentEnabled` (default `false`). Production code at
    `d30165e` reads none of them. Checked right after: `/api/health` 200 with `db.ok: true` and
    `d30165e`; `/`, `/help`, `/privacy` and `/register` 200; `/account/data` 307 (the normal
    redirect to sign-in).
  - **Consequence for Ship:** production's `_prisma_migrations` now records
    `20261018200000_p1134_marketing_consent`, so `deploy-production`'s `migrate deploy` will skip it
    on promotion. **Do not edit that `migration.sql` again**, or the recorded checksum no longer
    matches. If the slice is abandoned, production needs a reversing migration; it must not be left
    as an orphan.
  - **Earlier in this session, `npx prisma migrate status` also read production** (the "1 pending"
    result was production's). That was read-only.
  - **Dev is now migrated (2026-10-18).** The owner ran
    `env -u DIRECT_URL -u DATABASE_URL npx prisma migrate deploy`; Prisma named
    `ep-dry-morning-zab7dx08` (dev) and applied `20261018200000_p1134_marketing_consent`. Staging is
    not migrated, and `deploy-staging` will apply it on merge. **Every Prisma CLI command in this
    session still needs the `env -u DIRECT_URL -u DATABASE_URL` prefix** until Claude Code is
    restarted from a clean terminal.
- **Nothing has run against a database or under `npm run preview`.**
  - Applying the migration to the dev database (`npx prisma migrate deploy`, `.env` →
    `ep-dry-morning-zab7dx08`) was **blocked by the Claude Code auto-mode classifier** as a
    "Production Deploy", even though `.env` and `.dev.vars` were checked first and match neither
    `secrets/staging.vars` (`ep-empty-scene-zafjzeye`) nor `secrets/production.vars`
    (`ep-young-glitter-zadlkttm`).
  - The dev migration has since been applied (see the first bullet). Before it was, every page that
    reads the vendor profile failed locally on the missing column, and so did three DB-backed tests: `tests/slot-capacity.test.ts`, `tests/express-sla.test.ts` and
    `tests/concurrency-slot-booking.test.ts`. Each failed with "The column
    `marketingConsentEnabled` does not exist in the current database". CI sets no `DATABASE_URL`
    and skips them.
- **The sign-up hook (R18, R19, R28) is proven only by unit tests with fakes.**
  - That Better Auth 1.6.26 passes `context.path === "/sign-up/email"` and the raw body to
    `databaseHooks.user.create.after` was read from `node_modules/better-auth/dist/db/with-hooks.mjs`
    and `api/routes/sign-up.mjs`, not observed.
  - The hook runs via `queueAfterTransactionHook`. Confirm live that the event row exists after a
    ticked sign-up on Aheed, and that none exists on SriMart, for an unticked sign-up, or for a
    second sign-up with an existing email (R19, R28).
- **`getCurrentVendorProfile` inside the hook** resolves the vendor from the request host during
  the auth route. The rest of auth already resolves the vendor in that request (`resolveAuthOrigin`,
  the rate-limit plugin), so it should work, but it is unproven here.
- **Full `npx vitest run` (alone), at commit `563671d` before the autocomplete fix:** 275 files,
  6 failures.
  - `autocomplete-tokens`: fixed in `038719a`.
  - The three DB tests above: environment only.
  - `motion-reduce-coverage` and `token-alpha-purity` timed out at 6–9 s under full-suite load and
    pass alone. This is the known `#1125` flakiness.
  - The suite was not re-run in full after `038719a`. Validation should run it alone after migrating
    the dev database.
- **Rendering branches not covered by a unit test:**
  - `/account` (R2), `/privacy` (R3, R25, R26) and `/account/data` (R3, R21, R22) are async server
    components. They are covered only by the live rows.
  - The JSX for `/privacy` sections 5 and 6 and the `/account/data` lists stitches commas across
    `{cond ? … : …}` fragments. Read the rendered text in both switch states for stray or missing
    spaces and commas.
- **Mobile layout (R29) not measured.**
- **Rewards gating on `/` and `/help` (R5)** relies on pre-existing gates (the footer, chrome
  launcher and help page). This slice changed none of them, so R5 is a live regression check.
- **The stale branch `docs/p1142-merged-handoff` still exists on origin.** Its roadmap row is now on
  this branch. Its `docs/model-handoff.md` edit is **not** carried; the handoff is reconciled at the
  final `/document`. Deleting the branch needs the owner's approval: it is unmerged, and the
  standing rule is never to delete an unmerged branch unasked.

## Validation pass 1 and fix (2026-10-18, same context, Opus — not independent)

The owner chose to validate in the building context rather than Clear and switch to Sonnet. This
record is **not an independent validation**.

**Pass 1 confirmed every numbered row R1–R36**, live rows under `npm run preview` against the dev
database:
- R14 and R15: the switch saved, and a STAFF post of the captured action was refused with nothing
  written.
- R16: the checkbox is unticked, not required, carries the exact statement and sits between the
  password field and submit.
- R18, R19 and R28: five real sign-ups. Only the ticked Aheed one wrote an event; SriMart, unticked,
  the duplicate email and the string `"true"` wrote none.
- R21, R22 and R23: opt in, withdraw, an anonymous post (307, nothing written), withdrawal with the
  switch off, and the export JSON.
- R25: privacy wording with the switch on.
- R29: no overflow on `/register` or `/account/data` at 360, 390, 768 and 1280.
- R34: the docs site built all 246 pages.
- Full `npx vitest run`: all 275 tracked files ran. `product-grid-usage` and `slot-capacity` failed
  under load and pass alone (`#1125`).
- Both switches were restored to off afterwards.

**Defect found outside the numbered rows:** the `/account/data` export and erasure sentences lost
their final "and". Aheed read "…basket, loyalty points, marketing email choices from this store."
and SriMart "…reviews, basket from this store.". The cause was conditional comma fragments stitched
in JSX.

**Fix:** `lib/data-rights-form.ts` gains three pure functions, and both sentences now render from
them:
- `dataExportItems` and `dataErasureItems` (the item lists, gated on the two switches);
- `listPhrase` (`Intl.ListFormat("en-GB")`, which gives "a, b and c").

`tests/data-rights-lists.test.ts` pins every switch combination. With loyalty on and marketing off,
both sentences are byte-identical to the pre-`#1134` wording. `/privacy` sections 5 and 6 were
checked live in both states and read correctly, so they were not changed.

**Spec-wording notes (rows, not code):**
- R9's `grep -inE '\b(DROP|UPDATE|INSERT)\b'` matches `ON UPDATE CASCADE` inside the two
  foreign-key `ADD CONSTRAINT` statements. The requirement (only the allowed statement kinds) is
  met; the row should anchor on statement starts, e.g. `^\s*(DROP|UPDATE|INSERT)`.
- R14's export regex `^export (const|let|var|function [^a])` is an odd proxy. Reading the file shows
  its only export is `export async function`.

**Method note:** R2, R3 and R5's "loyalty off" was checked on SriMart, whose loyalty is off in dev,
rather than by switching Aheed off through the full `/staff/loyalty` form. Aheed (on) and SriMart
(off) together cover both states on two vendors.
