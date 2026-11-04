# Promotion Intelligence Platform & Storefront Experience (requirements / acceptance criteria)

Closes #1412. Builds on ADR-004 (multi-tenancy) and supersedes the department-only hero campaign model from P8.5e. Upgrades the promotion system into a customer-focused, psychology-led platform that boosts conversion, maintains pricing integrity, and supports phased customer segmentation and analytics.

---

## Phase V1 — Core Promotions, Pricing Integrity & Psychology-Led UX (Priority: High / Current Scope)

### Data Model & Migrations
R1. [Priority: High] The `Promotion` model exists in `prisma/schema.prisma` with `id`, `vendorId` (mandatory), `headline`, optional `subtitle`, optional `badgeText`, optional `callToActionText`, optional `imageKey`, optional `altText`, optional `linkUrl`, `priority` (Int, default 0), `isActive` (boolean, default true), optional `startsAt` (DateTime), optional `endsAt` (DateTime), optional `categoryId` (FK to `Category`), optional `bundleId` (FK to `Bundle`), optional `discountCodeId` (FK to `DiscountCode`), optional `audienceSegment` (Enum: `ALL`, `NEW_CUSTOMER`, `RETURNING_CUSTOMER`, `LOYALTY_MEMBER`, default `ALL`), `createdAt`, and `updatedAt`.
R2. [Priority: High] A hand-authored migration in `prisma/migrations/` creates the `"Promotion"` table with explicit foreign keys and `@@index([vendorId, isActive, priority])`, migrating any existing `"DepartmentCampaign"` rows or dropping `"DepartmentCampaign"`, and `npx prisma validate` exits 0.

### Repository & Business Logic
R3. [Priority: High] `lib/repositories/promotions.ts` exports pure functions `listPromotionsForAdmin`, `getPromotionById`, `createPromotion`, `updatePromotion`, `deletePromotion`, and `listLivePromotions` that take `prisma` and `vendorId` explicitly, enforce vendor row-level scoping, and pass `tests/repository-purity.test.ts`.
R4. [Priority: High] `lib/promotions-service.ts` exports request-scoped wrappers for `listPromotionsForAdmin`, `getPromotionById`, and `listLivePromotions` that resolve `vendorId` via `getCurrentVendorId()`.
R5. [Priority: High] `lib/promotion-liveness.ts` exports `isPromotionLive(promo, now: Date): boolean`, returning true if and only if `promo.isActive === true`, `promo.startsAt === null || promo.startsAt <= now`, and `promo.endsAt === null || promo.endsAt >= now`.
R6. [Priority: High] `features/admin/promotions.ts` exports server actions `savePromotion` and `deletePromotion` that validate input with Zod, enforce `requireVendorRole("STAFF", "ADMIN")`, validate that referenced categories, bundles, or discount codes belong to the caller's `vendorId`, and return typed action results.

### Staff Management UI (/staff/promotions)
R7. [Priority: High] `/staff/promotions` renders a list of the vendor's promotions displaying headline, target type (`Store-wide`, `Department`, `Bundle`, `Discount Code`), priority value, status badge (`Live`, `Scheduled`, `Inactive`, or `Expired`), and an action to create a new promotion.
R8. [Priority: High] `/staff/promotions/new` and `/staff/promotions/[id]` provide a form allowing staff to create and edit promotions with headline, optional subtitle, optional badge text, optional custom CTA text, target type selection, priority rank, banner image upload via presigned URL, active toggle, and optional start/end datetimes.
R9. [Priority: High] The promotion edit form's target selector allows choosing between "Store-wide / Generic", "Department", "Bundle", and "Discount Code", dynamically offering dropdown lists containing only the vendor's active departments, active bundles, and active discount codes.
R10. [Priority: High] When "Store-wide / Generic" is selected, the promotion saves with `categoryId: null`, `bundleId: null`, and `discountCodeId: null`.

