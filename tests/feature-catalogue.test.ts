import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN,
  CATALOGUE,
  PLATFORM,
  STAFF,
  featuresOf,
} from "@/features/feature-catalogue/catalogue";
import { STAFF_NAV_GROUPS } from "@/components/staff/nav-items";
import { PLATFORM_NAV_ITEMS } from "@/components/staff/platform-nav-items";

/**
 * #1374 — the Feature Catalogue lists only what exists.
 *
 * WHY: a demo reference that drifts is worse than none, because it is read aloud to users. Two
 * drifts are checkable by machine, and both are pinned here: an entry naming a route that no longer
 * exists, and a menu page nobody catalogued. Whether a description is TRUE is not checkable; that
 * stays a review duty (the file header says so).
 */

const ROOT = join(__dirname, "..");

function routeExists(route: string): boolean {
  const rel = route.replace(/^\//, "");
  return (
    existsSync(join(ROOT, "app/(admin)", rel, "page.tsx")) ||
    existsSync(join(ROOT, "app/(storefront)", rel, "page.tsx"))
  );
}

const all = CATALOGUE.flatMap((role) => featuresOf(role).map((feature) => ({ role, feature })));

describe("feature catalogue content", () => {
  it("has the four roles in the requested order", () => {
    expect(CATALOGUE.map((r) => r.role)).toEqual(["customer", "admin", "staff", "platform"]);
  });

  it("gives every feature a BLUF, a benefit and a demo line", () => {
    for (const { feature } of all) {
      expect(feature.what.trim(), feature.name).not.toBe("");
      expect(feature.value.trim(), feature.name).not.toBe("");
      expect(feature.demo.trim(), feature.name).not.toBe("");
    }
  });

  it("explains every partial or unavailable feature", () => {
    for (const { feature } of all) {
      if (feature.status !== "live") expect(feature.note, feature.name).toBeTruthy();
    }
  });

  it("has no duplicate feature name within a role", () => {
    for (const role of CATALOGUE) {
      const names = featuresOf(role).map((f) => f.name);
      expect(new Set(names).size, role.label).toBe(names.length);
    }
  });
});

describe("feature catalogue routes are real", () => {
  const routed = all.filter(({ feature }) => feature.route !== null);

  it.each(routed.map(({ feature }) => [feature.name, feature.route as string]))(
    "%s -> %s",
    (_name, route) => {
      expect(routeExists(route), `${route} has no page.tsx`).toBe(true);
    },
  );
});

describe("every menu page is catalogued under the role that can open it", () => {
  const routesOf = (role: typeof ADMIN) =>
    featuresOf(role)
      .map((f) => f.route)
      .filter((r): r is string => r !== null);

  const navItems = STAFF_NAV_GROUPS.flatMap((g) => g.items);

  it.each(navItems.map((i) => [i.href, i.tier] as const))("%s (%s tier)", (href, tier) => {
    expect(routesOf(tier === "staff" ? STAFF : ADMIN), `${href} is not catalogued`).toContain(href);
  });

  it.each(PLATFORM_NAV_ITEMS.map((i) => i.href))("%s (platform)", (href) => {
    expect(routesOf(PLATFORM), `${href} is not catalogued`).toContain(href);
  });
});
