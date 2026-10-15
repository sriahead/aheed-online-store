import { describe, expect, it } from "vitest";
import {
  listCategorySpotlights,
  pickDepartmentSpotlights,
  type SpotlightGroup,
} from "@/lib/repositories/products";
import type { getPrisma } from "@/lib/db";

/**
 * #1096 — homepage department spotlights.
 *
 * `pickDepartmentSpotlights` is pure and carries the ordering rule (R1, R4, R5, R7, R8). The
 * `listCategorySpotlights` tests below run against an in-memory double that applies the three
 * queries' filters to fixture rows, to pin the query SHAPE: how many calls, and that every one is
 * vendor- and active-scoped (R2, R3, R6). The double reproduces this file's reading of Prisma, not
 * Postgres — `scripts/verify-department-spotlights.ts` carries the same cases against a real
 * database on the runtime HTTP adapter (R9).
 */

const VENDOR = "vendor-a";
const OTHER_VENDOR = "vendor-b";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 14, 12, minute));
const group = (categoryId: string, isFeatured: boolean, minute: number): SpotlightGroup => ({
  categoryId,
  isFeatured,
  createdAt: at(minute),
});

describe("pickDepartmentSpotlights (#1096)", () => {
  it("R4: a department with many featured, newer products does not starve another", () => {
    const departmentOf = new Map([
      ["dept-a", "dept-a"],
      ["dept-b", "dept-b"],
    ]);
    // Ten featured A products collapse to one group per (category, flag) — the starvation the old
    // global `take` window allowed cannot be expressed here at all.
    const winners = pickDepartmentSpotlights(
      [group("dept-a", true, 50), group("dept-a", false, 55), group("dept-b", false, 1)],
      departmentOf,
    );

    expect([...winners.keys()].sort()).toEqual(["dept-a", "dept-b"]);
    expect(winners.get("dept-b")).toEqual(group("dept-b", false, 1));
  });

  it("R5/R8: a child's group is keyed by its department, never by the child", () => {
    const winners = pickDepartmentSpotlights(
      [group("child-1", false, 5)],
      new Map([
        ["dept-a", "dept-a"],
        ["child-1", "dept-a"],
      ]),
    );

    expect([...winners.keys()]).toEqual(["dept-a"]);
    expect(winners.get("dept-a")?.categoryId).toBe("child-1");
  });

  it("R7: featured beats a newer non-featured product in a sibling category", () => {
    const departmentOf = new Map([
      ["dept-a", "dept-a"],
      ["child-1", "dept-a"],
    ]);
    const winners = pickDepartmentSpotlights(
      [group("child-1", false, 59), group("dept-a", true, 1)],
      departmentOf,
    );

    expect(winners.get("dept-a")).toEqual(group("dept-a", true, 1));
  });

  it("R7: among equally featured groups, the latest createdAt wins", () => {
    const departmentOf = new Map([
      ["dept-a", "dept-a"],
      ["child-1", "dept-a"],
    ]);
    const winners = pickDepartmentSpotlights(
      [group("dept-a", true, 10), group("child-1", true, 20)],
      departmentOf,
    );

    expect(winners.get("dept-a")).toEqual(group("child-1", true, 20));
  });

  it("R6/R8: a group whose category is not eligible is ignored, and its department is absent", () => {
    const winners = pickDepartmentSpotlights(
      [group("inactive-child", true, 30)],
      new Map([["dept-a", "dept-a"]]),
    );

    expect(winners.size).toBe(0);
  });
});

/* ------------------------------------------------------------------------- *
 * listCategorySpotlights against an in-memory double
 * ------------------------------------------------------------------------- */

interface CategoryRow {
  id: string;
  vendorId: string;
  parentId: string | null;
  isActive: boolean;
}

interface ProductRow {
  id: string;
  vendorId: string;
  categoryId: string;
  isActive: boolean;
  isFeatured: boolean;
  createdAt: Date;
  name: string;
}

type Where = Record<string, unknown>;

const inList = (value: unknown, condition: unknown) =>
  (condition as { in: unknown[] }).in.includes(value);

