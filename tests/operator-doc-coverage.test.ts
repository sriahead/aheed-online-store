import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #633 (R15-R20) — every Admin/Staff menu item is documented, and every documented permission is
 * the permission the page actually enforces.
 *
 * WHY THIS TEST EXISTS. `docs/store-admin-guide/admin-tabs-guide.md` shipped, approved, telling
 * store admins they could "issue full refunds via the payment provider (Stripe)" and "Invite new
 * staff members". Neither capability has ever existed, and a third claim — that a store admin can
 * assign the Admin role — is contradicted by `lib/repositories/roles.ts`, which throws
 * `Forbidden: Only a platform-admin can grant the Store Admin role` (#629). Nothing caught any of
 * it, because prose is not executable.
 *
 * Prose still is not executable, and this test does not pretend otherwise. What it does pin is the
 * single most dangerous class of claim — WHO IS ALLOWED TO DO THIS — by parsing each documented
 * section's "Who can access" line and comparing it against the page's real `requireVendorRole`
 * call. A guide that misstates a permission now fails the suite.
 *
 * The route list is derived from the FILESYSTEM, never hardcoded (R19), so a newly added
 * `/staff/*` page fails this suite until someone documents it.
 */

const REPO_ROOT = join(__dirname, "..");
const STAFF_ROUTES_DIR = join(REPO_ROOT, "app/(admin)/staff");

/** The three operator guides. Developer docs and shopper help are not operator documentation. */
const OPERATOR_GUIDES = [
  "docs/staff-playbook/staff-tabs-guide.md",
  "docs/store-admin-guide/admin-tabs-guide.md",
  "docs/platform-admin-guide/platform-admin-guide.md",
] as const;

/** The exact strings a section may use, and what each means in terms of the page's own gate. */
const ACCESS_STAFF_AND_ADMIN = "Staff and store admins";
const ACCESS_ADMIN_ONLY = "Store admins only";
const ACCESS_PLATFORM_ONLY = "Platform admins only";
const PERMITTED_ACCESS = [ACCESS_STAFF_AND_ADMIN, ACCESS_ADMIN_ONLY, ACCESS_PLATFORM_ONLY] as const;

/** The seven labelled parts every section carries, per the operator-guide brief. */
const REQUIRED_PARTS = [
  "Purpose",
  "Who can access",
  "What you can do",
  "Typical workflow",
  "Important fields and filters",
  "Common mistakes and limitations",
  "What happens after changes are saved",
] as const;

/** Every immediate subdirectory of app/(admin)/staff that is a real route. */
function discoverStaffRoutes(): string[] {
  return readdirSync(STAFF_ROUTES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(STAFF_ROUTES_DIR, name, "page.tsx")))
    .sort();
}

/**
 * The access a page actually enforces, read from its own source.
 *
 * A page that additionally refuses `auth.via !== "platform-admin"` is platform-admin-only even
 * though its `requireVendorRole` call says ADMIN — that is exactly the /staff/errors case (#508),
 * and reading only the role gate would document it as reachable by every store admin.
 */
function enforcedAccess(route: string): string {
  const source = readFileSync(join(STAFF_ROUTES_DIR, route, "page.tsx"), "utf8");

  const call = source.match(/requireVendorRole\(([^)]*)\)/);
  if (!call) throw new Error(`${route}/page.tsx has no requireVendorRole call`);

  const refusesNonPlatformAdmin = /auth\.via\s*!==\s*"platform-admin"/.test(source);
  if (refusesNonPlatformAdmin) return ACCESS_PLATFORM_ONLY;

  return call[1].includes('"STAFF"') ? ACCESS_STAFF_AND_ADMIN : ACCESS_ADMIN_ONLY;
}

interface DocumentedSection {
  route: string;
  guide: string;
  body: string;
}

/**
 * Every documented section, keyed on the route path in its heading — e.g. a heading containing
 * `/staff/orders` in backticks documents the orders page. Splitting on headings rather than a fixed
 * template keeps the guides readable as prose.
 */
