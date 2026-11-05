# Product Filter Polish, Subcategory Icons, Quick View Performance & Filter Persistence (requirements)

## Functional Requirements

### 1. Filter Decluttering & Semantic Grouping (Phase 1)
- **R1:** Remove the duplicative search text input inside `ProductFilterForm` on `/search`. The site-wide header search remains the primary search interface.
- **R2:** Remove duplicative price preset buttons from inside `ProductFilterForm.tsx`, leaving clean, accessible `Min` and `Max` numeric inputs. Price preset shortcuts remain accessible in `<QuickFiltersRail />`.
- **R3:** Group filter controls into logical fieldsets with clear visual headers:
  - *Price* (`minPrice`, `maxPrice`)
  - *Dietary & Lifestyle* (`isHalal`, `isFresh`, `isOrganic`, `isVegetarian`, `isGlutenFree`, `isHmcCertified`)
  - *Availability* (`inStock`, `onOffer`)
  - *Attributes* (Origin, Brand, Pack size, vendor custom attributes)
- **R4:** Preserve all existing no-JS progressive enhancement, hidden passthroughs (`featured`, `category`, `sort`), and live facet counts.

### 2. Subcategory Visual Icons (Phase 2)
- **R5:** `components/product/category-icon.ts` maps subcategory slugs (e.g. `fresh-fruit`, `bread-loaves`, `lamb-mutton`, `tea-coffee`, `crisps-namkeen`, `cleaning`, etc.) to semantic icons from `ICON_REGISTRY`.
- **R6:** `<SubcategoryLinks />` renders an `<Icon />` with `aria-hidden="true"` inside each subcategory pill and the leading "All" pill (`layers` icon), matching the visual polish of `<DepartmentScroller />`.
- **R7:** Accessible link names in `<SubcategoryLinks />` remain intact and unpolluted by icon text.

### 3. Quick View Performance & Instant Hydration (Phase 3)
- **R8:** `openQuickView` accepts `(slug, initialProduct?, cdnBaseUrl?)` and `useQuickView` context provides `cdnBaseUrl`. When `initialProduct` and `cdnBaseUrl` are present, `QuickViewDrawer` renders the full image packshot, title, price, savings badge, unit price, stock status, and add-to-cart button with 0ms perceived latency.
- **R9:** Client-side cache: `QuickViewProvider` maintains an in-memory cache of API responses by product slug. Repeated opens for the same product render instantly from memory without duplicate network calls.
- **R10:** Prefetch capability: `prefetchQuickView(slug)` can be triggered on `onPointerEnter` or `onFocus` of the Quick View button/card.
- **R11:** In `/api/products/quick-view/route.ts`, parallelize `product` lookup and Better Auth `getSession()` via `Promise.all()`, reducing isolate blocking time. Add HTTP caching headers (`Cache-Control: private, max-age=60, stale-while-revalidate=300`).

### 4. Category Filter & Sort Persistence (Phase 4)
- **R12:** `components/product/category-href.ts` exports `categoryNavHref(newSlug, currentParams)` which retains all active filter parameters (`minPrice`, `maxPrice`, `inStock`, `isHalal`, `isFresh`, `isOrganic`, `isVegetarian`, `isGlutenFree`, `isHmcCertified`, `onOffer`, `origin`, `brand`, `packSize`, `attr_*`, and `sort`) while omitting pagination `cursor` and `back`.
- **R13:** `<SubcategoryLinks />` in `app/(storefront)/categories/[slug]/page.tsx` passes `hrefFor={(targetSlug) => categoryNavHref(targetSlug, query)}`.
- **R14:** `<DepartmentScroller />` in `app/(storefront)/categories/[slug]/page.tsx` accepts `hrefFor` and passes `(targetSlug) => categoryNavHref(targetSlug, query)`.
- **R15:** `<DepartmentScroller />` in `app/(storefront)/search/page.tsx` accepts `hrefFor` and passes `(targetSlug) => categoryFilterHref(params, targetSlug)` to preserve query and filters when switching departments within search.
- **R16:** All existing filter chip interactions, "Clear all", and zero-result relaxation continue to function correctly.
