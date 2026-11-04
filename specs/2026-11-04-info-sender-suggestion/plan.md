---
id: 2026-11-04-info-sender-suggestion-plan
title: "Client Setup: info- sender suggestion from the store's subdomain (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-11-04
visibility: internal
summary: Client Setup's suggested sender becomes info@<own domain>, else info-<subdomain>@<platform domain> from the store's platform subdomain, else info-<slug>@<platform domain>, replacing the orders- forms (#1419).
tags: [email, client-setup, p12]
related: [2026-11-02-forward-dropdown-default-sender-plan, env-setup]
---

# Client Setup: info- sender suggestion from the store's subdomain (plan)

Issue `#1419`. Gate 1 approved by the owner on 2026-11-04. It changes the suggestion rule `#1403`
introduced (`specs/2026-11-02-forward-dropdown-default-sender/`, its R12).

**Goal:** the sender Client Setup suggests mirrors the address a shopper actually sees. A store at
`aheed.merqify.com` is offered `info-aheed@merqify.com`, not `orders-aheed@merqify.com`.

**The rule (owner-confirmed 2026-11-04):**

| The store has                                                | Suggested sender email               |
| ------------------------------------------------------------ | ------------------------------------ |
| A custom domain (a host not the platform domain or under it) | `info@<custom domain>`               |
| A one-level subdomain of the platform domain                 | `info-<subdomain>@<platform domain>` |
| Neither                                                      | `info-<slug>@<platform domain>`      |

The order is the precedence: a custom domain beats a platform subdomain, which beats the slug. The
platform domain is still `EMAIL_FROM`'s domain, so there is no new config.

**Scope (this slice):**

- `suggestSender` in `lib/client-setup/sender-suggestion.ts`: the new rule, and its JSDoc
  owner-decision note.
- `tests/client-setup-sender-suggestion.test.ts`: the `suggestSender` cases rewritten for the rule.
- The two docs that state the old rule: `docs/developer-portal/env-setup.md` (the suggested-sender
  section and the #1403 sanity step 7) and `docs/platform-admin-guide/platform-admin-guide.md`
  ("Set the sender").

**Choosing among platform subdomains.** A store often has several: one database can hold both
`aheed.merqify.com` and `aheed-staging.merqify.com`. The tie-break the custom-domain branch already
uses applies: the canonical host first, then the alphabetically first. So a staging database whose
canonical host is `aheed-staging.merqify.com` suggests `info-aheed-staging@merqify.com`, and staging
mail then names staging.

**Hosts that give no subdomain** fall through to the slug: a host equal to the platform domain (no
label), and a multi-level host such as `a.b.merqify.com` (a dotted label would make an ambiguous
address). Dev hosts are already ignored before any of this.

**Deliberately excluded:**

- **Saved senders are not changed.** The card still only suggests. Aheed and SriMart are updated by
  hand in Client Setup after deploy, as an owner step, not a migration.
- **`isRoutableSenderDomain`** is unchanged. Any address on the platform domain is already routable,
  and the merqify.com catch-all receives every `info-*` address, so no Cloudflare change is needed.
- **The Sender card's component and copy.** It renders whatever `suggestSender` returns and names no
  `orders-` form (`app/(admin)/staff/platform/client-setup/page.tsx` passes `suggestedSender`
  through).
- **The test-email flow** (sends to the signed-in admin only) and any "send to" field: not asked
  for.
- `docs/model-handoff.md` mentions `orders-aheed@merqify.com` as an existing **receiving** address,
  not the suggestion rule, so it is left alone.

**Open items carried forward:** none.
