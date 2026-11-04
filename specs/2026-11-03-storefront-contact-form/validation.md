# Storefront contact and complaint form (validation)

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

Run the local suite first, on its own (`npx vitest run --maxWorkers=4`). For live rows, use
`npm run preview`, never `npm run dev`. The page needs the database and the Worker context, and
`npm run dev` cannot load the WASM Prisma engine.

**Driving the form without a browser:** Server Actions can be driven with `curl`. Post the multipart
form with the `Next-Action` header, taking its id from the rendered page. A browser via Chrome
automation is equally acceptable; record which was used.

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | A test file for `getAppEnvironment` covers `production`, `staging`, `" STAGING "` (trimmed and lower-cased to staging), `preview`, empty and unset. The last three give `development`. Read the function: it has no `throw` and no zod `.parse` that can throw. |
| R2  | Unit | `git diff origin/staging -- wrangler.toml` shows exactly two added `APP_ENV` lines, one under `[env.staging.vars]` and one under `[env.production.vars]`, plus comment lines, and nothing else. |
| R3  | Unit | The tag helper's test covers all three environments plus the idempotent case. For example, `withEnvironmentTag("[STAGING] x", "staging")` returns `"[STAGING] x"`. |
| R4  | Unit | A `lib/email.ts` test with `APP_ENV` unset and a fake adapter (the log provider or a stubbed binding) asserts the adapter receives `"[DEV] Hello"`. Read `send`: the tag is applied before the allowlist check and before every `console.*` call that prints the subject. |
| R5  | Unit | A test sends with `replyTo: "shopper@example.com"` and a sender whose domain is unverified, and asserts the adapter's `replyTo` is the shopper. A second test without `replyTo` keeps the vendor reply-to. `git diff origin/staging` shows no edits to existing `send(` call sites outside the new contact code. |
| R6  | Unit | `tests/client-setup-sender-suggestion.test.ts` passes, and `git diff` shows only additions to it. The new `isOwnDomainHost` cases are: `srimart.co.uk` with platform `merqify.com` gives true; `aheed.merqify.com`, `merqify.com`, `x.localhost`, `localhost:8787` and `127.0.0.1` give false; `a.com` with an undefined platform gives true. Read the module: it has one shared eligibility helper and no duplicate. |
| R7  | Unit | Read `StorefrontChrome`. It computes `isOwnDomainHost` from the `host` header and the `EMAIL_FROM` domain, and the diff adds no repository or service call to it. |
| R8  | Unit + E2E | A footer component test on a shared host with `contactEmail="shop@example.com"` finds no `mailto:` and no `shop@example.com` text. **Preview:** a store page on its `*.localhost` host has no `mailto:` in the footer; `grep -c 'mailto:'` on the saved page gives 0. |
| R9  | Unit | A footer component test on an own-domain host checks that the email link's `href` equals `mailto:shop@example.com?subject=` followed by the encoded `"[DEV] Enquiry: <name>"` (with `APP_ENV` unset in the test). A placeholder email renders as text with no link. |
| R10 | Unit + E2E | A footer test checks that the "Contact us" link has `href="/contact"` and directly precedes "Leave a review" in the list. **Preview:** check the same in saved HTML. |
| R11 | Unit + E2E | **Preview:** as a guest, `curl` `/contact` on a store host and expect 200. The HTML has each named field with its R11 `maxlength`, `required` and `type`; the honeypot `website` input with `tabindex="-1"`, `autocomplete="off"` and an `aria-hidden="true"` ancestor; and no `orderId`. `grep -n '"/contact"' app/sitemap.ts` matches. |
| R12 | Unit + E2E | **Preview:** sign in as a demo customer who has orders at that store and fetch `/contact`. `name` and `email` carry the session values. The `orderId` select has "Not about an order" first, then at most 20 options, each containing an order number. Repeat with a signed-in account that has no orders at this store: there is no `orderId`. |
| R13 | Unit | `head -1 features/contact/submit-contact.ts` prints `"use server";`, and `grep -n "^export" features/contact/submit-contact.ts` shows only `export async function` lines. Validator tests cover every limit at max and max+1, the message at 9 and 10 characters, a bad email and a bad `type`. An action test with invalid input asserts no send, no insert and no attempt row. |
| R14 | Unit + E2E | Action tests: a filled honeypot gives success with zero sends, inserts and attempts. Six valid submissions with one IP hash leave the sixth refused with the exact R14 copy. **Preview:** submit 6 times with header `cf-connecting-ip: 203.0.113.9`; the 6th response contains "Too many messages. Please try again later." The new repository function takes `prisma` and `vendorId` as parameters, and `npx vitest run tests/repository-client-injection.test.ts tests/repository-purity.test.ts` passes. |
| R15 | Unit | Action tests: a guest posting `orderId`, a signed-in shopper posting another user's order, and one posting another store's order each get "That order could not be found." A valid own order puts its `orderNumber` into both subject and body. |
| R16 | Unit | Recipient tests cover each branch: a complaint with both purposes gives ORDERS; an enquiry gives SUPPORT; an enquiry with an order gives ORDERS; only the other purpose present gives that one; two of the wanted purpose gives the alphabetically first; none with the default `set` gives the default; none with the default `unset` or `invalid` gives `null`. An action test with `null` asserts the R16 error copy, no insert, and a `console.error` containing the vendorId and no `@`. |
| R17 | Unit + E2E | An action test with a fake email service checks `to`, the absence of `sender`, `replyTo`, and the exact subject both with and without an order. A body test with `<script>` in the message finds `&lt;script&gt;`. **Preview:** submit once and read the log adapter's console line (provider `log` in dev); its subject starts `[DEV] Complaint · ` or `[DEV] Enquiry · `. |
| R18 | Unit + E2E | Action tests: `sent` leaves 0 outbox rows, `skipped` leaves 0, and `failed` leaves exactly 1 row with the R18 fields and `attempts` 0, with `markContactOutboxPending` called. The success copy matches R18 exactly. **Preview (optional):** force a `failed` send (for example `EMAIL_PROVIDER=resend` with no `RESEND_API_KEY` in `.dev.vars`), submit, and count `ContactOutbox` rows on dev: 1. Restore `.dev.vars` afterwards and delete the row. |
| R19 | Unit | `grep -n 'contact-outbox:pending' lib/job-signal-keys.ts` matches. `lib/job-signals` tests show mark and clear resolving when the store is missing and when it throws. |
| R20 | Unit | Route tests: no token gives 503; a wrong or missing header gives 401; GET gives 405; an authorised POST (service stubbed) gives 200 with exactly the keys `sent`, `failed`, `expired` and `remaining`. |
| R21 | Unit | Service tests with a fake repository or Prisma: an 8-day-old row is deleted and counted `expired`, and the log line carries its id and vendorId and no `@`. A `sent` row is deleted. A `failed` row ends with `attempts` 1 and `lastError` set. 60 rows lead to 50 processed. An empty table calls clear; a non-empty one calls mark. `grep -rn "updateMany\|createMany" lib/repositories/contact* lib/contact*` prints nothing. |
| R22 | Unit | `select-jobs` tests: the daily cron includes the path; the tick with `{ ok: true, value: null }` excludes it; `{ ok: true, value: "<instant>" }` includes it; `{ ok: false }` includes it. `ALL_JOB_PATHS` contains it. Read `index.ts`: it reads `CONTACT_OUTBOX_PENDING_KEY` and passes it to `selectJobs`. |
| R23 | Unit | `ls prisma/migrations` shows one new `*_contact_form` folder sorting after `20261101120000_vendor_inbound_address`. Its SQL contains only `CREATE TABLE`, `CREATE INDEX` and `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` statements, and nothing that drops, renames or alters a column. Its header comment cites `#895`. `npx prisma validate` exits 0. **Dev:** check `DIRECT_URL` and `DATABASE_URL` one at a time per CLAUDE.md and confirm both name dev. Then `prisma migrate deploy` applies the migration; the owner runs it if auto mode refuses. |
| R24 | Unit | `git diff origin/staging -- app components features lib ':!app/(admin)/staff/runbook/docs.ts' \| grep '^+' \| grep -E '@googlegroups\.com\|@merqify\.com'` prints nothing (test files live under `tests/`). `npx vitest run tests/vendor-neutral-copy.test.ts` passes. |
| R25 | Unit | `grep -n "APP_ENV" docs/developer-portal/env-setup.md` matches the keys table. The "Contact form" paragraph and the "Sanity check: storefront contact form (`#1409`)" section exist, the latter with "Last run: not yet run". The Gated-ticks tables name `/api/jobs/retry-contact-outbox` and `contact-outbox:pending`, and the daily row no longer says "all three jobs". The platform admin guide's Client Setup section mentions contact-form mail and the ORDERS/SUPPORT rule. |
| R26 | Unit | `git diff origin/staging -- CHANGELOG.md` shows an `[Unreleased]` entry containing `#1409`. |
| R27 | Unit | Each R27 command exits 0, with `npx vitest run --maxWorkers=4` run on its own, not beside a build. Then run `npm run kms:assemble:internal`, then `npx next build` inside `kms/site-internal`. It ends with "Generating static pages … (N/N)" and no MDX error. CI's `docs-gates`, `quality / kms` and `quality / quality` on the PR are the authority. |
