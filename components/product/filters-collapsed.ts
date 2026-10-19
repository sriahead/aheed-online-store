import { FILTERS_COLLAPSED_KEY } from "@/lib/storage-keys";

/**
 * #1173 — the collapsible browse sidebar's shared state. The single source of truth while a page is
 * open is the `data-filters-collapsed` attribute on `<html>`: `app/globals.css` keys the collapsed
 * layout (and the extra product column) off it, so the right layout paints before hydration.
 * `sessionStorage` carries it to the next page in the same tab.
 */
export const FILTERS_COLLAPSED_ATTRIBUTE = "data-filters-collapsed";

/**
 * Runs inline, before the sidebar is parsed, so a page in a tab that collapsed earlier paints
 * collapsed with no flash. Plain ES5 and `try/catch`: blocked storage just leaves it open.
 */
export const FILTERS_COLLAPSED_SCRIPT = `try{if(sessionStorage.getItem(${JSON.stringify(
  FILTERS_COLLAPSED_KEY,
)})==="1")document.documentElement.setAttribute(${JSON.stringify(
  FILTERS_COLLAPSED_ATTRIBUTE,
)},"")}catch(e){}`;

/** Apply a collapsed/open choice: the attribute now, `sessionStorage` for the next page. */
export function setFiltersCollapsed(collapsed: boolean): void {
  const root = document.documentElement;
  if (collapsed) root.setAttribute(FILTERS_COLLAPSED_ATTRIBUTE, "");
  else root.removeAttribute(FILTERS_COLLAPSED_ATTRIBUTE);
  try {
    if (collapsed) window.sessionStorage.setItem(FILTERS_COLLAPSED_KEY, "1");
    else window.sessionStorage.removeItem(FILTERS_COLLAPSED_KEY);
  } catch {
    // Storage blocked (private mode, site data off): the choice holds for this page only.
  }
}
