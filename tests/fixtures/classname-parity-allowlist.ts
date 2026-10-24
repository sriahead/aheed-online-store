/**
 * Files `scripts/verify-classname-parity.ts` skips (#1223, R59, R60).
 *
 * The check pairs each Lucide element at BASE with an `Icon` element at HEAD. That cannot hold for a file
 * whose icon was a component VALUE at BASE (`const Icon = categoryIcon(slug)`, `icon={User}`), because the
 * element's tag was then a local binding, not a `lucide-react` import, and the migration turned the value
 * into a semantic name. Those files are proved by R34 and R35 (rendered markup, live) and by reading their
 * diff (R57), so each is listed here with its reason. The list may not grow without a spec change.
 */
export const CLASSNAME_PARITY_ALLOWLIST: Array<{ path: string; reason: string }> = [
  // The five R57 files, migrated by hand in P2a.
  {
    path: "app/(storefront)/quick-shop/page.tsx",
    reason: "TILES held a component per tile (`Icon: Heart`); now an IconName",
  },
  {
    path: "components/account/AccountNav.tsx",
    reason: "NavLink took `icon: React.ComponentType`; now an IconName",
  },
  {
    path: "components/layout/ViewSwitcher.tsx",
    reason:
      "the views array held a component per view and rendered `<ActiveIcon>`; now an IconName",
  },
  {
    path: "components/product/CollectionNav.tsx",
    reason: "COLLECTIONS held a component per entry; now an IconName",
  },
  {
    path: "components/cart/AddToCartButton.tsx",
    reason: "chose `Loader2`, `Check` or `Plus` as a value at render time; now an IconName",
  },
  // Migrated in P1 (R29, R30), where the icon was already a value at BASE; proved live by #1226.
  {
    path: "app/(admin)/staff/page.tsx",
    reason: "P1: `const Icon = item.icon` from nav-items; nav-items now carries IconNames",
  },
  {
    path: "components/layout/DepartmentHero.tsx",
    reason: "P1: `const Icon = categoryIcon(slug)`; categoryIcon is now categoryIconName",
  },
  {
    path: "components/layout/DepartmentScroller.tsx",
    reason: "P1: `const Icon = categoryIcon(slug)`; categoryIcon is now categoryIconName",
  },
  {
    path: "components/staff/PanelNav.tsx",
    reason: "P1: rendered `item.icon` from nav-items; nav-items now carries IconNames",
  },
];
