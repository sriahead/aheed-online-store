---
id: adr-004-multi-tenancy
title: "ADR-004 — Multi-Tenancy (DB-driven vendors, regions & branding)"
audience: [dev]
type: adr
status: approved
version: "1.5.0"
updated: 2026-08-20
visibility: internal
summary: Evolve from single-vendor to a multi-tenant platform where vendors, regions, locations, delivery areas, and branding come from the database, sharing one business-logic and data layer. Row-level vendorId isolation, subdomain resolution, isolated-by-default auth (family SSO config-gated).
tags: [adr, multi-tenancy, vendors, branding, architecture]
related: [architecture, adr-001-hosting, adr-002-auth-library, adr-003-storage-abstraction]
---

# ADR-004 — Multi-Tenancy (DB-driven vendors, regions & branding)

- **Status:** **Accepted** (approved 2026-08-08). The four cross-cutting questions below are
  resolved; implementation proceeds as sequenced slices (see "Sequencing"). Tracked by issue #49.
- **Related:** `specs/architecture.md`, ADR-001 (hosting), ADR-002 (auth library), ADR-003
  (storage). Sequencing: land **before P3** (cart/checkout/orders), which would otherwise bake in
  single-vendor assumptions.

## Context

The store began as a single vendor (Aheed Food Centre, Milton Keynes) with the brand, locality,
delivery area, taxonomy, and theme **hardcoded across the codebase**. The owner has directed that
the platform must support **multiple vendors** cleanly: regions, locations, vendors, and related
config come from the **database**; a new vendor can be onboarded **without major code changes**;
each vendor gets its **own branding/UI** over the **same business logic and data layer**; and
vendor-specific change is handled primarily through the **UI/configuration layer**.

