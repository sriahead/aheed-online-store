import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { visibleCategoryWhere } from "@/lib/category-visibility";
import {
  getCategoryBySlug,
  listCategoryTreeForStorefront,
  listTopLevelCategories,
  suggestCategories,
} from "@/lib/repositories/categories";

/**
 * #1131 R1, R3, R6a — the "visible category" rule and the storefront category reads that use it.
 *
 * The stub below EVALUATES the `where` each read passes, rather than returning canned rows, so a
 * read that forgot the predicate returns the hidden rows and the test fails. It implements only the
 * operators these reads use (equality, `null`, `in`, `contains`/insensitive, `AND`, `OR`, and the
 * `parent` relation), and throws on anything else so a new operator cannot pass by being ignored.
 */

type Row = {
  id: string;
  vendorId: string;
  slug: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
};

const VENDOR = "vendor-a";
const ROWS: Row[] = [
  // A visible department with a visible child.
  row("fruit", "Fruit", null, true),
  row("apples", "Apples", "fruit", true),
  // A HIDDEN department whose child is still `isActive: true` — the case only the parent check catches.
  row("baby", "Baby", null, false),
  row("baby-food", "Baby Food", "baby", true),
  // Another vendor's row with a colliding slug, to prove vendor scoping is untouched.
  { ...row("fruit-b", "Fruit", null, true), vendorId: "vendor-b", slug: "fruit" },
];

function row(id: string, name: string, parentId: string | null, isActive: boolean): Row {
  return { id, vendorId: VENDOR, slug: id, name, parentId, isActive, sortOrder: 0 };
}

const byId = new Map(ROWS.map((r) => [r.id, r]));

function matches(r: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "AND") return (condition as Record<string, unknown>[]).every((w) => matches(r, w));
    if (key === "OR") return (condition as Record<string, unknown>[]).some((w) => matches(r, w));
    if (key === "parent") {
      const parent = r.parentId === null ? null : byId.get(r.parentId);
      return (
        parent !== null &&
        parent !== undefined &&
        matches(parent, condition as Record<string, unknown>)
      );
    }
    const value = r[key as keyof Row];
    if (condition === null || typeof condition !== "object") return value === condition;
    const op = condition as Record<string, unknown>;
    if ("in" in op) return (op.in as unknown[]).includes(value);
    if ("contains" in op) {
      return String(value).toLowerCase().includes(String(op.contains).toLowerCase());
    }
    throw new Error(`stub does not implement ${key}: ${JSON.stringify(condition)}`);
  });
}

const prisma = {
  category: {
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      ROWS.filter((r) => matches(r, where)),
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      ROWS.find((r) => matches(r, where)) ?? null,
  },
} as never;

describe("visibleCategoryWhere (R1)", () => {
  it("is active, and either top-level or under an active parent", () => {
    expect(visibleCategoryWhere).toEqual({
      isActive: true,
      OR: [{ parentId: null }, { parent: { isActive: true } }],
    });
  });
});

describe("storefront category reads hide a hidden department's subtree (R3)", () => {
  it("getCategoryBySlug returns null for a hidden department", async () => {
    expect(await getCategoryBySlug(prisma, VENDOR, "baby")).toBeNull();
  });

  it("getCategoryBySlug returns null for an active sub-category under a hidden department", async () => {
    expect(await getCategoryBySlug(prisma, VENDOR, "baby-food")).toBeNull();
  });

  it("getCategoryBySlug still returns visible departments and sub-categories", async () => {
    expect(await getCategoryBySlug(prisma, VENDOR, "fruit")).not.toBeNull();
    expect(await getCategoryBySlug(prisma, VENDOR, "apples")).not.toBeNull();
  });

  it("suggestCategories offers no category from a hidden subtree", async () => {
    const slugs = (await suggestCategories(prisma, VENDOR, ["baby", "apple"], 10)).map(
      (c) => c.slug,
    );
    expect(slugs).toEqual(["apples"]);
  });

  it("listCategoryTreeForStorefront returns only the visible tree, for this vendor only", async () => {
    const tree = await listCategoryTreeForStorefront(prisma, VENDOR);
    expect(tree.map((c) => c.slug).sort()).toEqual(["apples", "fruit"]);
  });
});

describe("a hidden department's promotion stays out of the landing carousel (R6a)", () => {
  it("the department list the landing page reads excludes a hidden department", async () => {
    const slugs = (await listTopLevelCategories(prisma, VENDOR)).map((c) => c.slug);
    expect(slugs).toEqual(["fruit"]);
  });

  it("the landing page asks for campaigns only for the departments that list returned", () => {
    // The carousel's slides and its campaign lookup are both keyed on `listTopLevel()`'s result, so
    // a hidden department's DepartmentCampaign is never requested (and never touched).
    const source = readFileSync(join(__dirname, "..", "app", "(landing)", "page.tsx"), "utf8");
    expect(source).toMatch(
      /const \[categories, profile\] = await Promise\.all\(\[\s*getCategoryRepository\(\)\.listTopLevel\(\)/,
    );
    expect(source).toContain("getCampaignsForHero(categories.map((c) => c.id))");
    expect(source).toMatch(/const heroDepartments = categories\.map\(/);
  });
});
