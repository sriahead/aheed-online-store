import { describe, expect, it, vi } from "vitest";
import {
  diffRows,
  imageKeys,
  normalise,
  parentsFirst,
  TABLES,
  uniqueClashes,
  withActivationPolicy,
  writePlan,
  type Delegate,
  type RowDiff,
  type TableSpec,
} from "../scripts/catalogue-copy-staging-to-production";

/** #1523 — copying the catalogue from staging to production, with no database. */

const spec = (model: string): TableSpec => TABLES.find((t) => t.model === model)!;

describe("diffRows", () => {
  it("creates new rows, updates only changed fields, reports destination-only rows", () => {
    const source = [
      { id: "a", name: "Apple", basePrice: 100, averageRating: 0 },
      { id: "b", name: "Banana", basePrice: 50, averageRating: 0 },
      { id: "c", name: "Cherry", basePrice: 300, averageRating: 0 },
    ];
    const target = [
      { id: "a", name: "Apple", basePrice: 120, averageRating: 4.5 },
      { id: "b", name: "Banana", basePrice: 50, averageRating: 3 },
      { id: "z", name: "Old", basePrice: 1, averageRating: 0 },
    ];
    const diff = diffRows(source, target, spec("product"));
    // averageRating is production's own (derived from its reviews): never compared or written.
    expect(diff.create).toEqual([{ id: "c", name: "Cherry", basePrice: 300 }]);
    expect(diff.update).toEqual([{ id: "a", data: { basePrice: 100 }, changed: ["basePrice"] }]);
    expect(diff.unchanged).toBe(1);
    expect(diff.onlyInTarget.map((r) => r.id)).toEqual(["z"]);
  });

  it("matches stock rows by product and updates the destination's own row id", () => {
    const diff = diffRows(
      [{ id: "inv-staging", productId: "p1", quantity: 0, stockMode: "UNTRACKED", version: 3 }],
      [{ id: "inv-prod", productId: "p1", quantity: 0, stockMode: "UNKNOWN", version: 9 }],
      spec("inventory"),
    );
    expect(diff.create).toEqual([]);
    expect(diff.update).toEqual([
      { id: "inv-prod", data: { stockMode: "UNTRACKED" }, changed: ["stockMode"] },
    ]);
  });

  it("ignores bookkeeping timestamps and compares dates and decimals by value", () => {
    const at = (s: string) => new Date(s);
    const diff = diffRows(
      [{ id: "t", productId: "p", groupQuantity: 3, updatedAt: at("2026-11-11T00:00:00Z") }],
      [{ id: "t", productId: "p", groupQuantity: 3, updatedAt: at("2026-01-01T00:00:00Z") }],
      spec("productPriceTier"),
    );
    expect(diff.unchanged).toBe(1);
    expect(normalise(at("2026-11-11T00:00:00Z"))).toBe("2026-11-11T00:00:00.000Z");
    expect(normalise({ toString: () => "1.50" })).toBe("1.50");
  });

  it("never updates an append-only audit row", () => {
    const diff = diffRows(
      [{ id: "log", reason: "new" }],
      [{ id: "log", reason: "old" }],
      spec("inventoryAuditLog"),
    );
    expect(diff).toMatchObject({ create: [], update: [], unchanged: 1 });
  });
});

describe("withActivationPolicy", () => {
  const source = [
    { id: "on-both", isActive: true, restriction: null },
    { id: "staging-only-on", isActive: true, restriction: null },
    { id: "new", isActive: true, restriction: null },
    { id: "restricted", isActive: true, restriction: "AGE_RESTRICTED" },
  ];
  const target = [
    { id: "on-both", isActive: true },
    { id: "staging-only-on", isActive: false },
    { id: "restricted", isActive: true },
  ];

  it("keep-production keeps production's switch, and new rows arrive off", () => {
    const rows = withActivationPolicy(source, target, ["id"], "keep-production");
    expect(Object.fromEntries(rows.map((r) => [r.id, r.isActive]))).toEqual({
      "on-both": true,
      "staging-only-on": false,
      new: false,
      restricted: false,
    });
  });

  it("copy takes staging's switch, but a restricted product is always off", () => {
    const rows = withActivationPolicy(source, target, ["id"], "copy");
    expect(Object.fromEntries(rows.map((r) => [r.id, r.isActive]))).toEqual({
      "on-both": true,
      "staging-only-on": true,
      new: true,
      restricted: false,
    });
  });
});

