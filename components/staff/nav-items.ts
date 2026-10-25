import type { IconName } from "@/components/icons/registry";

/**
 * THE admin panel's navigation model (#1177). Both app surfaces render from this file:
 * `components/staff/PanelNav.tsx` (the bar) and `app/(admin)/staff/page.tsx` (the hub).
 *
 * WHY THIS MODULE EXISTS, because the alternative was tried and failed twice. Before #1177 the two
 * surfaces were hand-maintained lists, and the relationship between them drifted silently: #612
 * (three pages vanished from one surface, three were unreachable from the other) and #626
 * (`/staff/payments` missing from the staff tier for months while the parity test passed, because
 * that test compares the two files to each other and is blind to the tier branches). Grouping the
 * links by hand would have added a THIRD thing to keep in sync — which group a route belongs to —
 * with nothing checking it, so a route could sit under Catalogue on the bar and Store setup on the
 * hub and every test would stay green. Here, membership and grouping are true by construction.
 *
 * A PLAIN MODULE, NOT `"use server"`. That matters: a `"use server"` file may export only async
 * functions, enforced at runtime, so a constant like `STAFF_NAV_GROUPS` would 500 every caller
 * while `build`, `typecheck` and `test` stayed green (`CLAUDE.md`). Nothing here is a server
 * action. It is imported by a client component AND a server component, which is fine — both
 * already imported these same lucide icons directly.
 *
 * TO ADD A NEW `/staff/*` PAGE: add one entry here (both app surfaces follow automatically) and one
 * section to the operator guide matching the page's own gate — `tests/operator-doc-coverage.test.ts`
 * fails until that section exists. Do NOT add links to `PanelNav.tsx` or the hub by hand;
 * `tests/staff-nav-parity.test.ts` fails if either file carries a `/staff/*` href of its own.
 *
 * TWO ROUTES ARE DELIBERATELY ABSENT, and both are excluded from the parity test for the same
 * reasons:
 *   - `/staff` — the Overview. `PanelNav` renders it as a standalone link before the groups, and
 *     the hub cannot link to itself.
 *   - `/staff/errors` — platform-admin-only. `PanelNav`'s `currentTier` prop has no way to express
 *     "platform admin" as distinct from "store admin", so the card lives in the hub alone behind
 *     its own `auth.via` check (#508).
 */

/** Which tier may see an item. `"staff"` means both tiers; `"admin"` means the admin tier only. */
export type StaffNavTier = "staff" | "admin";

export interface StaffNavItem {
  /** The route. Must match a directory under `app/(admin)/staff/` that has a `page.tsx`. */
  href: string;
  /** The one label used by BOTH surfaces — the bar's link text and the hub card's title. */
  label: string;
  /** The hub card's body. The bar does not render it. */
  description: string;
  /** A semantic icon name (`components/icons/registry.ts`), never a component: the model carries data. */
  icon: IconName;
  /**
   * MUST match the page's own `requireVendorRole(...)` arguments: `"staff"` exactly when the page
   * admits `"STAFF"`. This is not a second place to make the access decision — the page's own gate
   * is the decision, and `tests/staff-nav-parity.test.ts` reads that gate and fails if this
   * disagrees. Hiding a link is courtesy; the page still refuses.
   */
  tier: StaffNavTier;
  /**
   * The hub card's icon colour, preserving each card's existing tone across the #1177 regrouping.
   * `"action"` marks the day-to-day operational pages, `"accent"` the rest.
   */
  tone: "action" | "accent";
}

export interface StaffNavGroup {
  id: string;
  label: string;
  items: readonly StaffNavItem[];
}

