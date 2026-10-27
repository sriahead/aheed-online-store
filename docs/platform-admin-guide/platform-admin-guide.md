---
id: platform-admin-guide
title: "Platform & Technical Admin Guide"
audience: [platform-admin]
type: guide
status: approved
version: "1.4.0"
updated: "2026-10-27"
visibility: internal
summary: "A guide for Platform Administrators managing the multi-tenant infrastructure, onboarding new vendors, and configuring global platform settings."
tags: ["admin", "platform", "technical", "multi-tenancy"]
---

# Platform & Technical Admin Guide

Welcome to the **Platform Admin** documentation. Unlike Store Admins (who manage a single vendor's shop), Platform Admins are the technical operators of the entire multi-tenant platform.

## Global Roles vs Vendor Roles
It is critical to understand the distinction between the two types of administrative roles in the system:
- **Global Platform `ADMIN`**: This role transcends all vendors. It grants access to system-wide configurations, vendor onboarding, and global user management.
- **Vendor-Specific `ADMIN`**: This is a Store Admin. Their administrative powers are strictly scoped to a single vendor (e.g., managing the catalogue or delivery rules for "Aheed Food Centre" only). 

## Managing Vendors (Tenants)
The platform is designed to host multiple independent store fronts (vendors) from a single database.
- **Onboarding New Vendors:** When a new vendor joins the platform, the Platform Admin creates the new Vendor record.
- **Host Resolution:** Each vendor can be mapped to specific hostnames (e.g., `srimart.nocaped.com`). Platform Admins configure these routing rules so that incoming traffic is automatically served the correct vendor's branding, catalogue, and configuration.
- **Vendor Status:** You have the authority to suspend a vendor (`VendorStatus: SUSPENDED`), immediately disabling their storefront and checkout capabilities.

## Global Infrastructure & Fallbacks
- **Secret Management:** Platform Admins are responsible for managing environment secrets via Cloudflare Workers and GitHub environments. (See `docs/developer-portal/env-setup.md` for the technical runbook).
- **Global Feature Flags:** Managing platform-wide feature rollouts (like activating a new payment gateway provider) is done at the platform level.
- **Workers AI budgets and plan (#1028, #1029):** Every store's AI features draw on one Cloudflare account. Each store has a daily neuron budget (default 3,000; `0` switches its AI off). To change it, open the store's **AI Allowance** page at `/staff/ai-usage` on that store's host while signed in as a platform admin, enter the new figure (a whole number up to 1,000,000) and **Save budget**. Store admins can read the page but cannot change the budget, because it caps spend the platform pays for. The `WORKERS_AI_PLAN` setting (`free` or `paid`, Free when unset or misspelled) must match the Cloudflare dashboard's **Workers & Pages → Plans**. On `free`, AI pauses for every store once all stores together use the shared 10,000-neuron daily allowance; on `paid` that shared cap is lifted, usage above it is billed at $0.011 per 1,000 neurons, and the AI Allowance page shows platform admins an estimate of today's charge. The shared count covers only this platform's own usage records, so other usage on the same Cloudflare account is not included. Setting the value is a Worker environment change; see `docs/developer-portal/env-setup.md`.

## Store Impersonation (Dev/Support)
For support and debugging, Platform Admins can use the View Switcher to impersonate specific vendors and view the platform exactly as a Store Admin or Staff member of that vendor would see it.

## Error events — `/staff/errors`

**Purpose:** The most recent server-side errors across the whole platform, so a fault can be seen
without opening the hosting provider's logs.

**Who can access:** Platform admins only

**What you can do:** Read the 50 most recent errors, newest first. The page has no controls and
nothing to edit.

**Typical workflow:** A vendor reports that something failed. Open this page and look for an error
whose time and path match what they describe, then use the message and digest to investigate.

**Important fields and filters:** Each row carries when it happened, the HTTP method and path, which
router raised it, the error type and message, and a digest that groups repeats of the same fault.
There is no filter or search — the list is the 50 newest, and nothing else.

**Common mistakes and limitations:** **This page is deliberately closed to store admins, even though
they hold an admin role.** An error message or path can reveal internal implementation details that a
vendor-scoped account has no reason to see, so the page refuses anyone who is not a platform admin.
It is also **not** a complete error record: it captures server-side errors that were actually thrown,
so a request that failed quietly by returning an error response without raising anything will not
appear. It is independent of the hosting provider's own logs and does not replace them. Rows are not
scoped to one vendor, which is the other reason store admins cannot open it.

**What happens after changes are saved:** Nothing is editable. New errors appear as they occur;
reload to see them.


## Platform Vendors — `/staff/platform/vendors`

**Purpose:** Comprehensive directory of all registered store tenants on the multi-vendor platform, showing their operational status, canonical hostnames, catalogue counts, and team sizes.

**Who can access:** Platform admins only

**What you can do:** View every vendor on the platform, check whether their status is active or suspended, review active versus total product counts, verify delivery coverage, and deep link to each store's onboarding readiness.

**Typical workflow:** When reviewing store deployments or onboarding a new vendor, open this directory. Check that the tenant's primary domain is correctly mapped and that the catalogue contains published active products. Use the "Onboarding Readiness →" link to audit configuration completeness.

**Important fields and filters:** Displays Store Title and slug, Status (ACTIVE/SUSPENDED), Primary Canonical Domain, Catalogue metrics (active products, total products, total categories), Delivery Areas count, and Team Members count.

**Common mistakes and limitations:** This page is strictly restricted to global platform administrators; store admins cannot access it. Modifying a vendor's trading status or adding new tenants is performed via approved provisioning manifests or database migrations, not through inline edits here.

**What happens after changes are saved:** Data is read live from the database per-request. When a vendor is provisioned or modified in the database, refreshing this page displays the updated tenant list immediately.


## Platform Onboarding Roll-up — `/staff/platform/onboarding`

**Purpose:** Executive roll-up dashboard comparing onboarding configuration readiness and launch status across all tenants on the platform.

**Who can access:** Platform admins only

**What you can do:** Review onboarding completion scores across multiple stores simultaneously, compare store-operator vs platform-admin configuration progress, and jump directly to store-specific audit checklists.

**Typical workflow:** Before launching a new vendor publicly or approving marketing campaigns, navigate here to verify launch readiness. Ensure both the store operator and platform admin components are 100% complete and the readiness status shows "Ready for Storefront Launch".

**Important fields and filters:** Shows Storefront title and host, Readiness Status (LAUNCH_READY, NEEDS_ATTENTION, IN_PROGRESS), Overall Completion Score (%), Store Operator Score (%), and Platform Admin Score (%).

**Common mistakes and limitations:** Store-level admins can only view their own store's onboarding dashboard (`/staff/onboarding`); only platform admins can access this multi-tenant roll-up.

**What happens after changes are saved:** Recalculates dynamically whenever vendor profile, branding, hours, delivery rules, or domain settings are updated.


## Platform Domain Registry — `/staff/platform/domains`

**Purpose:** Platform-wide hostname routing registry showing all mapped subdomains and custom apex domains.

**Who can access:** Platform admins only

**What you can do:** Audit every hostname registered in the database, check which store each hostname resolves to, verify canonical host designations, and open live hosts via external links.

**Typical workflow:** When onboarding a custom domain or testing local subdomain routing, open this registry. Confirm that the incoming hostname is mapped to the intended vendor and that exactly one domain is designated as canonical.

**Important fields and filters:** Displays Host Name, Target Store title and slug, Domain Type (Canonical Host vs Alias/Preview), Store Status, and registration date.

**Common mistakes and limitations:** Registering a domain in the database must be paired with Cloudflare Worker routing rules in `wrangler.toml` for live HTTPS traffic to terminate properly. Store admins have no access to this registry.

**What happens after changes are saved:** Host lookups in `lib/tenant.ts` resolve incoming request hostnames against this table on every request.


## Platform Settings & Infrastructure — `/staff/platform/settings`

**Purpose:** Technical architecture and global platform settings dashboard covering edge runtime, database pooling, Better Auth SSO, and third-party integrations.

**Who can access:** Platform admins only

**What you can do:** Review platform-wide technical configurations, verify Cloudflare Workers Node.js compatibility mode, check hybrid database client pooling, review SSO cookie domain scope, and monitor external roadblock dependencies (Stripe Connect live keys, Cloudflare Email).

**Typical workflow:** When investigating cross-cutting technical problems or verifying environment configuration across staging and production, open this page. Review the active runtime constraints, registered user counts, and external service blocker statuses.

**Important fields and filters:** Covers Runtime & Edge Hosting, Database & Tenancy Architecture (Prisma hybrid client, row-level isolation), Identity & Access Management (Better Auth, SSO scope), and Platform Integrations & Roadblocks (Stripe #113, Email #1217, Workers AI #1028).

**Common mistakes and limitations:** Platform infrastructure values are defined in environment variables and deployment configuration files; they cannot be overridden dynamically from this dashboard.

**What happens after changes are saved:** Environment changes deployed to Cloudflare Workers or GitHub environment secrets are reflected upon worker restart.


## Platform System Health — `/staff/platform/health`

**Purpose:** Real-time health monitoring and latency diagnostics for the platform's database connection, health checks, and error logging infrastructure.

**Who can access:** Platform admins only

**What you can do:** Monitor live database ping latency, verify that pooled connection pools are responding, review the timestamp of the latest automated health probe, check total server-side exception counts, and navigate to the error events log.

**Typical workflow:** When diagnosing slow response times or suspected database degradation, open this dashboard. Check the database ping latency and status indicator. If anomalies or elevated error counts are observed, click "View Error Events Log →" to inspect server-side stack traces.

**Important fields and filters:** Shows Database Ping latency in milliseconds, Database Status (Connected/Degraded), Last Record timestamp, Logged Exceptions count, and platform observability guidelines.

**Common mistakes and limitations:** Ping measurements reflect the latency from the worker isolate to the serverless Neon PostgreSQL pooled proxy; network jitter can cause momentary fluctuations. Store admins are refused access to this screen to prevent leaking internal database infrastructure metrics.

**What happens after changes are saved:** Re-measures connection latency and queries the latest diagnostic records fresh on every page load.


## Costs, Pricing & Business Model — `/staff/platform/costs`

**Purpose:** One advisory page covering what the platform costs to run, what competitors charge, the prices we could charge, whether those prices would cover the costs and at what scale, and which business model fits. A banner at the top states that it is advisory: the platform has not traded, so no figure is realised revenue, and nothing on the page changes live prices, subscriptions or any store's settings.

**Who can access:** Platform admins only

**What you can do:** Read six sections in order. **Costs**: the six totals (now, with planned items, and at renewal prices, each per month and per year), Needs attention, Upcoming renewals, and one card per service grouped under Platform running costs (fixed), Platform running costs (usage-based) and Development tools, each group with its own monthly and yearly total, plus an Owner to confirm list. **Competitors**: each competitor's published plans (fee, commission, card fee, add-ons and extra charges) with a link to the page they came from and the date it was read, grouped as store builders, marketplaces, UK local-shop platforms and the payment-only baseline, and a table setting our proposed plans beside every published plan. **Proposed pricing**: four candidate plans, each labelled Proposal, priced excluding VAT. **Profitability**: the platform's monthly cost in pounds at a dated exchange rate, each plan's break-even, an At zero sales table for 1, 5, 10, 25 and 50 stores, and two rankings. **Business models**: six models with advantages, disadvantages, risks and expected profitability, and the Recommended one with its reasoning and review dates. **Review**: the Refresh Costs and Refresh Recommendations buttons. Each of the first five sections shows when it was last updated, how many of its entries are stale, and a Download CSV link. Print / Save as PDF opens the browser's print dialog; the staff navigation and the buttons are left out of the printout.

**Typical workflow:** Review costs monthly and subscriptions, competitors and pricing quarterly; a GitHub issue titled Quarterly pricing review opens on the first day of January, April, July and October as a reminder, listing stale figures, items for the owner to confirm and the current break-even figures. Press Refresh Recommendations: the page fetches the pricing pages the figures came from, has Workers AI read the prices, and lists each difference from the recorded figure as an Unconfirmed suggestion, with what the break-even figures and rankings would become if accepted and a list of recommended actions. Refresh Costs does the same for the cost pages only. To accept a suggestion, edit the registry that holds it and ship the change by pull request: costs in `lib/running-costs.ts`, competitors in `lib/pricing/competitors.ts`, the exchange rate and card fee in `lib/pricing/assumptions.ts`, proposed plans in `lib/pricing/proposed-plans.ts`, and the business models and recommendation in `lib/pricing/business-models.ts`.

**Important fields and filters:** Each cost card carries a status label. Actual is a figure read from a bill or a provider dashboard. Planned is about to be bought and is counted only in the with-planned and renewal totals. Estimate is worked out from usage and Unverified is not confirmed; neither is in any total, and Unverified items appear under Owner to confirm. Free (open licence) marks free open data and icons, with a link to the licence. Only Workers AI usage is read live; every other card says Usage not monitored. A competitor marked Not published by the provider or Pricing page could not be read shows no figures at all. Break-even is the number of stores needed at zero sales for a plan with a fee, or the monthly store sales needed for a plan with no fee; Commission does not cover card fees means the commission is below the card fee the platform pays, so every sale loses money. Figures exclude the per-order card fee because the number of orders is unknown. A warning appears when the numbers no longer put the recommended model's plan first, and another when its review date has passed. There are no filters.

**Common mistakes and limitations:** Nothing here is pulled live except Workers AI usage and what a refresh fetches, so each figure is only as current as its date. Costs are US dollars as quoted; profitability converts them to pounds at the recorded exchange rate, and with no rate those figures show No exchange rate rather than a number. Refresh suggestions are not saved: leaving the page discards them, so download them as CSV first if you need them. Each refresh uses Workers AI and is recorded as Pricing review on the AI usage page against the store whose site you are signed in on, so it counts against that store's daily AI budget; when the budget is spent the remaining pages show AI budget reached. A pricing page that blocks automated reading shows Page could not be fetched; check it by hand. The page sends no alerts and no emails.

**What happens after changes are saved:** Nothing is saved from this page. An edit to a registry under `lib/` takes effect once deployed, and the page recalculates every total, break-even and ranking, and reads Workers AI usage, fresh on each load.
