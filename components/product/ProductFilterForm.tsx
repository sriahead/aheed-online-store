import { toCategoryOptionGroups } from "@/lib/catalogue-form";
import { formatPackSize, packSizeParamValue } from "@/components/product/unit-price";
import type { AvailableFacets } from "@/lib/repositories/products";
import type { StorefrontCategoryNode } from "@/lib/repositories/categories";

/**
 * Plain <form method="GET"> — no client-side JS. Submitting it is a real page
 * navigation that replaces the query string, so a filter change naturally
 * restarts pagination at page 1 (no cursor field carried forward).
 *
 * Laid out as a vertical sidebar panel (search on top, then price, then the
 * speciality checkboxes) — sits in the left column of the browse pages.
 */
export function ProductFilterForm({
  showQuery,
  searchParams,
  facets,
  categories,
}: {
  showQuery?: boolean;
  searchParams: {
    q?: string;
    minPrice?: string;
    maxPrice?: string;
    inStock?: string;
    isHalal?: string;
    isFresh?: string;
    isOrganic?: string;
    isVegetarian?: string;
    isGlutenFree?: string;
    isHmcCertified?: string;
    onOffer?: string;
    origin?: string;
    brand?: string;
    featured?: string;
    category?: string;
    /** #397 — the wire form is `<amount>-<UNIT>`, e.g. `500-GRAM`. */
    packSize?: string;
  };
  // Per-vendor filter visibility (ADR-004 follow-up): only offer a filter the vendor's catalogue
  // actually uses, narrowed since #568 to the current result context. Defaults to none.
  facets?: AvailableFacets;
  /**
   * The vendor's active category tree (#681). Optional, and an empty list renders no category
   * control at all — `/categories/[slug]` passes none, because there the category is the ROUTE
   * rather than a parameter and a `GET` form cannot navigate to a different path.
   */
  categories?: readonly StorefrontCategoryNode[];
}) {
  // Pure reshape, unit-tested in `tests/catalogue-form.test.ts` — one `optgroup` per department,
  // each department followed by its own children, an orphan promoted to its own group.
  const categoryGroups = toCategoryOptionGroups<StorefrontCategoryNode>(categories ?? []);
  const spec: AvailableFacets = facets ?? {
    halal: false,
    fresh: false,
    organic: false,
    vegetarian: false,
    glutenFree: false,
    hmcCertified: false,
    onOffer: false,
    origins: [],
    brands: [],
    packSizes: [],
  };
  return (
    <form method="GET" className="flex flex-col gap-5">
      {/*
        #501 — a GET form submits ONLY the fields it contains, replacing the
        whole query string. `featured` has no visible control (it is reached
        from the shop page's "View all", not chosen here), so without this
        hidden field pressing Apply from a featured listing would silently drop
        the filter and dump the shopper into the full catalogue. `cursor` is
        deliberately NOT carried the same way: a filter change should restart
        pagination at page 1.
      */}
      {searchParams.featured === "1" && <input type="hidden" name="featured" value="1" />}

      {/*
        #681 — `category`'s hidden passthrough is GONE, replaced by the real select below.
        #568 added it because drill-down was chosen from a link beside the results rather than from
        a control in this form, so an Apply without it would silently widen the shopper back to the
        whole catalogue. That reasoning expired the moment this form owned the control: keeping
        both would submit `category` twice. `featured` above keeps its hidden field precisely
        because nothing here owns it — its entry point is a link in `CollectionNav`.
      */}

      {showQuery && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-primary">Search</span>
          <input
            type="text"
            name="q"
            defaultValue={searchParams.q ?? ""}
            className="w-full rounded-lg border border-black/20 px-3 py-2"
          />
        </label>
      )}

      {/*
        #681 — the department control, and the ONLY one on this page since `CategoryDrillDown` was
        deleted. Values are SLUGS, not ids: `/search` resolves `category` with `getBySlug`, and an
        id here would silently match nothing.

        Departments stay selectable in their own right rather than becoming bare `optgroup` labels,
        matching `/staff/products` (#630) and for the same reason — a department selection means
        "this department and everything beneath it", which the page expands via
        `selectedCategory.children`.
      */}
      {categoryGroups.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-primary">Category</span>
          <select
            name="category"
            defaultValue={searchParams.category ?? ""}
            className="w-full rounded-lg border border-black/20 px-3 py-2"
          >
            <option value="">All categories</option>
            {categoryGroups.map((group) => (
              <optgroup key={group.parent.id} label={group.parent.name}>
                <option value={group.parent.slug}>All of {group.parent.name}</option>
                {group.children.map((child) => (
                  <option key={child.id} value={child.slug}>
                    {child.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-primary">Price (£)</legend>
        <div className="flex items-center gap-2">
          <input
            type="number"
            name="minPrice"
            step="0.01"
            min="0"
            aria-label="Minimum price"
            placeholder="Min"
            defaultValue={searchParams.minPrice ?? ""}
            className="w-full rounded-lg border border-black/20 px-3 py-2"
          />
          <span className="text-primary-muted">–</span>
          <input
            type="number"
            name="maxPrice"
            step="0.01"
            min="0"
            aria-label="Maximum price"
            placeholder="Max"
            defaultValue={searchParams.maxPrice ?? ""}
            className="w-full rounded-lg border border-black/20 px-3 py-2"
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-primary">Filter by</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="inStock"
            value="1"
            defaultChecked={searchParams.inStock === "1"}
          />
          <span className="text-sm text-primary">In stock only</span>
        </label>
        {spec.halal && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="isHalal"
              value="1"
              defaultChecked={searchParams.isHalal === "1"}
            />
            <span className="text-sm text-primary">Halal</span>
          </label>
        )}
        {spec.fresh && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="isFresh"
              value="1"
              defaultChecked={searchParams.isFresh === "1"}
            />
            <span className="text-sm text-primary">Fresh</span>
          </label>
        )}
        {spec.organic && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="isOrganic"
              value="1"
              defaultChecked={searchParams.isOrganic === "1"}
            />
            <span className="text-sm text-primary">Organic</span>
          </label>
        )}
        {/* #569 — dietary facets, same conditional-visibility rule as the three above. */}
        {spec.vegetarian && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="isVegetarian"
              value="1"
              defaultChecked={searchParams.isVegetarian === "1"}
            />
            <span className="text-sm text-primary">Vegetarian</span>
          </label>
        )}
        {spec.glutenFree && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="isGlutenFree"
              value="1"
              defaultChecked={searchParams.isGlutenFree === "1"}
            />
            <span className="text-sm text-primary">Gluten free</span>
          </label>
        )}
        {spec.hmcCertified && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="isHmcCertified"
              value="1"
              defaultChecked={searchParams.isHmcCertified === "1"}
            />
            <span className="text-sm text-primary">HMC certified</span>
          </label>
        )}
        {spec.onOffer && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="onOffer"
              value="1"
              defaultChecked={searchParams.onOffer === "1"}
            />
            <span className="text-sm text-primary">On offer</span>
          </label>
        )}
      </fieldset>

      {/*
        #569 — origin and brand are DISTINCT-VALUE facets, not booleans, so they are selects rather
        than checkboxes: a real catalogue carries more brands than a checkbox list can hold without
        dominating the panel. Single-select, which is what makes one removable chip per facet the
        correct chip model. Each renders only when its facet has values in the current context, so
        an empty option list is never offered.

        The first option carries an EMPTY value deliberately: a GET form submits every control it
        contains, so selecting it submits `origin=` (empty), which the page reads as "no filter" —
        the same way an unticked checkbox is simply absent.
      */}
      {spec.origins.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-primary">Country of origin</span>
          <select
            name="origin"
            defaultValue={searchParams.origin ?? ""}
            className="w-full rounded-lg border border-black/20 px-3 py-2"
          >
            <option value="">Any origin</option>
            {spec.origins.map((origin) => (
              <option key={origin} value={origin}>
                {origin}
              </option>
            ))}
          </select>
        </label>
      )}

      {spec.brands.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-primary">Brand</span>
          <select
            name="brand"
            defaultValue={searchParams.brand ?? ""}
            className="w-full rounded-lg border border-black/20 px-3 py-2"
          >
            <option value="">Any brand</option>
            {/* Value is the SLUG, not the id: it is what appears in a shopper's URL, and a slug
                survives being shared or bookmarked in a way an opaque uuid does not. */}
            {spec.brands.map((brand) => (
              <option key={brand.id} value={brand.slug}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/*
        #397 — pack size, the last facet that issue asked for which had not shipped. Its other six
        (origin, brand, HMC, vegetarian, gluten-free, organic) all landed in #569/#398; this one
        waited on #398's netContentAmount/netContentUnit columns, since `unitLabel` is free text
        ("£2.40 / kg") and unusable as a facet.

        Like every control in this form, the label WRAPS the select and there is no `id` — see
        FilterPanel, which renders this whole form twice per page (a `details` disclosure below
        `md`, an `aside` above it). An `id` here would appear twice in one document and bind half
        the labels to the wrong control.
      */}
      {spec.packSizes.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-primary">Pack size</span>
          <select
            name="packSize"
            defaultValue={searchParams.packSize ?? ""}
            className="w-full rounded-lg border border-black/20 px-3 py-2"
          >
            <option value="">Any pack size</option>
            {spec.packSizes.map((packSize) => {
              const value = packSizeParamValue(packSize);
              return (
                <option key={value} value={value}>
                  {formatPackSize(packSize)}
                </option>
              );
            })}
          </select>
        </label>
      )}

      {/*
        #512 — this was a hardcoded `bg-[#2E7D32] hover:bg-[#1b5e20]`. Two things were wrong with
        that, and only the first is cosmetic. The literal bypasses `brandStyle()`'s per-vendor
        override entirely (CLAUDE.md's design-token section), so SriMart rendered Aheed's green on
        this one button; and the hover literal was not even the token's own hover shade
        (`--color-action-hover` is `#276a2b`, the value P7 closeout darkened for WCAG AA), so the
        button also reverted an audited contrast fix on hover.
      */}
      <button
        type="submit"
        className="w-full rounded-full bg-action hover:bg-action-hover transition-colors px-4 py-2 font-semibold text-white"
      >
        Apply
      </button>
    </form>
  );
}
