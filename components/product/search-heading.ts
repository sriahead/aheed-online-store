/**
 * #1173 — the `/search` page heading. Pure, so its three cases are tested without rendering a page.
 *
 * A search term always wins: the results are for that term, whether or not a category narrows them
 * (the category shows as a chip and as pills). With no term, a resolved category is what the page
 * lists, so it is headed by that category's name, matching `/categories/<slug>`. Otherwise the page
 * is the whole catalogue.
 */
export function searchHeading(query: string, categoryName?: string | null): string {
  if (query) return `Results for “${query}”`;
  if (categoryName) return categoryName;
  return "All products";
}
