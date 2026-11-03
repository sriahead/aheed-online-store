# Storefront contact and complaint form (build notes)

Issue `#1409`. Spec commit `dd844beb` and build commit `a2724a30`, on
`feature/1409-storefront-contact-form`. The branch is off `origin/staging` `1379f3f` and also
carries `5ee42467`, the `#1406` promotion's roadmap and handoff docs.

## What changed and why

- **Environment identity (R1–R4):**
  - `lib/config.ts` `getAppEnvironment()`, and `APP_ENV` in `wrangler.toml` (staging and
    production `[vars]` only).
  - `lib/email/environment-tag.ts` `withEnvironmentTag()`, applied first thing in
    `getEmailService().send` (`lib/email.ts`). The parameter is renamed `untagged`, so every later
    line, logs included, uses the tagged `subject`.
- **`replyTo` override (R5):** an optional field on `OutgoingEmail`. `send` uses it when non-blank,
  otherwise `resolveSender`'s.
- **Own domain (R6–R10):**
  - `isOwnDomainHost()` is appended to `lib/client-setup/sender-suggestion.ts`. It reuses the
    private `customHosts` and `normalisePlatformDomain`.
  - `StorefrontChrome` computes it from the `host` header and `EMAIL_FROM`'s domain, with no query.
  - `StorefrontFooter` takes a required `ownDomain` prop. On a platform host it nulls
    `contactEmail` before anything reads it, so the column-visibility count and the link both drop
    it.
  - `lib/contact/mailto.ts` `contactMailtoHref()` builds the tagged `mailto:`.
- **Form (R11–R18):**
  - **Page:** `app/(storefront)/contact/page.tsx` (narrow `PageContainer`, force-dynamic) and
    `components/storefront/ContactForm.tsx` (`useActionState`, honeypot `website`).
  - **Action:** `features/contact/submit-contact.ts`, which only resolves the session, IP and
    vendor. `features/contact/validate-contact.ts` holds the limits, form state and parsing.
  - **Logic:** `lib/contact/submit.ts` `processContactSubmission(fields, deps)` runs the fixed R14
    order with every collaborator injected. This is what the tests drive.
  - **Helpers:** `lib/contact/recipient.ts` (R16) and `lib/contact/message.ts` (R17 subject and
    escaped HTML).
  - `lib/contact-service.ts` wires the live dependencies, because `app/` and `features/` may not
    import `@/lib/db`.
- **Outbox (R19–R22):**
  - `lib/repositories/contact.ts` holds the rate limit and the outbox CRUD.
  - `runContactOutbox(deps)` lives in `lib/contact-service.ts`.
  - Job route `app/api/jobs/retry-contact-outbox/route.ts`, with the reap-guest-carts guard copied.
  - KV marker `contact-outbox:pending`: `markContactOutboxPending` and `clearContactOutboxPending`
    in `lib/job-signals.ts`.
  - `select-jobs.ts`/`index.ts` read and gate it.
- **Schema (R23):**
  - `ContactAttempt` and `ContactOutbox`, both cascading on vendor delete, plus
    `20261103120000_contact_form`.
  - The DDL is `prisma migrate diff --from-schema-datamodel <origin/staging schema>` output,
    unedited, behind the `#895` header.
- **Guard tests touched, as they were designed to fire:**
  - `scripts/lib/neon-migration-plan.ts`: both new models are `skip`.
  - `tests/page-container.test.ts`: `/contact` is `narrow`.
  - `tests/sitemap.test.ts`: eight static paths.
  - `tests/scheduler.test.ts`: the new job is in the daily list, the no-binding fail-open, the
    idle tick line, and the three-read count.
- **Docs (R25):**
  - `env-setup.md`: the `APP_ENV` row, a "contact form" paragraph, the Gated-ticks rows, and the
    sanity check with "Last run: not yet run".
  - The platform admin guide's Client Setup caveat.
  - The store admin guide: footer email only on own domain.

## Decisions taken during the build

- **The order picker posts the order number, not an id.** The field is still named `orderId`, as R11
  and R12 say, but its value is `orderNumber`, because `findOrderForUser` (the existing ownership
  check, `userId` in the WHERE) looks orders up by number. The email still shows the number the
  database returned, never the submitted text (R15).
- **Enquiry is preselected** in the type radio. Both radios are `required`; the server re-checks
  membership (R13).
