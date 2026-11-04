# Promotion management and landing page display overhaul (build notes)

Written at the end of Build, before the Clear.

## What changed and why

- **Database schema (`prisma/schema.prisma` & migration `20261104120000_promotions_overhaul`):**
  Replaced the department-bound `DepartmentCampaign` table with `Promotion`. Added support for `headline`, `subtitle`, `badgeText`, `callToActionText`, `imageKey`, `altText`, `linkUrl`, `priority`, `isActive`, `startsAt`, `endsAt`, and optional foreign keys to `Category`, `Bundle`, and `DiscountCode`, plus `AudienceSegment` enum.
- **Repository layer (`lib/repositories/promotions.ts` & `lib/promotions-service.ts`):**
  Pure functions taking `prisma` and `vendorId` explicitly, enforcing strict vendor row-level scoping (`listPromotionsForAdmin`, `getPromotionById`, `createPromotion`, `updatePromotion`, `deletePromotion`, `listLivePromotions`). Request-scoped facade in `lib/promotions-service.ts` with React `cache()`.
- **Promotion liveness (`lib/promotion-liveness.ts`):**
  Pure evaluation function `isPromotionLive(promo, now: Date)`. Backward compatibility maintained for `lib/campaign-liveness.ts` by re-exporting `isCampaignLive = isPromotionLive`.
- **Staff campaign back-office (`/staff/promotions`):**
  Replaced the department-listing page with a true promotion table listing active/scheduled/expired promotions with badges and priority values. Added `/staff/promotions/new` and `/staff/promotions/[id]` forms (`components/staff/PromotionForm.tsx`) with target selectors (Store-wide, Department, Bundle, Discount Code) and direct presigned WebP banner upload.
- **Landing page hero (`app/(landing)/page.tsx` & `<PromotionHero>`):**
  Replaced `DepartmentHero` with `<PromotionHero>`. When 1 or more live promotions exist, renders high-contrast promotional carousel displaying headlines, psychological badges, real bundle pricing, and target-aware CTAs. When 0 promotions are live, omits the promotional column completely (single-column brand value hero) without showing department icons or regular-price spotlights as fallbacks. The independent "Shop by department" scroller remains untouched.
- **Backward compatibility & test fixtures:**
  Updated `lib/repositories/campaigns.ts` to query `prisma.promotion` scoped to `categoryId`, preserving `app/(storefront)/whatsapp-offers/page.tsx` and legacy campaign tests. Updated `tests/page-container.test.ts`, `tests/category-visibility.test.ts`, and `scripts/lib/neon-migration-plan.ts`.

## Decisions taken during the build

- **Presigned banner uploads in `features/admin/promotions.ts`:**
  Reused the established `presignPut` pattern (`StorageService.presignPut`) with client-side WebP canvas conversion (`toWebp`), setting the storage key directly in the promotion record on save.
- **Unified Create and Edit Form:**
  `PromotionForm.tsx` handles both create (`/staff/promotions/new`) and edit (`/staff/promotions/[id]`) with optimistic error state feedback, dynamic contextual target dropdowns, and an explicit delete action for existing promotions.
- **Prioritised Carousel Cap:**
  `listLivePromotions` orders by `priority DESC, createdAt DESC`, and `PromotionHero` displays up to 3 live promotions to prevent cognitive overload.

## Deviations from the spec

None.

## Known-shaky areas

- None. All 386 test files (5,685 tests) pass cleanly under Vitest, ESLint passes with 0 errors/warnings, TypeScript typecheck passes with 0 errors, and Prettier check passes.
