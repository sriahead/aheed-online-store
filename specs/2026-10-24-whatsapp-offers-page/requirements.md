# Offers & WhatsApp Promotions page (requirements / acceptance criteria)

Closes `#1233` (`Storefront: Offers & WhatsApp Promotions page (/whatsapp-offers)`). Reasoning, multi-tenant architecture decisions (`ADR-003`, `ADR-004`, `#239`), and scope are in `plan.md`.

## Schema, migration & seed

R1. `VendorConfig` in `prisma/schema.prisma` defines `whatsappCommunityUrl String?` and `whatsappCommunityQrKey String?`, and additive migration `prisma/migrations/20261024040000_vendor_whatsapp_community/migration.sql` adds both nullable `TEXT` columns to `"VendorConfig"`.

R2. `prisma/seed-assets/aheed-whatsapp-qr.png` exists as a byte-identical copy of the owner-supplied WhatsApp QR code PNG, and `prisma/seed-whatsapp-community.ts` exports `AHEED_WHATSAPP_COMMUNITY_URL = "https://chat.whatsapp.com/FTgLVoelRw7262i0OvAIzS"`, `AHEED_WHATSAPP_QR_KEY = "vendors/a4ed0000-0000-4000-a000-000000000001/whatsapp-qr.png"`, and fill-only `seedWhatsappCommunityDefaults` (wired into `prisma/seed.ts` and `scripts/seed-whatsapp-community.ts`) that writes `whatsappCommunityUrl` and `whatsappCommunityQrKey` on Aheed's `VendorConfig` only while each column is `null`.

## Form validation, repository & service layer

R3. `lib/social-contact-form.ts` exports `WHATSAPP_COMMUNITY_URL_FIELD = "whatsappCommunityUrl"` and `parseWhatsappCommunityUrl(raw, field)`. It trims whitespace, returns `{ ok: true, value: null }` on blank input, accepts `https://chat.whatsapp.com/<non-empty-invite-code>` (no query/hash required, path segment non-empty), and rejects any non-`https:` scheme, any other hostname, or a bare `https://chat.whatsapp.com/` path with `{ ok: false, error: { field, message } }`. `parseSocialContact` includes `whatsappCommunityUrl` in its parsed output.

R4. `VendorProfile` and `fetchVendorProfile` in `lib/repositories/vendor.ts` select and return `whatsappCommunityUrl: string | null` and `whatsappCommunityQrKey: string | null` (both defaulting to `null` when `config` is absent). `VendorStorefrontConfigInput` and `updateVendorStorefrontConfig` accept optional `whatsappCommunityUrl?: string | null` so forms that omit it leave the stored value untouched.

R5. `lib/repositories/vendor.ts` exports `updateVendorWhatsappQrKey(prisma, vendorId, whatsappCommunityQrKey: string | null)` and `lib/vendor-service.ts` exports `updateVendorWhatsappQrKey(vendorId, whatsappCommunityQrKey: string | null)`. Every export in `lib/repositories/vendor.ts` and `lib/repositories/products.ts` takes `prisma` and `vendorId` explicitly (`tests/repository-purity.test.ts`, `tests/repository-client-injection.test.ts`, `tests/repository-vendor-scoping.test.ts`).

R6. `lib/repositories/products.ts` exports `listOfferProducts(prisma, vendorId, take)` (and `ProductRepository` in `lib/products-service.ts` exposes `listOfferProducts(take)`), returning active products in visible categories matching `buildFilterWhere({ onOffer: true })` (either `originalPrice` not null or `priceTier` not null) alongside each product's `categoryId` and active multi-buy `tier`, decorated with `withCurrentRestock`.

R7. A pure helper `groupOfferProductsByDepartment(items, categoryTree)` in `lib/whatsapp-offers.ts` groups `OfferProductWithCategory[]` by the vendor's active top-level departments (`parentId === null`) in `categoryTree` order, mapping products in second-tier subcategories (`parentId !== null`) to their parent department, and omitting departments with zero offer products.

## Admin `/staff/storefront` & operator documentation

R8. `features/admin/storefront.ts` forwards `whatsappCommunityUrl` in `updateSocialContact`, and exports `requestWhatsappQrUpload(byteLength)`, `attachWhatsappQr(key)`, and `removeWhatsappQr()`, each gated by `requireVendorRole("ADMIN")` (`tests/admin-only-authorization.test.ts`). `attachWhatsappQr` rejects any key not matching `vendors/${auth.vendorId}/whatsapp-qr-*.webp` and verifies the uploaded object via `getStorage().headObject(key)` before writing.

R9. `components/staff/StorefrontConfigForm.tsx` renders an input with `name="whatsappCommunityUrl"` in the `"Social & contact links"` form and renders `WhatsappQrUploader` (`components/staff/WhatsappQrUploader.tsx`) so store admins can upload, replace, or remove the WhatsApp group QR code image.

R10. `docs/store-admin-guide/admin-tabs-guide.md` documents the WhatsApp community group link and QR code upload/removal in the `/staff/storefront` section, and `tests/operator-doc-coverage.test.ts` passes.

