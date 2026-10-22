---
id: client-onboarding-prerequisites
title: "Client onboarding — prerequisites checklist (new vendor, own domain)"
audience: [dev]
type: doc
status: draft
version: "0.1.0"
updated: 2026-10-22
visibility: internal
summary: "Everything that must be true before a new client shopfront on its own domain can be provisioned, imported and deployed: domain and Cloudflare, vendor identity, branding, delivery, email, catalogue, deployment, rollback. Draft for owner review; nothing in it has been executed."
tags: [onboarding, multi-tenancy, cloudflare, provisioning, runbook, p11]
related: [env-setup, adr-004-multi-tenancy, adr-007-storefront-scope-restrictions-stock-states, sdd-operator-runbook]
---

# Client onboarding — prerequisites checklist

**Status: DRAFT for owner review.** Written 2026-10-22 for the `aheedsuperstore` test vendor. Every
row is a *requirement to confirm*, not a statement that it is done. Where a row names a fact about
live infrastructure (a Cloudflare zone, a DNS record, a secret), nobody has verified it from the
repository, and it must not be assumed. Owner-supplied values that are not yet known are written as
`‹OWNER TO CONFIRM›`.

**Who does what.** `Owner` = needs your account, a decision, or the client. `Repo` = a code or config
change the assistant makes on a branch for review. `Script` = done by `scripts/provision-vendor.ts`
(or its extension) once the inputs exist.

## 0. The shape of the work (read first)

A new vendor is **one row set in the database plus one route in `wrangler.toml` per host**. It is not
a new deployment: staging and production each run one Worker that serves every vendor, chosen by the
request host (`VendorDomain`, ADR-004).

Two properties make onboarding unforgiving:

1. **A `wrangler deploy` that omits any live host tears that host's custom domain down.** Every
   existing vendor host stays in `wrangler.toml` in the same change. `scripts/verify-worker-routes.ts`
   runs in both deploy workflows and fails the deploy if a trading vendor's host is missing, but it
   reads `VendorDomain`, so it can only protect a host that already has a row.
2. **Staging and production are different databases and different hosts.** They are separate changes
   and separate deploys. A step is never "done for both".

## 1. Decide: new vendor, or another domain for an existing vendor

| Question | Why it matters | Who |
| --- | --- | --- |
| Is the shopfront a **new vendor** (own `Vendor` row, own catalogue, own staff, own orders) or an **additional domain** for Aheed Food Centre? | A new vendor needs a manifest, a catalogue and its own staff accounts. An extra domain is one `VendorDomain` row and one route. The two are different pieces of work and must not be mixed. | Owner |
| If a new vendor: does it share **no data** with Aheed Food Centre? | Tenancy is by `vendorId`. Sharing anything across vendors is out of scope. | Owner |
| Is its trading name distinct from every existing vendor's? | The slug and display name must be unique and must not reuse another vendor's name in copy. | Owner |

**Current repository facts (verified from `wrangler.toml`, 2026-10-22).**

| Environment | Existing routes |
| --- | --- |
| staging | `staging.aheedfoodcentre.nocaped.com`, `srimart-staging.nocaped.com` |
| production | `aheedfoodcentre.nocaped.com`, `srimart.nocaped.com` |

`aheedfoodcentre.co.uk` does not appear anywhere in `wrangler.toml`, the seed, or the manifests.

## 2. Domain, DNS and Cloudflare

