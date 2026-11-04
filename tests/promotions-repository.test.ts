import { describe, expect, it, vi } from "vitest";
import {
  createPromotion,
  updatePromotion,
  deletePromotion,
  listPromotionsForAdmin,
  listLivePromotions,
  type PromotionWriteInput,
} from "@/lib/repositories/promotions";

const VENDOR_ID = "vendor-1";
const PROMO_ID = "promo-1";

function mockPrisma() {
  return {
    promotion: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe("promotions repository (R3, R10, R17)", () => {
  it("creates a generic promotion with null target IDs", async () => {
    const prisma = mockPrisma();
    prisma.promotion.create.mockResolvedValueOnce({ id: PROMO_ID });

    const input: PromotionWriteInput = {
      headline: "Store-wide Sale",
      subtitle: "10% off everything",
      priority: 5,
      isActive: true,
      categoryId: null,
      bundleId: null,
      discountCodeId: null,
    };

    const res = await createPromotion(prisma as never, VENDOR_ID, input);
    expect(res).toEqual({ ok: true, id: PROMO_ID });

    expect(prisma.promotion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vendorId: VENDOR_ID,
        headline: "Store-wide Sale",
        subtitle: "10% off everything",
        priority: 5,
        isActive: true,
        categoryId: null,
        bundleId: null,
        discountCodeId: null,
        audienceSegment: "ALL",
      }),
      select: { id: true },
    });
  });

  it("updates an existing promotion scoped to vendorId", async () => {
    const prisma = mockPrisma();
    prisma.promotion.findFirst.mockResolvedValueOnce({ id: PROMO_ID });
    prisma.promotion.update.mockResolvedValueOnce({ id: PROMO_ID });

    const res = await updatePromotion(prisma as never, VENDOR_ID, PROMO_ID, {
      headline: "Updated Headline",
      badgeText: "Weekend Deal",
    });

    expect(res).toEqual({ ok: true, id: PROMO_ID });
    expect(prisma.promotion.findFirst).toHaveBeenCalledWith({
      where: { id: PROMO_ID, vendorId: VENDOR_ID },
      select: { id: true },
    });
    expect(prisma.promotion.update).toHaveBeenCalledWith({
      where: { id: PROMO_ID },
      data: expect.objectContaining({
        headline: "Updated Headline",
        badgeText: "Weekend Deal",
      }),
      select: { id: true },
    });
  });

  it("refuses update if promotion does not belong to vendorId", async () => {
    const prisma = mockPrisma();
    prisma.promotion.findFirst.mockResolvedValueOnce(null);

    const res = await updatePromotion(prisma as never, VENDOR_ID, PROMO_ID, {
      headline: "Other vendor promo",
    });

    expect(res.ok).toBe(false);
    expect(prisma.promotion.update).not.toHaveBeenCalled();
  });

  it("deletes promotion only after confirming vendorId ownership", async () => {
    const prisma = mockPrisma();
    prisma.promotion.findFirst.mockResolvedValueOnce({ id: PROMO_ID });
    prisma.promotion.delete.mockResolvedValueOnce({ id: PROMO_ID });

    const res = await deletePromotion(prisma as never, VENDOR_ID, PROMO_ID);
    expect(res).toEqual({ ok: true });
    expect(prisma.promotion.findFirst).toHaveBeenCalledWith({
      where: { id: PROMO_ID, vendorId: VENDOR_ID },
      select: { id: true },
    });
    expect(prisma.promotion.delete).toHaveBeenCalledWith({
      where: { id: PROMO_ID },
    });
  });

  it("orders admin promotions by priority DESC, createdAt DESC", async () => {
    const prisma = mockPrisma();
    prisma.promotion.findMany.mockResolvedValueOnce([]);

    await listPromotionsForAdmin(prisma as never, VENDOR_ID);

    expect(prisma.promotion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { vendorId: VENDOR_ID },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      }),
    );
  });

  it("queries live promotions bounded by date and priority (R17)", async () => {
    const prisma = mockPrisma();
    prisma.promotion.findMany.mockResolvedValueOnce([]);
    const now = new Date("2026-11-04T12:00:00Z");

    await listLivePromotions(prisma as never, VENDOR_ID, now, 3);

    expect(prisma.promotion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          vendorId: VENDOR_ID,
          isActive: true,
        }),
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 3,
      }),
    );
  });
});
