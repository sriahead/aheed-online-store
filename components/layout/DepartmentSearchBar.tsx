"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { SearchSuggest } from "./SearchSuggest";

/**
 * One option as the selector needs it: its slug is what `/search?category=` takes. #1169 — a
 * subcategory is listed too, straight after its department, and `isSubcategory` indents it.
 */
export interface SearchDepartment {
  slug: string;
  name: string;
  isSubcategory?: boolean;
}

/**
 * The selector's "no department" option. Its empty value is what `/search` reads as "everything".
 * #1169 — "All", not "All Departments", at the owner's request: the select's accessible name
 * ("Search department") still says what it is all of.
 */
export const ALL_DEPARTMENTS_LABEL = "All";

/** #1169 — two no-break spaces: a native select keeps them, so a subcategory reads indented. */
const SUBCATEGORY_INDENT = "\u00A0\u00A0";

function DepartmentSelect({
  departments,
  selected,
}: {
  departments: readonly SearchDepartment[];
  selected: string;
}) {
  return (
    <select
      // A changed key remounts the select, so a client navigation to another department's results
      // shows that department instead of keeping the first page's DOM default.
      key={selected}
      name="category"
      aria-label="Search department"
      defaultValue={selected}
      data-tap-surface="search"
      className="min-h-tap lg:min-h-0 w-24 sm:w-36 shrink-0 truncate rounded-l-xl border border-r-0 border-black/10 bg-surface-muted px-2 text-xs font-semibold text-primary hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action"
    >
      <option value="">{ALL_DEPARTMENTS_LABEL}</option>
      {departments.map((department) => (
        <option key={department.slug} value={department.slug}>
          {department.isSubcategory ? `${SUBCATEGORY_INDENT}${department.name}` : department.name}
        </option>
      ))}
    </select>
  );
}

/**
 * The department or subcategory already in the URL, when it is one of the listed options (#1169: the
 * list carries subcategories too). An unknown slug selects "All": claiming a department the shopper
 * did not choose would be worse than showing none.
 */
function DepartmentSelectFromUrl({ departments }: { departments: readonly SearchDepartment[] }) {
  const category = useSearchParams()?.get("category") ?? "";
  const selected = departments.some((department) => department.slug === category) ? category : "";
  return <DepartmentSelect departments={departments} selected={selected} />;
}

/**
 * Header search (#1131, the owner's Amazon-style reference): a department selector, a wide search
 * field and a search button, joined into one bar.
 *
 * STILL A PLAIN `GET /search` FORM, which is the property everything else rests on (#568's
 * progressive-enhancement constraint). The select submits `category` and the input submits `q`, so
 * with JavaScript off the bar works exactly as it does with it on: `/search` already narrows to a
 * department and its subcategories from `category`, and ignores an empty or unknown value. Enter in
 * the input submits it too, unless a suggestion is highlighted (`SearchSuggest` handles that case).
 *
 * The department list is whatever the caller passes — `Header` passes the vendor's active
 * departments from the database — so a new department appears and a hidden one disappears with no
 * code change. It is a NATIVE select on purpose: a long list scrolls, a phone opens its own picker,
 * and keyboard and screen-reader behaviour come with it.
 *
 * `useSearchParams` sits under `Suspense` so the header can still render on the server; the
 * fallback is the same select with "All" chosen.
 */
export function DepartmentSearchBar({
  departments,
  placeholder,
  className = "",
}: {
  departments: readonly SearchDepartment[];
  placeholder: string;
  className?: string;
}) {
  return (
    <form
      method="GET"
      action="/search"
      role="search"
      data-header-search=""
      className={`flex w-full items-stretch ${className}`}
    >
      <Suspense fallback={<DepartmentSelect departments={departments} selected="" />}>
        <DepartmentSelectFromUrl departments={departments} />
      </Suspense>
      <SearchSuggest placeholder={placeholder} className="min-w-0 flex-1" />
      <button
        type="submit"
        aria-label="Search"
        data-tap-surface="search"
        className="flex min-h-tap min-w-tap lg:min-h-0 lg:min-w-0 shrink-0 items-center justify-center rounded-r-xl bg-accent px-3 text-white hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
      >
        <Search className="h-4 w-4" aria-hidden />
      </button>
    </form>
  );
}
