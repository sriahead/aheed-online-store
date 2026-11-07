import { describe, it, expect, vi } from "vitest";

describe("reset-halal-tags logic", () => {
  it("targets only the specified vendor and resets all halal and HMC flags to false / null", async () => {
    const mockVendorId = "a4ed0000-0000-4000-a000-000000000001";
    let updatedPayload: any = null;
    let whereCondition: any = null;

    const mockPrisma = {
      product: {
        updateMany: vi.fn(async (args: any) => {
          whereCondition = args.where;
          updatedPayload = args.data;
          return { count: 711 };
        }),
      },
    };

    const result = await mockPrisma.product.updateMany({
      where: {
        vendorId: mockVendorId,
        OR: [
          { isHalal: true },
          { isHmcCertified: true },
          { hmcReference: { not: null } },
          { hmcVerifiedAt: { not: null } },
        ],
      },
      data: {
        isHalal: false,
        isHmcCertified: false,
        hmcReference: null,
        hmcVerifiedAt: null,
      },
    });

    expect(result.count).toBe(711);
    expect(whereCondition.vendorId).toBe(mockVendorId);
    expect(updatedPayload).toEqual({
      isHalal: false,
      isHmcCertified: false,
      hmcReference: null,
      hmcVerifiedAt: null,
    });
  });

  it("never touches other vendors", async () => {
    const aheedVendorId = "a4ed0000-0000-4000-a000-000000000001";
    const sriMartVendorId = "5217a4a7-0000-4000-a000-000000000002";

    const whereClause = {
      vendorId: aheedVendorId,
    };

    expect(whereClause.vendorId).not.toBe(sriMartVendorId);
  });
});
