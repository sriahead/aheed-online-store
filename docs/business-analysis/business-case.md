---
id: business-case
title: "Business Case & Platform Pitch"
audience: [product, platform-admin]
type: doc
status: approved
version: "1.0.0"
updated: 2026-09-16
visibility: internal
summary: "The stakeholder-facing commercial case for the Aheed platform — what is built, what it costs to run, what it saves against Shopify, how it can earn, and what remains to be invested. Reviewed and updated at every milestone close."
tags: [business-case, stakeholder, commercial, strategy, shopify, costs]
related: [mission, roadmap, architecture, tech-stack, product-requirements-guide]
---

# Business Case & Platform Pitch

| Field | Value |
| --- | --- |
| **Milestone assessed** | P9 — Production launch readiness (in progress) |
| **Last reviewed** | 2026-09-16 |
| **Milestones closed to date** | M0, P0, P1, P2, P2.5, P2.6, P3, P4, P5, P6, P6.7, P7, P7.5, P8, P8.5 |
| **Trading status** | **Not yet trading.** Production runs Stripe test-mode keys. |
| **Next review due** | At the close of P9 |

> **How to read this document.** Every capability below is tagged **IMPLEMENTED**, **IN PROGRESS**
> or **PLANNED** and cites the file, data model, route or issue that proves it. Every derived
> number is tagged `ESTIMATE` and states the assumption it rests on. External prices carry their
> source and the date they were retrieved. This document is reviewed at every milestone close and
> records what changed — see **Milestone revision history** at the end.

---

## 1. Executive pitch

Aheed Food Centre owns a complete, working, multi-tenant UK grocery e-commerce platform. It is not
a website built on somebody else's store software. It is a product: the storefront, the checkout,
the payment integration, the staff operations panel, the loyalty engine, the delivery-slot system
and the tenancy model are all first-party assets, on infrastructure that costs tens of pounds a
month rather than hundreds, with no per-store licence and no revenue share.

**The honest headline first.** The platform has **not yet traded**. Production runs Stripe
**test-mode** keys (`#113`, open) and the email provider has no verified sending domain (`#104`,
open), so no customer has paid for anything and no customer email has been delivered. Every
financial figure in this document is therefore a **model at a stated order volume**, never a
realised result. The platform is in **P9 — Production launch readiness**, the phase whose exit
criterion is a formal GO decision (`#445`).

**What that leaves, which is substantial.** Fifteen milestones are closed. The system runs on real
infrastructure in three environments, with 47 data models, 51 applied database migrations, an
automated deployment pipeline, and a test suite of 1,842 tests. Two distinct vendors — Aheed Food
Centre and SriMart — already resolve from their own domains, with their own catalogues, branding,
delivery areas and staff, from a single deployment.

**The value proposition, in one sentence.** Aheed has replaced a recurring per-store platform fee
and a stack of paid extensions with an owned asset whose marginal cost per additional shop is close
to zero — and in doing so has built something it can sell to other independent grocers rather than
only use itself.

Three claims follow from that, and each is defended in its own section:

1. **Lower cost to operate than the obvious alternative.** Modelled at a realistic trading volume,
   the platform costs roughly **£3,100–£3,500 a year less** than the equivalent Shopify
   configuration — and the gap widens with every additional store (§3, §4).
2. **Capabilities a standard grocery store build does not have.** Delivery-slot booking with
   capacity limits, postcode-level delivery eligibility against licensed UK reference data,
   multi-buy price tiers, a loyalty ledger, an AI-assisted shopping-list importer, and a
   nineteen-page staff operations panel (§2).
3. **A second business inside the first.** The multi-tenancy is real and load-bearing, not
   theoretical. That is the difference between a shop with a website and a platform with a
   licensing opportunity (§6, §11).

---

## 2. What is built, and what it is worth commercially

Fifteen milestones closed between 2026-08-05 and 2026-09-16. The table below translates the
delivered technical scope into the commercial capability it represents.

### 2.1 Selling and revenue capture

