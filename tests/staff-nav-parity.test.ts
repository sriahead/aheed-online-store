import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * P9.2 (#612), R21 — the admin panel's two navigation surfaces must list the same pages.
 *
 * Before this slice neither was a superset of the other. `components/staff/PanelNav.tsx` omitted
 * brands, customers and payments; `app/(admin)/staff/page.tsx`'s hub omitted bundles, promotions
 * and storefront. So three pages vanished from the chrome the moment a user navigated off the hub,
 * three more were unreachable from it, and what the panel appeared to contain depended on which
 * surface you happened to be looking at. Nothing detected that, because each file is individually
 * correct — the defect only exists in the relationship between them, which is exactly the kind of
 * thing a per-file review does not catch.
 *
 * Parsed from source text rather than rendered, deliberately: the hub gates half its cards behind
 * `isAdmin` and PanelNav gates its links behind `currentTier`, so rendering either one would test a
 * single viewer's slice of the navigation rather than the full set each file declares. Reading the
 * literal hrefs is what makes "these two files offer the same destinations" checkable at all.
 *
 * PanelNav's staff-tier branch is a strict subset of its admin-tier branch (overview, inventory,
 * orders, runbook), so collecting every href in the file yields the admin-tier set exactly — no
 * branch-splitting needed.
 */

const REPO_ROOT = join(__dirname, "..");

/**
 * Routes deliberately outside the parity set, each for a stated reason — not an allowlist for
 * whatever happens to be missing today.
 *
 * `/staff` is the hub itself: PanelNav links to it as "Overview" and the hub cannot link to itself.
 * `/staff/errors` is platform-admin-only, and PanelNav's `currentTier` prop cannot express that
 * distinction, so the hub carries it alone behind its own `auth.via` check.
 * `/staff/search-synonyms` is absent from both surfaces and is #602's open work; this test asserts
 * parity between the two navs, and would otherwise fail for a reason that has nothing to do with
 * parity.
 */
const EXCLUDED = new Set(["/staff", "/staff/errors", "/staff/search-synonyms"]);

function staffLinksIn(relativePath: string): Set<string> {
  const source = readFileSync(join(REPO_ROOT, relativePath), "utf8");
  const matches = source.match(/"\/staff(?:\/[a-z-]+)?"/g) ?? [];
  const routes = matches.map((match) => match.slice(1, -1)).filter((route) => !EXCLUDED.has(route));
  return new Set(routes);
}

describe("staff navigation parity (R21)", () => {
  const panelNav = staffLinksIn("components/staff/PanelNav.tsx");
  const hub = staffLinksIn("app/(admin)/staff/page.tsx");

  it("both surfaces actually declare links, so a parsing failure cannot pass silently", () => {
    expect(panelNav.size).toBeGreaterThan(5);
    expect(hub.size).toBeGreaterThan(5);
  });

  it("every PanelNav link has a matching hub card", () => {
    const missingFromHub = [...panelNav].filter((route) => !hub.has(route)).sort();
    expect(missingFromHub).toEqual([]);
  });

  it("every hub card has a matching PanelNav link", () => {
    const missingFromNav = [...hub].filter((route) => !panelNav.has(route)).sort();
    expect(missingFromNav).toEqual([]);
  });

  it("includes the delivery-areas page this slice added", () => {
    expect(panelNav.has("/staff/delivery-areas")).toBe(true);
    expect(hub.has("/staff/delivery-areas")).toBe(true);
  });
});

describe("/staff/errors is reachable from the hub, and only for a platform admin (R22)", () => {
  const hubSource = readFileSync(join(REPO_ROOT, "app/(admin)/staff/page.tsx"), "utf8");

  it("links to it", () => {
    expect(hubSource).toContain('href="/staff/errors"');
  });

  it("gates it on auth.via rather than the page's broader isAdmin flag", () => {
    // `isAdmin` is true for a vendor ADMIN too, and /staff/errors refuses anyone whose `auth.via`
    // is not "platform-admin" — so gating on `isAdmin` would render a link every store admin could
    // see and none of them could open.
    expect(hubSource).toMatch(/auth\.via === "platform-admin" &&/);
  });
});
