# PR #1481 retro-spec: enquiries, Team & Access, inbound-email recording, operator guides (requirements / acceptance criteria)

This is the retrospective Gate 2 spec for the feature code already on PR #1481
(`feature/operator-guides-telegram-alerts` into `staging`). The narrative, the review of the
implementation against these requirements, and owner decisions D1–D6 are in `plan.md`. Where a
decision is pending, the requirement states the **recommended** option and names the decision; if
the owner picks otherwise, that requirement is rewritten before Build. Nothing here re-specifies
`#1390`/`#1435` (Telegram alert sending) or `#1331`/`#1478` (dedicated cell).

Terms: "platform admin" means `User.role = ADMIN` (`auth.via === "platform-admin"`). "Store admin"
means `VendorMembership.role = ADMIN` for the current vendor.

## A. Operator guides & Telegram quick links

R1. `lib/client-setup/telegram-links.ts` exports `TELEGRAM_QUICK_LINKS`. Every entry's `href` is
    either the in-app runbook path `TELEGRAM_RUNBOOK_HREF` or an `https://` URL whose host is
    `t.me`, `telegram.org` or `core.telegram.org`. No `href` matches `/bot\d+:/` (a bot token). This
    is enforced by `tests/client-setup-telegram-links.test.ts`.
R2. The Client Setup **Order alerts** card renders every quick link. Each external link carries
    `target="_blank"` and `rel="noopener noreferrer"`, and each link with `shareable: true` shows a
    "Shareable" label. A sentence warning never to share the bot token or a `getUpdates` URL
    appears under the list.
R3. The three operator guides describe only controls that exist after this slice:
    - The staff playbook's `/staff/enquiries` section names the same status values, filters, reply
      behaviour and inbound body limit (4,000 characters) that R7–R12 and R28 specify.
    - The store admin guide's `/staff/team` section states R18, R20–R24 as built, including that
      Platform Admin is global and is refused for an email with no account.
    - The platform admin guide's Telegram section matches the `#1390` recipient model.

## B. Vendor enquiries

R4. `app/(admin)/staff/enquiries/page.tsx` calls `requireVendorRole("STAFF", "ADMIN")`. It
    redirects a 401 to `/login`, renders `PanelRefusal` on a 403 (never `null`), and wraps its
    content in `<PageContainer width="wide">`.
R5. `/staff/enquiries` is registered exactly once, in `components/staff/nav-items.ts`, with
    `tier: "staff"`, and `tests/staff-nav-parity.test.ts` passes.
R6. When a storefront contact-form submission returns `status: "success"` and the honeypot field
    `website` is empty, exactly one `VendorEnquiry` row is created for that vendor with
    `source = CONTACT_FORM` and the submitted type, name, email, phone, order number, subject and
    message. A failure to create the row is logged and does not change the form's returned state.
R7. `/staff/enquiries` lists only the current vendor's enquiries: the 100 newest by `createdAt`
    descending, then `id` descending.
R8. No file under `app/(admin)/staff/enquiries/` contains a literal email domain. When the vendor
    has no sender, the "replies are sent as" label shows the vendor name and the `EMAIL_FROM` value
    read through `lib/config`.
R9. `replyToVendorEnquiry` requires `requireVendorRole("STAFF", "ADMIN")`. It loads the enquiry by
    `(id, vendorId)` (an id belonging to another vendor returns "Enquiry not found." and sends
    nothing) and sends only to that enquiry's `senderEmail`. It HTML-escapes the reply text, the
    quoted original and the store name. Its `replyTo` is the enquiry's `toAddress` when present,
    otherwise the vendor sender's address.
R10. A reply is recorded, and the action returns success, **only** when the email service returns
     `status: "sent"`. On `skipped` or `failed` nothing is written, and the action returns an error
     that names the reason, which the UI displays.
R11. The status-change action accepts only `OPEN`, `REPLIED` or `RESOLVED`. Any other value returns
     without a database write, as does an enquiry id belonging to another vendor.