| Capability | Status | Evidence | Business value |
| --- | --- | --- | --- |
| Catalogue, departments, product pages, images on a CDN | IMPLEMENTED | `Category`, `Product`, `ProductImage`; `app/(storefront)/categories`, `/products/[slug]` | The shop is browsable and indexable — the precondition for every other number in this document |
| Search with multi-word matching, relevance and in-stock ranking | IMPLEMENTED | P2.6 slice 1 (`#564`); `SearchQueryLog` | Search was previously matching a multi-word query as one literal string. Search quality is a conversion problem, not a polish problem |
| Desi and transliteration synonym dictionary with staff approval | IMPLEMENTED | `SearchSynonym`; `/staff/search-synonyms` (`#566`) | A shopper searching "atta" or "dhania" finds the product. Directly relevant to this customer base and absent from generic store software |
| Faceted filtering — brand, dietary flags, country of origin, offers, pack size | IMPLEMENTED | `Brand`; P2.6 slice 6 (`#569`), `#694` | Narrowing a large grocery range is what stops a shopper abandoning |
| Cart, guest checkout and account checkout | IMPLEMENTED | `Cart`, `CartItem`, `Order`, `OrderItem`; `/checkout` | Guest checkout removes the single biggest friction point for a first-time grocery shopper |
| Card payment via hosted Stripe Checkout | IMPLEMENTED (test mode) | `Payment`; `/api/webhooks/stripe`; ADR-005 | Money can move. **Live keys are not yet installed** (`#113`) |
| Signature-verified, idempotent payment webhook with reconciliation | IMPLEMENTED | `/api/webhooks/stripe`, `/api/jobs/reconcile-payments`, `PaymentBindingRefusal` | A paid order that loses its webhook is recovered automatically rather than becoming a support call |
| Stock decrement inside the order transaction | IMPLEMENTED | P3b; conditional `updateMany` in the checkout transaction | Overselling is structurally impossible, not merely unlikely. In grocery, overselling means a refund and a lost customer |
| Multi-buy price tiers | IMPLEMENTED | `ProductPriceTier` (P8.5d, `#348`) | "3 for £5" is how grocery actually merchandises. Standard store software usually needs a paid extension |
| Product bundles | IMPLEMENTED | `Bundle`, `BundleItem` | Raises basket value; a recipe or weekly-staples bundle is a merchandising lever |
| Discount codes, fixed and percentage | IMPLEMENTED | `DiscountCode`, `DiscountRedemption`; `/staff/discounts` | Campaign mechanics without a third-party app |
| Loyalty points — earn, redeem, tiers | IMPLEMENTED | `LoyaltyAccount`, `LoyaltyLedgerEntry`, `VendorLoyaltyTier`; `/account/loyalty` | Retention. A full ledger rather than a balance field, so points are auditable |
| Ratings and reviews | IMPLEMENTED | `Review`, denormalised aggregates | Conversion signal on the product card, owned rather than rented |
| "Shop your list" — paste a list, match to catalogue, add to cart | IMPLEMENTED | P3d; `lib/shopping-list.ts` | A weekly grocery shop is a list, not a browse. This is a genuine differentiator |
| AI shopping-list normalisation | IMPLEMENTED | `ListNormalisationAttempt`; `lib/list-normalisation.ts`, Workers AI `@cf/meta/llama-3.1-8b-instruct` | Natural-language list entry layered over the deterministic matcher, with per-caller cost limits |

### 2.2 Fulfilment — the part generic store software handles worst

| Capability | Status | Evidence | Business value |
| --- | --- | --- | --- |
| Delivery slot booking with per-slot capacity | IMPLEMENTED | `VendorFulfilmentSlot`; P401 | Prevents accepting more deliveries than the van and the staff can serve — the operational failure that kills local grocery delivery |
| Express delivery with an SLA schedule | IMPLEMENTED | `VendorExpressSchedule`; P402 | A premium tier the store can charge for |
| Collection as well as delivery | IMPLEMENTED | `FulfilmentMethod` enum | Zero-cost fulfilment option; higher margin per order |
| Postcode delivery eligibility, per district | IMPLEMENTED | `VendorDeliveryArea`; `lib/delivery-eligibility.ts` | A shopper outside the delivery area learns so before checkout, not after |
| UK postcode and place reference data, as a separate database | IMPLEMENTED | `uk-location-reference` project; `lib/reference/` (`#764`) | Address entry that validates against real UK data. Deliberately isolated so reference volume cannot threaten trading data |
| Address lookup at checkout | IN PROGRESS | `lib/address-lookup-provider.ts`; `#766` open — property-level results need a licensed provider | Faster checkout, fewer failed deliveries from mistyped addresses |
| Three-step order status with audit trail and emails | IMPLEMENTED | `OrderStatusEvent`; `lib/email.ts` | "Where is my order" answered by the product instead of by a phone call. **Email delivery is blocked on `#104`** |
| Guest order lookup, rate-limited | IMPLEMENTED | `OrderLookupAttempt`; `/orders/lookup` | Guest shoppers can track an order without an account, without exposing order data to enumeration |

### 2.3 Running the shop

The staff panel is **nineteen pages**, not a token admin screen: orders, products, categories,
brands, bundles, inventory, customers, discounts, promotions, loyalty, reports, team,
delivery areas, fulfilment, payments, storefront configuration, search synonyms, errors and the
operations runbook.

| Capability | Status | Evidence | Business value |
| --- | --- | --- | --- |
| Order dashboard with bulk status advance | IMPLEMENTED | `/staff/orders` | Picking and dispatch as a single-screen workflow |
| Catalogue management including image upload | IMPLEMENTED | `/staff/products`, `/staff/categories`; `lib/storage.ts` | The store manages its own range without developer involvement |
| AI product and campaign image generation | IMPLEMENTED | `/api/admin/product-images/generate`; Workers AI `@cf/black-forest-labs/flux-1-schnell` | A catalogue of thousands of SKUs is presentable without a photography budget |
| Inventory and availability | IMPLEMENTED | `Inventory`; `/staff/inventory` | Out-of-stock discipline, which is the top driver of grocery complaints |
| Customer directory | IMPLEMENTED | `/staff/customers` | Service and dispute handling |
| Sales and operational reports | IMPLEMENTED | `/staff/reports` | Owner visibility without exporting to a spreadsheet |
| Role-based team management with an audit log | IMPLEMENTED | `VendorMembership`, `VendorRoleAuditLog`; `/staff/team` (P6.7) | Staff can be given exactly the access they need, and every grant is recorded |
| In-product operations runbook | IMPLEMENTED | `/staff/runbook`, generated from the documentation set | Training material that cannot drift from the documentation, because it is the documentation |
| Error monitoring for platform administrators | IMPLEMENTED | `ErrorEvent`; `/staff/errors`, `/api/jobs/check-error-rate` (`#508`, `#644`) | Faults are seen before customers report them |

