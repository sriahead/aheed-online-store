---
id: 2026-11-02-default-forward-inbox-plan
title: "Client Setup default forward-to inbox (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-11-02
visibility: internal
summary: A platform default forward-to inbox (INBOUND_DEFAULT_FORWARD) prefills Client Setup's receiving-address form, and the address list groups addresses by the mailbox they forward to (#1399).
tags: [email, inbound, client-setup, p12, config]
related: [2026-11-01-cloudflare-email-service-plan, env-setup]
---

# Client Setup default forward-to inbox (plan)

`#1217` shipped incoming email: Cloudflare Email Routing hands mail for a store address to the
`aheed-inbound-email[-staging]` Worker. The Worker asks the app which store owns the address, and
forwards the message to that address's `forwardTo` mailbox. Platform admins register addresses in
Client Setup (`/staff/platform/client-setup`). Today the form's **Forward to** field starts blank
and is required (`components/staff/client-setup/EmailSetupForms.tsx`).

On 2026-11-02 the owner set up four Google Groups:

| Group | Role |
|---|---|
| `info-afc@googlegroups.com` | Aheed's forward-to |
| `info-srimart@googlegroups.com` | SriMart's forward-to |
| `info-merqifyhub@googlegroups.com` | The platform default, and the inbound Worker's `INBOUND_FALLBACK_FORWARD` |
| `info-merqify@googlegroups.com` | Merqify's own `info@merqify.com`, a direct Cloudflare rule with no Worker |

The owner asked for two things: `info-merqifyhub@` as the default for receiving addresses, and
many receiving addresses able to forward to one group.

**Goal:** a platform admin adding a receiving address finds **Forward to** already filled with
the platform default inbox and changes it only for a store that has its own mailbox. The address
list shows which addresses share each mailbox.

**Scope (this slice):**
- **A platform config value, `INBOUND_DEFAULT_FORWARD`.** It is read through `lib/config` with
  its own zod schema, separate from the email and inbound-token schemas. A bad value there must
  never break sending (`getEmailEnv`) or the inbound resolve route (`getInboundEmailEnv`, which
  fails closed with a 503). The value is trimmed and lower-cased. Unset or blank means "no
  default". A value that is not an email address is **invalid**: it prefills nothing, and the
  page says so.
- **`wrangler.toml` sets it** in `[env.staging.vars]` and `[env.production.vars]` to
  `info-merqifyhub@googlegroups.com`. It is non-secret platform config, the same pattern as
  `EMAIL_FROM` and `PLATFORM_NAME`. Committing it is fine: it is a business group inbox, not a
  personal address (`INBOUND_FALLBACK_FORWARD` is a secret for that reason). `lib/config` has
  **no** built-in fallback to this address. The platform's inbox is deployment data, so local dev
  and CI simply have no default.
- **Prefill.** `AddInboundAddressForm` takes the default and uses it as the **Forward to** input's
  `defaultValue`. The field stays required and editable. When a default exists, one neutral line
  under the field says it is the platform default and can be changed.
- **Status.** The "Sending status (this environment)" card gains a **Default forward-to** row:
  the address, "Not set", or "Invalid: check INBOUND_DEFAULT_FORWARD".
- **Grouped address list.** The selected store's receiving addresses are shown grouped by
  `forwardTo`. Each group is headed by its mailbox, with its addresses under it (purpose and
  Remove unchanged). The group whose mailbox equals the default is labelled as the platform
  default. The grouping is a pure function in a plain module under `lib/client-setup/`, so it is
  unit-tested without React. `"use server"` files may export only async functions (CLAUDE.md).
- **Many addresses to one mailbox keeps working.** Only `VendorInboundAddress.address` is unique
  (`prisma/schema.prisma`); `forwardTo` is not. A test pins this at the service boundary, so a
  later "dedupe" cannot quietly remove it.
- **Docs.** `env-setup.md` ("Email: sending and receiving") gets a Keys row and a note pairing it
  with `INBOUND_FALLBACK_FORWARD`. `docs/platform-admin-guide/platform-admin-guide.md` (Client
  Setup) covers the prefill, the grouping and the status row.

**Deliberately excluded:**
- **Editing an existing address's forward-to.** Remove and re-add still works. An edit control is
  a separate small follow-up if the owner wants it.
- **A server-side fallback** (blank `forwardTo` silently becoming the default). The default is a
  UI prefill only; the server action is unchanged and still requires `forwardTo`. Prefilling keeps
  what is saved visible before it is saved.
- **Cross-store visibility** ("this mailbox is also used by 3 other stores"). Client Setup is per
  store. Grouping is within the selected store.
- **Platform-level (non-store) receiving addresses** such as `info@merqify.com`. That is a
  Cloudflare rule straight to a group with no Worker. `VendorInboundAddress` requires a vendor and
  stays that way.
- **Checking that the default is a verified Cloudflare destination.** The Cloudflare API read is
  `#1392`.
- **Changing `INBOUND_FALLBACK_FORWARD`.** It is a separate secret on the inbound Worker, already
  set to the same group on staging (2026-11-02). Docs only.
- **Any schema change or migration.**

**Open items carried forward:**
- Production `INBOUND_EMAIL_TOKEN` / `INBOUND_FALLBACK_FORWARD`, the store routing rules and the
  production Client Setup entries are owner steps (runbook), not part of this slice's code.
- `#1395` (raw zod JSON in the test-email failure) stays separate.
