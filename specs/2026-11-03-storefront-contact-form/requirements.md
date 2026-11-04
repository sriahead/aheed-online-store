# Storefront contact and complaint form (requirements / acceptance criteria)

Issue `#1409`. It builds on `#1399` (`INBOUND_DEFAULT_FORWARD`), `#1217` (the email port and
`VendorInboundAddress`) and `#1403` (the own-domain host rule). Shoppers get a `/contact` form, and
each message is emailed to the store's Client Setup forward-to. Every outgoing subject is tagged
`[STAGING]` or `[DEV]` outside production. A failed send is kept in an outbox and retried for 7 days.
Shared-platform stores stop showing their footer email. Read `plan.md` for the reasoning.

Terms used below:
- **The store** is the vendor resolved from the request host (`getCurrentVendorId()`).
- **A shared-platform host** is the request host when the R6 rule returns false.
- **An own-domain host** is the request host when the R6 rule returns true.

## Environment identity and subject tag

R1. `lib/config.ts` exports `getAppEnvironment(): "production" | "staging" | "development"`.
    - It reads `APP_ENV` through `readEnv`.
    - After trim and lower-casing, `"production"` gives `production` and `"staging"` gives `staging`.
    - Every other value, including unset and empty, gives `development`.
    - It never throws.

R2. `wrangler.toml` sets `APP_ENV = "staging"` in `[env.staging.vars]` and
    `APP_ENV = "production"` in `[env.production.vars]`. No other `wrangler.toml` change is made
    besides these two lines and their comment.

R3. `lib/email/environment-tag.ts` exports a pure `withEnvironmentTag(subject, environment)`:
    - `production` returns `subject` unchanged.
    - `staging` returns `"[STAGING] " + subject`.
    - `development` returns `"[DEV] " + subject`.
    - It is idempotent: a subject that already starts with that environment's tag is returned
      unchanged.

R4. `getEmailService().send` (`lib/email.ts`) replaces the subject with
    `withEnvironmentTag(subject, getAppEnvironment())` before anything else.
    - The adapter receives the tagged subject.
    - Every log line that `send` writes uses the tagged subject.
    - A unit test with `APP_ENV` unset shows a fake adapter receiving `"[DEV] Hello"` for subject
      `"Hello"`.

R5. `OutgoingEmail` (`lib/email/types.ts`) gains an optional `replyTo?: string`.
    - When it is present and non-blank, the resolved email's `replyTo` is that value. This overrides
      `resolveSender`'s `replyTo`.
    - When it is absent, behaviour is unchanged.
    - Existing callers are not modified.

## Own-domain rule and footer

R6. `lib/client-setup/sender-suggestion.ts` exports `isOwnDomainHost(host, platformDomain)`.
    - It is true only when the host passes the same eligibility test `suggestSender` uses: no port,
      not `localhost`, not `*.localhost`, not an IPv4 literal.
    - The host must also be neither the platform domain nor a subdomain of it.
    - With `platformDomain` undefined, every eligible host is an own-domain host.
    - `suggestSender` and `isRoutableSenderDomain` share the same eligibility and platform helpers,
      not copies. Their existing tests stay green unmodified.

R7. `StorefrontChrome` computes `isOwnDomainHost(<request host lower-cased>, <platform domain>)` and
    passes the result to `StorefrontFooter`.
    - The platform domain is `emailDomain` of `EMAIL_FROM`, read via `readOptional(getEmailEnv)`,
      or undefined when that is empty.
    - No database query is added to the storefront render.

R8. On a shared-platform host, `StorefrontFooter` renders neither the store's `contactEmail` text
    nor any `mailto:` link, even when `contactEmail` is set.
    - The "Visit & contact us" column's visibility no longer counts `contactEmail` on such a host.
    - The phone, address and channel buttons are unchanged.

R9. On an own-domain host, a valid `contactEmail` renders as before. Its link's `href` is
    `mailto:<contactEmail>?subject=<encodeURIComponent(withEnvironmentTag("Enquiry: " + <store name>, getAppEnvironment()))>`.
    The href is built by an exported helper `contactMailtoHref(email, subject)`, which applies the
    tag itself. Placeholder (invalid) emails still render as text with no link, as today.

R10. On every storefront host, the footer's link list contains a link with the text "Contact us"
     and `href="/contact"`, placed immediately before "Leave a review".

## Contact page and submission

