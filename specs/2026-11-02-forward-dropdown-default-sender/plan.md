---
id: 2026-11-02-forward-dropdown-default-sender-plan
title: "Client Setup: verified forward-to dropdown and suggested sender (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-11-02
visibility: internal
summary: Client Setup reads Cloudflare's verified Email Routing destinations to offer Forward to as a dropdown (text fallback), and suggests each store's sender from its name and domain, flagging an unroutable sender (#1392, #1403).
tags: [email, inbound, client-setup, cloudflare, p12]
related: [2026-11-02-default-forward-inbox-plan, 2026-11-01-cloudflare-email-service-plan, env-setup]
---

# Client Setup: verified forward-to dropdown and suggested sender (plan)

Client Setup (`/staff/platform/client-setup`, platform admins) configures a store's email. `#1217`
built it, and `#1399` prefilled **Forward to** with the platform inbox. Two gaps remain. Both
showed up in live use on 2026-11-02.

1. **Forward to is free text** (`#1392`). Cloudflare forwards only to addresses verified under
   Email Routing → Destination addresses. A typo, or a mailbox nobody verified, saves without
   complaint, and then mail to that receiving address silently goes nowhere. The guide's "Verify
   the forward-to mailbox" step can only say "Check in Cloudflare".
2. **Store senders still name `nocaped` addresses** (`#1403`). The Merqify cut-over copied each
   store's `VendorConfig.senderEmail` (`orders@aheedfoodcentre.nocaped.com`,
   `orders@srimart.nocaped.com`). An unverified sender domain means mail goes out from `EMAIL_FROM`
   with **Reply-To set to that dead address**, so customer replies are lost. Nothing suggests the
   right value. On 2026-11-02 the owner nearly saved Aheed's details onto SriMart's form.

**Goal:** a platform admin picks a forward-to mailbox from the mailboxes Cloudflare has actually
verified. The guide marks that step done from real data. Each store's Sender card offers a correct
sender in one click and warns when the current one cannot receive replies.

**Owner decisions (2026-11-02, at Propose):**
- **Suggested sender address:**
  - `orders@<store's own domain>` when the store has a custom domain;
  - otherwise flat on the platform domain, `orders-<slug>@<platform domain>`. The platform domain
    is `EMAIL_FROM`'s domain, so no new config.
- **Suggest, never overwrite.** A button fills the form and the admin still presses Save. The page
  flags a sender whose domain cannot receive replies.
- **Credentials:** reuse the Workers' existing `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN`
  (secrets in both environments, already used for Workers AI). The owner adds **Email Routing
  Addresses: Read** to each environment's token. A separate token was rejected: one more secret in
  two stores to rotate.

**Scope (this slice):**
- **A destination-address reader** in `lib/email/` that calls
  `GET https://api.cloudflare.com/client/v4/accounts/{account_id}/email/routing/addresses` and
  pages through the results.
  - It returns `{ status: "ok", addresses: [{ email, verified }] }` or
    `{ status: "unavailable", reason }`, and never throws.
  - `fetch` and credentials are passed in, so it is unit-testable with a stub and keeps the
    repository-style explicit-argument shape.
  - Credentials come through `lib/config`.
  - It caps at 4 pages of 50, which is Cloudflare's published 200-destination account limit.
- **Forward to dropdown**, shown when the read succeeds:
  - verified addresses are selectable;
  - pending ones are shown disabled ("awaiting verification");
  - an **Other…** choice reveals a text box with a warning.
  - The `#1399` default is preselected when it is verified. Otherwise **Other…** is preselected
    with the default typed in, so `#1399`'s behaviour is kept.
  - The form still posts a single `forwardTo` value, so the server action does not change.
- **Fallback:** when the read is unavailable, Forward to stays today's text field, and the page
  says why (not configured, permission missing, or Cloudflare error).
- **Status card:** a **Verified mailboxes** row, e.g. "3 verified, 1 pending" or "Unavailable:
  …".
- **Guide step "Verify the forward-to mailbox"** becomes computed:
  - Done when the store has receiving addresses and every distinct forward-to mailbox is verified;
  - Not done otherwise;
  - still "Check in Cloudflare" when the read is unavailable.
- **Suggested sender**, a pure function in a plain module:
  - **name:** the vendor's name;
  - **address:**
    - `orders@<custom domain>` when the store has a `VendorDomain` host that is neither the
      platform domain nor under it. A leading `www.` is stripped. The canonical such host wins;
      otherwise the alphabetically first.
    - otherwise `orders-<slug>@<platform domain>`.
    - no suggestion when neither exists (no custom domain and no `EMAIL_FROM`).
- **Sender card:**
  - shows the suggestion and a **Use suggested sender** button, which fills both inputs without
    saving;
  - hides both when the saved sender already equals the suggestion.
- **Unroutable-sender warning:** shown when the saved sender's domain is none of these:
  - the platform domain;
  - one of the store's own custom domains (the same derivation);
  - a domain in `EMAIL_VERIFIED_DOMAINS`.

  It says replies may not arrive and why. This is the `nocaped` case.
- **Docs:** `env-setup.md` (the token permission, the Keys note, and a sanity check) and the
  platform admin guide.

**Deliberately excluded:**
- **"New stores start with the suggested sender."** It was in the proposal, but no application
  code path creates a store's `VendorConfig`: stores come from `prisma/seed.ts` and the migration
  scripts. Building store creation is far outside this slice. Client Setup shows the suggestion
  for any store, a new one included, which is what the owner experiences. Tracked as a follow-up
  issue.
- **Server-side enforcement** that a forward-to is verified. The action still accepts any valid
  email; the UI warns. A verified mailbox can be un-verified later anyway, so the read is advisory.
- **Routing-rule state and sending-domain state** (auto-filling `EMAIL_VERIFIED_DOMAINS`). These
  are the rest of `#1392`'s original text and stay open there.
- **Overwriting existing senders**, and any dashboard work in Cloudflare.
- **Caching the API result** across requests. The page is `force-dynamic` and the read is one
  small call per render.
- **Schema change:** none.

**Known caveat (documented, not fixed):** a staging cell on a custom subdomain (e.g. the planned
`staging.aheedfoodcentre.co.uk`, `#1331`) derives `orders@staging.aheedfoodcentre.co.uk`. That
subdomain would need its own Email Sending onboarding. It is a suggestion, so the admin can type
another address.

**Open items carried forward:**
- The owner adds **Email Routing Addresses: Read** to the staging and production Merqify tokens.
  Until then the dropdown falls back, as designed. The live dropdown check waits on it.
- Outgoing mail needs `merqify.com` onboarded in Email Sending (owner, R39 of `#1217`).