- **The retry walks every vendor, not only active ones** (`listAllVendorIds`, new in
  `lib/repositories/vendor.ts`).
  - My first version listed the vendors that had outbox rows (`findMany distinct vendorId`) and
    counted the table platform-wide. `tests/repository-vendor-scoping.test.ts` refused both,
    because they query a vendor-scoped model with no vendor id.
  - Rather than add two `ALLOWED` entries plus ADR-004 text, every outbox query now takes a
    `vendorId`, and the runner loops over all vendors. Vendor counts are small, so that is one
    `findMany` plus one `count` per vendor per run.
  - Active-only would strand a suspended store's queued mail, and its never-zero count would keep
    the marker set forever.
- **The R14 order puts validation before the rate limit**, as amended at Spec. A honeypot hit
  returns success echoing the submitted email.
- **The outbox runner treats `skipped` like `sent`** (deletes the row), matching R18's "skipped is
  not queued" reasoning.
- **The page copy promises nothing about reply times.** "Usually within one working day" was
  removed as an unbacked claim.
- **`recordContactOutboxFailure` uses `update` with `where: { id, vendorId }`.** That is singular
  `update` on the HTTP adapter (fine per CLAUDE.md), and the `vendorId` keeps it store-scoped.

## Deviations from the spec

None. Three notes:

- **R11/R12:** `orderId` carries the order number. See Decisions.
- **R21:** "processes at most 50 rows per run" holds across stores. Rows are oldest-first *within*
  each store, and stores run in vendor `createdAt` order. A strictly global oldest-first order
  would need a cross-store query, which the scoping guard forbids.
- **R25:** the R25 wording mentioned `specs/architecture.md`, but that was replaced at Spec by the
  Gated-ticks table rows. `architecture.md` does not list tables.

## Known-shaky areas

- **The migration is applied on dev only** (`ep-dry-morning`, by the owner, 2026-11-03, after `migrate status` named that host). Staging and production get it from the deploy workflows. The note below is kept for the record. **Before that:** the migration was not applied anywhere. `npm run preview` against dev needs
  `20261103120000_contact_form` applied first. Auto mode refuses `prisma migrate deploy` even on
  dev, so the owner runs it as `! <command>`. Check `DIRECT_URL`/`DATABASE_URL` one at a time
  first. Until it is applied, `/contact` submissions and the outbox job fail on dev with a missing
  table.
- **Nothing was exercised live.** The `ContactForm` component has no render test; R11 and R12 are
  meant for preview. Check the honeypot container really is off-screen and `aria-hidden`, and that
  the Enquiry default plus `required` behave.
- **`StorefrontChrome` reads `EMAIL_FROM` via `readOptional(getEmailEnv)`.** On dev without
  `EMAIL_FROM`, the platform domain is undefined, so any eligible host counts as own-domain. Dev
  hosts are all `*.localhost` with ports, so they are platform hosts. A real non-localhost dev host
  would show the email.
