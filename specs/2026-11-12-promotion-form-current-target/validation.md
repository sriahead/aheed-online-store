# Promotion edit page keeps its saved bundle, code or product (validation)

| Req | How to verify |
| --- | --- |
| R1, R2 | `tests/promotion-target-options.test.ts`: `keepCurrentOption` adds the saved option, marked, only when the filter dropped it. `listEligiblePromotionalProducts` adds `{ id: { in: [saved] } }` only when given. |
| R3 | Read in `components/staff/PromotionForm.tsx` (`filteredProducts`). |
| R4 | The hint text is present in `PromotionForm.tsx`. |
| Live | On www after deploy, open Staff → Promotions → "BBQ Chicken Pack: Save £8.48": the picker shows "BBQ Chicken Pack". |
