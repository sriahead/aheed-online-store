import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STAFF_NAV_GROUPS, visibleGroups } from "../components/staff/nav-items";

/**
 * P9.2 (#612) R21, #626/#633 R22-R23, rewritten for #1177.
 *
 * WHAT CHANGED, AND WHY THIS FILE LOOKS DIFFERENT. Until #1177 the admin panel had two
 * hand-maintained navigation lists — `components/staff/PanelNav.tsx` and the hub at
 * `app/(admin)/staff/page.tsx` — and this test parsed both files' SOURCE TEXT and compared the two
 * sets to each other. That caught a real defect twice over (#612, #626) but it had two holes:
 *
 *   1. It compared the files to EACH OTHER, so a route that existed on disk and was missing from
 *      BOTH surfaces passed silently. The #633 block below closed that for STAFF-admitting routes
 *      only, because it derives its expectation from the filesystem; an ADMIN-only route missing
 *      from both was invisible.
 *   2. It located the staff tier by the literal `currentTier === "staff"` and `") : ("`, so it was
 *      coupled to one particular shape of JSX.
 *
 * Both surfaces now render from `components/staff/nav-items.ts`, so membership and grouping are
 * true by construction and there is no longer a relationship between two files to police. What
 * CANNOT be derived — and so is what this file still checks — is whether that module agrees with
 * the pages' OWN `requireVendorRole` gates, and whether either surface has started hand-writing
 * links again and quietly bypassing the module.
 *
 * Expectations are derived from the filesystem and from each page's own gate, never written down
 * here, so a future reallocation between the tiers stays self-verifying rather than trusted. That
 * is the property #626 bought and it is deliberately preserved.
 *
 * ONE STALE CLAIM IS DELIBERATELY NOT CARRIED FORWARD. The previous version of this comment said
 * `/staff/payments` admits STAFF. It does not: `app/(admin)/staff/payments/page.tsx` is
 * `requireVendorRole("ADMIN")` today, almost certainly reallocated by #737. The old test's LOGIC
 * was right (it read the gate, so it self-corrected); only its prose was wrong. Read the gate, not
 * a comment about the gate.
 */

const REPO_ROOT = join(__dirname, "..");
const STAFF_ROUTES_DIR = join(REPO_ROOT, "app/(admin)/staff");

/**
 * Routes deliberately outside the module, each for a stated reason — not an allowlist for whatever
 * happens to be missing today.
 *
 * `/staff` is the hub itself: PanelNav links to it as "Overview" and the hub cannot link to itself.
 * `/staff/errors` is platform-admin-only, and PanelNav's `currentTier` prop cannot express that
 * distinction, so the hub carries it alone behind its own `auth.via` check.
 */
const EXCLUDED = new Set(["/staff", "/staff/errors"]);

/** Every `/staff/<dir>` on disk that has a `page.tsx`, minus the two excluded routes. */
function routesOnDisk(): Set<string> {
  const routes = new Set<string>();

  for (const entry of readdirSync(STAFF_ROUTES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!existsSync(join(STAFF_ROUTES_DIR, entry.name, "page.tsx"))) continue;
    const route = `/staff/${entry.name}`;
    if (!EXCLUDED.has(route)) routes.add(route);
  }

  if (existsSync(join(STAFF_ROUTES_DIR, "products", "import", "page.tsx"))) {
    routes.add("/staff/products/import");
  }

  return routes;
}

/** Routes whose page admits a STAFF member — excluding platform-admin-only pages (#508). */
function routesAdmittingStaff(): Set<string> {
  const admitting = new Set<string>();

  for (const route of routesOnDisk()) {
    const page = join(STAFF_ROUTES_DIR, route.replace("/staff/", ""), "page.tsx");
    const source = readFileSync(page, "utf8");
    const call = source.match(/requireVendorRole\(([^)]*)\)/);
    if (!call || !call[1].includes('"STAFF"')) continue;
    if (/auth\.via\s*!==\s*"platform-admin"/.test(source)) continue;
    admitting.add(route);
  }

  return admitting;
}

const allItems = STAFF_NAV_GROUPS.flatMap((group) => group.items);

