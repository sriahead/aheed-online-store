---
id: platform-admin-guide
title: "Platform & Technical Admin Guide"
audience: [platform-admin]
type: guide
status: approved
version: "1.8.0"
updated: 2026-10-31
visibility: internal
summary: "A guide for Platform Administrators managing the multi-tenant infrastructure, onboarding new vendors, and configuring global platform settings."
tags: ["admin", "platform", "technical", "multi-tenancy"]
---

# Platform & Technical Admin Guide

Welcome to the **Platform Admin** documentation. Unlike Store Admins (who manage a single vendor's shop), Platform Admins are the technical operators of the entire multi-tenant platform.

## Global Roles vs Vendor Roles
It is critical to understand the distinction between the two types of administrative roles in the system:
- **Global Platform `ADMIN`**: This role transcends all vendors. It grants access to system-wide configurations, vendor onboarding, and every store's admin panel. Managing users across all stores from one page is not built yet (`#1320`); team roles are managed per store at `/staff/team`.
- **Vendor-Specific `ADMIN`**: This is a Store Admin. Their administrative powers are strictly scoped to a single vendor (e.g., managing the catalogue or delivery rules for "Aheed Food Centre" only). 

**Where each role lands after sign-in (#1319).** Everyone signs in at the same `/login` page, and the
server then sends each person to the home for their role:
- a platform admin goes to `/staff/platform`;
- staff or a store admin of the store whose web address they signed in on goes to `/staff`;
- anyone else goes to `/account`.

If the sign-in link carried a `next` page on the same site, that page wins; a `next` pointing at
another site is ignored. Every page and action still checks the role on the server, so typing a
URL never grants access the role does not have.

The demo platform admin is `demo-platform-admin@merqify.com`. Since `#1319`,
`demo-admin@merqify.com` is a store admin only (`docs/developer-portal/env-setup.md`). The demo
addresses moved from `@example.com` to `@merqify.com` on 2026-10-31 (`#1356`).

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

## Platform overview — `/staff/platform`

**Purpose:** The platform admin's home page, and where a platform admin lands after signing in. It
shows platform-wide figures and links to every platform page.

**Who can access:** Platform admins only

**What you can do:** Read seven figures: stores, active stores, domains, users, products, active
products and recent errors. Open any platform page from its card: vendors, onboarding roll-up,
domain registry, settings, system health, costs, and error events. The page has no controls and
nothing to edit.

**Typical workflow:** After signing in, glance at the figures for anything unexpected, such as a
rise in recent errors or a store that is no longer active. Then open the matching page from its card.

**Important fields and filters:** Each figure counts across every store on the platform, not only
the store whose web address you are on. There are no filters.

**Common mistakes and limitations:** **Store admins are refused here even though they hold an admin
role**, as on every platform page. The figures are counts only; to act on one, open the page it
relates to. The page does not manage users across stores (`#1320`).

**What happens after changes are saved:** Nothing is editable. The figures are read live on each
visit; reload to refresh them.

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

**Purpose:** One advisory page covering what the platform costs now and in production as shops and orders grow, what competitors charge, four ways we could charge, what each costs a shop against the alternatives, paid add-ons, the risks not priced anywhere else, and one launch recommendation. A banner at the top states that it is advisory: the platform has not traded, so no figure is realised revenue, prices are in pounds excluding VAT, Stripe Connect (each shop as the seller, paying its own card fees) is a planning assumption, and nothing on the page changes live prices, subscriptions or any store's settings.

**Who can access:** Platform admins only

**What you can do:** Read nine sections in order. **Costs**: what the platform pays now — the six totals (now, with planned items, and at renewal prices, each per month and per year), Needs attention, Upcoming renewals, and one card per service grouped under Platform running costs (fixed), Platform running costs (usage-based) and Development tools, plus an Owner to confirm list. **Production costs as we grow**: our monthly cost, excluding partner time, at 1, 5, 10, 25, 50 and 100 shops and 100, 500 and 2,000 orders per shop, with the cost per order; partner time for each shop count; which free allowance runs out first at each order volume; the one-off start-up costs; Stripe Connect's two options side by side, with the one that has no platform fees marked as the one modelled; and every cost line with its price, free allowance and source, or Estimate. **Competitors**: each competitor's published plans with a link to the page they came from and the date it was read. **Business models**: four models that grow with a shop's orders (order bands, allowance plus per order, low fee capped per order, and a customer service fee), each labelled Proposal, with what the shop pays (including its own card fees and expected disputes), our revenue, cost and margin at the reference scenario of 10 shops taking 500 orders a month at a £25 basket, the shops needed to fund the partners' pay target, break-even including partner time, and the shop count at which our revenue crosses the VAT threshold; then a comparison table of what a shop pays on each model and on Shopify Basic and Grow, Square Online Free and Plus, Ecwid Starter, Uber Eats (self-delivery) and doing nothing, at a £25 basket, with £15 and £40 tables you can expand. **What if**: type a partner hourly rate, yearly rate increase, partner minutes per shop, onboarding minutes, the partners' monthly pay target, average basket, orders per shop and number of shops, and every model recalculates. **Add-ons**: twelve paid extras with price, our running cost, margin, whether each is cheap to run or usage-heavy, whether it is included or sold separately, and which are in the launch set. **Risks and gaps**: who bears each risk, its cost where one can be stated, and what to do. **Recommendation**: the recommended model and its public prices for shop two onwards, the launch add-ons, the dated founding-partner offer with its review clause, the three numbers to track every month, what would change the recommendation, and why. **Review**: the Refresh Costs and Refresh Recommendations buttons. Every section except What if and Review shows when it was last updated, how many of its entries are stale, and a Download CSV link. Print / Save as PDF opens the browser's print dialog; the staff navigation, the buttons, What if and Review are left out of the printout.

**Typical workflow:** Review costs monthly and everything else quarterly; a GitHub issue titled Quarterly pricing review opens on the first day of January, April, July and October as a reminder, listing stale figures, items for the owner to confirm, each model's figures at the reference scenario, and whether the partner pay target and yearly rate increase are still unset. Press Refresh Recommendations: the page fetches the pricing pages the competitor and current-cost figures came from, has Workers AI read the prices, and lists each difference as an Unconfirmed suggestion, with how each model's reference margin and shop total would change if accepted and a list of recommended actions. Refresh Costs does the same for the current-cost pages only. To change a figure, edit the file that holds it and ship the change by pull request: current costs in `lib/running-costs.ts`; production cost lines in `lib/pricing/cost-drivers.ts`; Stripe Connect options in `lib/pricing/connect.ts`; competitors in `lib/pricing/competitors.ts`; the exchange rate, card fees, partner time, basket and reference scenario in `lib/pricing/assumptions.ts`; the models, comparisons and recommendation in `lib/pricing/business-models.ts`; add-ons in `lib/pricing/add-ons.ts`; and risks in `lib/pricing/risks.ts`. CSV downloads are available for costs, competitors, production, models (every model at every shop count, order volume and basket), comparison, add-ons and risks.

**Important fields and filters:** Each current-cost card carries a status label: Actual, Planned, Estimate or Unverified, as before; only Actual and Planned reach a total. A production cost line marked Estimate has no published price; the others link to the provider's page. Usage quantities behind every production line (requests per order, storage per shop, emails per order) are estimates even where the unit price is published. None of our models takes a percentage of sales; card percentages appear only in the shop's own card fees and in competitors' prices. "More than 1,000 shops" means the figure is not reached in the range searched. A missing value (the yearly rate increase, the pay target) shows "Enter a value" or "Enter a pay target" rather than a number. Add-ons marked Not available yet are not built; their prices are proposals. A warning appears when the numbers no longer support the recommendation (the recommended model loses money at the reference scenario, or another model earns more and costs the shop less), and another when its review date has passed. There are no filters.

**Common mistakes and limitations:** What if values are not saved: reloading the page restores the committed values, and nothing typed there changes the figures in the other sections. The totals use the UK card rate; the EEA rate is recorded but not modelled, and nor is the card fee Stripe keeps on a refund. Comparators exclude disputes. Nothing is pulled live except Workers AI usage and what a refresh fetches, so each figure is only as current as its date; the refresh does not yet read the production cost, Connect, add-on or risk pages. Refresh suggestions are not saved: download them as CSV first if you need them. Each refresh uses Workers AI and is recorded as Pricing review on the AI usage page against the store whose site you are signed in on, so it counts against that store's daily AI budget. The risks section is not legal, tax or insurance advice. The page sends no alerts and no emails.

**What happens after changes are saved:** Nothing is saved from this page. An edit to a file under `lib/` takes effect once deployed, and the page recalculates every figure, and reads Workers AI usage, fresh on each load.

---

## Feature Catalogue - `/staff/feature-catalogue`

**Purpose:** A structured reference of what the platform does today, written for demonstrations. It
is organised by who uses it (Customer, Admin, Staff, Platform Admin), then by business area, then by
feature. Each feature opens with what it does and why, then its business value and a short demo
talking point.

**Who can access:** Platform admins only

**What you can do:** Read the catalogue, jump between roles with the buttons under the heading, open a
feature's page from its card, and check the "Not ready to demonstrate" table for anything partial or
unavailable. The page is read-only.

**Typical workflow:** Before a demonstration, open the page and scan the three status counts. Pick the
role you are showing, follow its areas in order, and use each card's demo line as the talking point.
Check "Not ready to demonstrate" before you promise anything.

**Important fields and filters:** **Live** works end to end. **Partial** is real but conditional, for
example a per-store switch that is off by default or an owner-only setup that is not done; the card
says what is missing. **Unavailable** is not built or not usable yet. There are no filters.

**Common mistakes and limitations:** The catalogue is written by hand and checked only for real
routes and for menu pages being listed; it cannot prove a description is still true, so tell a
developer if you find one that is wrong. It is closed to store admins and staff (`#1379`): it lists
unbuilt and partial features, which is platform-level information.

**What happens after changes are saved:** Nothing is saved here. The page changes only when a
developer edits the catalogue and deploys it.

### Sanity check: Feature Catalogue (`#1374`, `#1379`)

Run after deploying changes to `/staff/feature-catalogue` or `features/feature-catalogue/`. Last run: 2026-10-31, after the `#1379` change: checks 1 and 2 passed locally; 3-5 run after the staging deploy.

| # | Check | Expect |
|---|---|---|
| 1 | `npx vitest run --maxWorkers=4 tests/feature-catalogue.test.ts` | All pass; every route and menu page is catalogued |
| 2 | `npx vitest run --maxWorkers=4 tests/operator-doc-coverage.test.ts tests/staff-nav-parity.test.ts` | All pass |
| 3 | `curl.exe -sS -I https://aheed-staging.merqify.com/staff/feature-catalogue` | `307 Temporary Redirect` to `/login` |
| 4 | Sign in as `demo-platform-admin@merqify.com`, open `/staff/feature-catalogue` | The catalogue renders; it is in the Platform menu |
| 5 | Sign in as `demo-admin@merqify.com` (store admin), open `/staff/feature-catalogue` | "Platform admin only" refusal; no menu entry |
