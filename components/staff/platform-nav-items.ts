import type { IconName } from "@/components/icons/registry";

/**
 * Dedicated navigation model for Platform Administrators (#1269).
 * Used by PanelNav.tsx and app/(admin)/staff/page.tsx.
 */

export interface PlatformNavItem {
  href: string;
  label: string;
  description: string;
  icon: IconName;
  badge?: string;
}

export const PLATFORM_NAV_ITEMS: readonly PlatformNavItem[] = [
  {
    // #1319 — the platform admin's home, where /signed-in lands them.
    href: "/staff/platform",
    label: "Platform overview",
    description: "Platform-wide figures and every operator control in one place.",
    icon: "shield-check",
  },
  {
    href: "/staff/platform/vendors",
    label: "Vendors & Tenants",
    description: "Manage registered store vendors, active catalogues, and status.",
    icon: "store",
  },
  {
    href: "/staff/platform/onboarding",
    label: "Onboarding Roll-up",
    description: "Multi-tenant onboarding readiness progress and compliance tracking.",
    icon: "clipboard-list",
  },
  {
    // #1217 — one onboarding dashboard per client store; Email is its first section.
    href: "/staff/platform/client-setup",
    label: "Client Setup",
    description: "Configure a client store step by step: email first, more sections to follow.",
    icon: "list-checks",
  },
  {
    href: "/staff/platform/domains",
    label: "Domain Registry",
    description: "Platform-wide host routing, custom domains, and SSL status.",
    icon: "globe",
  },
  {
    href: "/staff/platform/settings",
    label: "Platform Settings",
    description: "Cloudflare routing, email sender, Stripe Connect, and shared infra.",
    icon: "sliders-horizontal",
  },
  {
    href: "/staff/platform/health",
    label: "System Health",
    description: "Database connectivity, ping latency, and environment diagnostics.",
    icon: "gauge",
  },
  {
    href: "/staff/platform/costs",
    label: "Costs, Pricing & Business Model",
    description:
      "Running costs, competitor pricing, proposed pricing, profitability and business models.",
    icon: "coins",
  },
  {
    href: "/staff/feature-catalogue",
    label: "Feature Catalogue",
    description: "What the platform does for each role, with its status and a demo talking point.",
    icon: "list-checks",
  },
  {
    href: "/staff/errors",
    label: "Error Events",
    description: "Recent server-side exceptions and stack traces across all stores.",
    icon: "bug",
  },
];