### 2.4 Platform foundations

| Capability | Status | Evidence | Business value |
| --- | --- | --- | --- |
| Multi-tenancy — vendor per domain, isolated data | IMPLEMENTED | `Vendor`, `VendorDomain`, `VendorMembership`; ADR-004 | **The commercial foundation of §6.** Two live vendors today |
| Per-vendor branding, copy, locality and theme from the database | IMPLEMENTED | `VendorBranding`, `VendorConfig`, `VendorTheme` | A new store looks like itself on day one, with no code change and no redeploy |
| Vendor-scoped authentication and session isolation | IMPLEMENTED | ADR-004 slice 3c; `lib/auth-origin.ts` | One vendor's login cannot be used against another's storefront |
| UK GDPR data-subject rights | IMPLEMENTED | `/account/data`; `lib/data-rights-service.ts` (P7) | A legal requirement, self-service rather than a manual process |
| PECR cookie consent, privacy policy, terms | IMPLEMENTED | `/privacy`, `/terms` | Required before trading |
| Automated deployment with quality gates | IMPLEMENTED | `.github/workflows/`; build-before-migrate (`#434`) | Changes reach production repeatably, not by hand |
| Scheduled job runner | IMPLEMENTED | `workers/scheduler/`, 15-minute cron | Payment reconciliation, guest-cart reaping and error-rate checks run unattended |
| Store locations | IMPLEMENTED | `VendorLocation`; ADR-006 | Multi-branch groundwork |

---

## 3. Comparison with Shopify for this business model

Shopify is the correct comparison because it is what an independent UK grocer would otherwise use.
The comparison below is specific to **this** business model — a local grocer running its own
deliveries, with a large ambient catalogue, multi-buy pricing, delivery slots and postcode-limited
delivery — not to e-commerce in general.

### 3.1 External pricing, as published

All figures retrieved **2026-09-16**.