function collectSections(): DocumentedSection[] {
  const sections: DocumentedSection[] = [];

  for (const guide of OPERATOR_GUIDES) {
    const source = readFileSync(join(REPO_ROOT, guide), "utf8");
    const lines = source.split("\n");

    let current: { route: string; lines: string[] } | null = null;
    let inFence = false;

    for (const line of lines) {
      if (line.trimStart().startsWith("```")) inFence = !inFence;

      const heading = !inFence && /^#{2,4}\s/.test(line);
      if (heading) {
        if (current) sections.push({ route: current.route, guide, body: current.lines.join("\n") });
        current = null;

        const route = line.match(/`\/staff\/([a-z-]+)`/);
        if (route) current = { route: route[1], lines: [] };
        continue;
      }

      if (current) current.lines.push(line);
    }

    if (current) sections.push({ route: current.route, guide, body: current.lines.join("\n") });
  }

  return sections;
}

const routes = discoverStaffRoutes();
const sections = collectSections();

describe("operator documentation covers every menu item (R15, R19)", () => {
  it("discovers the staff routes from the filesystem, so the list cannot go stale", () => {
    // A guard against the discovery itself silently returning nothing, which would make every
    // coverage assertion below vacuously true.
    expect(routes.length).toBeGreaterThan(10);
    expect(routes).toContain("orders");
    expect(routes).toContain("errors");
  });

  it.each(routes)("/staff/%s has exactly one documented section", (route) => {
    const found = sections.filter((section) => section.route === route);
    expect(
      found.length,
      found.length === 0
        ? `/staff/${route} is undocumented — add a section to one of: ${OPERATOR_GUIDES.join(", ")}`
        : `/staff/${route} is documented ${found.length} times (${found.map((f) => f.guide).join(", ")})`,
    ).toBe(1);
  });

  it("documents no route that does not exist", () => {
    const undocumentedRoutes = sections
      .map((section) => section.route)
      .filter((route) => !routes.includes(route));
    expect([...new Set(undocumentedRoutes)]).toEqual([]);
  });
});

describe("every section carries the seven labelled parts (R16)", () => {
  it.each(routes)("/staff/%s", (route) => {
    const section = sections.find((candidate) => candidate.route === route);
    expect(section, `/staff/${route} has no section`).toBeDefined();

    const missing = REQUIRED_PARTS.filter((part) => !section!.body.includes(`**${part}:**`));
    expect(missing, `/staff/${route} is missing: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("documented access matches the access the page enforces (R17, R18)", () => {
  it.each(routes)("/staff/%s", (route) => {
    const section = sections.find((candidate) => candidate.route === route);
    expect(section, `/staff/${route} has no section`).toBeDefined();

    const stated = section!.body.match(/\*\*Who can access:\*\*\s*(.+)/);
    expect(stated, `/staff/${route} has no "Who can access" value`).not.toBeNull();

    const value = stated![1].trim().replace(/\.$/, "");
    expect(
      PERMITTED_ACCESS as readonly string[],
      `/staff/${route} states "${value}", which is not one of the three permitted values`,
    ).toContain(value);

    expect(
      value,
      `/staff/${route} documents "${value}" but its page enforces "${enforcedAccess(route)}"`,
    ).toBe(enforcedAccess(route));
  });
});

describe("sections live in the guide matching their audience (R20)", () => {
  it.each(routes)("/staff/%s", (route) => {
    const section = sections.find((candidate) => candidate.route === route);
    expect(section, `/staff/${route} has no section`).toBeDefined();
    const access = enforcedAccess(route);

    const expectedGuide =
      access === ACCESS_STAFF_AND_ADMIN
        ? "docs/staff-playbook/staff-tabs-guide.md"
        : access === ACCESS_PLATFORM_ONLY
          ? "docs/platform-admin-guide/platform-admin-guide.md"
          : "docs/store-admin-guide/admin-tabs-guide.md";

    expect(
      section!.guide,
      `/staff/${route} is "${access}" so its section belongs in ${expectedGuide}`,
    ).toBe(expectedGuide);
  });
});