describe("uniqueClashes", () => {
  it("finds a slug that two different ids would hold after the copy", () => {
    const clashes = uniqueClashes(
      [{ id: "s1", vendorId: "v", slug: "fresh-fruit" }],
      [{ id: "p1", vendorId: "v", slug: "fresh-fruit" }],
      spec("category"),
    );
    expect(clashes).toHaveLength(1);
    expect(clashes[0]).toContain("fresh-fruit");
  });

  it("allows a slug that moves between rows in the same copy, and ignores null PLUs", () => {
    const clashes = uniqueClashes(
      [
        { id: "a", vendorId: "v", slug: "new-a", plu: null },
        { id: "b", vendorId: "v", slug: "old-a", plu: null },
      ],
      [
        { id: "a", vendorId: "v", slug: "old-a", plu: null },
        { id: "b", vendorId: "v", slug: "old-b", plu: null },
      ],
      spec("product"),
    );
    expect(clashes).toEqual([]);
  });
});

describe("parentsFirst and imageKeys", () => {
  it("orders categories so every parent precedes its children", () => {
    const ordered = parentsFirst([
      { id: "leaf", parentId: "mid" },
      { id: "mid", parentId: "root" },
      { id: "root", parentId: null },
      { id: "other", parentId: "existing-in-production" },
    ]).map((r) => r.id);
    expect(ordered.indexOf("root")).toBeLessThan(ordered.indexOf("mid"));
    expect(ordered.indexOf("mid")).toBeLessThan(ordered.indexOf("leaf"));
    expect(ordered).toHaveLength(4);
  });

  it("collects each image key once, from every image column", () => {
    expect(
      imageKeys({
        category: [{ imageKey: "categories/a.png" }, { imageKey: null }],
        productImage: [{ storageKey: "products/p/1.png" }, { storageKey: "products/p/1.png" }],
        promotion: [{ imageKey: "promotions/x.png" }],
      }),
    ).toEqual(["categories/a.png", "products/p/1.png", "promotions/x.png"]);
  });
});

describe("writePlan", () => {
  function fakeClient() {
    const calls: string[] = [];
    const client: Record<string, Delegate> = {};
    for (const t of TABLES) {
      client[t.model] = {
        findMany: vi.fn(async () => []),
        createMany: vi.fn(async (args: { data: { id: string }[] }) => {
          calls.push(`${t.model}.create ${args.data.map((r) => r.id).join(",")}`);
        }),
        update: vi.fn(async (args: { where: { id: string } }) => {
          calls.push(`${t.model}.update ${args.where.id}`);
        }),
        deleteMany: vi.fn(async (args: { where: { id: { in: string[] } } }) => {
          calls.push(`${t.model}.delete ${args.where.id.in.join(",")}`);
        }),
      } as unknown as Delegate;
    }
    return { client, calls };
  }
  const empty: RowDiff = { create: [], update: [], onlyInTarget: [], unchanged: 0 };

  it("writes parents before children, bumps stock versions, and mirrors image rows", async () => {
    const { client, calls } = fakeClient();
    const diffs = new Map<string, RowDiff>([
      [
        "category",
        {
          ...empty,
          create: [
            { id: "child", parentId: "parent" },
            { id: "parent", parentId: null },
          ],
        },
      ],
      ["product", { ...empty, create: [{ id: "p1", categoryId: "child" }] }],
      [
        "inventory",
        {
          ...empty,
          update: [{ id: "inv", data: { stockMode: "UNTRACKED" }, changed: ["stockMode"] }],
        },
      ],
      [
        "productImage",
        { ...empty, create: [{ id: "img-new" }], onlyInTarget: [{ id: "img-placeholder" }] },
      ],
      ["promotion", { ...empty, onlyInTarget: [{ id: "promo-prod-only" }] }],
    ]);
    await writePlan(client, diffs);

    expect(calls).toEqual([
      "category.create parent",
      "category.create child",
      "product.create p1",
      "inventory.update inv",
      "productImage.create img-new",
      "productImage.delete img-placeholder",
    ]);
    // A promotion only in production is reported, never deleted.
    expect(client.promotion.deleteMany).not.toHaveBeenCalled();
    expect(client.inventory.update).toHaveBeenCalledWith({
      where: { id: "inv" },
      data: { stockMode: "UNTRACKED", version: { increment: 1 } },
    });
  });
});