R11. `app/(storefront)/contact/page.tsx` exists.
     - It renders inside `PageContainer` with `width="narrow"`, for guests and signed-in shoppers
       alike.
     - `app/sitemap.ts` lists `"/contact"` beside `"/help"`.
     - The form posts to a Server Action and contains:
       - `name` (required, at most 100 characters);
       - `email` (required, `type="email"`, at most 254);
       - `phone` (optional, at most 30);
       - `type` (required, radio: `COMPLAINT` labelled "Complaint", `ENQUIRY` labelled "Enquiry");
       - `subject` (required, at most 150);
       - `message` (required, 10 to 5,000 characters);
       - a honeypot input named `website`, inside a container with `aria-hidden="true"`, with
         `tabindex="-1"` and `autocomplete="off"`, visually hidden.

R12. For a signed-in shopper:
     - `name` and `email` are prefilled from the session user, and remain editable.
     - When that shopper has at least one order at the store, the form also has an optional
       `orderId` select. Its first option is "Not about an order" (value `""`), followed by up to
       their 20 most recent orders at the store, from `listOrdersForUser` with `take: 20`. Each label
       contains the order number and the order date.
     - For a guest, or a shopper with no orders at the store, no `orderId` field is rendered.

R13. `features/contact/submit-contact.ts` begins with `"use server"` and exports only async
     functions. Pure parsing and validation live in `features/contact/validate-contact.ts`.
     - The action re-validates every R11 limit server-side, plus `type` membership and the email
       format.
     - Any violation returns a form state with a per-field error. It sends nothing, stores nothing
       and counts no rate-limit attempt.

R14. The action's steps run in this order: honeypot, R13 validation, rate limit, R15 order check,
     R16 recipient, then the R17 send.
     - Only a submission that passes validation counts as a rate-limit attempt.
     - **Honeypot:** a non-blank `website` makes the action return the normal success state. It
       sends nothing, stores nothing and records no attempt.
     - **Rate limit:** a new `ContactAttempt` table is counted per store and SHA-256 IP hash, using
       `cf-connecting-ip`, else the first `x-forwarded-for` entry, else `"unknown"`. A sixth valid
       submission within 60 minutes is refused with "Too many messages. Please try again later."
       Nothing is sent or stored.
     - The repository function takes its Prisma client and `vendorId` explicitly
       (`tests/repository-client-injection.test.ts`).

R15. When `orderId` is non-blank:
     - The action accepts it only if `findOrderForUser` finds that order for the session user at the
       store.
     - A guest submitting `orderId`, or an order that is not theirs at this store, gets the error
       "That order could not be found." Nothing is sent.
     - The email shows the order's `orderNumber`, never the submitted id.

R16. `lib/contact/recipient.ts` exports a pure
     `resolveContactRecipient({ type, hasOrder, addresses, defaultForward })`. It returns a forward-to
     email or `null`.
     - The wanted purpose is `ORDERS` when `type` is `COMPLAINT` or `hasOrder` is true, else
       `SUPPORT`.
     - It returns the `forwardTo` of the alphabetically first `address` with the wanted purpose.
     - Failing that, it uses the alphabetically first address of the other purpose.
     - Failing that, `defaultForward.address` when `defaultForward.status` is `set`.
     - Otherwise `null`.
     - The action feeds it `listInboundAddresses` for the store and `getInboundDefaultForward()`.
     - A `null` result returns the error "We could not send your message right now. Please try
       again later." Nothing is stored, and the action logs `console.error` naming only the
       `vendorId`.

R17. The email the action sends through `getEmailService().send`:
     - **To:** the R16 recipient.
     - **Sender:** no `sender`, so the platform `EMAIL_FROM`.
     - **`replyTo`:** the shopper's email.
     - **Subject:** `"<Complaint|Enquiry> · <store name> · Order <orderNumber> · <subject>"`, with the
       `Order` segment omitted when there is no order. The R4 tag is added by `send`.
     - **HTML body:** the store name, type, name, email, phone (or "Not given"), order number (or
       "None"), subject, message and the submission time in ISO 8601. Every shopper-supplied value
       passes through `escapeHtml` (`lib/html-escape.ts`).

R18. After the send:
     - **`sent` or `skipped`:** the action returns success and stores nothing.
     - **`failed`:** it inserts one `ContactOutbox` row and calls a new `markContactOutboxPending()`
       in `lib/job-signals.ts`, which never throws, then returns the same success state. The row
       holds `vendorId`, `toAddress`, the untagged `subject`, `html`, `replyTo`, `attempts` (0),
       `lastError` (the failure reason) and `createdAt`.
     - **Success state:** `Thank you. Your message to the store has been received. They will reply
       to {email}.`, where `{email}` is the submitted email.

