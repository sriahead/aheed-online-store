import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/registry";

/**
 * The Quick Shop hub (#1187) — what the header's Quick Shop button opens, instead of going straight
 * to the paste-a-list page.
 *
 * Reads no session and queries no database on purpose. All four tiles render for every visitor, and
 * the two authenticated-only destinations redirect to `/login` on tap exactly as
 * `/account/favourites` already does — so there is nothing per-visitor to resolve here. That is why
 * this file declares no `export const dynamic`: the `(storefront)` layout already sets
 * `force-dynamic` for the whole group (its Header reads the session), the same position
 * `app/(storefront)/help/page.tsx` is in.
 *
 * Each tile's label is its destination page's own `<h1>`, not a shorter synonym. `#1187` names the
 * four informally as "Favourites, Regulars, Smart Lists and Bundles", but two of those would not
 * match the page they open — and a tile disagreeing with its destination is the exact problem
 * `#1145` was opened to fix. Renaming `/bundles`'s shipped heading to match a shorter tile would
 * reach outside this slice for a cosmetic gain, so the tile carries the page's name instead.
 *
 * The tile markup is `app/(storefront)/account/page.tsx`'s, reused rather than reinvented.
 */
export const metadata: Metadata = { title: "Quick Shop" };

const TILE_CLASS =
  "rounded-2xl border border-black/10 bg-white p-5 hover:border-action transition block";

/**
 * Copy is vendor-neutral: Aheed sells groceries and SriMart electronics, so no tile may name a
 * vendor or a product category (`docs/developer-portal/app-conventions.md`, "User-facing copy").
 * `tests/vendor-neutral-copy.test.ts` is a denylist and cannot catch a new vendor-specific phrase,
 * so this stays a review obligation rather than a test one.
 */
const TILES: {
  href: string;
  label: string;
  description: string;
  icon: IconName;
  iconClass: string;
}[] = [
  {
    href: "/account/favourites",
    label: "Your favourites",
    description: "Everything you have tapped the heart on, ready to add to your basket again.",
    icon: "heart",
    iconClass: "text-action",
  },
  {
    href: "/account/regulars",
    label: "Your regulars",
    description: "The items you order most often, in one place.",
    icon: "repeat",
    iconClass: "text-accent",
  },
  {
    href: "/shop-your-list",
    label: "Smart Lists",
    description: "Paste or type a list and match it to what is in stock.",
    icon: "list-checks",
    iconClass: "text-action",
  },
  {
    href: "/bundles",
    label: "Value Bundles",
    description: "Multi-item bundles at a set price.",
    icon: "boxes",
    iconClass: "text-accent",
  },
  // #1302 — appended last so the four tiles above keep the fixed order #1187 pinned.
  {
    href: "/account/orders",
    label: "Your orders",
    description: "Reorder a past order or save it as a list.",
    icon: "package",
    iconClass: "text-action",
  },
] as const;

export default function QuickShopPage() {
  return (
    <PageContainer width="standard">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Quick Shop</h1>
      <p className="mb-6 text-sm text-primary-muted">
        Quick ways to fill your basket without browsing from scratch.
      </p>

      {/* Same responsive card grid as `/account`: 2-column on desktop, single-column on mobile. */}
      <div className="grid gap-4 sm:grid-cols-2">
        {TILES.map(({ href, label, description, icon, iconClass }) => (
          <Link key={href} href={href} className={TILE_CLASS}>
            <Icon name={icon} className={`mb-3 h-6 w-6 ${iconClass}`} />
            <p className="font-semibold text-primary">{label}</p>
            <p className="mt-1 text-sm text-primary-muted">{description}</p>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
