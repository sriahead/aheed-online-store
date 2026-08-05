# Mission

## Problem

Aheed Food Centre has no online storefront. Customers cannot browse the range, order, or pay
online, and staff have no digital tooling to manage products, orders, discounts, or loyalty.
Aheed needs a centralised, UK-compliant e-commerce platform it can rely on while its team stays
focused on the shop floor and its own deliveries. The platform must be **PostgreSQL-first,
vendor-agnostic, and cost-effective**, so Aheed is never locked to one cloud.

## Audience

- **Customers** — browse by category, search/filter, buy by card, track orders, earn/redeem
  loyalty. Both registered account holders and **guests** (guest checkout is in scope for the MVP).
- **Staff** — shop-floor role: toggle product availability and move orders through the delivery
  status workflow. A restricted subset of admin.
- **Admin** — full management of products/categories, orders, customers, discounts, loyalty rules,
  and reporting.

## Success

The MVP is successful when:

- A customer (registered **or guest**) can browse by category, search/filter by name/category/price,
  view product pages, add to cart, check out, pay by card, and receive on-screen and emailed
  confirmation.
- A registered customer can view order history, live delivery status, and loyalty balance, and
  redeem points at checkout.
- Staff/admin can manage products and categories, toggle availability, run the order dashboard, edit
  orders and update delivery status, view the customer directory, manage discounts, configure
  loyalty rules, and view sales/order reports.
- UK compliance is in place and functional: privacy policy, PECR cookie consent, T&Cs,
  Stripe-handled PCI scope, SSL across the site.
- The platform is deployed to production and covered by one year of maintenance.

## Scope (MVP)

Storefront (browse, search/filter, product pages, cart, guest + account checkout, card payment,
order confirmation, delivery-status tracking, loyalty earn/redeem) and admin/staff tooling
(products, categories, availability, orders, customers, discounts, loyalty rules, reports), served
from **one headless API** with RBAC, on a portable Cloudflare + Neon + S3-compatible-storage stack.

## Out of scope (future phases)

- Native mobile app (the API is built mobile-ready, but no app ships in the MVP).
- Courier booking / GPS tracking — Aheed self-delivers; only the three-step status is shown.
- SMS/WhatsApp notifications, multi-branch management, marketing automation.
- Multi-language — English only.
- Hosted identity providers (Clerk/Auth0) — rejected for the MVP (see ADR-002).

## Non-functional targets (Gate-3 acceptance criteria)

These are the measurable defaults for the MVP; confirm figures with Aheed before the phases that
enforce them. Sized for a mobile-first, ~1,000-orders/day storefront.

- **Throughput:** comfortably handle **~1,000 orders/day** (bursty peaks of tens of orders/minute)
  plus higher anonymous browse traffic, on Neon's autoscaling serverless Postgres.
- **Availability:** ~99.5% target (single-region MVP; scale-to-zero DB).
- **Performance:** storefront **LCP < 2.5s on 4G**; **API p95 < 400ms**. Enforced via indexing,
  keyset pagination, edge/ISR caching, and query optimisation (`specs/architecture.md` §3.4).
- **Scale (MVP):** catalogue in the hundreds to low thousands of SKUs; ~100+ concurrent shoppers.
- **Accessibility:** WCAG 2.2 AA as a best-effort target.
- **Backups:** Neon automated backups / point-in-time restore enabled (retention configured in
  setup); portable to the target provider's backup facility on migration.
- **Security:** OWASP Top 10 mitigations; secrets in Cloudflare environment/secret bindings (typed
  in `lib/config`); encryption in transit and at rest; RBAC on every route.

## Open items carried into later phases

- **Checkout currency / VAT.** UK is the compliance target, so **GBP** is the default checkout
  currency (stored as **integer pence**) with UK VAT handling. (The LKR figures in the proposal are
  Aheed's one-time build fee, not the store's transaction currency.) Confirm before payments work
  (Phase 3/4).