- **Every staging and dev subject now carries a tag**, including order confirmations, password
  resets and the Client Setup test email. That was intended (owner's choice), but it is a visible
  change for staging testers.
- **The R14 IP fallback is `"unknown"`.** Under `npm run preview` without `cf-connecting-ip`,
  every local request shares one bucket. Send the header when testing R14 live.
- **Staging allowlist.** Contact mail is `skipped`, not queued, unless the forward-to is on
  `EMAIL_ALLOWED_RECIPIENTS`. The R18 "failed → row" path is only reachable on staging while
  sending itself fails, which it currently does (merqify.com is not onboarded).

## Validation record (in-session, NOT independent)

Run 2026-11-03 in the same context that built the slice, on Opus, with no Clear (the owner invoked
`/validate` here). Treat it as a self-check, not an independent validation.

**Pre-flight** on `3250c734`: `lint`, `format:check` and `tsc --noEmit` exit 0. `npx vitest run --maxWorkers=4`
alone gives 383 files and 5,658 tests passing. `npm run build` exits 0 and lists `/contact` and
`/api/jobs/retry-contact-outbox`. `kms:assemble:internal` plus `next build` in `kms/site-internal`
gives 313/313 pages.

**Live, `npm run preview` against dev** (`ep-dry-morning`, migration applied by the owner). For the
run only, `.dev.vars` gained `INBOUND_DEFAULT_FORWARD="hub@inbox.test"`, since dev has no receiving
addresses. It was restored byte for byte afterwards. Every test row was deleted, and SriMart's
`contactEmail` was set for a moment and then returned to `null`.

| Req | Result |
|---|---|
| R1–R5 | Pass (unit tests, file reads). R2: the diff is exactly the two `APP_ENV` lines plus comments. R5: no existing `.send(` call site changed. |
| R6, R7 | Pass. The test diff is additions only, and `StorefrontChrome` adds no query. |
| R8 | Pass live. Aheed's placeholder `[YOUR EMAIL]` appears 0 times on `localhost:8787` (platform host) and 2 times on `staging.aheedfoodcentre.nocaped.com` (own domain on dev, because dev has no `EMAIL_FROM`, so every eligible host counts). Neither page has a `mailto:`. |
| R9 | Pass live. With SriMart's email set to `shop@example.com` for a moment, `srimart-staging.nocaped.com` rendered `href="mailto:shop@example.com?subject=%5BDEV%5D%20Enquiry%3A%20SriMart"`, and `srimart.localhost:8787` had no link and no email text. |
| R10 | Pass live: "Contact us" `href="/contact"` sits 115 characters before "Leave a review". |
| R11 | Pass live (guest, SriMart). Every field carries its `maxLength`/`required`/`type`, and the honeypot has `tabindex="-1"`, `autoComplete="off"` and an `aria-hidden="true"` ancestor. There is no `orderId`, and `"/contact"` is in the sitemap. |
| R12 | Pass live on `localhost:8787` (Aheed). demo-customer is prefilled (name and email) and has a picker of "Not about an order" plus 20 orders (they have 26). demo-platform-admin (no Aheed orders) has no picker. |
| R13 | Pass: `"use server"` is first, the only export is `export async function`, and the validator tests pass. |
| R14 | Pass live. One IP, signed in, Aheed: submissions 1–5 accepted and the 6th answered "Too many messages. Please try again later." `ContactAttempt` held 5 rows for that store and IP hash (the refused one is not counted) and 1 for the earlier SriMart guest. The honeypot is covered by unit tests only. |
| R15 | Pass live: the customer's own order was accepted, and `AHE-NOT-MINE` gave "That order could not be found." |
| R16 | Pass (unit), and live via the default inbox: every row's `toAddress` was `hub@inbox.test`. |
| R17 | Pass. The live outbox subjects were `Complaint · Aheed Food Centre · Order AHE-20261019-74CVQB · Validation run` and `Enquiry · SriMart · Opening hours`, with `replyTo` the shopper. **The live `[DEV]` tag on the sent subject is unverified:** the Worker's console output does not reach the preview log, so the log adapter's line could not be read. R4's unit test covers the tag, and R9 showed `getAppEnvironment()` giving development in the Worker. |
| R18 | Pass live. The preview build runs as production, and dev has no `EMAIL_FROM`, so `send` returned `failed` ("EMAIL_FROM is required in production"). Each submission wrote one `ContactOutbox` row with the R18 fields and `attempts` 0, and the shopper still saw the success copy. `sent`/`skipped` are covered by unit tests. |
| R19 | Pass (unit). Locally there is no KV binding, so the marker no-ops, as designed. |
| R20 | Pass live: GET 405, wrong token 401, authorised `{"sent":0,"failed":5,"expired":0,"remaining":5}` 200. |
| R21 | Pass live. After the run all 5 rows had `attempts` 1, written by the singular `update` with `{ id, vendorId }` through `getPrisma()`. A row backdated 8 days was deleted on the next run (`expired` 1, `remaining` 4). |
| R22 | Pass (unit). |
| R23 | Pass. One `*_contact_form` folder, purely additive, cites `#895`, `prisma validate` passes, and the owner applied it to dev. |
| R24 | Pass. The grep prints nothing, and `vendor-neutral-copy` passes. |
| R25, R26 | Pass. Every listed doc item is present, and the CHANGELOG names `#1409`. |
| R27 | Pass locally. CI not yet run (not pushed). |

**Still open for Ship:** CI on the PR. On staging: the migration through `deploy-staging`, the `[STAGING]`
tag on a delivered email, and a real Support/Orders forward-to. The last two need merqify.com
onboarded for sending, plus the forward-to on `EMAIL_ALLOWED_RECIPIENTS`.