function makeClient(categories: CategoryRow[], products: ProductRow[]) {
  const calls: { method: string; where: Where; take?: number }[] = [];

  const productMatches = (row: ProductRow, where: Where) =>
    row.vendorId === where.vendorId &&
    row.isActive === where.isActive &&
    (where.categoryId === undefined || inList(row.categoryId, where.categoryId)) &&
    (where.OR === undefined ||
      (where.OR as Where[]).some(
        (clause) =>
          row.categoryId === clause.categoryId &&
          row.isFeatured === clause.isFeatured &&
          row.createdAt.getTime() === (clause.createdAt as Date).getTime(),
      ));

  const client = {
    category: {
      findMany: async ({ where }: { where: Where }) => {
        calls.push({ method: "category.findMany", where });
        return categories
          .filter(
            (row) =>
              row.vendorId === where.vendorId &&
              row.isActive === where.isActive &&
              inList(row.parentId, where.parentId),
          )
          .map(({ id, parentId }) => ({ id, parentId }));
      },
    },
    product: {
      groupBy: async ({ where }: { where: Where }) => {
        calls.push({ method: "product.groupBy", where });
        const groups = new Map<string, { categoryId: string; isFeatured: boolean; max: Date }>();
        for (const row of products.filter((p) => productMatches(p, where))) {
          const key = `${row.categoryId}|${row.isFeatured}`;
          const current = groups.get(key);
          if (!current || row.createdAt > current.max) {
            groups.set(key, {
              categoryId: row.categoryId,
              isFeatured: row.isFeatured,
              max: row.createdAt,
            });
          }
        }
        return [...groups.values()].map((g) => ({
          categoryId: g.categoryId,
          isFeatured: g.isFeatured,
          _max: { createdAt: g.max },
        }));
      },
      findMany: async ({ where, take }: { where: Where; take?: number }) => {
        calls.push({ method: "product.findMany", where, take });
        return products
          .filter((p) => productMatches(p, where))
          .sort((a, b) => (a.id < b.id ? -1 : 1))
          .map((p) => ({
            categoryId: p.categoryId,
            name: p.name,
            slug: p.id,
            basePrice: 100,
            originalPrice: null,
            unitLabel: "each",
          }));
      },
    },
  };

  return { client: client as unknown as ReturnType<typeof getPrisma>, calls };
}

const category = (id: string, parentId: string | null, isActive = true): CategoryRow => ({
  id,
  vendorId: VENDOR,
  parentId,
  isActive,
});

const product = (
  id: string,
  categoryId: string,
  minute: number,
  extra: Partial<ProductRow> = {},
): ProductRow => ({
  id,
  vendorId: VENDOR,
  categoryId,
  isActive: true,
  isFeatured: false,
  createdAt: at(minute),
  name: id,
  ...extra,
});

describe("listCategorySpotlights (#1096)", () => {
  it("R2: an empty department list makes no call and returns an empty Map", async () => {
    const { client, calls } = makeClient([], []);
    const result = await listCategorySpotlights(client, VENDOR, []);

    expect(result.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it.each([1, 20])("R2: %i department(s) cost at most one call per method", async (count) => {
    const ids = Array.from({ length: count }, (_, i) => `dept-${i}`);
    const { client, calls } = makeClient(
      ids.map((id) => category(id, null)),
      ids.map((id, i) => product(`p-${i}`, id, i)),
    );
    const result = await listCategorySpotlights(client, VENDOR, ids);

    expect(result.size).toBe(count);
    expect(calls.map((c) => c.method).sort()).toEqual([
      "category.findMany",
      "product.findMany",
      "product.groupBy",
    ]);
  });

  it("R3: every call is scoped to the caller's vendor and to active rows", async () => {
    const { client, calls } = makeClient([category("dept-a", null)], [product("p1", "dept-a", 1)]);
    await listCategorySpotlights(client, VENDOR, ["dept-a"]);

    expect(calls).toHaveLength(3);
    // R4 — no global window: the winning-rows fetch is bounded by the winners, not by `take`.
    expect(calls.find((c) => c.method === "product.findMany")?.take).toBeUndefined();
    for (const call of calls) {
      expect(call.where.vendorId).toBe(VENDOR);
      expect(call.where.isActive).toBe(true);
    }
  });

  it("R4–R8: starvation, subcategories, exclusions and the exact-tie rule end to end", async () => {
    const categories = [
      category("dept-a", null),
      category("dept-b", null),
      category("dept-c", null),
      category("dept-d", null),
      category("child-c", "dept-c"),
      category("child-off", "dept-d", false),
      category("grandchild", "child-c"),
    ];
    const products = [
      // R4 — ten featured, newer A products; one older non-featured B product.
      ...Array.from({ length: 10 }, (_, i) =>
        product(`a-${i}`, "dept-a", 30 + i, { isFeatured: true }),
      ),
      product("b-1", "dept-b", 1),
      // R5 — C has nothing of its own; its child does. R7 — exact tie on the child's triple.
      product("c-z", "child-c", 5),
      product("c-a", "child-c", 5),
      // R6(b) — a newer, featured grandchild product never wins.
      product("g-1", "grandchild", 59, { isFeatured: true }),
      // R6(a)/(c)/(d) — D's only products are ineligible, so D is absent.
      product("d-off", "child-off", 40, { isFeatured: true }),
      product("d-inactive", "dept-d", 41, { isActive: false }),
      product("d-other", "dept-d", 42, { vendorId: OTHER_VENDOR }),
    ];
    const { client } = makeClient(categories, products);

    const result = await listCategorySpotlights(client, VENDOR, [
      "dept-a",
      "dept-b",
      "dept-c",
      "dept-d",
    ]);

    expect([...result.keys()].sort()).toEqual(["dept-a", "dept-b", "dept-c"]);
    expect(result.get("dept-a")?.name).toBe("a-9");
    expect(result.get("dept-b")?.name).toBe("b-1");
    expect(result.get("dept-c")).toMatchObject({ name: "c-a", categoryId: "child-c" });
  });
});
