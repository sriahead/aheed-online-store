# One-click "Buy This Offer" — requirements

Issue `#1517`. Narrative: `plan.md`.

## Pricing

R1. `bundleTotalPence` prices every available constituent with `tieredLineTotalPence(basePrice,
    quantity, tier)` from `lib/tier-pricing.ts`; with no tier, or a quantity below the tier's group,
    a line is `basePrice × quantity` exactly as before.
R2. `bundleRegularPence` is the same sum at base price; `bundleSavingPence` is the difference and is
    never negative.
R3. The bundle repository selects each constituent product's `priceTier` (`groupQuantity`,
    `groupPricePence`, `isActive`) and passes it as the item's `tier`.

## Bundle page and card

R4. `/bundles/[slug]` shows the vendor's active bundle with that slug, through the same `BundleCard`.
    A slug that is unknown, inactive, belongs to another vendor, or has no available constituent
    renders the not-found page.
R5. `BundleCard` shows the tiered total. When the saving is above zero it also shows the normal total
    struck through and "Save £X", and the button reads "Buy this offer"; otherwise the button keeps
    "Add all N to basket". The bundle name links to `/bundles/<slug>` everywhere except on that page.
R6. "Buy this offer" is the existing `addBundleToCart` form: one POST adds every available
    constituent at its quantity, with no JavaScript needed.

## Promotions

R7. A promotion linked to a bundle and with no `linkUrl` links to `/bundles/<slug>` and, with no
    `callToActionText`, is labelled "Buy This Offer". The price it shows is computed with the same
    tier-aware function as the card.

## Data (Aheed, staging first)

R8. A loader creates, by slug and idempotently, one bundle per multi-buy product at its group
    quantity, plus combined packs of related offer products named in the price list file; each
    bundle and each linked promotion is created inactive.
R9. An `Offer Type` vendor attribute (LIST) with options `Multi-Buy` and `Box Offer` is created and set
    on the corresponding products, so the existing vendor-filter chips can filter by it.
R10. Re-running the loader changes nothing.
