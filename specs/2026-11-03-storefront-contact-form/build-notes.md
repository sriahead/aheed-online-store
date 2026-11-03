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

- **The migration is not applied anywhere yet.** `npm run preview` against dev needs
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