### Storefront Landing Display & Neuromarketing Experience
R11. [Priority: High] The storefront landing page (`app/(landing)/page.tsx`) queries live promotions for the active vendor using `listLivePromotions`. When one or more live promotions exist, it renders `<PromotionHero>` in the hero layout.
R12. [Priority: High] When zero live promotions exist for the vendor, `app/(landing)/page.tsx` omits `<PromotionHero>` entirely, rendering the hero section in single-column format without displaying department icons, department glyphs, or regular-price product spotlights as fallbacks.
R13. [Priority: High] The "Shop by department" scroller on `app/(landing)/page.tsx` renders top-level categories independently below the hero section regardless of promotion status.
R14. [Priority: High] Existing bundle pricing calculations, discount-code validation, and cart/checkout procedures are preserved without modification.

### Behavioural Economics & Pricing Integrity
R17. [Priority: High] Intelligent Prioritisation: `listLivePromotions` orders active promotions by `priority DESC, createdAt DESC`, and `<PromotionHero>` caps the carousel to a maximum of 3 concurrent slides to prevent choice overload and decision paralysis.
R18. [Priority: High] Neuromarketing Visual Hierarchy: `<PromotionHero>` renders prominent badge chips (`badgeText`) when configured (e.g. *"Weekend Deal"*, *"Customer Favourite"*), adaptive brand tonal backgrounds (`bg-primary`, `bg-action`, `bg-accent`), and distinct call-to-action buttons (`callToActionText`).
R19. [Priority: High] Pricing Psychology & Anchoring: When a promotion is linked to a `Bundle`, the card calculates and renders the bundle's live price from its constituent products; when linked to a `DiscountCode`, it displays the code string and minimum spend threshold (e.g. *"Use code: SAVE10 on orders over £30"*).
R20. [Priority: High] Target-Aware Destination Routing: Clicking a promotion's CTA button automatically routes to the appropriate destination (department page `/categories/[slug]`, bundle view, or custom `linkUrl`), defaulting to `/categories` if no destination is configured.
R21. [Priority: High] Ethical Marketing & Transparent Urgency: When `endsAt` is populated, `<PromotionHero>` displays a human-readable end date (e.g. *"Ends Sunday"*) without artificial countdown timers or deceptive scarcity claims.
R22. [Priority: Medium] Form Validation & Scheduling Guardrails: The promotion form enforces that `headline` is between 3 and 100 characters, and validates that `startsAt` is strictly before `endsAt` when both dates are provided.

---

## Phase V2 — Customer Segmentation & Campaign Analytics (Priority: Medium / Next Milestone)

R23. [Priority: Medium] Audience Segmentation Rules: In Phase V2, `lib/promotions-service.ts` evaluates the active shopper's status against `audienceSegment` (`ALL`, `NEW_CUSTOMER`, `RETURNING_CUSTOMER`, `LOYALTY_MEMBER`), ensuring targeted promotions surface only to eligible visitors.
R24. [Priority: Medium] Privacy-First Event Telemetry: Lightweight server-side incrementing of promotional impressions and clicks without third-party tracking scripts or PII, fully adhering to UK GDPR and PECR.
R25. [Priority: Medium] Staff Performance Analytics: `/staff/promotions` surfaces impression counts, click-through rates (CTR), and attributed orders per promotion.

---

## Phase V3 — A/B Testing & Conversion Optimisation (Priority: Low / Future Scaling)

R26. [Priority: Low] Creative Split Testing: `PromotionVariant` model allows authoring alternative headlines, subtitles, and imagery for a single promotion campaign.
R27. [Priority: Low] Deterministic Traffic Allocation: Storefront deterministically partitions shoppers into Variant A or Variant B based on visitor session hash to prevent creative flickering across page reloads.
R28. [Priority: Low] Statistical Significance Reporting: Staff back-office calculates and highlights conversion rate differences between variants with confidence metrics.

---

## Quality Gates & Verification

R29. [Priority: High] `CHANGELOG.md` updated with entry for issue #1412 (Gate 4).
R30. [Priority: High] `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npx vitest run --maxWorkers=4` all exit 0 (Gate 3).