| # | Prerequisite | Who | Notes |
| --- | --- | --- | --- |
| 2.1 | The client **owns** the domain and you hold registrar access | Owner | Needed to change nameservers. |
| 2.2 | The domain is an **active zone in the same Cloudflare account** as the Worker | Owner | A Worker Custom Domain can only attach to a zone in the account. **Not verified.** If the zone is absent: add the site in Cloudflare, change the registrar nameservers to the two Cloudflare ones, wait for "Active". |
| 2.3 | Zone SSL/TLS mode and Universal SSL | Owner | Custom Domains issue a certificate per hostname. A staging host such as `staging.<domain>` is one label deep on a client-owned zone, so Universal SSL would cover it, but do not rely on that; the Custom Domain issues its own. |
| 2.4 | **No existing DNS record** on the exact hostname | Owner | Attaching a Custom Domain creates the record. A pre-existing `A`/`CNAME`/`AAAA` on the host blocks it. |
| 2.5 | Email DNS (see §6) does not collide with web DNS | Owner | `MX`/`SPF`/`DKIM` go on the apex and sub-labels, never on the Custom Domain host. |
| 2.6 | Hostnames agreed, one per environment | Owner | e.g. production `‹OWNER TO CONFIRM›`, staging `‹OWNER TO CONFIRM›`. Keep staging non-indexable (see §8.3). |
| 2.7 | **A `dev` host cannot be a deployed host today** | Owner decision | `env-setup.md` records that the `dev` tier is local-only: no `[env.dev]` block, no Worker deploy, no custom domain. A dev vendor host is `‹name›.localhost:8787` under `npm run preview`. A deployed `aheedsuperstore.nocaped.com` would need a new `[env.dev]` Worker, route, bucket and secrets. That is a separate piece of work and a decision, not a default. |
| 2.8 | The `nocaped.com` zone can host `‹slug›.nocaped.com` hosts only **one label deep** | Owner | Established in ADR-004's 2026-10-21 note. `‹slug›-staging.nocaped.com` is the existing pattern; `staging.‹slug›.nocaped.com` works only because Custom Domains issue per-host certificates. |

## 3. Vendor setup (identity and tenancy)

| # | Prerequisite | Who | Notes |
| --- | --- | --- | --- |
| 3.1 | A stable vendor **`id`** (UUID) and **`slug`** | Repo | The manifest supplies the id. Every write is an upsert on it, so a re-run changes nothing. A new id on a re-run would create a second vendor. |
| 3.2 | **Display name** and tagline | Owner | Name shown in the header, emails and footer. |
| 3.3 | Locality name, search placeholder, hero subtitle, banner note | Owner | All optional copy is neutral or vendor-supplied, never a grocery example baked into a component. |
| 3.4 | First staff accounts and their roles (ADMIN, STAFF) | Owner | Created through the normal sign-up and role flow, not by the manifest. Passwords never go in a manifest or a doc. |
| 3.5 | The target database is **not** a deployed one when using a script | Repo | `scripts/lib/protected-hosts.ts` refuses staging/production hosts with no override. Deployed databases are changed only by the deploy workflows or an explicitly approved operation. |
| 3.6 | Manifest file is held **outside the repository** | Owner/Repo | `prisma/manifests/README.md`: a real client's manifest carries contact details and VAT numbers and is never committed. Only `example.json` is. |

## 4. Branding

| # | Prerequisite | Who | Notes |
| --- | --- | --- | --- |
| 4.1 | Eight brand primitives (`brandGreenDark`, `brandGreen`, `brandOrange`, `brandRed`, `brandCream` and the three tints) as `#rrggbb` | Owner | For the test vendor: copied from Aheed Food Centre's seeded values in `prisma/seed.ts` unless told otherwise. |
| 4.2 | Logo | Owner | An **upload** on `/staff/storefront`, never a file in the repo (ADR-003). Leave `logoStorageKey` null in the manifest. |
| 4.3 | Check against a **second vendor** | Repo | `brandStyle()` injects inline custom properties that beat `tokens.css`; verify the new vendor's colours really render, and that no other vendor's page changed. |

## 5. Delivery and checkout settings

None of these have defaults that are safe to ship. For a **test** vendor they are placeholders; for a
trading vendor each is a business decision.

| # | Value | Placeholder in a test manifest | Who |
| --- | --- | --- | --- |
| 5.1 | Delivery fee (pence) | `‹OWNER TO CONFIRM›` | Owner |
| 5.2 | Free-delivery threshold (pence, or none) | `‹OWNER TO CONFIRM›` | Owner |
| 5.3 | Minimum order (pence) | `‹OWNER TO CONFIRM›` | Owner |
| 5.4 | Outward-postcode prefixes delivered to | `‹OWNER TO CONFIRM›` | Owner |
| 5.5 | Fulfilment slots and collection | `‹OWNER TO CONFIRM›` | Owner |
| 5.6 | Loyalty on/off and tiers | off | Owner |
| 5.7 | Discount codes | none | Owner |
| 5.8 | Payment: Stripe keys belong to the platform account; confirm whether the client takes payment on their own account | `‹OWNER TO CONFIRM›` | Owner |