describe("the nav module is well formed (R1, R4)", () => {
  it("derives a non-empty set, so a parsing failure cannot pass silently", () => {
    expect(STAFF_NAV_GROUPS.length).toBeGreaterThan(2);
    expect(allItems.length).toBeGreaterThan(5);
  });

  it("gives every group a unique id, a unique label and at least one item", () => {
    const ids = STAFF_NAV_GROUPS.map((group) => group.id);
    const labels = STAFF_NAV_GROUPS.map((group) => group.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
    for (const group of STAFF_NAV_GROUPS) {
      expect(group.items.length, `group "${group.id}" is empty`).toBeGreaterThan(0);
    }
  });

  it("gives every item the fields both surfaces render", () => {
    for (const item of allItems) {
      expect(item.href, "an item has no href").toMatch(/^\/staff\/[a-z/-]+$/);
      expect(item.label.length, `${item.href} has no label`).toBeGreaterThan(0);
      expect(item.description.length, `${item.href} has no description`).toBeGreaterThan(0);
      expect(item.icon, `${item.href} has no icon`).toBeTruthy();
      expect(["staff", "admin"], `${item.href} has a bad tier`).toContain(item.tier);
    }
  });

  it("lists no route twice", () => {
    const hrefs = allItems.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("carries the six groups in the order #1177 approved", () => {
    expect(STAFF_NAV_GROUPS.map((group) => group.label)).toEqual([
      "Orders & Fulfilment",
      "Catalogue",
      "Offers & Loyalty",
      "Customers & Content",
      "Store setup",
      "Insights & Help",
    ]);
  });
});

describe("the module covers exactly the routes that exist (R2)", () => {
  it("lists every /staff/* page on disk, and nothing that is not one", () => {
    const expected = [...routesOnDisk()].sort();
    const actual = allItems.map((item) => item.href).sort();
    expect(actual).toEqual(expected);
  });

  it("does not list the hub or the platform-admin error page", () => {
    const hrefs = new Set(allItems.map((item) => item.href));
    expect(hrefs.has("/staff")).toBe(false);
    expect(hrefs.has("/staff/errors")).toBe(false);
  });
});

describe("every item's tier matches its page's own gate (R3)", () => {
  it("marks an item staff-visible exactly when its page admits STAFF", () => {
    const expected = [...routesAdmittingStaff()].sort();
    const actual = allItems
      .filter((item) => item.tier === "staff")
      .map((item) => item.href)
      .sort();
    expect(actual).toEqual(expected);
  });

  it("shows a staff viewer only pages that admit STAFF, and drops an empty group (R7)", () => {
    const staffHrefs = visibleGroups("staff").flatMap((group) =>
      group.items.map((item) => item.href),
    );
    expect([...staffHrefs].sort()).toEqual([...routesAdmittingStaff()].sort());

    const staffGroupIds = visibleGroups("staff").map((group) => group.id);
    const adminGroupIds = visibleGroups("admin").map((group) => group.id);
    expect(adminGroupIds).toEqual(STAFF_NAV_GROUPS.map((group) => group.id));
    // Every route in "Store setup" is ADMIN-only, so a staff viewer must not see that group at all.
    expect(staffGroupIds).not.toContain("store-setup");
    expect(staffGroupIds.length).toBe(adminGroupIds.length - 1);
  });
});

describe("neither surface hand-writes links any more (R5)", () => {
  /**
   * The point of the module is that a page is registered once. If either surface starts carrying
   * its own `/staff/*` href, the grouping can drift between them again — exactly the failure #1177
   * removed — and nothing else would notice.
   */
  const SURFACES: ReadonlyArray<{ file: string; allowed: readonly string[] }> = [
    // The Overview link; the hub cannot link to itself, so only the bar carries it.
    { file: "components/staff/PanelNav.tsx", allowed: ["/staff"] },
    // Platform-admin-only, and outside the vendor-scoped module by design.
    { file: "app/(admin)/staff/page.tsx", allowed: ["/staff/errors"] },
  ];

  for (const { file, allowed } of SURFACES) {
    it(`${file} carries only its documented exceptions`, () => {
      const source = readFileSync(join(REPO_ROOT, file), "utf8");
      const found = (source.match(/"\/staff(?:\/[a-z-]+)?"/g) ?? []).map((match) =>
        match.slice(1, -1),
      );
      expect([...new Set(found)].sort()).toEqual([...allowed].sort());
    });

    it(`${file} renders from the module`, () => {
      const source = readFileSync(join(REPO_ROOT, file), "utf8");
      expect(source).toMatch(/from "(\.\/nav-items|@\/components\/staff\/nav-items)"/);
    });
  }
});

/**
 * #508 — /staff/errors is reachable from the hub, and only for a platform admin (R22, preserved).
 */
describe("/staff/errors is reachable from the hub, and only for a platform admin", () => {
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
