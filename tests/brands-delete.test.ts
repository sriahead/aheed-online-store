import { describe, expect, it, vi } from "vitest";
import { deleteBrandForVendor } from "@/lib/repositories/brands";

/**
 * #917 — brand deletion. The repository takes its client explicitly (#252), so a stub stands in
 * for Prisma here; the live proof against a real database is validation.md's R34.
 */

type DeleteDb = Parameters<typeof deleteBrandForVendor>[0];

function stub(productCount: number | null) {
  const findFirst = vi.fn(async () =>
    productCount === null ? null : { _count: { products: productCount } },
  );
  const deleteMany = vi.fn(async () => ({ count: 1 }));
  const prisma = { brand: { findFirst, deleteMany } } as unknown as DeleteDb;
  return { prisma, findFirst, deleteMany };
}

describe("deleteBrandForVendor (#917)", () => {
  it("(a) refuses a brand this vendor does not have, and deletes nothing", async () => {
    const { prisma, findFirst, deleteMany } = stub(null);
    const result = await deleteBrandForVendor(prisma, "vendor-1", {
      id: "brand-1",
      confirmed: true,
    });
    expect(result).toEqual({ ok: false, error: "That brand no longer exists.", field: "id" });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "brand-1", vendorId: "vendor-1" } }),
    );
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("(b) refuses an in-use brand without confirmation, and deletes nothing", async () => {
    const { prisma, deleteMany } = stub(3);
    const result = await deleteBrandForVendor(prisma, "vendor-1", {
      id: "brand-1",
      confirmed: false,
    });
    expect(result).toEqual({
      ok: false,
      error: "Tick the box to confirm.",
      field: "confirmDelete",
    });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("(c) deletes an in-use brand once confirmed, scoped by vendor", async () => {
    const { prisma, deleteMany } = stub(3);
    const result = await deleteBrandForVendor(prisma, "vendor-1", {
      id: "brand-1",
      confirmed: true,
    });
    expect(result).toEqual({ ok: true, id: "brand-1" });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "brand-1", vendorId: "vendor-1" } });
  });

  it("(d) deletes a brand no product uses without confirmation", async () => {
    const { prisma, deleteMany } = stub(0);
    const result = await deleteBrandForVendor(prisma, "vendor-1", {
      id: "brand-1",
      confirmed: false,
    });
    expect(result).toEqual({ ok: true, id: "brand-1" });
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });
});
