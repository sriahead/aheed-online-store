---
id: 2026-11-10-pr1481-enquiries-team-access-retro-plan
title: "PR #1481 retro-spec: enquiries inbox, Team & Access provisioning, inbound-email recording and operator guides (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-10
visibility: internal
summary: "Retrospective Gate 1/2 spec for code already on PR #1481: the /staff/enquiries inbox and its migration, Team & Access Platform Admin grants and pre-provisioning, inbound-email recording, and the Telegram/operator guides. Includes a review of the implementation against it."
tags: [enquiries, rbac, team-access, inbound-email, telegram, retro-spec, migration]
related: [architecture, model-handoff, 2026-11-04-order-alerts-telegram-plan]
---

# PR #1481 retro-spec (plan)

**Why this exists.** PR #1481 (`feature/operator-guides-telegram-alerts` into `staging`) is titled
as documentation, but it also carries feature code: a new table and migration, a new staff page
with outgoing email, an unauthenticated-by-session HTTP route, and changes to who can grant which
role. None of it went through Gate 1 (proposal) or Gate 2 (spec), and its CI is red. The owner
asked on 2026-11-10 for a retrospective spec that covers all five areas. Then the implementation
is reviewed against it, the 12 failing tests are fixed without weakening any security control, and
nothing merges until the spec is approved, CI is green, integration tests pass and staging
validation is done.

**Goal:** turn PR #1481 into a specified, reviewed, validated slice, or into a clear list of what
must change before it can be one. Shipping it proves staff can read and answer customer messages
in-app, and that Team & Access grants are safe.

## Scope (this slice): the five areas on the branch

Commits `6ed115d2`, `47e753ae`, `4eba5b47`, `4c33b882`, `c719b118` (diff base `origin/staging`
`82dd8aa1`).

| Area | What is on the branch | Files |
|---|---|---|
| **A. Operator guides & Telegram quick links** | Rewritten guides for `/staff/enquiries` (staff playbook), `/staff/team` (store admin guide), and an end-to-end Telegram order-alert setup section (platform admin guide). A "Telegram quick links" block in the Client Setup **Order alerts** card. The alert mechanism itself shipped in `#1390`/`#1435` and is **not** re-specified here. | `docs/staff-playbook/staff-tabs-guide.md`, `docs/store-admin-guide/admin-tabs-guide.md`, `docs/platform-admin-guide/platform-admin-guide.md`, `app/(admin)/staff/runbook/docs.ts`, `lib/client-setup/telegram-links.ts`, `app/(admin)/staff/platform/client-setup/page.tsx`, `tests/client-setup-telegram-links.test.ts` |
| **B. Vendor enquiries** | `/staff/enquiries` lists the store's last 100 contact-form and inbound-email messages, filters and searches them client-side, sends an email reply as the store, and toggles Resolved/Open. Successful contact-form submissions are recorded as enquiries. | `app/(admin)/staff/enquiries/*`, `lib/enquiries-service.ts`, `lib/repositories/enquiries.ts`, `lib/contact-service.ts`, `components/staff/nav-items.ts`, `tests/page-container.test.ts` |
| **C. Team & Access provisioning** | Case-insensitive email lookup. A platform admin can grant **Platform Admin** (global `User.role = ADMIN`) from a store's Team page. Granting a role to an email with no account **creates the account** (pre-verified). | `lib/repositories/roles.ts`, `components/staff/team/AssignRoleForm.tsx`, `app/(admin)/staff/team/page.tsx` |
| **D. Inbound-email Worker** | After forwarding, the Worker reads the raw message, extracts sender and plain-text body, and POSTs it to a new token-guarded route `/api/inbound-email/record`, which stores an `INBOUND_EMAIL` enquiry. | `workers/inbound-email/src/index.ts`, `app/api/inbound-email/record/route.ts` |
| **E. Vendor enquiries migration** | `20261109225000_vendor_enquiries` creates `VendorEnquiry` (vendor FK with cascade delete, two indexes). | `prisma/schema.prisma`, `prisma/migrations/20261109225000_vendor_enquiries/` |

## Implementation review against this spec

The review was done by reading the diff on 2026-11-10. Requirement numbers refer to `requirements.md`.

**Met as built:** R1, R2, R4–R7, R14, R16, R17, R19, R21, R23, R28. The page guard, nav
registration, vendor scoping by `(id, vendorId)`, HTML escaping of the reply, the timing-safe token
check, and the Serializable transaction around membership, audit row and account creation are all
correct. **Not yet provable (need a run, not a code change):** R25, R33, R34. **R3** is re-checked
after Build, because the guides must describe the final behaviour.

