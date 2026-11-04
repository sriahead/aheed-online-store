# Build Notes — Promotions: Campaign Management, Eligible Offer Items & AI Generation (#1415)

## 1. What Changed

### A. Separation of Offer Configuration from Marketing Campaigns
- Established the boundary: commercial pricing, was-price markdowns, multi-buy tiers, bundles, and discount vouchers are maintained in their respective operational modules (`/staff/products`, `/staff/bundles`, `/staff/discounts`).
- Promotions module acts as the marketing and campaign management layer, referencing existing offer items by foreign key without duplicating pricing or discount algorithms.

### B. Promotional Product Eligibility Filtering
- In `lib/repositories/promotions.ts`, added `listEligiblePromotionalProducts(prisma, vendorId)`.
- It queries and returns only products that have active promotional content:
  - Was-price markdown (`originalPrice !== null && originalPrice > basePrice`)
  - Active multi-buy offer (`priceTier !== null`)
  - Featured on homepage (`isFeatured === true`)
- Standard regular-price products with no promotional content are excluded.
- The UI picker displays formatted context beside each product:
  - `Product Name — Was £X.XX, Now £Y.YY (Save £Z.ZZ)`
  - `Product Name — Multi-buy: N for £X.XX`
  - `Product Name — Featured on homepage`

### C. Department & Sub-Department Scoping
- In `PromotionForm.tsx`, integrated `toCategoryOptionGroups(categories)`.
- Administrators can optionally select a department or sub-department to scope the promotion.
- Unselected (`""`) applies Store-wide (`categoryId: null`).
- Selecting a category dynamically filters the eligible promotional products to that department or its child sub-departments.

### D. Form Layout Reordering
- Reordered form sections in `PromotionForm.tsx`:
  1. Offer & Scope Selection
  2. Scheduling & Prioritisation
  3. Promotional Messaging (Headline, Subtitle, Badge, CTA)
  4. Banner Photo & Creative Media

### E. Checkout Auto-Application
- Added `lib/promotions-checkout.ts` and `lib/promotions-checkout-service.ts`:
  - `resolveAutoPromotionAtCheckout(prisma, vendorId, cartProductIds)` evaluates live active promotions for the vendor ordered by `priority DESC`.
  - Automatically matches store-wide promotions, product-specific promotions, or department-scoped promotions when qualifying products exist in the cart.
  - Automatically pre-fills and applies the promotion's discount code into checkout summary and pricing provider without requiring manual code entry.
  - In `app/(storefront)/checkout/page.tsx`, renders a confirmation status banner when a promotion is auto-applied.

### F. Psychology-Led AI Content & Banner Generation
- Created `lib/promotions-ai.ts`, `lib/promotions-ai-service.ts`, and endpoint `POST /api/admin/promotions/ai-generate`.
- Uses Workers AI text completion (`@cf/meta/llama-3.1-8b-instruct`) with prompt engineering covering:
  - Behavioural Economics (loss aversion, framing, price anchoring)
  - Cognitive Biases (social proof, default effect, decision fatigue reduction)
  - Pricing Psychology (transparent savings, multibuy value)
  - Neuromarketing (sensory, emotive language and high-contrast visual prompts)
- Uses Workers AI Flux (`@cf/black-forest-labs/flux-1-schnell`) to generate hero banner imagery, saving to S3 at `promotions/<vendorId>/<uuid>.png`.
- Displays prominent explanatory callout note in `PromotionForm.tsx` detailing these consumer psychology disciplines.

### G. Multi-Channel Publishing Architecture
- Added `PromotionChannel` enum (`WEBSITE`, `WHATSAPP`, `FACEBOOK`, `INSTAGRAM`) to `prisma/schema.prisma` and hand-authored migration `20261104140000_promotions_campaign_marketing/migration.sql`.
- Added `channel` field on `Promotion`, defaulting to `WEBSITE`.
- Added `productId` foreign key to `Promotion` with index `[vendorId, productId]`.

---

## 2. Key Decisions & Deviations
- Maintained clean repository purity: API route and checkout page do not touch `getPrisma()` or `@prisma/client`, querying strictly through service wrappers (`lib/promotions-service.ts`, `lib/promotions-checkout-service.ts`, `lib/promotions-ai-service.ts`).
- Semantic design token compliance: Replaced `text-primary/80` with semantic token `text-primary-muted` to ensure 4.5:1 contrast floor.

---

## 3. Test Coverage & Validation
- Unit tests:
  - `tests/promotions-repository.test.ts`: Eligible promotional product query and filters.
  - `tests/promotion-form.test.ts`: Target type validation, product association, channel parsing, and date bounds.
  - `tests/promotions-ai.test.ts`: Prompt framing across 4 consumer psychology disciplines, JSON response parsing.
  - `tests/promotions-checkout.test.ts`: Store-wide, department-scoped, and product-specific auto-application matching at checkout.
  - `tests/token-alpha-purity.test.ts`: Passed with zero violations.
- System checks:
  - `typecheck` passed (`tsc --noEmit`).
  - `lint` passed (`eslint .`).
  - `format:check` passed (`prettier --check .`).
  - `build` passed (`next build --webpack`).
