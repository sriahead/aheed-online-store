import { describe, expect, it, vi } from "vitest";
import {
  countHiddenWithCategory,
  updateCategoryForVendor,
  type CategoryWriteInput,
} from "@/lib/repositories/categories";

/**
 * #1131 R7 — switching off a department that still has active products and sub-categories is now a
 * plain save. Before this slice `updateCategoryForVendor` refused it ("still has N active products
 * … Deactivate or move those first"), so the owner could not hide any department that had stock.
 * Hiding is safe now because visibility is derived (lib/category-visibility.ts): nothing but the
 * category's own row may be written.
 */

const VENDOR = "vendor-a";
const ID = "dept-1";

function mockPrisma() {
  return {
    category: {
      findFirst: vi.fn(async () => ({ id: ID })),
      update: vi.fn(async () => ({ id: ID })),
      updateMany: vi.fn(),
      count: vi.fn(async () => 2),
    },
    product: {
      count: vi.fn(async () => 7),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

const HIDE: CategoryWriteInput = {
  name: "Department",
  slug: "department",
  parentId: null,
  sortOrder: 0,
  isActive: false,
};

describe("updateCategoryForVendor — hiding a department with stock (#1131 R7)", () => {
  it("succeeds and writes only the category's own row", async () => {
    const prisma = mockPrisma();
    const result = await updateCategoryForVendor(prisma as never, VENDOR, ID, HIDE);

    expect(result).toEqual({ ok: true, id: ID });
    expect(prisma.category.update).toHaveBeenCalledTimes(1);
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: ID, vendorId: VENDOR },
      data: expect.objectContaining({ isActive: false }),
    });
    // No product and no child category is touched.
    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
    expect(prisma.category.updateMany).not.toHaveBeenCalled();
  });

  it("does not even count the department's contents to decide", async () => {
    const prisma = mockPrisma();
    await updateCategoryForVendor(prisma as never, VENDOR, ID, HIDE);
    expect(prisma.product.count).not.toHaveBeenCalled();
    expect(prisma.category.count).not.toHaveBeenCalled();
  });

  it("still refuses a category that does not exist for this vendor", async () => {
    const prisma = mockPrisma();
    prisma.category.findFirst.mockResolvedValueOnce(null as never);
    const result = await updateCategoryForVendor(prisma as never, VENDOR, ID, HIDE);
    expect(result).toEqual({ ok: false, error: "That category no longer exists." });
    expect(prisma.category.update).not.toHaveBeenCalled();
  });
});

describe("countHiddenWithCategory — what the form says a switch-off hides (#1131 R8)", () => {
  it("counts active products in the category and in its active sub-categories, and active sub-categories", async () => {
    const prisma = mockPrisma();
    expect(await countHiddenWithCategory(prisma as never, VENDOR, ID)).toEqual({
      products: 7,
      subCategories: 2,
    });
    expect(prisma.product.count).toHaveBeenCalledWith({
      where: {
        vendorId: VENDOR,
        isActive: true,
        OR: [{ categoryId: ID }, { category: { parentId: ID, isActive: true } }],
      },
    });
    expect(prisma.category.count).toHaveBeenCalledWith({
      where: { vendorId: VENDOR, parentId: ID, isActive: true },
    });
  });
});