**Gaps, in severity order:**

1. **Failing CI, with two separate causes (R31, R32, R36).**
   - `tests/roles.test.ts`, 10 failures. The repository now calls `prisma.user.findFirst`
     (case-insensitive lookup), and the test double still only provides `findUnique`. Nine of the
     ten are only that. The tenth ("does not apply the self-lockout count to a platform-admin
     acting on themselves") **also** hits a real behaviour change: a platform admin who removes
     themselves from a store's team now also loses their global Platform Admin role, guarded by a
     new last-platform-admin count. See decision D3.
   - `tests/neon-migration-plan.test.ts`, 2 failures. `VendorEnquiry` is not classified in
     `scripts/lib/neon-migration-plan.ts`.
2. **A reply is marked REPLIED when no email was sent (R10).** `replyToVendorEnquiry` only treats
   `failed` as failure. `skipped` (staging's `EMAIL_ALLOWED_RECIPIENTS`, or the log-only adapter)
   records the reply and the UI says "Reply sent". This would also make staging validation report a
   false pass.
3. **The role value is not allow-listed (R20).** `assignRoleAction` casts any form string to
   `VendorRoleAction`. An unknown value reaches the `else if (newRole)` branch and is written to
   `VendorMembership.role`, which Postgres rejects with an enum error that is shown raw to the user.
   It was always like this, but adding `PLATFORM_ADMIN` widened the surface.
4. **The status value is not allow-listed (R11).** `updateEnquiryStatusAction` casts any form
   string, and `status` is a `TEXT` column, so any string is stored.
5. **Global privilege is changed from a store-scoped page (R18, R21, R22).**
   - Granting Platform Admin, or demoting a platform admin to STAFF, ADMIN or none on *any* store's
     Team page, changes the user's role on **every** store.
   - The last-platform-admin guard only covers self-demotion. One platform admin can demote the
     last other one.
   - This overlaps open `#1320` (cross-store Users page). Decisions D2 and D3.
6. **Pre-provisioning creates pre-verified accounts (R24, R25).** `emailVerified: true` is set
   without proof that the grantee controls the mailbox. For STAFF/ADMIN, access still requires
   signing in as that email, so the risk is a typo granting a stranger store access. For
   **Platform Admin** the same typo grants global access. It is also unproven that a provisioned
   account can sign in at all: email/password sign-up refuses an existing email, so the only routes
   in are Google (trusted account linking) or password reset. Decision D4.
7. **Replies overwrite each other (R12).** `replyBody`/`repliedAt`/`repliedBy` are single columns,
   and "Send another reply" overwrites the record of what was sent before. That is a repeating group
   in one row (3NF), and the audit of customer-facing messages is lost. Decision D1.
8. **Status/source/type are free `TEXT` (R29).** Every other status column in the schema is a
   Prisma enum (`FeedbackStatus`, `OrderStatus`, ...), and `type` duplicates two existing enums
   (`ContactType`, `InboundAddressPurpose`). The migration has not reached staging or production,
   so it can be corrected in place now. After it applies, a correction needs a second migration.
9. **The migration has no hand-authored header (R30).** CLAUDE.md requires one while `#895` blocks
   `migrate dev --create-only`.
10. **A platform domain is hard-coded in the UI (R8).** The page falls back to the literal
    `no-reply@merqify.com`, which breaks the vendor-agnostic rule (ADR-004). `EMAIL_FROM` in
    `lib/config` is the real default.
11. **Reply-To can point at a no-reply address (R9).** `replyTo` prefers `sender.email`, which is
    the From address itself, so a customer replying to the reply may reach nobody. The store's
    receiving address (`toAddress`) belongs first.
12. **The record route does not cap field lengths (R27).** The Worker truncates the body to 4,000
    characters, but the route trusts any token-holder's payload of any size.
13. **A failed record call is silent (R26).** `fetch` does not throw on a 4xx/5xx response, so a
    404 or 500 from `/record` is never logged.
14. **Missing tests (R13, R15, R31).** There is no test for the enquiries service, contact-form
    recording, record route, or the Worker's record path and parsers, and no `roles.test.ts` case
    for Platform Admin or provisioning.
15. **The PR misdescribes itself (R35).** Its title and CHANGELOG entry describe documentation
    only, and it closes no issue.
16. **The Platform Admin option has no "global" warning (R18).**

## Decisions (owner approved all recommended options, 2026-11-10)

`requirements.md` encodes the **recommended** option for each decision. Changing one changes the
named requirements before Build.

- **D1. Reply history.** *Recommended:* a child table `VendorEnquiryReply` (enquiry FK, body,
  sentBy, sentAt), added to the **same, not-yet-applied** migration, with the three reply columns
  dropped from `VendorEnquiry`. *Alternative:* keep one reply per enquiry and disable "Send another
  reply" once one is recorded. (R12, R29)
- **D2. Platform Admin grants from a store's Team page.** *Recommended:* keep them, because the
  owner built this on purpose. They stay platform-admin-only and audited, with a visible "this is
  global" warning, and `#1320` later moves them to the cross-store page. *Alternative:* remove the
  option until `#1320`. (R18, R21)
- **D3. What demoting a platform admin on a store page does.** *Recommended:* keep the
  effective-role behaviour as built, and extend the last-platform-admin guard to **every**
  demotion, not only self-demotion. *Alternative:* store-page actions change only
  `VendorMembership` and never `User.role`. (R21, R22)
- **D4. Pre-provisioning.** *Recommended:* allow it for STAFF and Store Admin, and **refuse** it for
  Platform Admin. A global grant requires an account that already exists. Staging must prove a
  provisioned STAFF account can sign in. (R23, R24, R25)
- **D5. Commit `8531ffc1` (`#1331` follow-up).** It is not one of the five areas and does not
  duplicate `#1478`. It changes the AFC routes from custom domains to `zone_name` routes through the
  Cloudflare for SaaS fallback origin, widens the CSP `img-src` to `*.aheedfoodcentre.co.uk`, edits
  `verify-worker-routes.ts`, and adds `scripts/migrate-aheed-to-dedicated-cell.ts`. *Recommended:*
  move it to its own PR referencing `#1331`. Note that with `--staging` the script copies the **AFC
  production** database into AFC staging, which puts production customer data in staging; that
  needs its own decision. (Excluded below.)
- **D6. Where "staging validation" runs.** Staging only receives code and migrations when a PR
  merges into `staging`. *Recommended:* merge into `staging` once CI is green and the
  integration/preview checks pass, validate there, and treat "no merge" as no promotion to `main`
  until staging validation is complete. *Alternative:* `wrangler versions upload --env staging` (a
  preview version) against a Neon branch of staging. That is heavier, and the migration still has
  to apply somewhere.

## Deliberately excluded

- **The `#1390`/`#1435` alert mechanism.** It is already in production. Area A only covers the
  guide and links.
- **`#1331` follow-up commit `8531ffc1`** (D5). Its routes, CSP and data-copy script belong to
  `#1331`. `#1478` is not re-specified.
- **Idempotency for duplicate inbound deliveries** (Message-ID dedupe). Cloudflare may redeliver,
  which creates a duplicate enquiry row. Track it as an issue.
- **Retention, erasure and data-rights export for enquiries.** `VendorEnquiry` holds personal data
  but has no `userId` link, so an account-erasure request would not find it. Track it as an issue
  before production use.
- **Pagination beyond 100 and server-side search.** The list is capped at 100 and filtered
  client-side.
- **`ContactOutbox` viewing/retry** stays `#1411`. **Cross-store Users page** stays `#1320`.
- **The Aheed custom-email (`#104`/`#1343`/`#1392`) and Stripe (`#113`) sequence** is unchanged.
  This slice does not touch sending-domain or payment configuration.

## Dependencies

- **`INBOUND_EMAIL_TOKEN`** must be set on the app Worker and the inbound Worker (already required
  by `#1217`). The `/record` route returns 503 without it.
- **Email Routing Worker rules (owner-gated).** On 2026-11-03, `merqify.com` routing was a
  catch-all to a Google group with **no Worker rules**, so area D receives nothing in production
  until the owner adds rules. The AFC cell's inbound Worker has the same dependency.
- **Outgoing email**: replies reach only verified addresses until `#104` (verified sending domain)
  closes. Staging only mails `EMAIL_ALLOWED_RECIPIENTS`.
- **Lockstep migrations (`#1331`)**: on merge, `deploy-staging` applies the migration to both the
  platform and AFC staging databases.

## Open items carried forward

- Owner decisions D1–D6 above.
- New issues to open on approval: the enquiries umbrella (this slice's `Closes`), inbound
  idempotency, and enquiry data-rights. PR #1481 currently only says `Refs #1390, #1217`.
- `R16` of `#1435` (a real Telegram message on staging) is still unverified, and this slice does
  not change that.
