# PR #1481 retro-spec (build notes)

Branch `feature/operator-guides-telegram-alerts` (PR #1481 into `staging`), built in the main
checkout because the PR branch was already checked out there. Commits on top of the original five:

- `0ae2fcab` the spec;
- `3962ec72` reverts `8531ffc1`, which moved to PR #1485 (D5);
- `ce0ea703` code and tests;
- `da980817` docs and CHANGELOG.

Umbrella issue **#1482**. Follow-ups #1483 (inbound dedupe) and #1484 (enquiry data rights).

## What changed and why

- **Schema and migration (R29, R30).** `VendorEnquiry.source`/`status` are now enums
  (`EnquirySource`, `EnquiryStatus`), matching every other status column. Replies moved to an
  append-only child table, `VendorEnquiryReply` (D1).
  - The migration `20261109225000_vendor_enquiries` was **edited in place**. On 2026-11-10,
    `prisma migrate status` against dev (`ep-dry-morning-zab7dx08`, confirmed different from every
    `secrets/*.vars` host, with neither `DIRECT_URL` nor `DATABASE_URL` exported) listed it as
    **not yet applied**. It had never reached staging or production, because PR #1481 never merged.
  - Its DDL is Prisma's own `migrate diff --from-schema-datamodel <origin/staging schema>` output
    under a `#895` header. It differs from the diff only by one blank line, and has no `pg_trgm`
    lines and no `DROP`.
  - The header avoids the word "drop" so R30's grep stays meaningful.
- **Repository (`lib/repositories/enquiries.ts`).** `addVendorEnquiryReply` makes two singular
  writes (reply insert, then status update), not one nested write: a nested write opens an implicit
  transaction, which the HTTP adapter cannot run (CLAUDE.md). The reply goes first, because by then
  the email has been sent. It re-finds the enquiry by `(id, vendorId)` first, so a cross-vendor id
  returns `null` and nothing is written.
- **Service (`lib/enquiries-service.ts`).**
  - Only `status: "sent"` records a reply (R10).
  - `replyTo` is `toAddress`, then the sender's address (R9).
  - `changeVendorEnquiryStatus` allow-lists the status itself via `isEnquiryStatus`, so the action
    passes the raw string and cannot bypass it (R11).
  - `getEnquirySenderLabel` reads `EMAIL_FROM` through `lib/config` (R8).
- **Roles (`lib/repositories/roles.ts`).** Two changes, both inside the existing Serializable
  transaction:
  - `PLATFORM_ADMIN` for an unknown email throws before any transaction (R24).
  - `isSelfPlatformDemotion` became `isPlatformDemotion`: the count runs for any change that removes
    `User.role = ADMIN` (R22, D3).
- **Team action.** It now refuses any role outside `STAFF`/`ADMIN`/`PLATFORM_ADMIN`/`NONE` (R20).
  The list is local because a `"use server"` file may export only async functions.
- **Record route.** Per-field caps, refused rather than truncated (R27). **Worker:** it logs a
  non-2xx `/record` response with its status only, so no personal data reaches the logs (R26). The
  two parsers are now exported for tests.
- **Feature catalogue.** `/staff/enquiries` was added under the staff role. This surfaced once the
  roles failures were fixed: `tests/feature-catalogue.test.ts` had been failing on the branch too,
  hidden in the same red run.

## Decisions taken during the build

- **Enquiry `type` stays `String`** with a schema comment, not a third enum. Its values come from two
  existing enums (`ContactType`, `InboundAddressPurpose`), and a merged enum would duplicate both.
  The spec (R29) said this.
- **`tests/roles.test.ts`**: the `findUniqueUser` double was renamed to `findFirstUser` (7
  occurrences) and `tx.user` was added to the transaction double. No `expect(` line was removed or
  changed. The tenth original case gained one extra assertion (the platform count ran), and its
  original `txCount` not-called assertion still holds.
- **The "Who can access" line** for `/staff/team` stays "Store admins only". It is one of the three
  values `tests/operator-doc-coverage.test.ts` permits, and the table under it says what platform
  admins can do.
- **Guides rewritten, not patched.** The branch's enquiries section claimed several things the code
  does not do:
  - recording happens "before forwarding" (it happens after);
  - replies go through "Resend" (retired in `#1217`);
  - a fixed `info@aheedfoodcentre.co.uk` sender, in a guide shared by every vendor;
  - a `resolvedAt` field and a clickable phone number, neither of which exists;
  - Gmail self-send immunity;
  - contact-form types that do not exist.

  The Team section claimed an on-page audit log, inline row actions, a "Save" button, and a
  last-store-admin guard covering every change; none of those exist.

### R3 traceability (each guide claim and the control behind it)

Staff playbook, `/staff/enquiries`:

| Claim | Control |
|---|---|
| Tabs: All Messages / OPEN / REPLIED / RESOLVED, plus search over name, email, order #, subject, message | `EnquiryList.tsx`, the `filter` state and the `filtered` predicate |
| Counter of open and total | `page.tsx`, `openCount` / `serialized.length` |
| 100 newest | `getVendorEnquiries` → `listVendorEnquiries(…, 100)`, ordered `createdAt desc, id desc` |
| Card shows status, source, type, name, email, phone, To address, Order #, message | `EnquiryList.tsx` card markup |
| Reply goes only to the sender, from the label shown at the top | `replyToVendorEnquiry` `to: enquiry.senderEmail`; `getEnquirySenderLabel` |
| Every reply listed with who and when; a second reply is added, not replaced | `addVendorEnquiryReply` insert, and the `item.replies.map` render |
| Mark Resolved / Reopen | `updateEnquiryStatusAction` hidden `status` toggle |
| Contact form recorded once accepted, honeypot not recorded | `submitContactForVendor` (`state.status === "success"`, `website === ""`) |
| Inbound recorded after forwarding | Worker: `recordInboundEnquiry` called after `await message.forward(...)` |
| Types COMPLAINT/ENQUIRY vs ORDERS/SUPPORT | `CONTACT_TYPES`; `resolution.purpose` (`InboundAddressPurpose`) |
| "Email not sent: …" records nothing | `sendResult.status !== "sent"` branch |
| Staging only mails an approved list | `EMAIL_ALLOWED_RECIPIENTS` (`lib/email`) returns `skipped` |
| Inbound only appears once routed to the Worker | owner-gated Email Routing Worker rules (plan.md "Dependencies") |
| Text only, up to 4,000 characters, formatting removed, no attachments | `extractBodyFromRawEmail` (tags stripped, `.slice(0, 4000)`), plus route cap 4,000 |
| Customer replies go to the store address first written to | `replyTo: enquiry.toAddress ?? sender?.email` |
| Duplicates possible | no Message-ID dedupe yet (#1483) |
| Status set to REPLIED only after a real send | `addVendorEnquiryReply`, called after the `sent` check |

Store admin guide, `/staff/team`:

| Claim | Control |
|---|---|
| Grant Access / Apply / Revoke Access (Demote) | `page.tsx` `<h2>Grant Access`, `AssignRoleForm` button and options |
| Store admin sees only Staff; platform admin also sees Store Admin and Platform Admin | `canGrantAdmin` in `AssignRoleForm` |
| Current Members columns | `page.tsx` `<th>` Name / Email / Store Role / Platform Role / Added |
| Email lookup ignores capitals | `findFirst … mode: "insensitive"` |
| Account created for an unknown email (Staff/Store Admin) | `tx.user.create` in `applyVendorRole` |
| Platform Admin refused for an unknown email | the R24 throw |
| A change to a platform admin applies everywhere | `tx.user.update({ role: "CUSTOMER" \| "ADMIN" })` |
| Last platform admin cannot be demoted by anyone | `isPlatformDemotion` count |
| A store admin cannot remove themselves as the last store admin; a platform admin is not stopped | `isSelfVendorDemotion` (requires `actor.via === "ADMIN"`) |
| No invitation email | no send in `applyVendorRole` / `setVendorRole` |
| Google with the same address links | `lib/auth.ts` `accountLinking.trustedProviders: ["google"]` |
| Every change audited; not shown on the page | `tx.vendorRoleAuditLog.create`; `page.tsx` has no audit view |
| Access changes on the next page load | `requireVendorRole` runs per request on every `/staff` page |

Platform admin guide, Telegram section: the claims were spot-checked against the code.

| Claim | Control |
|---|---|
| 5 s timeout | `lib/order-alert/channels.ts` `TELEGRAM_TIMEOUT_MS = 5000` |
| "TELEGRAM_BOT_TOKEN unset" skip reason | `channels.ts:40` |
| `[STAGING]` prefix | `withEnvironmentTag` in `lib/order-alert/brief.ts` / `order-alert-service.ts` |
| Alert carries order number, sender name, subject | `lib/order-alert/brief.ts` |
| Bot usernames `@AheedFoodCentre_alerts_bot` / `@Merqify_alerts_bot` | owner-supplied; not in code or config, so **unverified** |

## Deviations from the spec

- **R33: the last-platform-admin *refusal* is not exercised against the real database.** Producing
  it would require demoting dev's real platform admins. The script proves the guard's count query
  runs over the WebSocket adapter, and that the allowed path works. The refusal branch is covered by
  three `tests/roles.test.ts` cases. This is said in the script's header.
- **R33 has not been run yet.** It needs migration `20261109225000_vendor_enquiries` applied to
  **dev**. Auto mode blocks `prisma migrate deploy` even on dev, so the owner must run it (see
  Known-shaky). R25 and R34 are staging-only and wait for D6.

## Known-shaky areas

- **The Worker reads `message.raw` after `forward()`.** Unit tests use a fresh stream. Whether
  Cloudflare's `ForwardableEmailMessage.raw` is still readable after `forward()` has **never been
  exercised**. If it is not, recording silently gets an empty body and sends `(No message body)`,
  and the message is still recorded. Prove it on staging once a Worker routing rule exists; until
  then R34 reports inbound recording as "not exercised".
- **Provisioned accounts signing in (R25).** Only the Google route is backed by config
  (`trustedProviders`). Email/password sign-up refuses an existing email. Whether password reset
  works for an account with no credential row is unknown, and the guide claims only Google.
- **Contact-form order number.** The enquiry stores the `orderId` the shopper typed, not the one
  `processContactSubmission` verified. The guide tells staff to check it belongs to the customer.
  Not specified either way, so it is not changed here.
- **Two writes per reply.** A failure between the reply insert and the status update leaves an OPEN
  enquiry with a listed reply. This is benign and visible.
- **The record route re-resolves `to`** through `resolveInboundEmailWith`. If addresses change
  between `/resolve` and `/record`, a 404 is logged by the Worker and nothing is recorded.