R12. (D1, approved: recommended option) Every sent reply is stored as its own `VendorEnquiryReply` row (body, sender's email,
     sent time), and sending a second reply leaves the first row unchanged. The enquiry page lists
     all replies oldest-first, and the enquiry's status becomes `REPLIED`.
R13. A unit test file covers R9–R12: cross-vendor id refused, reply HTML-escaped, `skipped` and
     `failed` not recorded, an invalid status refused, and a second reply appended.
R14. Enquiry subject, message, sender and reply text are rendered as React text children. No file
     under `app/(admin)/staff/enquiries/` uses `dangerouslySetInnerHTML`.
R15. A unit test covers R6: a successful submission records one enquiry; a honeypot submission, a
     failed submission and a throwing `createVendorEnquiry` each leave the form state unchanged, and
     the first two record nothing.
R16. `lib/repositories/enquiries.ts` passes `tests/repository-purity.test.ts`,
     `tests/repository-client-injection.test.ts` and `tests/repository-transaction-safety.test.ts`.
     Every query it issues includes `vendorId` in its `where` clause.

## C. Team & Access provisioning

R17. Target-user lookup in `applyVendorRole` trims and lower-cases the email and matches it
     case-insensitively (`Alice@Example.com ` finds `alice@example.com`).
R18. (D2, approved) Only a platform admin can grant `ADMIN` or `PLATFORM_ADMIN`. A store admin who tries
     receives a "Forbidden" error and no write happens. `AssignRoleForm` shows the Platform Admin
     option only to a platform admin, together with a warning that the role applies to every store.
