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
  specialities,
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
    featured?: string;
    category?: string;
  };
  // Per-vendor filter visibility (ADR-004 follow-up): only offer a speciality
  // filter the vendor's catalogue actually uses. Defaults to none.
  specialities?: { halal: boolean; fresh: boolean; organic: boolean };
}) {
  const spec = specialities ?? { halal: false, fresh: false, organic: false };
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
        #568 — `category` needs the identical passthrough for the identical reason. Drill-down is
        chosen from a link beside the results, not from a control in this form, so without this
        hidden field pressing Apply would silently drop the category and widen the shopper back to
        the whole catalogue — the exact failure #501 fixed for `featured`. Like `featured` and
        unlike `cursor`, it is a filter rather than a position, so it IS carried across a submit.
      */}
      {searchParams.category && (
        <input type="hidden" name="category" value={searchParams.category} />
      )}

      {showQuery && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-primary">Search</span>
          <input
            type="text"
            name="q"
            defaultValue={searchParams.q ?? ""}
            className="w-full rounded-sm border border-black/20 px-3 py-2"
          />
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
            className="w-full rounded-sm border border-black/20 px-3 py-2"
          />
          <span className="text-primary/50">–</span>
          <input
            type="number"
            name="maxPrice"
            step="0.01"
            min="0"
            aria-label="Maximum price"
            placeholder="Max"
            defaultValue={searchParams.maxPrice ?? ""}
            className="w-full rounded-sm border border-black/20 px-3 py-2"
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
      </fieldset>

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
