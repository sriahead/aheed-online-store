import Link from "next/link";
import { Layers, PackageOpen, Sparkles, Star } from "lucide-react";

/**
 * The storefront's collection entry points (#681), rendered in the filter-panel column on
 * `/search` and at the head of `/bundles`.
 *
 * WHY LINKS AND NOT FORM CONTROLS. These change which listing you are on — `/search` versus
 * `/bundles` — and the filter form is a `GET` form submitting to the current path, which cannot
 * navigate elsewhere. Modelling them as checkboxes inside that form would have meant either a
 * client-side redirect or a hidden field per destination; a link is what they actually are.
 *
 * WHY IT IS RENDERED ONCE, OUTSIDE `FilterPanel`'s TWO BRANCHES. `FilterPanel` renders
 * `ProductFilterForm` twice — once in the below-`md` `details` disclosure, once in the
 * `md`-and-above `aside` — which is safe there specifically because that form uses no `id`
 * attributes (see its docstring). A navigation landmark is different: two copies would put two
 * identical `nav`s in the accessibility tree. So the page renders this once, above the panel, where
 * it also stays visible on a narrow viewport rather than collapsing behind the disclosure. Entry
 * points that are hidden by default are not entry points.
 *
 * NEW ARRIVALS DELIBERATELY POINTS AT PLAIN `/search`, and that is not an oversight.
 * `findPage` (`lib/repositories/products.ts`) orders every browse listing by
 * `createdAt desc, id desc`, so `/search` with no query IS the newest-first listing — the shop
 * page's own New Arrivals row is that same query capped at eight. Giving this link a
 * predicate-free `collection=new` parameter would have rendered a removable filter chip claiming a
 * filter that is not running, which `filter-chips.ts` exists to prevent (see `labelFor`'s
 * `category` case, and #568's R15). The honest fix was to label the destination, not to invent a
 * key. A recency-window New Arrivals is a real feature and a different one.
 */

const COLLECTIONS = [
  { href: "/search", label: "All products", icon: Layers },
  { href: "/search", label: "New Arrivals", icon: Sparkles },
  { href: "/search?featured=1", label: "Featured Products", icon: Star },
  { href: "/bundles", label: "Value Bundles", icon: PackageOpen },
] as const;

export function CollectionNav({ activeHref }: { activeHref?: string }) {
  return (
    <nav aria-label="Collections" className="mb-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary-muted">
        Browse
      </h2>
      <ul className="flex flex-wrap gap-2 md:flex-col md:gap-1">
        {COLLECTIONS.map(({ href, label, icon: Icon }) => {
          const active = href === activeHref;
          return (
            <li key={label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "inline-flex items-center gap-2 rounded-2xl bg-action-tint px-3 py-2 text-sm font-semibold text-primary"
                    : "inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm text-primary hover:bg-surface-muted"
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
