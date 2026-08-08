---
id: multitenancy-slice4-branding-config
title: "ADR-004 slice 4 — branding-as-CSS-vars + config split (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-08
visibility: internal
summary: Fill the empty vendor satellite tables and wire the read paths — per-vendor brand primitives injected as CSS custom properties per request, plus locality, delivery area, header/hero copy, logo, metadata and email sender read from the DB. The final ADR-004 slice, before P3.
tags: [multi-tenancy, vendor, branding, config, css-variables, delivery]
related: [adr-004-multi-tenancy, multitenancy-slice3b-host-resolver, design-system, architecture]
---

# ADR-004 slice 4 — branding-as-CSS-vars + config split (plan)

Final slice of ADR-004 (issue #73, umbrella #49) — `specs/decisions/ADR-004-multi-tenancy.md`
§Sequencing.4. `requirements.md` holds the checkable criteria; this file holds the reasoning.

**Goal:** make a vendor's **look and locality** data-driven so a second vendor (SriMart) renders in
its **own colours, name, delivery area, and copy** over the same components — proving ADR-004's
"onboard/rebrand through configuration, no code change" rule for the branding surface. Consumes slice
3b's host→tenant resolver (`lib/tenant.ts`); today SriMart resolves to a distinct *catalogue* but
still inherits Aheed's *branding* — this slice closes that gap.

**The seam is already there.** `design-system/tokens/tokens.css` is two-layer: eight
`--color-brand-*` **primitives** feed a **semantic** layer (`--color-primary`, `--color-action`, …)
that every component reads via `var()`. Overriding just the eight primitives on a wrapping element
cascades to the whole semantic layer with **zero component/token changes** — exactly ADR-004 §5. The
eight primitives map 1:1 to `VendorBranding`'s eight hex columns (slice 1).

**Scope (this slice) — storefront-visible core** (confirmed with the owner):

- **Seed the satellites** (`prisma/seed.ts`): `VendorBranding` + `VendorConfig` +
  `VendorDeliveryArea` for **Aheed** (brand primitives = the exact current `tokens.css` hex;
  locality "Milton Keynes"; delivery prefix `MK`) and, guarded behind the same both-`SEED_*_HOST`
  condition that already gates SriMart, for **SriMart** with **visibly distinct** colours, locality,
  and prefix. Idempotent upserts.
- **Branding read path in the repository layer** (`lib/repositories/vendor.ts`): current vendor's
  branding / config / delivery prefixes via `getCurrentVendorId()` + Prisma, memoized per request
  with React `cache()`. Keeps the slice-2 no-direct-Prisma guard green (layouts/components/pages
  never touch Prisma directly).
- **Theme injection**: `app/(storefront)/layout.tsx` wraps header + page in an element whose inline
  `style` sets the eight `--color-brand-*` custom properties from `VendorBranding`.
- **Header** (`components/layout/Header.tsx`): promo/delivery copy from `name` + `localityName`;
  **logo** from `${CDN_BASE_URL}/${logoStorageKey}` when set, else a **text wordmark** from `name`.
- **Homepage** (`app/(storefront)/page.tsx`): hero from `tagline` + `localityName`; postcode checker
  uses the vendor's `VendorDeliveryArea` prefixes and locality in its message.
- **Delivery** (`lib/delivery.ts`): `isDeliverable(postcode, prefixes)` — stays a pure function
  (no Prisma), prefixes supplied by the caller from the vendor's delivery areas.
- **Metadata**: `app/layout.tsx` + homepage use `generateMetadata` from `VendorBranding`, with a
  neutral platform fallback (root layout also serves `/coming-soon`).
- **Email**: reset/verify **subjects** in `lib/auth.ts` use `VendorConfig.senderName` (fallback to a
  platform default); From address unchanged.
- **Aheed logo → storage**: upload the existing `public/images/brand/logo.png` to object storage at
  `vendors/{AHEED_VENDOR_ID}/logo.png` (ADR-003 relative key) and seed `logoStorageKey`; SriMart has
  none → wordmark.
- **Persistent docs**: `specs/design-system.md` (primitives overridable per vendor at runtime),
  `specs/architecture.md` (slice-4 tenancy line), `docs/env-setup.md` (logo upload step).

**Deliberately excluded:**
- **The metadata long tail** — the ~10 other pages' `metadata.title` "— Aheed Food Centre" suffixes
  and an async per-vendor `manifest.ts`. Low impact, ~15 touch points, a DB call per resolution →
  its own follow-up issue (opened at Document).
- **Vendor `senderEmail` as the real email From** — needs Resend domain verification per vendor;
  only the sender **name**/subject copy is data-driven now.
- **Rich per-vendor hero body copy** beyond `tagline` + locality. The satellites (slice 1) have no
  dedicated hero-headline/sub-copy columns, so Aheed's specific "100% certified HMC halal meat cut
  daily" sub-sentence is **generalised** to a locality-templated line rather than preserved verbatim.
  Dedicated hero-copy columns would be an additive migration — deferred, not smuggled in here.
- **`category-icon.ts` fallback** for a new vendor's unmapped category slugs (SriMart's demo
  categories reuse existing slugs, so icons resolve; a generic-icon fallback is a later cleanup).
- **Derived hover shades** (`--color-action-hover`/`--color-accent-hover`) stay Aheed-tuned — they're
  hardcoded hex, not `var()`-derived, and there's no `VendorBranding` column for them.
- **A theme catalogue** (named, reusable `Theme` rows a vendor picks from, vs. today's raw 8 hex
  per vendor). Considered and deferred: per-request cost is flat in vendor count either way (each
  request is single-tenant, one indexed branding read), the injection seam is identical so a
  catalogue is **additive later, not a rewrite**, and its real payoff (curation, reuse, a pick-list)
  needs the P6 admin/onboarding UI that doesn't exist yet. Tracked for the P6 era.
- **`Region`/`Location` reference tables** (ADR "when geography grows") — not needed at prefix level.

**Open items carried forward:**
- The **Aheed logo upload** to storage is a per-env ops step (like slice 3b's `SEED_*_HOST`); until
  it's done in an env, Aheed's header falls back to a wordmark (graceful, not broken).
- **SriMart's real logo** is a data-only follow-up (set `logoStorageKey` once an asset exists).
- **Slice 3c** (auth cookie scoping / family SSO, #74) is still the outstanding ADR-004 piece before
  P3; this slice does not touch it.