export const STAFF_NAV_GROUPS: readonly StaffNavGroup[] = [
  {
    id: "orders-fulfilment",
    label: "Orders & Fulfilment",
    items: [
      {
        href: "/staff/orders",
        label: "Orders",
        description: "Work the queue, search past orders, and open one for its full history.",
        icon: "clipboard-list",
        tier: "staff",
        tone: "action",
      },
      {
        href: "/staff/fulfilment",
        label: "Fulfilment",
        description: "Delivery and collection time slots, and express collection hours.",
        icon: "calendar-clock",
        tier: "admin",
        tone: "accent",
      },
      {
        href: "/staff/payments",
        label: "Payment Issues",
        description:
          "Payment events that were refused, and the orders they may have left stranded.",
        icon: "shield-alert",
        tier: "admin",
        tone: "action",
      },
    ],
  },
  {
    id: "catalogue",
    label: "Catalogue",
    items: [
      {
        href: "/staff/products",
        label: "Products",
        description: "Add products, correct prices, and set what’s in stock.",
        icon: "package",
        tier: "staff",
        tone: "accent",
      },
      {
        href: "/staff/products/import",
        label: "Import stock file",
        description: "Upload stock sheets to preview and import products and categories.",
        icon: "upload",
        tier: "admin",
        tone: "action",
      },
      {
        href: "/staff/inventory",
        label: "Live Inventory & Availability",
        description: "Quickly adjust stock levels and toggle product availability.",
        icon: "layers",
        tier: "staff",
        tone: "action",
      },
      {
        href: "/staff/categories",
        label: "Categories",
        description: "The departments shoppers browse by, and how they’re ordered.",
        icon: "folder-tree",
        tier: "staff",
        tone: "accent",
      },
      {
        href: "/staff/brands",
        label: "Brands",
        description: "The brands shoppers can filter by, and which products carry them.",
        icon: "tag",
        tier: "staff",
        tone: "accent",
      },
      {
        href: "/staff/attributes",
        label: "Product filters",
        description:
          "Your own shopper filters, such as Colour or Size, and the values each offers.",
        icon: "sliders-horizontal",
        tier: "staff",
        tone: "accent",
      },
      {
        href: "/staff/net-content",
        label: "Net content review",
        description: "Check AI-suggested pack sizes before they reach a product.",
        icon: "ruler",
        tier: "staff",
        tone: "accent",
      },
    ],
  },
  {
    id: "offers-loyalty",
    label: "Offers & Loyalty",
    items: [
      {
        href: "/staff/promotions",
        label: "Promotions",
        description: "Department campaigns and the banners that front them.",
        icon: "megaphone",
        tier: "staff",
        tone: "accent",
      },
      {
        href: "/staff/bundles",
        label: "Bundles",
        description: "Multi-product deals, their pricing and what they contain.",
        icon: "boxes",
        tier: "staff",
        tone: "accent",
      },
      {
        href: "/staff/loyalty",
        label: "Loyalty",
        description: "Earn and redemption rates, tier thresholds and multipliers.",
        icon: "sparkles",
        tier: "admin",
        tone: "accent",
      },
      {
        href: "/staff/discounts",
        label: "Discount codes",
        description: "Create, review and deactivate this store’s codes.",
        icon: "ticket-percent",
        tier: "admin",
        tone: "accent",
      },
    ],
  },
  {
    id: "customers-content",
    label: "Customers & Content",
    items: [
      {
        href: "/staff/customers",
        label: "Customers",
        description: "Who buys from this store, what they spend, and their loyalty standing.",
        icon: "contact",
        tier: "admin",
        tone: "accent",
      },
      {
        href: "/staff/feedback",
        label: "Customer Feedback",
        description:
          "Reviews customers left about the shop. Nothing appears on the storefront until you approve it.",
        icon: "message-square-quote",
        tier: "staff",
        tone: "accent",
      },
      {
        href: "/staff/faqs",
        label: "Help Centre Answers",
        description: "Your own answers to the questions shoppers ask, shown on the Help Centre.",
        icon: "circle-question-mark",
        tier: "admin",
        tone: "accent",
      },
      {
        href: "/staff/assistant",
        label: "Help Assistant",
        description:
          "Switch the storefront help assistant on or off, and see what shoppers ask it.",
        icon: "messages-square",
        tier: "admin",
        tone: "accent",
      },
      {
        href: "/staff/search-synonyms",
        label: "Search dictionary",
        description: "Words your shoppers use that your product names don’t.",
        icon: "book-a",
        tier: "staff",
        tone: "accent",
      },
    ],
  },
  {
    id: "store-setup",
    label: "Store setup",
    items: [
      {
        href: "/staff/onboarding",
        label: "Onboarding Readiness",
        description:
          "Audit storefront configuration, track onboarding completeness, and check live launch readiness.",
        icon: "clipboard-list",
        tier: "admin",
        tone: "action",
      },
      {
        href: "/staff/storefront",
        label: "Storefront",
        description: "This store’s branding, logo and shopfront configuration.",
        icon: "store",
        tier: "admin",
        tone: "accent",
      },
      {
        href: "/staff/delivery-areas",
        label: "Delivery areas",
        description:
          "The postcode areas this store delivers to. A customer outside them cannot check out.",
        icon: "truck",
        tier: "admin",
        tone: "accent",
      },
      {
        href: "/staff/team",
        label: "Team & Access",
        description: "Manage staff access, roles, and administrative privileges.",
        icon: "users",
        tier: "admin",
        tone: "accent",
      },
      {
        href: "/staff/ai-usage",
        label: "AI Allowance",
        description: "How much of today’s AI budget this store has used, by feature.",
        icon: "gauge",
        tier: "admin",
        tone: "accent",
      },
    ],
  },
  {
    id: "insights-help",
    label: "Insights & Help",
    items: [
      {
        href: "/staff/reports",
        label: "Reports",
        description: "Sales, total orders, and average basket value financials.",
        icon: "trending-up",
        tier: "admin",
        tone: "accent",
      },
      {
        href: "/staff/runbook",
        label: "Runbook",
        description: "Zero-trust guide to store operations and procedures.",
        icon: "book-open",
        tier: "staff",
        tone: "action",
      },
    ],
  },
];

/**
 * The groups a tier may see, with each group's items filtered to that tier and any group left with
 * nothing dropped entirely.
 *
 * The empty-group case is real, not defensive: every route in **Store setup** is ADMIN-only, so a
 * staff viewer sees five groups rather than six, and that group's trigger and heading must not
 * render at all.
 */
export function visibleGroups(tier: StaffNavTier): StaffNavGroup[] {
  return STAFF_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => tier === "admin" || item.tier === "staff"),
  })).filter((group) => group.items.length > 0);
}
