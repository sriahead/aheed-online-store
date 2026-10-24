---
id: whatsapp-offers-page-plan
title: "Offers & WhatsApp Promotions page (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-10-24
visibility: internal
summary: "Dedicated /whatsapp-offers storefront page (#1233) combining per-vendor WhatsApp community join banner + QR code on VendorConfig with genuine catalogue offers grouped by department, active bundles, live campaigns, and storefront navigation."
tags: [storefront, promotions, whatsapp, navigation, multi-tenant]
related: [architecture, design-system, app-conventions, p1180-shared-page-container-plan]
---

# Offers & WhatsApp Promotions page (plan)

**Goal:** deliver a dedicated, mobile-friendly **Offers & WhatsApp Promotions** page at `/whatsapp-offers` (`#1233`) where shoppers can join a store's WhatsApp community group (via invite link or QR code when configured for that vendor) and browse all genuine catalogue offers (`Product.originalPrice` markdowns, `ProductPriceTier` multi-buy deals, active `Bundle`s, and live `DepartmentCampaign`s) grouped by the store's real top-level departments.

## Why this shape

### 1. Per-vendor WhatsApp community invite and QR code (`ADR-004`, `ADR-003`, `#239`)

Every vendor shares the same codebase and Worker deployment (`ADR-004`). Hardcoding Aheed Food Centre's WhatsApp group invite URL (`https://chat.whatsapp.com/FTgLVoelRw7262i0OvAIzS`) or committing its QR code into `public/` for every storefront would leak Aheed's community invite onto SriMart and every future vendor (`#239`).

Instead, `VendorConfig` (`prisma/schema.prisma`) gains two nullable columns:

- `whatsappCommunityUrl String?` — validated by `parseWhatsappCommunityUrl` in `lib/social-contact-form.ts` to accept only `https://chat.whatsapp.com/<invite-code>` (or `null` when left blank).
- `whatsappCommunityQrKey String?` — a relative object-storage key (`ADR-003`), composed into a public URL at read time via `composePublicUrl(CDN_BASE_URL, key)` (`lib/storage.ts`).

Following the `#239` null-hides rule:

- When `profile.whatsappCommunityUrl` is non-null, `<WhatsappCommunityBanner>` (`components/layout/WhatsappCommunityBanner.tsx`) renders the WhatsApp community banner using the vendor's semantic theme tokens (`bg-primary`, `bg-action`, `hover:bg-action-hover`, `text-primary`, `text-primary-muted` — heading `"Stay Updated with Our Latest Offers!"`, vendor-neutral supporting copy naming `profile.name`, `"Join Our WhatsApp Group"` button with the WhatsApp SVG icon, `"Free to join. Leave anytime."` reassurance, and the QR code card when `profile.whatsappCommunityQrKey` is also set) on both `/categories` (when clicking `"Shop"`) and `/whatsapp-offers`.
- When `profile.whatsappCommunityUrl` is `null` (for example on SriMart), the WhatsApp community banner is omitted (`#239`).

### 2. Genuine offers grouped by the vendor's real departments

Rather than inventing promotional categories, fake discounts, or unverified expiry dates (`#239`), the `"Latest Offers & Deals"` section reads the vendor's existing data:

1. **Live department campaigns (`DepartmentCampaign`)**: fetched via `getCampaignsForHero` (`lib/campaigns-service.ts`) and filtered with `isCampaignLive(campaign, new Date())` (`lib/campaign-liveness.ts`). Only live campaigns render, displaying their `headline`, optional `subtitle`, optional validity window (`startsAt` / `endsAt` when stored on the row, formatted in `profile.timezone`), and a `"Shop Now"` link to `campaign.linkUrl ?? /categories/<department-slug>`.
2. **Active value bundles (`Bundle`)**: fetched via `getBundlesForStorefront()` (`lib/bundles-service.ts`) and rendered through the existing `BundleRow` component (`components/bundle/BundleRow.tsx`) with `viewAllLink="/bundles"`, which already filters with `hasAvailableItems` and hides itself when empty.
3. **Discounted and multi-buy products (`onOffer: true`)**: fetched in one repository read via `listOfferProducts` (`lib/repositories/products.ts` and `lib/products-service.ts`), which reuses `buildFilterWhere({ onOffer: true })`, `visibleCategoryWhere`, `productSummarySelect` plus `categoryId: true`, `listActiveTiersForProducts`, and `toProductSummary`. Each product's `categoryId` (whether a top-level department or a second-tier subcategory) is mapped to its top-level department using `getCategoryRepository().listTree()`, so departments render in the vendor's own `(sortOrder, name)` order. Each department with at least one offer product renders a section with the department name, a `"Shop Now"` link to `/categories/<department-slug>`, and a `<ProductGrid as="ul" density={gridDensity}>` of `<ProductCard>` items.
4. **Friendly empty state**: when a vendor has zero offer products, zero renderable bundles, and zero live campaigns, `/whatsapp-offers` renders a friendly empty state encouraging shoppers to join the WhatsApp group (when `profile.whatsappCommunityUrl` is set) or browse all categories (`/categories`).

### 3. Vendor-neutral copy (`tests/vendor-neutral-copy.test.ts`)

`tests/vendor-neutral-copy.test.ts` forbids hardcoded vendor names (`"Aheed"`, `"Aheed Food Centre"`, `"SriMart"`) and grocery-specific nouns (`"grocery"`, `"groceries"`, `"halal"`) in `.tsx` files under `app/` and `components/`. All copy on `/whatsapp-offers` and `/staff/storefront` derives the store name from `profile.name` and uses vendor-neutral wording:

> `"Join the ${profile.name} WhatsApp group to discover special promotions, exclusive deals, fresh arrivals, and exciting savings on your favourite products."`

