import { readdirSync, readFileSync, existsSync } from "node:fs";
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
 * PanelNav's staff-tier branch is a strict subset of its admin-tier branch, so collecting every href
 * in the file yields the admin-tier set exactly — no branch-splitting needed for THIS check.
 *
 * WHICH SURFACE EACH BLOCK COVERS, because that distinction turned out to matter (#626):
 * the parity block below compares the two files' full declared link sets, which is the **admin**
 * view; it is structurally blind to what the staff tier offers. The third block, added in #633,
 * covers the **staff** tier specifically. Do not read a green run of the parity block as evidence
 * about the staff view — that reading is what let `/staff/payments` sit missing from the staff nav
 * for months while this file passed.
 */

const REPO_ROOT = join(__dirname, "..");

/**
 * Routes deliberately outside the parity set, each for a stated reason — not an allowlist for
 * whatever happens to be missing today.
 *
 * `/staff` is the hub itself: PanelNav links to it as "Overview" and the hub cannot link to itself.
 * `/staff/errors` is platform-admin-only, and PanelNav's `currentTier` prop cannot express that
 * distinction, so the hub carries it alone behind its own `auth.via` check.
 */
const EXCLUDED = new Set(["/staff", "/staff/errors"]);

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

/**
 * #626 (R22, R23), added in #633 — the parity test above is TIER-BLIND, and that cost a real link.
 *
 * It collects every href in each file and compares the two sets, which is a check on the ADMIN view
 * only: `PanelNav`'s staff-tier branch is a strict subset of its admin-tier branch, so the staff set
 * is never compared against anything. `/staff/payments` admits STAFF
 * (`requireVendorRole("STAFF", "ADMIN")`) and the hub renders its card to them, but the nav's staff
 * branch omitted it — so the link vanished the moment a staff member navigated off the hub, and
 * nothing failed.
 *
 * The expected set is derived from the pages' OWN gates rather than written down here, so a future
 * reallocation between the tiers is self-verifying instead of trusted.
 */
describe("PanelNav's staff tier matches the pages that actually admit STAFF (R23)", () => {
  const STAFF_ROUTES_DIR = join(REPO_ROOT, "app/(admin)/staff");

  /** Routes whose page admits a STAFF member — excluding platform-admin-only pages (#508). */
  function routesAdmittingStaff(): Set<string> {
    const admitting = new Set<string>();

    for (const entry of readdirSync(STAFF_ROUTES_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const page = join(STAFF_ROUTES_DIR, entry.name, "page.tsx");
      if (!existsSync(page)) continue;

      const source = readFileSync(page, "utf8");
      const call = source.match(/requireVendorRole\(([^)]*)\)/);
      if (!call || !call[1].includes('"STAFF"')) continue;
      if (/auth\.via\s*!==\s*"platform-admin"/.test(source)) continue;

      admitting.add(`/staff/${entry.name}`);
    }

    return admitting;
  }

  /** The hrefs inside PanelNav's `currentTier === "staff"` branch only. */
  function staffTierLinks(): Set<string> {
    const source = readFileSync(join(REPO_ROOT, "components/staff/PanelNav.tsx"), "utf8");
    const start = source.indexOf('currentTier === "staff"');
    expect(start, 'PanelNav no longer branches on currentTier === "staff"').toBeGreaterThan(-1);

    // The staff branch runs to the `) : (` that opens the admin branch.
    const end = source.indexOf(") : (", start);
    expect(end, "could not find the end of PanelNav's staff-tier branch").toBeGreaterThan(start);

    const branch = source.slice(start, end);
    const hrefs = branch.match(/"\/staff(?:\/[a-z-]+)?"/g) ?? [];
    return new Set(hrefs.map((href) => href.slice(1, -1)).filter((href) => href !== "/staff"));
  }

  it("derives a non-empty expected set, so a parsing failure cannot pass silently", () => {
    expect(routesAdmittingStaff().size).toBeGreaterThan(2);
    expect(staffTierLinks().size).toBeGreaterThan(2);
  });

  it("links to /staff/payments, which admits STAFF (R22)", () => {
    expect(staffTierLinks()).toContain("/staff/payments");
  });

  it("links to every route that admits STAFF, and to no route that does not", () => {
    const expected = [...routesAdmittingStaff()].sort();
    const actual = [...staffTierLinks()].sort();
    expect(actual).toEqual(expected);
  });
});
