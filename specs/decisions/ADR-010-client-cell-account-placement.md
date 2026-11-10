---
id: adr-010-client-cell-account-placement
title: "ADR-010 — Where a dedicated client cell runs: the platform account via Cloudflare for SaaS, or the client's own account"
audience: [dev, architect, operations]
type: adr
status: draft
version: "0.1.0"
updated: 2026-11-10
visibility: internal
summary: "Proposed, not decided. Compares keeping the Aheed Food Centre cell in the Merqify account behind Cloudflare for SaaS (ADR-009 Decision 4) with moving it into the Aheed Food Centre account that already holds its zone. To be decided before the AFC production promotion; it is not a performance fix."
tags: [adr, cells, cloudflare, cloudflare-for-saas, accounts, routing, isolation]
related: [adr-009-dedicated-client-cells, adr-001-hosting, adr-004-multi-tenancy, cloudflare-saas-onboarding-runbook, saas-scaling-cost-and-isolation-architecture]
---

# ADR-010 — Where a dedicated client cell runs: the platform account via Cloudflare for SaaS, or the client's own account

**Status: proposed.** Issue `#1495`, raised by the owner on 2026-11-10 and parked for later. Nothing in
this record is approved. If it is accepted, it amends ADR-009 Decision 4 ("Custom Domain Ingress via
Cloudflare for SaaS") and possibly Decision 2 ("the Cloudflare Workers Paid plan account container").

## 1. Context

ADR-009 gives Aheed Food Centre (AFC) a dedicated cell: its own Workers (`afc-store-staging`,
`afc-store-production`), schedulers, inbound-email Workers, KV namespaces, R2 buckets and Neon projects.
All of them run in the **Merqify** Cloudflare account. The client's zone, `aheedfoodcentre.co.uk`, lives in
a separate **Aheed Food Centre** account. Traffic crosses between the two through Cloudflare for SaaS:
the client zone CNAMEs each hostname to a Merqify origin, and a custom hostname in the `merqify.com` zone
maps it to the cell's Worker.

Four facts from 2026-11-10 prompt this record:

1. **The SaaS routing failed on staging.** At 10:28 UTC `staging.aheedfoodcentre.co.uk` returned
   Cloudflare 524. The custom hostname's origin was the platform staging Worker's domain, so requests
   reached the wrong Worker or no answer at all. Three settings in two accounts have to agree: the
   client-zone CNAME, the custom hostname's origin and SNI, and the Worker routes. The fix took `#1487`,
   `#1489` and a dashboard change to the client CNAME. Changing the custom hostname's origin alone did
   nothing.
2. **Production routing is behind staging and must be redone at promotion.** `main` carries no
   `afc-production` configuration at all. The live `afc-store-production` Worker was deployed outside CI
   (its health check reports no commit), it uses the older `fallback.merqify.com/*` route, and
   `www.aheedfoodcentre.co.uk` still names the platform production Worker as its origin. The planned
   dedicated origin `afc-origin.merqify.com` does not exist yet.
3. **The account shares hard limits with the platform.** The Merqify account accepts 12 Cron Triggers,
   and all 12 are in use after `#1491`. Every new cell environment needs more.
4. **The slowdowns and crashes seen the same day are not caused by routing.** Production recorded 8
   `exceededMemory` invocations (10:00–10:59 UTC), CPU time per request has a median of 57–75 ms, and some
   requests hang for 57–155 s. Those come from the application and would happen in either account. They
   are tracked separately and must not be used to justify this decision.

## 2. Options

### Option A — Stay in the Merqify account behind Cloudflare for SaaS (today's design)

- One account, one deploy token, one Workers Paid plan for every cell.
- ADR-009's single-workflow lockstep deploy stays as it is.
- The delegated sender on `merqify.com` (`saas-scaling-cost-and-isolation-architecture.md`, Option 2)
  keeps working with no extra plan.
- Adding a client is one more custom hostname, the runbook in `cloudflare-saas-onboarding-runbook.md`.
- Routing needs three settings in two accounts to agree, and nothing checks the dashboard side today.
- The cell shares the account's limits, bill and blast radius with the platform. A Merqify token leak or
  account incident reaches the client.

### Option B — Move the cell into the Aheed Food Centre account

- Routing becomes one zone route on the client's own zone. No custom hostname, fallback origin or
  cross-account CNAME.
- The cell gets its own limits (Cron Triggers, subrequests, KV and R2 quotas), its own bill, and its own
  blast radius.
- Ownership is clear if the client later takes the account over.
- The Aheed account needs its own Workers Paid plan (about $5/month at the time of writing; confirm the
  current price). This is the cost the delegated-sender decision set out to avoid for every client.
- CI needs an account-scoped token for the Aheed account in a new GitHub environment, and the lockstep
  deploy has to span two accounts.
- KV namespaces, R2 buckets and Worker secrets are recreated in the Aheed account. The Neon projects do
  not move, since Neon is independent of Cloudflare.
- Outbound email must come from Aheed's own sending domain. That is already the planned direction
  (`#104`, `#1343`, `#1392`).
- Each future dedicated client becomes one more account to run.

### Option C — Move the client's zone into the Merqify account

Rejected. The zone belongs to the client, and moving it would hand Merqify control of the client's DNS
and email records. The Cloudflare accounts reference already records "connect via Cloudflare for SaaS,
never move the zone".

## 3. Comparison

| Concern | A. Merqify + SaaS | B. Aheed account |
|---|---|---|
| Places routing can disagree | 3, across two accounts | 1 |
| Shares limits with the platform | Yes (12 Cron Triggers, all used) | No |
| Blast radius of a platform incident | Includes the client | Excludes the client |
| Extra Cloudflare cost | None | One Workers Paid plan |
| Deploy credentials | One token | Two account-scoped tokens |
| ADR-009 lockstep | Unchanged | Spans two accounts |
| Effect on today's memory, CPU and hang problems | None | None |

## 4. Recommendation (for the owner to confirm)

Decide before the AFC production promotion, because production routing is being rebuilt then anyway.

- **Choose A** if Merqify will keep running AFC indefinitely and a per-client Workers Paid plan is not
  wanted as the standard. Make A safe by adding an automated check that all three routing settings agree,
  for every cell, in the deploy workflow beside `scripts/verify-worker-routes.ts`.
- **Choose B** if the client should own its runtime, or if isolation from platform incidents and limits
  matters more than the extra plan and token.

Both options leave the application work unchanged, and that work comes first.

## 5. Migration outline if B is chosen

Written as a separate slice with its own spec. Staging first, then production.

1. Owner enables Workers Paid on the Aheed account and creates an API token scoped to that account only.
2. A new GitHub environment holds that token and account id. Runtime secrets are set with
   `wrangler secret put` against the Aheed account; this is a second store, so setting it does not
   populate GitHub.
3. Create the KV namespaces and R2 buckets in the Aheed account. Copy R2 objects; keys are relative and
   immutable, so the database needs no change. Point `CDN_BASE_URL` at the new bucket's domain.
4. Give each `afc-*` environment its own `account_id` in `wrangler.toml` and in both scheduler and
   inbound-email configs, and replace the SaaS routes with a zone route on `aheedfoodcentre.co.uk`.
5. Extend the deploy workflows so the AFC jobs use the Aheed token, keeping one build and migrating
   every database before any deploy (ADR-009 Decision 3; build before migrate stays).
6. Deploy, then change the client-zone record from the SaaS CNAME to the Worker route.
7. Remove the custom hostnames and Merqify-side AFC resources only after a clean week.

**Rollback:** point the client-zone record back at the Merqify origin. The Merqify Worker stays deployed
until step 7.

## 6. Open questions

- Who owns the Aheed account long term: Merqify on the client's behalf, or the client?
- Is one Workers Paid plan per dedicated client acceptable as the standard?
- Must lockstep deploy remain a single workflow job across accounts, or may a dedicated cell deploy in its
  own job gated on the same build?