### 4. Storefront Shop page, contact channels, and SEO

- **Shop page (`app/(storefront)/categories/page.tsx`)**: renders `<WhatsappCommunityBanner>` directly below the `"Shop by department"` scroller when `profile.whatsappCommunityUrl` is set, so shoppers clicking `"Shop"` in the header immediately see the WhatsApp community invite and QR code without needing a separate `"Offers"` navigation link in the header, `CollectionNav`, or footer `"Shop with us"` column.
- **Floating contact cluster & footer contact channels (`lib/contact-channels.ts`, `components/layout/StorefrontChrome.tsx`, `components/layout/StorefrontFooter.tsx`, `components/layout/FloatingContact.tsx`, `components/layout/contact-channel-icons.tsx`)**: passes `whatsappCommunityUrl: profile.whatsappCommunityUrl` into `contactChannels()`, emitting `{ kind: "whatsapp-community", href: whatsappCommunityUrl, label: "Join <vendorName> WhatsApp group" }` (with `WhatsappGlyph`) alongside Facebook, Instagram, and the Help Assistant (`?`) in both the floating bottom-right contact menu and the footer's `"Visit & contact us"` icon row.
- **Sitemap (`app/sitemap.ts`)**: adds `"/whatsapp-offers"` to `STATIC_PATHS` so search engines index each vendor's offers page on that vendor's own host.
- **Metadata (`lib/page-metadata.ts` & `app/(storefront)/whatsapp-offers/page.tsx`)**: pure `buildOffersMetadata({ host, vendorName })` helper in `lib/page-metadata.ts` builds `title: "Offers & Deals | <vendorName>"`, a bounded vendor-neutral description, and an absolute canonical URL `https://<host>/whatsapp-offers`.

## Scope

1. **Schema & migration**:
   - Add `whatsappCommunityUrl String?` and `whatsappCommunityQrKey String?` to `VendorConfig` in `prisma/schema.prisma`.
   - Hand-author additive migration `prisma/migrations/20261024040000_vendor_whatsapp_community/migration.sql` (following `CLAUDE.md`'s `#895` rule: never `migrate dev` on shared dev DB).
2. **Validation, repository, and service layer**:
   - `lib/social-contact-form.ts`: add `WHATSAPP_COMMUNITY_URL_FIELD = "whatsappCommunityUrl"`, `parseWhatsappCommunityUrl(raw, field)`, and include `whatsappCommunityUrl` in `SocialContactInput` and `parseSocialContact`.
   - `lib/repositories/vendor.ts` & `lib/vendor-service.ts`: add `whatsappCommunityUrl` and `whatsappCommunityQrKey` to `VendorProfile`, `fetchVendorProfile`, `VendorStorefrontConfigInput`, and `updateVendorStorefrontConfig`, plus `updateVendorWhatsappQrKey(prisma, vendorId, qrKey: string | null)`.
   - `lib/repositories/products.ts` & `lib/products-service.ts`: add `listOfferProducts(prisma, vendorId, take)` (and `listOfferProducts(take)` on `ProductRepository`) returning `OfferProductWithCategory[]` (`{ product: ProductSummary; categoryId: string }[]`).
3. **Admin `/staff/storefront` & operator guide**:
   - `features/admin/storefront.ts`: pass `whatsappCommunityUrl` in `updateSocialContact`, and add `requestWhatsappQrUpload(byteLength)`, `attachWhatsappQr(key)`, and `removeWhatsappQr()` Server Actions gated by `requireVendorRole("ADMIN")`.
   - `components/staff/WhatsappQrUploader.tsx` & `components/staff/StorefrontConfigForm.tsx` & `app/(admin)/staff/storefront/page.tsx`: add the `"WhatsApp community group link"` field and `WhatsappQrUploader` inside `/staff/storefront`.
   - `docs/store-admin-guide/admin-tabs-guide.md`: document the WhatsApp community group link and QR code uploader under `/staff/storefront`.
4. **Seed & Aheed asset**:
   - Copy the owner-supplied QR code PNG to `prisma/seed-assets/aheed-whatsapp-qr.png`.
   - Add `prisma/seed-whatsapp-community.ts` and `scripts/seed-whatsapp-community.ts` (fill-only, matching `prisma/seed-footer.ts` and `scripts/seed-footer-defaults.ts`) and call `seedWhatsappCommunityDefaults` from `prisma/seed.ts` so Aheed's `whatsappCommunityUrl` (`https://chat.whatsapp.com/FTgLVoelRw7262i0OvAIzS`) and `whatsappCommunityQrKey` (`vendors/a4ed0000-0000-4000-a000-000000000001/whatsapp-qr.png`) are populated when `null` without overwriting later admin edits.
5. **Storefront `/whatsapp-offers` page & navigation**:
   - `app/(storefront)/whatsapp-offers/page.tsx`: render `<PageContainer width="wide" padY="tight">`, `<DepartmentScroller>`, two-column layout with `<CollectionNav activeHref="/whatsapp-offers" />`, top WhatsApp banner (when `profile.whatsappCommunityUrl` is set), `"Latest Offers & Deals"` section (live department campaigns, active bundles via `BundleRow`, offer products grouped by top-level department in `<ProductGrid>`, or friendly empty state), bottom WhatsApp CTA (when `profile.whatsappCommunityUrl` is set), and navigation back to `/categories`.
   - Update `components/layout/Header.tsx`, `components/product/CollectionNav.tsx`, `components/layout/StorefrontFooter.tsx`, `app/sitemap.ts`, `lib/page-metadata.ts`, `tests/page-container.test.ts`, and `tests/product-grid-usage.test.ts`.
