# Offers & WhatsApp Promotions page (build notes)

Closes `#1233` (`Storefront: Offers & WhatsApp Promotions page (/whatsapp-offers)`).

## What changed and why

1. **Multi-tenant schema & migration (`R1`)**:
   - Added nullable `whatsappCommunityUrl String?` and `whatsappCommunityQrKey String?` to `VendorConfig` in `prisma/schema.prisma`, with hand-authored additive migration `prisma/migrations/20261024040000_vendor_whatsapp_community/migration.sql`.
   - Deployed migration to the Neon development database (`ep-dry-morning-zab7dx08.c-2.eu-west-2.aws.neon.tech`) and regenerated the Prisma client (`npm run db:generate`).

2. **Owner-supplied QR code & fill-only seed (`R2`)**:
   - Copied the owner-supplied Aheed WhatsApp group QR PNG to `prisma/seed-assets/aheed-whatsapp-qr.png` (verified SHA-256 `25AE82034E079D88ADF2CAF8A9B1BED2FE968C9C8DE0C33DC6A63265DAF0C6C5`).
   - Created `prisma/seed-whatsapp-community.ts` and `scripts/seed-whatsapp-community.ts` (and wired into `prisma/seed.ts`) to upload the PNG to `vendors/a4ed0000-0000-4000-a000-000000000001/whatsapp-qr.png` in R2 and populate Aheed's `whatsappCommunityUrl` (`https://chat.whatsapp.com/FTgLVoelRw7262i0OvAIzS`) and `whatsappCommunityQrKey` only while each column is `null`.

3. **Validation, repository, service & `/staff/storefront` admin controls (`R3`–`R10`)**:
   - Added `WHATSAPP_COMMUNITY_URL_FIELD` and `parseWhatsappCommunityUrl` in `lib/social-contact-form.ts` (validating `https://chat.whatsapp.com/<invite-code>` or blank -> `null`) and extended `parseSocialContact`.
   - Extended `VendorProfile`, `fetchVendorProfile`, `VendorStorefrontConfigInput`, and `updateVendorStorefrontConfig` in `lib/repositories/vendor.ts`, and added `updateVendorWhatsappQrKey` in `lib/repositories/vendor.ts` and `lib/vendor-service.ts`.
   - Extended `features/admin/storefront.ts` (`updateSocialContact`, `requestWhatsappQrUpload`, `attachWhatsappQr`, `removeWhatsappQr`), added `components/staff/WhatsappQrUploader.tsx`, wired both controls into `components/staff/StorefrontConfigForm.tsx` and `app/(admin)/staff/storefront/page.tsx`, and documented them in `docs/store-admin-guide/admin-tabs-guide.md`.

4. **Offer product query, department grouping & `/whatsapp-offers` storefront page (`R6`, `R7`, `R11`–`R18`)**:
   - Added `listOfferProducts(prisma, vendorId, take)` in `lib/repositories/products.ts` (exposed on `ProductRepository` in `lib/products-service.ts`) and pure `groupOfferProductsByDepartment(items, categoryTree)` in `lib/whatsapp-offers.ts`.
   - Added `buildOffersMetadata({ host, vendorName })` in `lib/page-metadata.ts`.
   - Created `app/(storefront)/whatsapp-offers/page.tsx` with `WhatsappOffersView`, rendering the top WhatsApp community banner and QR code card (when configured), live `DepartmentCampaign`s (with validity dates), active `Bundle`s (`BundleRow`), department-grouped offer products (`ProductGrid` + `ProductCard`), a friendly empty state when no offers exist, and a secondary bottom WhatsApp CTA (when configured).
   - Added navigation links in `components/layout/Header.tsx` (`Offers`), `components/product/CollectionNav.tsx` (`Offers & Deals`), `components/layout/StorefrontFooter.tsx` (`Offers & deals`), and added `"/whatsapp-offers"` to `STATIC_PATHS` in `app/sitemap.ts`.
   - Updated guard registries in `tests/page-container.test.ts`, `tests/product-grid-usage.test.ts`, and `tests/sitemap.test.ts`, and added unit tests in `tests/whatsapp-offers.test.tsx`, `tests/social-contact-form.test.ts`, `tests/vendor-profile.test.ts`, `tests/page-metadata.test.ts`, and `tests/admin-only-authorization.test.ts`.

## Decisions taken during the build

- **Exporting `WhatsappOffersView` and `formatCampaignValidity` from `app/(storefront)/whatsapp-offers/page.tsx`**: Keeping the JSX directly in `app/(storefront)/whatsapp-offers/page.tsx` satisfies both `tests/page-container.test.ts` (which inspects the top-level returned `<PageContainer width="wide" padY="tight">`) and `tests/product-grid-usage.test.ts` (which asserts `<ProductGrid` appears in the page file and no `grid-cols-` class is used), while exporting `WhatsappOffersView` lets `tests/whatsapp-offers.test.tsx` render every multi-tenant branch (`whatsappCommunityUrl` present vs `null`, `qrImageUrl` present vs `null`, live campaigns, and empty state) via `renderToStaticMarkup` with zero DB/request mocking.
- **Flex layout for campaign cards**: Because `tests/product-grid-usage.test.ts` forbids any `grid-cols-` class in listing page files, the Special Promotions campaign cards use `flex flex-wrap gap-4` with `min-w-[280px] flex-1`.

## Deviations from the spec

- None.

## Known-shaky areas

- None identified. Both `whatsappCommunityUrl` and `whatsappCommunityQrKey` degrade cleanly to `null` when unset (`#239`), and `generateMetadata()` catches any failure and returns `{}` so the route inherits layout metadata rather than throwing 500.
