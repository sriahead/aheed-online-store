/**
 * Plain <form method="GET"> — no client-side JS. Submitting it is a real page
 * navigation that replaces the query string, so a filter change naturally
 * restarts pagination at page 1 (no cursor field carried forward).
 */
export function ProductFilterForm({
  showQuery,
  searchParams,
}: {
  showQuery?: boolean;
  searchParams: { q?: string; minPrice?: string; maxPrice?: string; inStock?: string };
}) {
  return (
    <form method="GET" className="mb-6 flex flex-wrap items-end gap-3">
      {showQuery && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-primary">Search</span>
          <input
            type="text"
            name="q"
            defaultValue={searchParams.q ?? ""}
            className="rounded-sm border border-black/20 px-3 py-2"
          />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-primary">Min £</span>
        <input
          type="number"
          name="minPrice"
          step="0.01"
          min="0"
          defaultValue={searchParams.minPrice ?? ""}
          className="w-24 rounded-sm border border-black/20 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-primary">Max £</span>
        <input
          type="number"
          name="maxPrice"
          step="0.01"
          min="0"
          defaultValue={searchParams.maxPrice ?? ""}
          className="w-24 rounded-sm border border-black/20 px-3 py-2"
        />
      </label>
      <label className="flex items-center gap-2 pb-2">
        <input
          type="checkbox"
          name="inStock"
          value="1"
          defaultChecked={searchParams.inStock === "1"}
        />
        <span className="text-sm text-primary">In stock only</span>
      </label>
      <button type="submit" className="rounded-full bg-action px-4 py-2 font-semibold text-white">
        Apply
      </button>
    </form>
  );
}