## Storefront `/whatsapp-offers` page

R11. `app/(storefront)/whatsapp-offers/page.tsx` exists, declares `export const dynamic = "force-dynamic"`, and its default export returns `<PageContainer width="wide" padY="tight">` as the first JSX element after its top-level `return (`. `tests/page-container.test.ts`'s `EXPECTED` map includes `"app/(storefront)/whatsapp-offers/page.tsx": { width: "wide", padY: "tight" }`.

R12. `lib/page-metadata.ts` exports `buildOffersMetadata({ host, vendorName })` returning `{ title: "Offers & Deals | <vendorName>", description: "Browse current offers, weekly deals, and special promotions at <vendorName>.", alternates: { canonical: "https://<host>/whatsapp-offers" } }`, and `app/(storefront)/whatsapp-offers/page.tsx`'s `generateMetadata()` uses it (degrading to `{}` when no vendor profile resolves or on error).

R13. When `profile.whatsappCommunityUrl` is non-null, `<WhatsappCommunityBanner>` (`components/layout/WhatsappCommunityBanner.tsx`) renders on both `/categories` (the Shop page) and `/whatsapp-offers` using the vendor's semantic theme tokens (`bg-primary`, `bg-action`, `hover:bg-action-hover`, `text-primary`, `text-primary-muted`) with:
     a. A WhatsApp promotions banner with heading `"Stay Updated with Our Latest Offers!"`, supporting text `"Join the <profile.name> WhatsApp group to discover special promotions, exclusive deals, fresh arrivals, and exciting savings on your favourite products."`, a button (`bg-action hover:bg-action-hover`) labelled `"Join Our WhatsApp Group"` linking to `profile.whatsappCommunityUrl` (`target="_blank" rel="noopener noreferrer"`) with the WhatsApp SVG icon (`WhatsappGlyph`), and the reassurance text `"Free to join. Leave anytime."`.
     b. When `profile.whatsappCommunityQrKey` is also non-null and `CDN_BASE_URL` is configured, a QR code `<ImageWithFallback>` whose `src` is `composePublicUrl(CDN_BASE_URL, profile.whatsappCommunityQrKey)` and whose `alt` is `"Scan to join the <profile.name> WhatsApp group"`.

R14. When `profile.whatsappCommunityUrl` is `null` (such as on SriMart), `<WhatsappCommunityBanner>` renders nothing (`#239`), and no link to `chat.whatsapp.com` appears in the rendered HTML.

R15. Below the top banner (or at the top of the main column when `whatsappCommunityUrl` is `null`), `/whatsapp-offers` renders a section with `<h2>Latest Offers &amp; Deals</h2>` containing:
     a. Any live `DepartmentCampaign` rows (`isCampaignLive(campaign, now)`), showing the campaign `headline`, optional `subtitle`, formatted validity dates (`startsAt` / `endsAt`) when present on the row, and a `"Shop Now"` link to `campaign.linkUrl ?? /categories/<department.slug>`.
     b. Active value bundles rendered via `<BundleRow title="Value Bundles" bundles={bundles} cdnBaseUrl={CDN_BASE_URL ?? ""} viewAllLink="/bundles" />`.
     c. Each department group from `groupOfferProductsByDepartment` rendered with its department `<h3>` heading, a `"Shop Now"` link to `/categories/<department.slug>`, and `<ProductGrid as="ul" density={gridDensity}>` of `<ProductCard>` items. `tests/product-grid-usage.test.ts` includes `"app/(storefront)/whatsapp-offers/page.tsx"` in `LISTING_PAGES`.
     d. When the vendor has zero offer products, zero renderable bundles, and zero live campaigns, a friendly empty state message with a link to `/categories` (and a `"Join Our WhatsApp Group"` button when `profile.whatsappCommunityUrl` is non-null).

## Contact channels, sitemap & guards

R16. `lib/contact-channels.ts` accepts optional `whatsappCommunityUrl?: string | null` and emits `{ kind: "whatsapp-community", href: whatsappCommunityUrl, label: "Join <vendorName> WhatsApp group" }` (rendered with `WhatsappGlyph` in `components/layout/contact-channel-icons.tsx`) in both `FloatingContact` (`StorefrontChrome.tsx`) and `FooterContactChannels` (`StorefrontFooter.tsx` under `"Visit & contact us"`), even when `assistantAvailable` is `true`. No separate `"Offers"` link is rendered in `Header.tsx`, `CollectionNav.tsx`, or `StorefrontFooter.tsx`'s `"Shop with us"` column.

R17. `app/sitemap.ts`'s `STATIC_PATHS` includes `"/whatsapp-offers"`, and `tests/sitemap.test.ts` passes.

R18. `tests/vendor-neutral-copy.test.ts` and `tests/icon-imports.test.ts` pass with zero allowlist additions.

R19. `CHANGELOG.md` updated under `[Unreleased]` referencing `#1233` and `specs/2026-10-24-whatsapp-offers-page/` (Gate 4).

R20. `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4`, `npm run format:check`, and `npm run kms:validate` all exit 0 (Gate 3).
