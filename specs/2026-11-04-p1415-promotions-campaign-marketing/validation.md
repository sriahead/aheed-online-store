# Promotions: Marketing Campaign Management, Eligible Offer Items & AI Generation (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Verify each requirement thoroughly with focused tests and live preview verification. Avoid duplicate tests across layers.

---

## Validation Matrix

| Req | Testing Area | How to verify |
| :--- | :--- | :--- |
| **R1** | Schema | `npx prisma validate` exits 0 with `productId` on `Promotion` and `PromotionChannel` enum. |
| **R2** | Migration | Hand-authored migration in `prisma/migrations/` applies cleanly and passes migration status checks. |
| **R3** | Unit / Architecture | Unit test confirms `lib/repositories/promotions.ts` does not contain pricing or discount calculation algorithms, maintaining clean separation of concerns. |
| **R4** | Repository / Filter | Unit test for `listEligiblePromotionalProducts` confirms only products with `originalPrice > basePrice`, active `priceTier`, or `isFeatured: true` are returned. Products with regular pricing are omitted. |
| **R5** | Component / UI | In `PromotionForm`, selecting a department filters the promotional product list to items in that category and child subcategories; selecting store-wide shows all eligible promotional products. |
| **R6** | UI | Product dropdown options render the formatted promotional context (e.g., Was £X.XX / Now £Y.YY / Multi-buy: 3 for £10.00). |
| **R7** | UI / A11y | Department selector renders `<optgroup>` elements structured by `toCategoryOptionGroups` with accessible labels. |
| **R8** | Integration | Saving a promotion with the blank department option sets `categoryId: null`. |
| **R9** | Unit | `resolveApplicablePromotionForCart` prioritizes active live promotions by `priority DESC` and verifies category/store-wide matching. |
| **R10**| Integration | Loading `/checkout` with a qualifying cart automatically resolves and applies the active promotion's discount code into `initialDiscountCode`. |
| **R11**| UI | Checkout displays a banner notifying the shopper that a promotion was automatically applied. |
| **R12**| UI Layout | In `PromotionForm.tsx`, the DOM order places Promotional Messaging after Scheduling & Prioritisation. |
| **R13**| API Security | `POST /api/admin/promotions/ai-generate` returns 401 without auth, 403 for non-admin roles, and 429 when AI budget is exhausted. |
| **R14**| Unit / AI | `generatePromotionAiContent` prompt incorporates behavioural economics, cognitive biases, pricing psychology, and neuromarketing instructions, returning structured JSON copy and image key. |
| **R15**| UI / Copy | The explanatory callout note citing consumer psychology and neuromarketing appears above the AI generation button. |
| **All**| System | `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npx vitest run --maxWorkers=4` all pass with zero errors. |