R19. A store admin cannot change any role of a user whose `User.role` is `ADMIN` ("Forbidden: Cannot
     modify a platform-admin's privileges."), and no write happens.
R20. `assignRoleAction` accepts only `STAFF`, `ADMIN`, `PLATFORM_ADMIN` or `NONE`. Any other value
     returns `{ error: "Invalid role" }` without calling `setVendorRole`.
R21. (D3, approved) Granting `PLATFORM_ADMIN` sets `User.role = ADMIN` and upserts an `ADMIN` membership for
     the current vendor. Assigning `STAFF`, `ADMIN` or `NONE` to a user who is a platform admin sets
     `User.role = CUSTOMER`. In every case one `VendorRoleAuditLog` row records the effective old
     role (`PLATFORM_ADMIN` for a platform admin) and the new role, inside the same Serializable
     transaction as the change.
R22. (D3, approved) Any change that removes `User.role = ADMIN`, whether from self or from another user,
     counts platform admins inside the transaction and is refused with "Cannot demote the last
     remaining Platform Admin." when the count is 1 or less. A store admin's self-demotion still
     runs the existing last-store-admin count. The vendor count never runs for a platform admin
     acting on themselves.
R23. (D4, approved) Granting `STAFF` or `ADMIN` to an email with no `User` creates one, inside the same
     transaction as the membership and audit rows. It has the normalised email, a name derived from
     the local part, `role = CUSTOMER` and `emailVerified = true`. Revoking (`NONE`) for an unknown
     email returns "User not found with that email address." without a write.
R24. (D4, approved) Granting `PLATFORM_ADMIN` to an email with no `User` is refused with an error telling the
     grantee to sign up first, and no write happens.
R25. (D4, approved) On staging, an account provisioned by R23 signs in by at least one documented route
     (Google, or password reset), reaches `/staff`, and sees exactly the tier it was granted.

## D. Inbound-email Worker

R26. `handleInboundEmail` calls `/api/inbound-email/record` only after `message.forward()` has
     resolved, sending the `x-inbound-token` header. A thrown error **or a non-2xx response** from
     that call is logged with its status and never prevents the order-alert call or changes
     delivery.
R27. `POST /api/inbound-email/record` returns:
     - 503 when `INBOUND_EMAIL_TOKEN` is unset;
     - 401 for a missing or wrong token (compared with `timingSafeEqual`);
     - 400 for a non-JSON body, a missing or non-string `to`/`fromEmail`/`subject`/`message`, or a
       field over its cap (`to` and `fromEmail` 320, `fromName` 200, `subject` 998, `message` 4,000
       characters);
     - 404 when no vendor owns `to`;
     - 200 `{ recorded: true }` after creating one `source = INBOUND_EMAIL` enquiry.

     `GET` returns 405.
R28. The Worker's parsers behave as follows:
     - Sender: the address inside `<...>`, else a bare address header, else the envelope `from`,
       else `unknown@sender`.
     - Body: the first `text/plain` part when present, quoted-printable soft breaks and `=XX` escapes
       decoded, tags stripped, trimmed, at most 4,000 characters. An empty result is sent as
       `(No message body)`.

## E. Vendor enquiries migration

R29. (D1, approved: recommended option) `prisma/schema.prisma` models enquiries in 3NF with enums:
     - `VendorEnquiry.source` is the enum `EnquirySource { CONTACT_FORM INBOUND_EMAIL }` and
       `status` is `EnquiryStatus { OPEN REPLIED RESOLVED }`, default `OPEN`.
     - `type` is a `String` holding `COMPLAINT`, `ENQUIRY`, `ORDERS` or `SUPPORT`, its comment naming
       the two source enums.
     - Replies live in `VendorEnquiryReply` (`enquiryId` FK with cascade delete, `body`, `sentBy`,
       `sentAt`, index on `(enquiryId, sentAt)`), and `VendorEnquiry` has no reply columns.
R30. `prisma/migrations/20261109225000_vendor_enquiries/migration.sql` is edited in place (it has
     been applied nowhere except possibly dev; Build checks this and records the result). It opens
     with a comment saying it was hand-authored because of `#895`. It contains only `CREATE TYPE`,
     `CREATE TABLE`, `CREATE INDEX` and `ADD CONSTRAINT` statements, and no `DROP` or `ALTER ...
     DROP`. Its statements equal `prisma migrate diff` from `origin/staging`'s `schema.prisma` to
     this branch's, excluding any proposed drop of the hand-authored `pg_trgm` indexes.
R31. Tests exist and pass for:
     - `tests/roles.test.ts`: the existing ten cases, with test doubles updated to `findFirst` and
       no assertion removed or loosened, plus cases for R17, R18 (`PLATFORM_ADMIN` by a store
       admin), R20, R21, R22 (self and other, count 1 and 2), R23 and R24;
     - the record route: R27, every status code;
     - `tests/inbound-email-worker.test.ts`: R26 (record after forward, a non-2xx logged, the alert
       still sent) and R28 (each sender and body case).
R32. `scripts/lib/neon-migration-plan.ts` classifies `VendorEnquiry` and `VendorEnquiryReply` as
     `skip` (pre-launch shopper messages, regenerated per environment), and
     `tests/neon-migration-plan.test.ts` passes.
R33. `scripts/verify-pr1481-integration.ts` runs against the **dev** database and exercises both
     real adapters, each against the code path that uses it in production:
     - `PrismaNeonHttp`, the adapter `getPrisma()` resolves: create, list, find, cross-vendor find
       (null) and status update for enquiries, plus a reply insert;
     - `PrismaNeon` over WebSocket, the adapter `getPrismaWs()` resolves: `applyVendorRole`
       provisioning, a Platform Admin grant, and the last-platform-admin refusal.

     It deletes every row it creates and exits 0 printing one line per check.
R34. Staging validation (D6) passes:
     - a contact-form submission appears in `/staff/enquiries` within one refresh;
     - a reply to an allow-listed address arrives and is listed, and a reply to a non-allow-listed
       address shows the `skipped` error and records nothing;
     - Mark Resolved and Reopen persist;
     - R25 holds;
     - a STAFF account sees `/staff/enquiries` but cannot open `/staff/team`;
     - the `/record` route answers 401 without the token.

     If no Worker routing rule exists, inbound-email recording is reported as **not exercised**,
     not as passed.
R35. `CHANGELOG.md` describes the feature code in this slice (not only the docs). The PR #1481
     title and body describe all five areas and reference this spec folder and the slice's
     umbrella issue with `Closes #NN` (Gate 4).
R36. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run kms:validate`,
     `npm run kms:check-generated` and `npx vitest run --maxWorkers=4` pass locally, and every
     required check on PR #1481 is green (Gate 3).
