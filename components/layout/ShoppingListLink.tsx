import Link from "next/link";
import { ShoppingBag } from "lucide-react";

/**
 * The header's Shopping List link (#1142), placed directly after the search bar so the two read as
 * one way to find products. It moved out of the right-hand nav, which freed the shared header row
 * for the search field.
 *
 * Deliberately NOT part of the search `<form>`: a Shopping List click is a navigation, not a search,
 * so it must not submit the bar's `q` and `category`.
 *
 * `aria-label` because the visible text is hidden below `sm`, so without it a phone's screen reader
 * would fall back to the `title`. The visible text and the label agree (#1131, WCAG 2.5.3).
 */
export function ShoppingListLink() {
  return (
    <Link
      href="/shop-your-list"
      aria-label="Shopping list"
      className="flex min-h-tap min-w-tap shrink-0 justify-center lg:min-h-0 lg:min-w-0 items-center gap-1.5 bg-surface-muted hover:bg-black/5 text-black/80 px-2 sm:px-3 py-2 rounded-xl text-xs font-bold transition border border-black/10"
      title="Shop by pasting your list"
    >
      <ShoppingBag className="w-4 h-4 text-primary" aria-hidden />
      <span className="hidden sm:inline whitespace-nowrap">Shopping List</span>
    </Link>
  );
}