The manifest schema is strict and numeric fields must be real integers, so a placeholder cannot be
a string. The extension in the proposal makes placeholder-bearing manifests validate with a warning
and **refuse to run against any deployed database** until every `‹OWNER TO CONFIRM›` is replaced.

## 6. Email (outgoing and incoming are separate systems)

**Decision of 2026-10-22:** outgoing email is **provider-agnostic**. The application depends on one
`EmailService` interface; each provider is an adapter chosen by configuration. **Cloudflare Email
Sending is the initial provider**; Resend (the current one) and others stay swappable. Incoming mail
(Cloudflare Email Routing and Gmail forwarding) is a **manual DNS and mailbox concern with no code**
and is kept apart on purpose: the two never share configuration.

### 6.1 Outgoing (application mail: password reset, verification, order emails)

| # | Prerequisite | Who | Notes |
| --- | --- | --- | --- |
| 6.1.1 | The sending domain is onboarded to Cloudflare Email Sending, with its **SPF and DKIM** records published | Owner | **Not verified, and the Cloudflare page could not be read from this session** (the docs host is blocked by the session proxy). Treat domain onboarding steps, DNS records, limits, plan and beta status as unknown until read. |
| 6.1.2 | A `send_email` Worker binding per environment | Repo/Owner | `wrangler.toml` supports `[[env.<env>.send_email]]` with `name` and optional `allowed_sender_addresses`; the installed `wrangler` schema notes it is **not inherited**, so every environment declares its own. |
| 6.1.3 | One platform sender address per environment (`EMAIL_FROM_ADDRESS`) | Owner | **Today every vendor shares one From.** Per-vendor From is a separate decision (needs per-domain verification). |
| 6.1.4 | A staging/dev policy for recipients | Owner | Decide whether non-production environments may mail arbitrary addresses; the adapter must be able to restrict recipients. Unknown whether Cloudflare restricts this; verify. |
| 6.1.5 | A fallback or rollback provider is configured but dormant | Owner | Keep Resend's key available until Cloudflare sending is proven in production; switching is a config change. |
| 6.1.6 | Bounce, complaint and delivery visibility | Owner | Decide how failures are seen. Today the Resend adapter only logs non-OK responses. |

### 6.2 Incoming (client mailbox: `info@`, `orders@` and the like) — manual, no code

| # | Step | Who | Notes |
| --- | --- | --- | --- |
| 6.2.1 | The client's domain is an **active zone** in the Cloudflare account | Owner | Not true yet for `aheedfoodcentre.co.uk`. |
| 6.2.2 | Enable Email Routing on the zone; accept the MX and SPF records it adds | Owner | Email Routing takes over the zone's `MX`. **Do not enable it on `nocaped.com`**, which uses Zoho Mail. |
| 6.2.3 | Verify the destination Gmail address; create the forwarding rules | Owner | |
| 6.2.4 | In Gmail, "Send mail as" the client address so staff can reply from it | Owner | This is the client's *human* mailbox. It is not the application's sender. |
| 6.2.5 | Make one **combined SPF record** covering every sender for the domain | Owner | A domain may have only one SPF record; a second one invalidates both. |

### 6.3 What does not change
`senderEmail`/`senderName` stay per-vendor config and are **not** the From address today (only
`senderName` appears in subjects). They are marked placeholders in a test manifest.

## 7. Catalogue import

