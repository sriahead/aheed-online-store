# Promotions: Marketing Campaign Management, Eligible Offer Items & AI Generation (requirements)

Closes #1415. Follows the initial promotions overhaul (#1412). Establishes separation between offer configuration and campaign management, filters eligible promotional items, supports department scoping, checkout auto-application, psychology-led AI generation, and multi-channel readiness.

---

## Data Model & Schema

R1. [Priority: High] The `Promotion` model in `prisma/schema.prisma` includes:
   - `productId String?` with relation to `Product` (`onDelete: SetNull`).
   - `channel PromotionChannel @default(WEBSITE)` where `PromotionChannel` enum contains `WEBSITE`, `WHATSAPP`, `FACEBOOK`, `INSTAGRAM`.
   - Index on `[vendorId, productId]`.
R2. [Priority: High] A hand-authored migration in `prisma/migrations/` adds the `productId` column, `PromotionChannel` enum, and foreign key / index, passing `npx prisma validate`.

---

## Offer Separation & Item Eligibility

R3. [Priority: High] Offer configuration (pricing, multi-buy tiers, discounts) remains exclusively in their respective modules (`/staff/products`, `/staff/bundles`, `/staff/discounts`). The Promotions module only references existing active items.
R4. [Priority: High] When "Product" is selected as the offer type in `PromotionForm`, the product picker displays **only eligible promotional products** (products having an active Was-price markdown `originalPrice > basePrice`, an active multi-buy tier `priceTier.isActive`, or `isFeatured: true`). Products with standard pricing and no promotional settings are excluded.
R5. [Priority: High] When a department or sub-department is selected, the product picker dynamically filters eligible products to that category or its child categories. When unselected (Store-wide), all eligible promotional products in the store are displayed.
R6. [Priority: High] Product picker options display clear promotional context beside the product name (e.g., `Product Name — Was £X.XX, Now £Y.YY (Save £Z.ZZ)` or `Product Name — Multi-buy: 3 for £10.00`).

---

## Department & Sub-Department Scoping

R7. [Priority: High] The promotion form's department selector uses the existing `toCategoryOptionGroups` component pattern, rendering optgroups for top-level departments with nested sub-departments.
R8. [Priority: High] Selecting the blank option (`""`) designates the promotion as Store-wide, persisting `categoryId: null`.

---

## Checkout Auto-Application

R9. [Priority: High] At storefront checkout (`app/(storefront)/checkout/page.tsx`), the server evaluates active live promotions for the current vendor ordered by `priority DESC`.
R10. [Priority: High] If an active promotion carries a discount code and matches the cart criteria (store-wide or containing items from the promotion's department), the discount code is automatically applied and prefilled at checkout without requiring manual entry by the shopper.
R11. [Priority: Medium] Checkout displays a clear confirmation badge when a promotion has been automatically applied.

---

## Form Layout & Psychology-Led AI Generation

R12. [Priority: High] In `PromotionForm.tsx`, the **Promotional Messaging** section appears strictly after **Scheduling & Prioritisation**.
R13. [Priority: High] `POST /api/admin/promotions/ai-generate` is protected by `requireVendorRole("ADMIN")` and daily AI budget checks. It accepts the selected offer type, item details, target department, and audience segment.
R14. [Priority: High] The AI generation endpoint produces:
   - Engaging promotional copy (`headline`, `subtitle`, `badgeText`, `callToActionText`, `altText`) engineered with Behavioural Economics (loss aversion, framing), Cognitive Biases (social proof), Pricing Psychology (transparent savings), and Neuromarketing (emotive, action-oriented language).
   - High-contrast banner image saved to relative S3 storage (`promotions/<vendorId>/<uuid>.png`).
R15. [Priority: High] An explanatory callout note is prominently displayed above the AI generation option in the UI, informing staff of the applied behavioural economics and neuromarketing principles.