| Item | Figure | Source |
| --- | --- | --- |
| Shopify Basic | £25/month monthly, £19/month billed annually | [shopify.com/uk/pricing](https://www.shopify.com/uk/pricing) |
| Shopify Grow | £65/month monthly, £49/month billed annually | [shopify.com/uk/pricing](https://www.shopify.com/uk/pricing) |
| Shopify Advanced | £344/month monthly, £259/month billed annually | [shopify.com/uk/pricing](https://www.shopify.com/uk/pricing) |
| Shopify Plus | from £1,800/month | [shopify.com/uk/pricing](https://www.shopify.com/uk/pricing) |
| Shopify Payments, UK online card | 2% + 25p (Basic), 1.7% + 25p (Grow), 1.5% + 25p (Advanced) | [shopify.com/uk/pricing](https://www.shopify.com/uk/pricing) |
| Shopify third-party gateway fee | 2% (Basic), 1% (Grow), 0.6% (Advanced) | [shopify.com/uk/pricing](https://www.shopify.com/uk/pricing) |
| Stripe UK standard, domestic cards | 1.5% + 20p | [stripe.com/gb/pricing](https://stripe.com/gb/pricing) |
| Shopify delivery-slot apps | roughly $7–$30/month | [Shopify App Store](https://apps.shopify.com/categories/orders-and-shipping-shipping-solutions-delivery-and-pickup/all) |

Two independent sources agree on the plan pricing and transaction rates
([Charle](https://www.charle.co.uk/articles/shopify-pricing/) corroborates the figures above).

### 3.2 Where the money actually goes

**The subscription is the small number.** At any real grocery volume, the transaction rate dominates.

A concrete comparison at **1,500 orders per month with a £45 average basket** — `ESTIMATE`, basket
value assumed from typical UK independent grocery delivery baskets, order volume chosen as a
realistic established trading level rather than the platform's engineering target:

| Line | Shopify Grow | This platform |
| --- | --- | --- |
| Monthly gross merchandise value | £67,500 | £67,500 |
| Platform subscription | £65 | £0 |
| Payment processing | 1.7% + 25p = £1,522.50 | 1.5% + 20p = £1,312.50 |
| Infrastructure | included | ~£34 (§5) |
| Extensions for delivery slots and loyalty | `ESTIMATE` £19–£52 | £0 — both are first-party |
| **Monthly total** | **£1,607–£1,640** | **£1,346** |
| **Difference** | | **£261–£294/month** |

At **300 orders per month** (a realistic opening level, `ESTIMATE`): Shopify Basic totals
**£389–£422/month** against **£276/month** here — a difference of **£113–£146/month**.

At the platform's engineering target of **1,000 orders per day**: Shopify Advanced totals
**£28,094/month** against **£26,350/month** here — **£1,744/month**. At that scale a store would
negotiate payment rates directly, which is itself an option Shopify Payments does not offer below
Plus.

### 3.3 The structural differences that do not appear in a price table

**Per-store cost is the decisive one.** Shopify charges per store. Aheed and SriMart on Shopify
would be two subscriptions, two app stacks, two theme builds and two sets of settings to keep in
step. Here they are two rows in the `Vendor` table sharing one deployment, one codebase and one
operations panel. **Each additional store costs Shopify `ESTIMATE` £528–£924 per year in
subscription and apps alone, before a single transaction.** Here it costs approximately nothing.

**Capabilities that are first-party here and rented there.** Delivery-slot capacity, express SLA
windows, postcode-district delivery eligibility, multi-buy tiers, the loyalty ledger, the
synonym dictionary and the list importer are all built in. On Shopify each is an app with its own
monthly fee, its own upgrade cycle, and its own risk of being discontinued.

**Data ownership and portability.** Customer, order and loyalty data sit in a standard PostgreSQL
database with no proprietary column types, no document storage, and no vendor-specific features —
an explicit constraint from ADR-001 onwards. The database can move to another PostgreSQL host
without a rewrite. On Shopify, the store is the data.

**Where Shopify is genuinely better, and this is the honest part.** Shopify gives you a large
themes and apps ecosystem, a point-of-sale product, an established fraud-prevention stack, 24/7
support, and — most importantly — **somebody else carries the operational risk**. If this platform
breaks at 7pm on a Saturday, the responsibility is Aheed's. That is the real trade being made, and
§8 and §10 address it directly rather than talking around it.

---

## 4. Cost savings

**Nothing in this section has been realised.** The store has not traded. These are modelled
differences at stated volumes.

### 4.1 Modelled annual saving against Shopify

`ESTIMATE` — assumes £45 average basket, UK domestic cards, Shopify billed monthly, and a
delivery-slot plus loyalty app stack at the mid-point of the ranges in §3.1.

| Trading level | Shopify, per year | This platform, per year | Modelled saving |
| --- | --- | --- | --- |
| 300 orders/month | £4,668–£5,064 | £3,312 | **£1,356–£1,752** |
| 1,500 orders/month | £19,284–£19,680 | £16,158 | **£3,126–£3,522** |
| 1,000 orders/day | £337,128 | £316,200 | **£20,928** |

### 4.2 Savings that already exist, independent of trading volume

These are the ones not contingent on a single order being placed:

- **The second store is free.** SriMart runs today at no incremental platform cost. On Shopify it
  would be a second subscription plus a second app stack — `ESTIMATE` **£528–£924 per year**, and
  that is the floor, before transactions.
- **No app subscriptions at all.** Delivery slots, loyalty and bundles are first-party. `ESTIMATE`
  **£228–£624 per year per store** avoided.
- **No developer retainer for routine merchandising.** Departments, campaigns, banners, brands,
  bundles, price tiers, delivery areas, slots and synonyms are all editable by staff in the panel.
- **Documentation and training are generated, not written.** `/staff/runbook` renders the same
  documents the engineering process already maintains, so there is no separate training-material
  budget and no drift between the two.

### 4.3 Future savings, not yet available

- **Payment rate negotiation.** Direct Stripe volume pricing is available on a direct merchant
  relationship; it is not available on Shopify Payments below Plus. PLANNED, no figure claimed.
- **Per-vendor infrastructure amortisation.** The fixed infrastructure floor (§5) is shared across
  every vendor, so cost per store falls as stores are added. This is the same fact that makes §6 a
  revenue opportunity rather than only a cost saving.

---

## 5. Operating costs

### 5.1 Basis and assumptions

**No invoice data exists in the repository.** Every figure below is modelled from published vendor
pricing retrieved **2026-09-16**, and replacing it with actual spend is an open item
(§10). Converted at **GBP/USD 1.35** (rate was 1.3469 on 2026-09-16,
[Trading Economics](https://tradingeconomics.com/united-kingdom/currency)).

| Service | Published price | Source |
| --- | --- | --- |
| Cloudflare Workers Paid | $5/month, including 10M requests and 30M CPU-milliseconds; then $0.30 per million requests and $0.02 per million CPU-ms | [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Cloudflare R2 storage | $0.015 per GB-month; Class A $4.50/million, Class B $0.36/million; 10 GB free; **egress free** | [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) |
| Neon Free | $0 — 0.5 GB storage and 100 compute-unit-hours per project | [Neon pricing](https://neon.com/pricing) |
| Neon Launch | pay-as-you-go: $0.35 per GB-month storage, $0.106 per CU-hour | [Neon pricing](https://neon.com/pricing) |
| Resend Free | $0 — 3,000 emails/month, 100/day | [Resend pricing](https://resend.com/pricing) |
| Resend Pro | $20/month for 50,000 emails; $35/month for 100,000 | [Resend pricing](https://resend.com/pricing) |
| Stripe UK | 1.5% + 20p, domestic cards | [Stripe UK pricing](https://stripe.com/gb/pricing) |

### 5.2 Current cost

**The platform currently runs at or near zero recurring infrastructure cost.** Neon is on the Free
plan — evidenced directly: the project hit the **512 MB** Free-plan ceiling during a reference-data
import, which is what forced the second database (`#764`). R2 storage is inside the 10 GB free
allowance, and email volume is inside Resend's free tier because no customer email is being sent at
all (`#104`).

The one certain recurring cost is the **Cloudflare Workers Paid plan at $5/month (£3.70)**, which
covers both the application Worker and the separate scheduler Worker, plus domain registration of
roughly £10–£15 per year.

`ESTIMATE` **current recurring cost: under £10/month.**

### 5.3 Projected cost by trading volume

`ESTIMATE` throughout. Assumes a 4% session-to-order conversion rate, roughly 40 Worker requests
per session, about three emails per order (confirmation plus status updates), and a Neon compute
profile that scales to zero overnight.

| | Launch — 300 orders/mo | Established — 1,500 orders/mo | Target — 1,000 orders/day |
| --- | --- | --- | --- |
| Cloudflare Workers | $5 | $5 | $16 |
| Neon PostgreSQL | $13 | $20 | $79 |
| Cloudflare R2 | $0 | $1 | $5 |
| Resend email | $0 | $20 | $35 |
| **Monthly, USD** | **~$18** | **~$46** | **~$135** |
| **Monthly, GBP** | **~£13** | **~£34** | **~£100** |
| **Per order** | **~4.3p** | **~2.3p** | **~0.3p** |

**The shape matters more than the numbers.** Infrastructure cost per order falls by more than an
order of magnitude between launch and target volume, because the architecture is per-request
compute and scale-to-zero storage with zero image egress (ADR-001, ADR-003). There is no idle
compute bill and no bandwidth bill.

**Costs deliberately excluded** because they are not infrastructure: Stripe transaction fees
(§3.2, a function of revenue), staff time (§8), and the original build investment, which **is not
recorded anywhere in this repository** and is flagged in §10.

---

## 6. Revenue and monetisation

### 6.1 Primary — Aheed's own trading revenue

The store's own sales. Not yet realised. Modelled contribution at 1,500 orders/month and a £45
basket: **£810,000 annual gross merchandise value** `ESTIMATE`, against total platform operating
cost of roughly **£16,200/year** including payment processing (§4.1).

### 6.2 The multi-vendor opportunity — the real asset

**This is the argument the whole document exists to make.** Multi-tenancy here is implemented and
proven, not aspirational: `Vendor`, `VendorDomain`, `VendorMembership`, `VendorBranding`,
`VendorConfig` and `VendorTheme` are live models; ADR-004 governs the design; a second vendor
(SriMart) resolves from its own domain with its own catalogue, branding, delivery areas and staff
today; and vendor scoping is enforced in the repository layer and backed by tests
(`tests/repository-purity.test.ts`, `tests/repository-client-injection.test.ts`).

The marginal cost of onboarding an additional independent grocer is the staff time to seed their
catalogue and configure their branding. There is no additional subscription, no additional app
stack and no additional deployment.

**Monetisation models available** — all PLANNED, none built, none priced, and each requiring its own
proposal:

| Model | Shape | Note |
| --- | --- | --- |
| Flat SaaS subscription | A monthly fee per store, positioned below Shopify Basic plus apps | The clearest and easiest to sell against a competitor whose pricing is public |
| Revenue share | A percentage of merchandise value | Aligns incentives; harder to sell to a low-margin grocer |
| Tiered by volume | Bands by order count | Matches the platform's own cost curve (§5.3), which is genuinely volume-driven |
| Setup and migration fee | One-off for catalogue seeding and branding | Recovers the only real marginal cost of onboarding |

**What is missing before any of these can be charged for** is not the tenancy — it is billing,
self-service onboarding, a tenant-facing plan model, and a support commitment. None exist. There is
no `Subscription` model, no billing integration beyond customer checkout, and no vendor self-signup.
That is the investment §10 and §11 quantify.

### 6.3 Secondary opportunities

| Opportunity | Status | Note |
| --- | --- | --- |
| Express delivery as a paid tier | IMPLEMENTED, unpriced | `VendorExpressSchedule` exists; charging for it is a pricing decision, not a build |
| Delivery fees and minimum order values | IMPLEMENTED | `VendorConfig`; currently seed-configured, see `#634` |
| Supplier-funded promotion and featured placement | IMPLEMENTED as a mechanism | `DepartmentCampaign`, promotions and banners exist; selling placement is a commercial decision |
| Loyalty-driven repeat purchase | IMPLEMENTED | `LoyaltyLedgerEntry`; margin effect unmeasured |
| Bundle and multi-buy margin | IMPLEMENTED | `Bundle`, `ProductPriceTier`; basket-value effect unmeasured |

---

## 7. Planned features and their expected impact

All PLANNED. Expected impacts are `ESTIMATE` and **unmeasured** — the platform has no analytics
instrumentation, which §10 records as a gap.

### 7.1 Required before launch (P9)

| Item | Issue | Why it matters commercially |
| --- | --- | --- |
| Live Stripe keys | `#113` | No revenue is possible without this. The single highest-value open item |
| Verified email sending domain | `#104` | No order confirmation can reach a customer. Order confirmation is not optional in grocery |
| Storefront performance re-measurement | `#439` | Load time is a conversion multiplier on mobile, which is the majority of grocery traffic |
| End-to-end smoke test suite | `#440` | Protects revenue against a deploy that silently breaks checkout |
| Customer and staff acceptance testing | `#441` | The only remaining check that real people can complete a real shop |
| Accessibility validation | `#442` | Legal exposure and addressable market |
| Production game day | `#443` | Proves payment failure, database interruption and rollback are survivable before a customer meets them |
| Verified backups and restore | `#436` | Data loss is an existential risk, not a technical one |
| Production alerting | `#437` | Determines whether a fault is found by staff or by a customer |
| Tested rollback procedure | `#438` | Bounds the cost of a bad release |
| Final GO/NO-GO | `#445` | The launch decision itself |

### 7.2 Post-launch, revenue-oriented (P10)

| Item | Issue | Expected effect |
| --- | --- | --- |
| Saved reusable shopping lists | `#116` | The strongest retention mechanic in grocery — a saved weekly list makes reordering near-frictionless |
| Product variants and units of measure | `#398`, `#663` | Correct handling of loose and weighted goods; unlocks a large part of a real grocery range |
| Unit-price sorting | `#664` | "Cheapest per kg" is how grocery shoppers actually compare |
| Smart stock badges | `#400` | Reduces abandonment on uncertain availability |
| Live review widgets | `#406` | Third-party trust signal at the point of decision |
| Discount engine expansion | `#146`–`#149` | Richer promotional mechanics |
| Save for later | `#232` | Basket recovery |
| WhatsApp re-order flow | `#695` | Channel fit for this customer base; needs its own decision record |
| Fuzzy and typo-tolerant search | `#286` | Recovers searches that currently return nothing |

### 7.3 Required to sell the platform to other grocers

Not on the roadmap. Named here because §6.2 and §11 depend on them, and pretending otherwise would
be the exact failure this document is written to avoid: tenant billing and subscription management,
self-service vendor onboarding, a tenant-facing analytics view, a documented support model with
response times, and a contractual service-level commitment.

---

## 8. Day-to-day operating model

### 8.1 Staffing

| Function | Who | Load |
| --- | --- | --- |
| Catalogue, pricing, promotions | Store staff, via the panel | Routine; no engineering involvement |
| Order picking and dispatch | Store staff, via `/staff/orders` | Scales with order volume |
| Delivery slot configuration | Store admin, via `/staff/fulfilment` | Occasional |
| Customer service | Store staff | Order lookup and status are self-service for the customer, which suppresses contact volume |
| Platform engineering | Currently a **single maintainer** | See §10 — this is the largest operational risk |

### 8.2 Monitoring

IMPLEMENTED: a health endpoint (`/api/health`) reporting database and storage status; persisted
error capture (`ErrorEvent`, `instrumentation.ts`) with a platform-admin view at `/staff/errors`;
an automated error-rate check every 15 minutes; and Cloudflare's own Workers observability.

**Gap:** there is no alert routing (`#437`). Errors are recorded and visible, but nothing wakes
anybody up. Today a fault is found by someone looking.

### 8.3 Deployments

IMPLEMENTED and automated. A change is proposed, specified, built, validated, and shipped through a
pull request into `staging`, which auto-deploys to the staging environment; promotion to production
is a second, deliberate pull request. Both deploy paths run the same quality checks — lint,
type-check, the full test suite, format, and the documentation gates. Builds happen **before**
migrations (`#434`) so a failed build cannot leave the database ahead of the code. Merges with
failing checks are blocked by repository rulesets (`#644`).

**Gap:** rollback is documented but **not yet tested** (`#438`), and there is no environment
approval gate — deliberately, since a sole maintainer approving their own deploys adds a click and
no independent check. Revisit when a second maintainer joins.

### 8.4 Maintenance

Dependencies are exact-pinned where a version change could break the runtime, and that pinning is
enforced by a test rather than by convention. Database migrations run in CI against a direct
connection, never at request time. Reference data syncs on a monthly schedule. The documentation
set is generated from source, so it cannot silently diverge from what the system does.

### 8.5 Security

IMPLEMENTED: role-based access on every staff route; per-vendor data scoping enforced in the
repository layer and backed by tests; vendor-scoped authentication and session isolation;
signature-verified payment webhooks; rate limiting on authentication and guest order lookup;
UK GDPR data-subject rights; PECR consent; secrets held in Cloudflare and GitHub environment stores
rather than in the repository; and PCI scope kept minimal by never handling card data — Stripe's
hosted checkout does.

**Open:** two credential rotations are outstanding (`#219`, `#175`) and content-security-policy
hardening is deferred (`#446`).

### 8.6 Support

**This is the least developed area and the most important one for §6.2.** There is no defined
support model, no response-time commitment, no on-call rotation and no escalation path. Acceptable
for a single owner-operated store. **Not acceptable for a platform sold to third parties**, and it
is the first thing a prospective tenant will ask about.

---

## 9. Customer acquisition, marketing, retention and growth

### 9.1 What the platform already supports

| Capability | Status | Evidence |
| --- | --- | --- |
| SEO surface — sitemap, robots, metadata, per-vendor manifest | IMPLEMENTED | `app/sitemap.ts`, `app/robots.ts`, `app/manifest.ts` |
| Discount codes for campaign attribution | IMPLEMENTED | `DiscountRedemption` ties a redemption to an order |
| Homepage campaigns, banners and featured rails | IMPLEMENTED | `DepartmentCampaign`; `/staff/promotions` |
| Loyalty points as a retention mechanic | IMPLEMENTED | `LoyaltyLedgerEntry` |
| Ratings and reviews as social proof | IMPLEMENTED | `Review` |
| Search query logging — what shoppers ask for and do not find | IMPLEMENTED | `SearchQueryLog` |
| WhatsApp contact link | IMPLEMENTED | Per-vendor deep link (`#405`) — a link the shopper taps, not an outbound channel |
| Guest checkout | IMPLEMENTED | Removes the account-creation barrier for first purchase |

### 9.2 What is missing

**There is no analytics instrumentation.** No conversion funnel, no traffic attribution, no basket
abandonment measurement, no cohort retention. `SearchQueryLog` is the only behavioural data
captured. Consequently **every conversion, retention and growth claim in this document is a model,
and none of them can currently be checked against reality.** That is a material gap, and it is the
reason §7's expected impacts carry no numbers.

Also absent: email marketing (the transactional sender is not even verified yet, `#104`), any paid
acquisition tooling, and abandoned-cart recovery.

### 9.3 Strategy, given the above

**Acquisition.** For a local grocer the addressable market is geographic and the acquisition
channels are local — the physical shop itself, local search, community and WhatsApp networks. The
postcode delivery-area feature makes it possible to market accurately to exactly the districts that
can be served. Paid acquisition is poor value until conversion can be measured.

**Retention is where this platform should compete, and it is a deliberate choice.** Grocery is the
highest-frequency retail category there is. The mechanics that matter — a saved weekly list, the
list importer, loyalty points, reliable delivery slots — are frequency mechanics, and three of the
four are already built. `#116` (saved lists) is the single highest-leverage unbuilt retention
feature and it is already tracked.

**Growth.** Two distinct paths, and they need separating: more orders per existing store (§7.2),
and more stores (§6.2, §11). The second is the one that changes what this business is.

**The first instrumentation investment should precede the first marketing spend.** Marketing
against an unmeasured funnel is how money disappears without a lesson.

---

## 10. Limitations, risks, and where investment is required

Ordered by commercial severity.

| # | Risk | Status | What it would take |
| --- | --- | --- | --- |
| 1 | **The platform has never traded.** No real payment, no real customer email, no production load from real shoppers. Every projection is unvalidated | `#113`, `#104` open | Complete P9. Both are configuration and account actions, not engineering |
| 2 | **Single-maintainer concentration.** One person holds the operational knowledge. No on-call, no second reviewer, no succession | Acknowledged in `#644` | A second engineer, or a documented support contract. The documentation is unusually strong, which reduces but does not remove this |
| 3 | **No production alerting.** Faults are recorded but nobody is notified | `#437` open | Alert routing to a real destination |
| 4 | **Backups not restore-tested.** Automated backups exist; a restore has never been performed | `#436` open | One rehearsed restore |
| 5 | **Rollback untested.** Documented, never executed | `#438` open | One rehearsed rollback, ideally during the game day (`#443`) |
| 6 | **No analytics.** No conversion, attribution or retention measurement (§9.2) | Not tracked as an issue | An analytics decision and its implementation |
| 7 | **Build investment not recorded.** The original cost of building this platform appears nowhere in the repository, so return on investment cannot be stated | Open item for the next review | The owner supplying the figure |
| 8 | **Operating costs are modelled, not measured.** No invoice data (§5.1) | Open item for the next review | Actual monthly spend per service |
| 9 | **No tenant billing or onboarding.** §6.2's opportunity cannot be charged for | Not tracked as an issue | Subscription model, billing integration, self-service onboarding, support commitment |
| 10 | **No defined support model** (§8.6) | Not tracked as an issue | A support and service-level definition, required before selling to a third party |
| 11 | **Credential rotations outstanding** | `#219`, `#175` open | Rotate, in both secret stores, and redeploy |
| 12 | **Address lookup incomplete.** Property-level results need a licensed data provider | `#766` open | A commercial data licence |
| 13 | **Accessibility not yet validated on the candidate** | `#442` open | The P9.3 validation pass |
| 14 | **Orphaned image objects are never deleted** | `#174` open | A cleanup job. Slow-growing storage cost, not urgent |

**Concentration of risk is the honest summary.** Items 1, 3, 4 and 5 are all "we have built it and
not yet proven it under real conditions", and they are exactly what P9 exists to close. Item 2 is
structural and cannot be closed by engineering.

---

## 11. The 12–24 month commercial opportunity

Three horizons. Each depends on the previous one actually completing — and the first has not.

### Horizon 1 — Months 0–3: trade

**Objective: earn the first pound.** Complete P9, install live payment keys, verify the email
domain, prove backups and rollback, and open the store. Nothing in horizons 2 or 3 means anything
until a real customer has completed a real order.

**Success looks like:** orders flowing, confirmation emails delivered, one month of production
operation with no unrecovered payment and no data-loss event.

### Horizon 2 — Months 3–12: prove and optimise

**Objective: turn assumptions into measurements.** Install analytics and learn the real conversion
rate, the real basket value and the real repeat rate — every figure in this document is currently a
guess dressed in arithmetic. Ship the retention features (`#116` saved lists first), then the
grocery-specific catalogue work (`#398`, `#663`, `#664`) that makes a full range sellable.

**Success looks like:** the §5 cost model replaced with actual invoices; the §4 savings restated as
realised; a measured repeat-purchase rate.

### Horizon 3 — Months 12–24: license the platform

**Objective: a second revenue line that is not grocery margin.** This is where the asset becomes a
business. The technical foundation exists and is proven with two vendors; the commercial
foundation does not exist at all.

**Required, in order:** a support model with response times (§8.6); tenant billing and subscription
management; self-service vendor onboarding; a tenant-facing analytics view; and a reference
customer — ideally a grocer already known to Aheed — onboarded at cost to prove the model before it
is priced.

**The market argument.** UK independent grocers face Shopify pricing designed for general retail
and must rent grocery-specific behaviour as apps. A platform that ships delivery slots, postcode
eligibility, multi-buy pricing, loyalty and list-based reordering as standard, from an operator who
runs a grocery business themselves, is a credible and differentiated proposition.

**The realistic constraint.** With a single maintainer (§10, item 2), horizon 3 is not achievable
without either hiring or partnering. That is the decision this document exists to put in front of a
stakeholder, and it should be made deliberately rather than by drift.

---

## 12. Stakeholder summary

**What we have built.** A complete, multi-tenant UK grocery e-commerce platform, owned outright:
storefront, search, cart, checkout, payments, delivery-slot fulfilment, postcode-level delivery
eligibility, loyalty, discounts, bundles and multi-buy pricing, reviews, a nineteen-page staff
operations panel, GDPR compliance, automated deployment, and a generated documentation and training
set. Fifteen milestones closed across six weeks. Two live vendors on one deployment.

**What it saves.** Modelled against Shopify at a realistic trading volume: **£3,100–£3,500 per
year**, rising to roughly **£21,000 per year** at the platform's engineering target. Independent of
volume, each additional store avoids `ESTIMATE` **£528–£924 per year** in subscription and app fees.
Infrastructure runs at **under £10 per month today** and roughly **£34 per month** at established
volume — **2.3p per order**. **None of this is realised, because the store has not yet traded.**

**How it can make money.** First, Aheed's own grocery sales. Second — and this is the larger
opportunity — licensing the platform to other independent grocers. The multi-tenancy is real,
proven with a second live vendor, and costs almost nothing per additional store. What is missing is
not the technology but the commercial apparatus: billing, onboarding, and a support commitment.

**What remains to be invested.** Immediately: complete P9 — live payment keys, a verified email
domain, tested backups and rollback, production alerting. Then: analytics, because every projection
here is currently unverifiable. Then, if the licensing opportunity is to be pursued: tenant billing,
self-service onboarding, a support model, and a second pair of hands — the single-maintainer
concentration is the risk that engineering cannot solve.

**Where it can go.** Three horizons: trade within three months; measure and optimise within twelve;
license within twenty-four. The first is close and the work remaining is mostly configuration and
verification rather than construction. The third would change what this business is — from a grocer
with a good website into a software business with a grocery proving ground.

**The one thing to take away.** The engineering asset is materially complete and unusually
well-documented for its size. The gap between here and revenue is not code. It is a payment key, a
verified email domain, four rehearsals, and a decision to open.

---

## Milestone revision history

Newest first. Each entry names the milestone assessed, what materially changed since the previous
assessment, and — the part that matters — what was **withdrawn or corrected**. Conclusions in the
body above are revised in place so a reader always sees current truth; the record of what moved
lives here.

### 2026-09-16 — P9 (in progress) — baseline

**Baseline entry. No prior assessment existed, so nothing is withdrawn or corrected.**

Assessed at the point where fifteen milestones (M0, P0, P1, P2, P2.5, P2.6, P3, P4, P5, P6, P6.7,
P7, P7.5, P8, P8.5) have closed and P9 — Production launch readiness is in progress, with P9.1
substantially complete, P9.2 carrying 22 open issues, P9.3 ten and P9.4 three.

**Established in this baseline:**

- The platform is **not trading**. `#113` (live Stripe keys) and `#104` (verified email sending
  domain) are both open. Every financial figure in this document is a model, not a result.
- Operating cost is modelled from published pricing retrieved 2026-09-16, not from invoices. No
  spend data exists in the repository.
- The original build investment is not recorded anywhere in the repository, so return on investment
  cannot be stated.
- No analytics instrumentation exists, so no conversion, retention or attribution claim can be
  verified.
- Multi-tenancy is implemented and proven with a second live vendor (SriMart), but there is no
  tenant billing, onboarding or support model, so it cannot yet be monetised.

**Items flagged for the next review:**

1. Actual monthly spend per service, to replace §5's estimates.
2. The build investment figure, to enable a return-on-investment statement.
3. Whether `#113` and `#104` have closed — if so, §1 and §4 change character entirely, from modelled
   to realised.
4. Re-research Shopify, Stripe, Cloudflare, Neon and Resend pricing; §3 and §5 assume figures
   retrieved 2026-09-16.
5. Whether analytics instrumentation now exists, which would make §9 checkable.
