import { describe, expect, it, vi } from "vitest";
import { keepCurrentOption } from "@/lib/promotion-target-options";
import { listEligiblePromotionalProducts } from "@/lib/repositories/promotions";

/** A promotion's saved bundle/code/product stays selectable on its edit page (2026-11-12). */

const all = [
  { id: "on", name: "BBQ Chicken Pack" },
  { id: "off", name: "Breakfast Basics" },
];
const active = [all[0]];
const mark = (o: { id: string; name: string }) => ({ ...o, name: `${o.name} (switched off)` });

describe("keepCurrentOption", () => {
  it("adds the saved option, marked, when the filter dropped it", () => {
    expect(keepCurrentOption(active, all, "off", mark)).toEqual([
      { id: "off", name: "Breakfast Basics (switched off)" },
      { id: "on", name: "BBQ Chicken Pack" },
    ]);
  });

  it("leaves the list alone when the saved option is already there, or there is none", () => {
    expect(keepCurrentOption(active, all, "on", mark)).toEqual(active);
    expect(keepCurrentOption(active, all, null, mark)).toEqual(active);
    expect(keepCurrentOption(active, all, "deleted", mark)).toEqual(active);
  });
});

describe("listEligiblePromotionalProducts includeIds", () => {
  it("adds the saved product to the OR, and only when given", async () => {
    const findMany = vi.fn(async () => []);
    const prisma = { product: { findMany } } as never;
    await listEligiblePromotionalProducts(prisma, "v");
    await listEligiblePromotionalProducts(prisma, "v", ["p1"]);
    const ors = findMany.mock.calls.map(
      (c) => (c as unknown as [{ where: { OR: object[] } }])[0].where.OR,
    );
    expect(ors[0]).toHaveLength(3);
    expect(ors[1]).toContainEqual({ id: { in: ["p1"] } });
  });
});
