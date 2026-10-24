# Offers & WhatsApp Promotions page (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Before you start

1. **Database environment safety (`CLAUDE.md`)**: Check `DIRECT_URL` and `DATABASE_URL` one at a time (`if printenv "$v" >/dev/null 2>&1`). If either is set in the shell environment to a non-dev host, prefix every Node/Prisma command with `env -u DIRECT_URL -u DATABASE_URL`. Print the hostname only, never the connection string.
2. **Apply migration & seed**:
   - Run `npx prisma migrate deploy` and `npm run db:generate` against the dev database.
   - Run `npx tsx scripts/seed-whatsapp-community.ts` to populate Aheed's `whatsappCommunityUrl` and `whatsappCommunityQrKey` (fill-only).
3. **Preview server**:
   - Build and start the Cloudflare Worker preview server (`npm run build && npm run preview`) on `http://localhost:8787` (and `http://srimart.localhost:8787` for SriMart). Stop the full `node`/`workerd` process tree when done before running another build.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Integration  | Inspect `prisma/schema.prisma` (`model VendorConfig`) and `prisma/migrations/20261024040000_vendor_whatsapp_community/migration.sql` for `whatsappCommunityUrl` and `whatsappCommunityQrKey`; run `npx prisma migrate status` against dev DB and confirm schema is up to date. |
| R2  | Integration  | Compare SHA-256 of `prisma/seed-assets/aheed-whatsapp-qr.png` against the owner-supplied PNG; run `npx tsx scripts/seed-whatsapp-community.ts` twice and verify the second run is a fill-only no-op. |
| R3  | Unit         | `npx vitest run --maxWorkers=4 tests/social-contact-form.test.ts` exits 0, covering valid `https://chat.whatsapp.com/...` URLs, blank -> `null`, and rejections for `http://`, `javascript:`, wrong host, and empty invite path. |
| R4  | Unit         | `npx vitest run --maxWorkers=4 tests/vendor-profile.test.ts` exits 0, asserting `fetchVendorProfile` maps `whatsappCommunityUrl` and `whatsappCommunityQrKey` and defaults both to `null` when `config` is null. |
| R5  | Integration  | `npx vitest run --maxWorkers=4 tests/repository-purity.test.ts tests/repository-client-injection.test.ts tests/repository-vendor-scoping.test.ts` exits 0. |
| R6  | Unit         | `npx vitest run --maxWorkers=4 tests/whatsapp-offers.test.tsx` exits 0, asserting `listOfferProducts` composes `buildFilterWhere({ onOffer: true })` with `visibleCategoryWhere`, selects `categoryId`, and attaches active price tiers. |
| R7  | Unit         | `npx vitest run --maxWorkers=4 tests/whatsapp-offers.test.tsx` exits 0, asserting `groupOfferProductsByDepartment` maps both direct department products and subcategory products to their top-level department in `categoryTree` order and omits empty departments. |
| R8  | Unit & Security | `npx vitest run --maxWorkers=4 tests/admin-only-authorization.test.ts` exits 0, confirming `STAFF` is denied on `requestWhatsappQrUpload`, `attachWhatsappQr`, and `removeWhatsappQr`, and cross-vendor keys are rejected. |
| R9  | Integration  | Inspect `components/staff/StorefrontConfigForm.tsx` and `components/staff/WhatsappQrUploader.tsx`; under `npm run preview`, sign in as `demo-store-admin@example.com` and verify `/staff/storefront` renders the `"WhatsApp community group link"` input and `"WhatsApp Group QR Code"` uploader. |
| R10 | Integration  | `npx vitest run --maxWorkers=4 tests/operator-doc-coverage.test.ts` exits 0, and `grep -n "WhatsApp" docs/store-admin-guide/admin-tabs-guide.md` shows the new community group link and QR code documentation. |
| R11 | Integration  | `npx vitest run --maxWorkers=4 tests/page-container.test.ts` exits 0 with `"app/(storefront)/whatsapp-offers/page.tsx": { width: "wide", padY: "tight" }`. |
| R12 | Unit & E2E   | `npx vitest run --maxWorkers=4 tests/page-metadata.test.ts` exits 0 for `buildOffersMetadata`; under `npm run preview`, `curl -s http://localhost:8787/whatsapp-offers \| grep -o '<title>[^<]*</title>'` prints `<title>Offers &amp; Deals \| Aheed Food Centre</title>`. |
| R13 | Unit & E2E   | `npx vitest run --maxWorkers=4 tests/whatsapp-offers.test.tsx` exits 0; under `npm run preview`, `curl -s http://localhost:8787/whatsapp-offers` contains `Stay Updated with Our Latest Offers!`, `Join Our WhatsApp Group`, `Free to join. Leave anytime.`, `https://chat.whatsapp.com/FTgLVoelRw7262i0OvAIzS`, and `whatsapp-qr.png`. |
| R14 | Unit & E2E   | `npx vitest run --maxWorkers=4 tests/whatsapp-offers.test.tsx` exits 0; under `npm run preview`, `curl -s http://srimart.localhost:8787/whatsapp-offers \| grep -c 'chat.whatsapp.com'` prints `0`, while `<title>Offers &amp; Deals \| SriMart</title>` and `Latest Offers &amp; Deals` are present. |
| R15 | Unit & E2E   | `npx vitest run --maxWorkers=4 tests/product-grid-usage.test.ts tests/whatsapp-offers.test.tsx` exits 0; under `npm run preview`, `/whatsapp-offers` on localhost renders `Latest Offers &amp; Deals`, `Value Bundles`, department headings with `/categories/<slug>` links, and offer product cards. |
| R16 | Integration & E2E | Under `npm run preview`, `curl -s http://localhost:8787/categories` contains `href="/whatsapp-offers"` in the header (`Offers`), `CollectionNav` (`Offers &amp; Deals`), and footer (`Offers &amp; deals`). |
| R17 | Unit         | `npx vitest run --maxWorkers=4 tests/sitemap.test.ts` exits 0, asserting `https://aheed.example/whatsapp-offers` is in the generated sitemap. |
| R18 | Security & Accessibility | `npx vitest run --maxWorkers=4 tests/vendor-neutral-copy.test.ts tests/icon-imports.test.ts` exits 0, and `git diff origin/staging -- tests/vendor-neutral-copy.test.ts` is empty. |
| R19 | Acceptance   | `git diff origin/staging -- CHANGELOG.md` shows the `[Unreleased]` entry referencing `#1233` and `specs/2026-10-24-whatsapp-offers-page/`. |
| R20 | Release      | `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4`, `npm run format:check`, and `npm run kms:validate` all exit 0. |