## Outbox retry

R19. `lib/job-signal-keys.ts` exports `CONTACT_OUTBOX_PENDING_KEY = "contact-outbox:pending"`.
     `markContactOutboxPending()` puts the current ISO instant there, and a
     `clearContactOutboxPending()` deletes it. Both never throw, like the existing markers.

R20. `app/api/jobs/retry-contact-outbox/route.ts` uses the reap-guest-carts guard shape:
     - `POST` with no `JOB_INVOCATION_TOKEN` configured returns 503;
     - a missing or wrong `x-job-token` returns 401;
     - `GET` returns 405.

     An authorised `POST` runs the outbox service and returns 200 with JSON
     `{ sent, failed, expired, remaining }`.

R21. The outbox service processes at most 50 rows per run, oldest `createdAt` first:
     - **Older than 7 days:** the row is deleted and counted `expired`. `console.error` logs its
       `id` and `vendorId` only, with no email address or message.
     - **Otherwise:** it is re-sent with the stored fields. `sent` or `skipped` deletes it. `failed`
       increments `attempts` and stores `lastError`, using a singular `update`.
     - **After the run:** if no rows remain it calls `clearContactOutboxPending()`; otherwise it
       calls `markContactOutboxPending()`.
     - The service takes its Prisma client explicitly and uses no `updateMany` or `createMany`.

R22. `workers/scheduler/src/select-jobs.ts` exports
     `CONTACT_OUTBOX_PATH = "/api/jobs/retry-contact-outbox"`.
     - The daily cron includes it.
     - On the tick it is included when the `CONTACT_OUTBOX_PENDING_KEY` read failed or returned a
       non-null value, and excluded when the read succeeded with `null`.
     - `ALL_JOB_PATHS` contains it. `workers/scheduler/src/index.ts` reads the key and passes it to
       `selectJobs`.

## Schema

R23. One additive migration, in a folder named `<14-digit timestamp>_contact_form` that sorts after
     `20261101120000_vendor_inbound_address`, creates `ContactAttempt` and `ContactOutbox`, each with a `vendorId` foreign key to `Vendor`.
     - **`ContactAttempt`:** `id`, `vendorId`, `ipHash`, `createdAt`, and an index on
       `(vendorId, ipHash, createdAt)`.
     - **`ContactOutbox`:** `id`, `vendorId`, `toAddress`, `subject`, `html`, `replyTo`,
       `attempts Int @default(0)`, `lastError String?` and `createdAt`, with an index on `createdAt`.
     - It drops, alters or renames nothing.
     - Its header comment says it was hand-authored because `migrate dev --create-only` refuses on
       dev (`#895`).
     - `schema.prisma` matches it. `npx prisma validate` exits 0.

## Copy, config hygiene and docs

R24. No file added or changed under `app/`, `components/`, `features/` or `lib/` contains a literal
     `@googlegroups.com` or `@merqify.com` address, tests excepted. Recipients come only from
     `VendorInboundAddress` and `INBOUND_DEFAULT_FORWARD`. No vendor name or grocery example
     appears in new component copy, and `tests/vendor-neutral-copy.test.ts` passes.

R25. Documentation:
     - **`docs/developer-portal/env-setup.md`:**
       - `APP_ENV` in the email keys table (meaning, values, unset means `[DEV]`);
       - a "Contact form" paragraph covering the recipient order, `skipped` not queued, the outbox
         and the 7-day expiry;
       - a "Sanity check: storefront contact form (`#1409`)" section with numbered steps, expected
         results and "Last run: not yet run".
     - **Platform admin guide, Client Setup section:** says which receiving address receives
       contact-form mail.
     - **`docs/developer-portal/env-setup.md`, the "Gated ticks" tables:**
       - the tick row and the daily row name `/api/jobs/retry-contact-outbox`, and the daily row no
         longer says "all three jobs";
       - the marker table gains a `contact-outbox:pending` row (written by a failed contact send and
         by the job while rows remain; the tick calls the job when the key is present).

R26. `CHANGELOG.md` has an `[Unreleased]` entry naming `#1409` (Gate 4).

R27. `npm run lint`, `npm run typecheck`, `npm run format:check`,
     `npx vitest run --maxWorkers=4`, `npm run build`, `npm run kms:validate` and
     `npm run kms:check-generated` all exit 0. `npm run kms:assemble:internal` followed by
     `npx next build` in `kms/site-internal` exits 0. That last check catches the bare-`<tag>` MDX
     break from `#1408`.