Today there is **no `Vendor`/`Tenant` entity** in `prisma/schema.prisma`, and no `vendorId` on any
domain table. A 2026-08-07 audit (issue #49) enumerated the hardcoded surfaces. Separately,
**staging and production currently share one Neon database**, so environment and tenant isolation
should be reasoned about together.

## Decision

1. **Introduce a `Vendor` aggregate** as the tenancy root, plus supporting config tables:
   - `Vendor` (id, slug, status, **optional `customDomain`**), `VendorBranding` (theme primitives,
     logo storage key, name, tagline), `VendorConfig` (locality copy, sender identity, feature
     flags), and a **delivery-area** table (`VendorDeliveryArea`: per-vendor postcode prefixes /
     regions — replaces `lib/delivery.ts`'s hardcoded `MK1–MK19`).
   - `Region`/`Location` as their own reference tables when geography grows beyond delivery areas.

2. **Scope every domain row to a vendor — row-level tenancy.** Add a mandatory `vendorId` (FK) to
   `Category`, `Product`, `Inventory`, `Review`, and the future `Order`/`Cart`. Row-level tenancy
   (a mandatory `vendorId` filter) is chosen over schema-per-tenant to fit the Neon + Prisma +
   cost-effective mandate and the "onboard with a row, no deploy" goal. It is **enforced centrally
   in the repository layer** (`lib/repositories/*`), which is the **only** DB-access path and
   requires a resolved `vendorId`, injecting `where: { vendorId }` on every query. Concretely:
   - **Global uniques become per-vendor composites:** `Product.slug` and `Category.slug` →
     `@@unique([vendorId, slug])`; `Review` → `@@unique([vendorId, userId, productId])`.
   - **Composite indexes lead with `vendorId`** (e.g. `@@index([vendorId, isActive, basePrice])`).
   - **Guardrail:** a lint/test rule forbids importing `@prisma/client` outside `lib/repositories/*`,
     so a missing filter can't leak cross-vendor data.
   - ~~**Deferred:** Postgres row-level security (RLS) as defense-in-depth → **P7 hardening**~~
     **Settled 2026-08-19: RLS is NOT adopted** — see "Row-level security" below. The 2026-08-08
     guess that "per-request session vars on Workers isolates is fiddly" turned out to understate
     it: there is no session at all on the HTTP driver the app reads through, and the adapter
     refuses transactions in HTTP mode, so there is nowhere for a session variable to live. The
     repository layer plus `tests/repository-vendor-scoping.test.ts` is the compensating control.

3. **Resolve the tenant per request from the host — subdomain, with an optional custom-domain
   override.** Default host is `{slug}.aheedfoodcentre.nocaped.com`; an optional `Vendor.customDomain`
   lets a vendor map their own domain **with no schema change**. A single resolver seam maps
   `request host → (vendorId, cookie domain, isCustomDomain)`: exact custom-domain match first,
   then subdomain fallback → `vendorId` in request context. Path-prefix (`/v/{slug}`) is **rejected**
   as the primary model — it welds all vendors to one origin/cookie namespace and can't grow into
   vanity domains cleanly. One wildcard DNS record + one Worker route + one wildcard cert covers all
   subdomain vendors.
   - **Canonical origin per vendor:** once a vendor has a `customDomain`, its subdomain **301-redirects
     to the custom domain**, so a vendor is never simultaneously live on two origins (which would
     split sessions — see decision 4).

4. **Auth: global identity, family-scoped SSO, isolated sessions per custom domain.** One global
   `User` pool (one email, one login platform-wide; ADR-002 Better Auth unchanged). Session cookie
   scoping follows cookie reality, not a wish:
   - **Within the subdomain family** (`.aheedfoodcentre.nocaped.com`): the session cookie is set on
     the **parent domain**, giving SSO across every subdomain vendor. All family subdomains are in
     Better Auth `trustedOrigins`.
   - **A vendor on a custom domain** is a separate registrable origin → **isolated session** (its
     own cookie; the user authenticates separately there). Cross-registrable-domain SSO is **not**
     free — it needs a federation flow, deliberately deferred (see "Deferred upgrade").
   - **Authorization is per-vendor and independent of session scope.** RBAC moves **off** the global
     `User.role` into a **`VendorMembership(userId, vendorId, role)`** for staff/admin; customers
     need no membership row (their vendor relationship is implicit via vendor-scoped orders/reviews).
     A customer SSO'd across three subdomain vendors is fine; a staff member is staff **only** where
     a membership row exists. Retain a platform-level admin role distinct from vendor-level roles.
   - **`trustedOrigins` and the cookie `Domain` are derived from the `Vendor` table at runtime**,
     never hardcoded — otherwise onboarding a custom domain would require a code/deploy change,
     violating decision 7. The resolver seam from decision 3 supplies the cookie domain, so the auth
     code reads the session and resolves the same global `User` regardless of origin; only the
     cookie `Domain` differs. This keeps one implementation today and makes the deferred federated
     upgrade additive, not a rewrite.

5. **Branding is data, delivered as CSS variables.** The existing two-layer token system
   (primitive → semantic in `design-system/tokens/tokens.css`) already provides the seam: per-vendor
   **primitives** come from `VendorBranding` and are injected as CSS custom properties at request
   time. Per-vendor logo and assets resolve through storage keys (ADR-003), namespaced per vendor
   (e.g. `vendors/{vendorId}/...`).

   **Amended 2026-08-20 (P7.5c+f, #255).** This decision originally added "the **semantic** layer
   and every component stay unchanged." Components still are — that part holds, and is why 45-plus
   call sites were recoloured in #251 without touching one of them. The semantic *layer* is no
   longer unchanged: `brandStyle()` now derives `--color-primary`, `--color-action`,
   `--color-accent`, `--color-danger` and the two hover shades from each vendor's own primitives,
   each passed through `clampForContrast` (`lib/color-contrast.ts`), which moves OKLCH lightness
   until the value clears WCAG AA against the surfaces it renders on while preserving hue and
   chroma.

   The original wording was written when "semantic layer unchanged" and "vendors are
   differentiated" were compatible, because every semantic token was a plain alias of a primitive.
   #251 broke that tie by decoupling three of them into audited constants — buying an AA guarantee
   at the cost of every vendor rendering identical buttons. The clamp resolves it properly: colour
   varies per vendor **and** AA holds by construction rather than by curation. Measured at
   P7.5c+f's `/propose`, Aheed's own primitives failed hardest of anything in the repo (`#4caf50`
   at 2.78:1, `#f57c00` at 2.70:1, against SriMart's `#1e88e5` at 3.68:1), so a clamp is not
   optional decoration on this decision — an unclamped restoration would breach AA for the vendor
   that has been live longest.

   **Backgrounds are still plain aliases** (`--color-surface-muted` and the three tints): they are
   what text sits on, and clamping them would move the surface instead of the foreground.
   **Promotional content is data on the same principle** — `VendorPromotion` rows, not constants in
   a shared component (#233).

6. **Split platform config from vendor config.** `lib/config.ts` keeps **platform/infra** values in
   env (DB endpoint, storage endpoint, secrets); **vendor** values (name, tagline, locality,
   delivery area, sender identity, theme) move to the **database**, read per request for the
   resolved tenant.

7. **Onboarding is data-only.** A new vendor = a `Vendor` row + branding + config + delivery area +
   catalogue (+ `customDomain` if any + its `trustedOrigins` entry, all read from the DB) — **no
   code change, no deploy.**

## Environment isolation (prerequisite)

**Separate the shared staging/production Neon database into two Neon projects, first — before the
`vendorId` migration.** Each environment wires through the existing two-URL pattern (`DATABASE_URL`
pooled / `DIRECT_URL` direct) via its own GitHub environment + Worker env. Separate **projects**
(not just Neon branches) give true isolation; branches share compute/limits. Rationale: the
multi-tenant migration is a large, rehearsable schema change you don't want to trial against prod,
and once real vendor data exists a shared DB conflates environment isolation with tenant isolation
(a staging test could mutate a live vendor's rows — a data-integrity and UK-GDPR problem).

## Sequencing

Land before P3, as independently-validatable slices:

0. **Separate the Neon DBs** (prerequisite above).
1. **Schema:** `Vendor` + `VendorBranding`/`VendorConfig`/`VendorDeliveryArea` (+ `Region`/`Location`
   if needed) and the `vendorId` migration, with per-vendor composite uniques and vendorId-leading
   indexes. Backfill existing rows to the Aheed vendor.
2. **Repository-layer enforcement** + the no-direct-Prisma lint/test guard.
3. **Host → tenant resolver** (subdomain + custom-domain override, canonical-origin redirect) and
   the data-driven auth cookie domain / `trustedOrigins` + `VendorMembership`.
4. **Branding-as-CSS-vars + config split**, collapsing the hardcoded surfaces (`lib/delivery.ts`,
   header/hero/`manifest.ts` copy, `tokens.css`, storage keys, `lib/config.ts`, category-icon map).

> **Slices 0–1 implemented** (2026-08-08, `specs/roadmap.md`'s change log): Neon environment
> isolation and the `Vendor` aggregate + `vendorId` migration both shipped to production, backfilled
> cleanly onto existing rows.
>
> **Schema-drift check closed** (2026-08-17, **#197**, split from #65): `prisma migrate diff
> --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma` against a
> throwaway local Postgres shadow database reported **"No difference detected."** The hand-authored
> `20260808130000_multitenancy_vendor_scope` migration exactly matches what `schema.prisma` implies
> — no reconciling migration needed.

## Consequences

- **Positive:** new vendors onboard through configuration; a single business-logic/data layer serves
  all; theming is per-vendor without forking components; the delivery/brand/locality hardcoding
  collapses into DB-driven config.
- **Cost:** `vendorId` scoping touches **every existing repository query** (`lib/repositories/*`) —
  enforced centrally so a missing filter can't leak cross-vendor data. This is the main reason to do
  it **before** P3 adds more query surface (orders/carts/payments).
- **Environment isolation:** handled as prerequisite slice 0 above.
- **Auth blast radius:** a parent-domain family cookie is readable by every subdomain — acceptable
  because all subdomains map to one Worker (no dangling-subdomain takeover surface); keep cookies
  `HttpOnly`/`Secure`/`SameSite=Lax`.
- **Rule of thumb (post-ADR):** if onboarding a vendor or changing its branding/locality/delivery
  area/custom domain requires editing anything **outside the database and the UI/config layer**, the
  abstraction has been violated.

## Implementation note — auth cookie scoping (slice 3c, 2026-08-09, #74)

Decision 4 assumed a **subdomain family** (`{slug}.aheedfoodcentre.nocaped.com`) whose members SSO
via a parent-domain cookie. The **deployed topology has no such family**: the two live vendors sit on
distinct hosts — Aheed at the apex `aheedfoodcentre.nocaped.com`, SriMart on its own
`srimart.nocaped.com` (the custom-domain path). So slice 3c implements decision 4 as
**isolated-by-default**: `baseURL`, `trustedOrigins`, and the cookie domain are resolved **per
request** from the host alone (`lib/auth-origin.ts` → `getAuth()`, no DB call), and every vendor gets
a **host-only session cookie whose `trustedOrigins` trusts only that vendor's own origin** — a sibling
vendor's origin is rejected by Better Auth's origin/CSRF check exactly like an unknown origin
(confirmed live on staging, #83; an earlier draft of this slice trusted every vendor's origin
DB-wide, which would have reopened a cross-tenant CSRF-adjacent surface). The parent-domain
family-cookie mechanism is **built and unit-tested but config-gated** behind an optional platform env
`AUTH_COOKIE_FAMILY_DOMAIN` (unset in every environment today); when a real `{slug}.family` vendor
eventually exists, setting that one value arms family SSO (parent-domain cookie + a scoped wildcard
trusted origin for that family) with no code change. This does **not** change decision 4's intent —
global identity, per-vendor `VendorMembership` authz, cookie config derived from the request — only
its default posture, since the family it presupposed does not currently exist. Cross-**custom-domain**
SSO remains the deferred federation upgrade below.

## Implementation note — the one permitted cross-vendor query (P7b, 2026-08-18, #216)

Decision 2 makes every domain read `vendorId`-scoped in `lib/repositories/*`. **P7b introduces the
single deliberate exception**, and it is recorded here rather than only in that slice's folder so it
does not read as precedent later: `countOtherVendorData(prisma, userId, excludingVendorId)` in
`lib/repositories/data-rights.ts` spans tenants because UK GDPR erasure has to answer "is this the
user's last vendor?" before deciding whether to delete the shared `User` row — and that question is
unanswerable from inside one vendor.

Its contract is as narrow as the question allows: **it returns an integer and nothing else** — never
rows, never field values, never a vendor id or name. That is what distinguishes it from
`findOrderForWebhook`, this codebase's other un-scoped read, which returns full order contents and
became an unauthenticated cross-vendor disclosure the moment P7a wired it to a public page (PR
#204). A function that can only answer *how many* tells vendor A nothing about vendor B beyond the
fact that this user also shops there — which the user already knows about themselves.

**Do not widen it to return rows.** A caller needing more than a count is a new decision, not a
small change. The deeper fix is **#220 (P7e)** — row-level security, which decision 2 already defers
to P7 — so that a missing `vendorId` filter fails closed at Postgres instead of relying on the
repository layer and the `no-restricted-imports` lint rule being the only enforcement.

## Row-level security — determined 2026-08-19, NOT adopted (#220, P7 closeout #251)

Decision 2 deferred RLS to P7. P7 ran the experiment. **RLS is not adopted, because it is not
reachable on this stack** — and that is a property of the driver, not a matter of effort.

Evidence: `specs/2026-08-19-p7-closeout/rls-experiment.md`, produced by
`scripts/rls-experiment.ts` (re-runnable, read-only).

An RLS policy reads the current tenant from **session state** — conventionally a GUC set with
`SET LOCAL app.current_vendor` and read via `current_setting(...)`. That requires the `SET` and the
guarded query to share a session. Measured behaviour:

| Case | Result |
|---|---|
| A. `PrismaNeonHttp`, `SET` and read as two queries | **GUC lost** — no shared session |
| B. `PrismaNeonHttp`, both in one batched `$transaction` | **Errors**: `Transactions are not supported in HTTP mode` |
| C. `PrismaNeon` (WebSocket), inside one interactive `$transaction` | GUC survives |
| D. `PrismaNeon`, read after the transaction ends | GUC correctly gone — `SET LOCAL` does not leak |

Case A is the shape of **every repository read**, so a policy reading a GUC would see nothing on all
of them and fail closed — returning no rows at all. Case B is the finding that removes the obvious
workaround: the batched-transaction escape hatch does not exist at the adapter layer, so this cannot
be solved by restructuring calls.

Adopting RLS would therefore require routing **every read** through `getPrismaWs()` to give each one
a session. That is precisely the configuration that caused **#187** — WebSocket connections
exhausting the per-isolate limit under ordinary concurrent load, fixed by moving reads to HTTP. RLS
would trade a defence-in-depth control for a previously-experienced production outage. Case D is the
one reassuring result: `SET LOCAL` is properly transaction-scoped, so nothing leaks between callers
on a pooled connection.

**Not evaluated:** Neon's RLS integration carries identity in a **JWT on the connection** rather than
a session GUC, which would sidestep case A. It is gated behind **Neon Auth**, which `CLAUDE.md`
keeps deliberately off — authentication is Better Auth per ADR-002. Reopening a settled
authentication decision to obtain a secondary control is out of proportion. Recorded so a later
reader knows it was considered, not missed.

### Compensating control

The tenant boundary stays in `lib/repositories/*`, and `tests/repository-vendor-scoping.test.ts`
makes it executable rather than conventional. It walks each repository module's TypeScript AST and
asserts that (a) every exported function querying a `vendorId`-bearing model takes a vendor id
parameter, and (b) a function given one actually references it, so the parameter cannot be
decorative. Twelve exceptions are allowlisted **with reasons** in that file — the eight
request-scoped facades (#252), `countOtherVendorData` and `hasVendorMembership` (both deliberately
cross-vendor), and `findOrderForWebhook`/`confirmPayment` (webhooks arrive with no host to scope by).

**State the limit plainly:** a function that takes `vendorId`, applies it to one query and omits it
on a second is still not detected. A stronger per-call-site check was built and rejected during the
slice — it flagged 38 of 155 call sites, almost all correct code keyed by an id already fetched
under a vendor scope, and would have needed ~38 hand-written justifications, the kind of list that
gets rubber-stamped rather than read. What is lost by RLS being unavailable is real, and this
records it rather than implying parity.

## Deferred upgrade — cross-domain SSO (federated auth)

Custom-domain vendors have isolated sessions today. If platform-wide SSO across custom domains ever
becomes a stated requirement, add a **central auth origin** (e.g. `accounts.aheedfoodcentre.…`) with
an OIDC/token-exchange flow. It is additive to decision 4's single resolver seam — not a rewrite —
and is deliberately out of scope now.

## Resolved decisions (2026-08-08)

1. **Tenant resolution** — subdomain (`{slug}.aheedfoodcentre.nocaped.com`) + optional
   `Vendor.customDomain` override; canonical-origin redirect once a custom domain is set. *(decision 3)*
2. **Data isolation** — row-level `vendorId`, enforced centrally in the repository layer; per-vendor
   composite uniques; RLS deferred to P7 and, on 2026-08-19, **determined not adoptable** on this
   driver — see "Row-level security" above for the evidence and the compensating control. *(decision 2)*
3. **Auth across tenants** — global identity; SSO within the subdomain family, isolated session per
   custom domain; per-vendor authorization via `VendorMembership`; cookie domain + `trustedOrigins`
   derived from the `Vendor` table. *(decision 4)*
4. **Staging/production DB separation** — separate Neon projects, done first (prerequisite slice 0).