| # | Prerequisite | Who | Notes |
| --- | --- | --- | --- |
| 7.1 | The source export, held **outside the repository** | Owner | The client's stock list is their commercial data. Pass it to the importer by path. |
| 7.2 | Owner rulings on file | — | `ADR-007`: import everything **hidden** with stock **UNKNOWN**; `PROHIBITED` and `AGE_RESTRICTED` are hard blocks; `NOT_DELIVERABLE` and `NEEDS_REVIEW` clear only through an audited ADMIN confirmation. |
| 7.3 | A department → restriction map for this client | Owner | Per-client input (ADR-004), supplied to the importer as a `DepartmentRestrictionPolicy`. Never hard-coded in platform code. |
| 7.4 | The department list, VAT rates and the £0.00 / catch-all rows reviewed | Owner | Uncertain rows import as `NEEDS_REVIEW`, never as live. |
| 7.5 | **Not imported unless the client says otherwise:** stock count, cost, supplier, barcode, case size, reorder levels | Owner | The source carries no usable barcode or supplier; the importer must not fabricate them. |
| 7.6 | Unit label and description policy | Owner | `Product.description` and `unitLabel` are non-null and the source carries neither. An editorial decision for the remainder; see `#1201`. |
| 7.7 | Images | Owner | Uploaded through `lib/storage`; the database holds relative keys only. A catalogue imported without images renders with the placeholder. |
| 7.8 | Run against a **dev database first**, then review the exception report | Repo | The importer never runs against a deployed database from a script. |

## 8. Deployment

| # | Prerequisite | Who | Notes |
| --- | --- | --- | --- |
| 8.1 | One `[[env.<env>.routes]]` block **per host**, `custom_domain = true`, **added alongside** every existing host | Repo | Generate with `npx tsx scripts/verify-worker-routes.ts --env <env> --write`; diff by eye that no existing line vanished. |
| 8.2 | Staging first, production second, **separate PRs** | Repo | `feature → staging` squash, then `staging → main` as a merge commit (CLAUDE.md). |
| 8.3 | `SEO_INDEXABLE` stays set **only** in `[env.production.vars]` | Repo | Staging must remain non-indexable by being unconfigured. |
| 8.4 | `VendorDomain` rows exist in **that environment's** database before its deploy | Owner/Repo | The route check reads them. Created against a deployed database only by an explicitly approved operation, since scripts refuse deployed hosts. |
| 8.5 | Worker secrets set for the environment (see `env-setup.md`) | Owner | Per-environment, per-store. |
| 8.6 | Auth: nothing to configure per vendor | — | Cookies and trusted origins are derived per request from the host. `AUTH_COOKIE_FAMILY_DOMAIN` stays unset. |
| 8.7 | Deploy order unchanged: build → migrate → route check → `wrangler deploy` | — | Do not reorder. |

## 9. Verification (after each environment's deploy)

1. `npx tsx scripts/verify-worker-routes.ts --env <env>` exits 0 and names **every** trading host,
   existing and new.
2. `GET /api/health` on **every** vendor host returns `db.ok: true` and the deployed commit.
3. Each existing vendor host still serves its own branding and catalogue (no cross-contamination).
4. The new host serves its own branding; an unmatched host serves `/coming-soon`.
5. Imported products are all hidden: storefront shows no products; `/staff/products` shows them with
   `Hidden` + `UNKNOWN`; restricted rows carry their class.
6. `deploy-staging` / `deploy-production` complete successfully; confirm, do not assume from the merge.

## 10. Rollback

| Layer | Rollback | Caution |
| --- | --- | --- |
| Routes | Revert the `wrangler.toml` commit and redeploy. | Reverting removes the new host's custom domain, which is the intent. Never revert by deleting an existing vendor's route. |
| Vendor rows | Deactivate rather than delete: remove the `VendorDomain` row (`scripts/remove-vendor-domains.ts` exists) so the host falls to `/coming-soon`. | Deleting a vendor with orders fails on foreign keys by design. **No delete without explicit owner approval.** |
| Catalogue | Imported products are hidden, so they are not customer-visible. Removal is a separate, approved operation. | Never `migrate reset` (`#895`). |
| DNS | Detach the Custom Domain in Cloudflare. | Leave the registrar nameservers alone unless abandoning the zone. |

## 11. Manual actions that cannot be scripted

Zone creation and nameservers; Resend domain verification and its DNS records; secrets in both
stores; staff account creation; logo upload; image upload; the department → restriction map; every
`‹OWNER TO CONFIRM›` value.
