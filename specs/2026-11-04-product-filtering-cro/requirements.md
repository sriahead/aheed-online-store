# Product Filtering Component CRO & UX Improvements (Requirements / Acceptance Criteria)

Issue `#1424`. Implementation specification for product filtering enhancements across `/categories/[slug]` and `/search`.

## Phase 1: Storefront Sorting (CRO Core)

R1. **Sort Options Definition:**
    - `lib/repositories/products.ts` exports `type ProductSortOption = "newest" | "relevance" | "price_asc" | "price_desc" | "unit_price_asc" | "rating_desc"`.
    - `parseSortOption(value: unknown, defaultSort: ProductSortOption): ProductSortOption` validates input against known options and falls back to `defaultSort` when omitted or invalid.

R2. **Repository Integration:**
    - `ProductFilters` accepts `sort?: ProductSortOption`.
    - In `findPage()`:
      - `"newest"` (default browse): `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`.
      - `"price_asc"`: `orderBy: [{ basePrice: "asc" }, { id: "asc" }]`.
      - `"price_desc"`: `orderBy: [{ basePrice: "desc" }, { id: "desc" }]`.
      - `"unit_price_asc"`: `orderBy: [{ unitPricePencePerBaseUnit: "asc" }, { basePrice: "asc" }, { id: "asc" }]`.
      - `"rating_desc"`: `orderBy: [{ averageRating: "desc" }, { reviewCount: "desc" }, { id: "desc" }]`.
    - In `searchProducts()`:
      - If `sort` is `"relevance"` or undefined: uses `rankSearchCandidates` (relevance ranking).
      - If `sort` is any other option: sorts candidate items in memory using the chosen criterion.

R3. **URL & Navigation Preservation:**
    - `sort` parameter travels in the query string (`?sort=price_asc`).
    - Carried in `nextCategoryPageHref`, `prevCategoryPageHref`, `searchPageHref`, and `categoryFilterHref`.
    - Preserved when individual filter chips are removed in `activeFilterChips` and on "Clear all" in `clearAllHref`.
    - Omitted from `activeFilterChips` so sort order never renders as a removable filter chip.

R4. **Sort Control UI (`ProductSortSelect.tsx`):**
    - Rendered above the product grid on both `/categories/[slug]` and `/search`.
    - Implemented as a `<form method="GET">` with an accessible `<select name="sort">` carrying hidden inputs for all active query/filter parameters.
    - Fully operational with JavaScript disabled (via native submit / change).

## Phase 2: Quick Filter Rail & Price Presets (Behavioural Economics)

R5. **Quick Filters Rail (`QuickFiltersRail.tsx`):**
    - Sits directly below category heading / above products on mobile and desktop.
    - Displays 1-tap toggle pills for primary high-intent facets when available in context:
      - *On Offer* (`onOffer=1`)
      - *In Stock* (`inStock=1`)
      - *Halal* (`isHalal=1`)
      - *Fresh* (`isFresh=1`)
      - *Organic* (`isOrganic=1`)
      - *Vegetarian* (`isVegetarian=1`)
    - Shows an active pill style (tinted background, checkmark or active border) when active, and tapping it removes the filter.
    - Tapping an inactive pill toggles it on, resetting pagination.

R6. **Quick Price Presets:**
    - In `ProductFilterForm.tsx`, below the min/max inputs, render 4 quick price anchor buttons/links:
      - *Under £2* (`maxPrice=2`)
      - *£2 – £5* (`minPrice=2&maxPrice=5`)
      - *£5 – £10* (`minPrice=5&maxPrice=10`)
      - *£10+* (`minPrice=10`)
    - Selecting a price preset updates or populates the Min/Max bounds.

## Phase 3: Live Facet Product Counts (Density Foresight)

R7. **Facet Counts in `getAvailableFacets`:**
    - `AvailableFacets` includes counts for boolean facets:
      - `halalCount: number`
      - `freshCount: number`
      - `organicCount: number`
      - `vegetarianCount: number`
      - `glutenFreeCount: number`
      - `hmcCertifiedCount: number`
      - `onOfferCount: number`
    - In `ProductFilterForm`, boolean labels display their item count when greater than zero (e.g., `Halal (14)`).

## Phase 4: Zero-Result Smart Relaxation

R8. **Intelligent Zero-Result Recovery (`FilterZeroRecovery.tsx`):**
    - When active filters return 0 products:
      - If price bounds are applied, show a clear message and a 1-click button to relax the price filter.
      - If dietary or brand filters are applied, offer 1-click links to remove individual filters.
      - Always offer "Clear all filters" to restore full catalogue view.
