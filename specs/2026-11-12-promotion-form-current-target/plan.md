---
id: 2026-11-12-promotion-form-current-target-plan
title: "Promotion edit page keeps its saved bundle, code or product (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-12
visibility: internal
summary: "The promotion edit page always lists the promotion's saved bundle, discount code or product, marked when switched off, so the picker never shows its placeholder for a linked promotion and a save never drops the link."
tags: [staff-panel, promotions]
related: [2026-11-12-landing-promotions-search-placeholder-plan]
---

# Promotion edit page keeps its saved bundle, code or product (plan)

Owner report, 2026-11-12, with a screenshot. On "BBQ Chicken Pack: Save £8.48" the offer type was "Product
Bundle", but the bundle picker read "-- Choose an active bundle --". The owner also asked whether the dates
were missing and wanted other gaps on the page fixed.

## Findings

- `app/(admin)/staff/promotions/[id]/page.tsx` offered only switched-on bundles and only active
  discount codes. The product list (`listEligiblePromotionalProducts`) had only products currently on offer, and the
  form's department filter could hide the chosen product too. When the saved target is filtered out,
  the controlled `<select>` has no matching option: it shows the placeholder, and a save sends an empty id. The
  BBQ Chicken Pack bundle was switched off in production until today's activation.
- **Dates.** On staging this promotion's `startsAt`/`endsAt` are null, so blank inputs are correct.
  Only "Weekend Meat Sale: 5% OFF" has dates (4–8 Nov). It is still switched on but has expired. The list
  page already labels it "Expired", and the storefront hides it.

## Scope

- `lib/promotion-target-options.ts` `keepCurrentOption`: the saved bundle or code is added back, marked
  "(switched off — turn it on in Bundles)" or "(inactive)".
- `listEligiblePromotionalProducts(prisma, vendorId, includeIds)`: the edit page passes the saved
  product id.
- The form's department filter always keeps the chosen product.
- A hint under the date fields: blank dates mean the promotion runs until switched off, and times are in the store's local time.
