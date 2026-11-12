import { describe, expect, it, vi } from "vitest";
import { resolveAutoPromotionAtCheckout } from "@/lib/promotions-checkout";
import type { getPrisma } from "@/lib/db";
import type { PromotionRow } from "@/lib/repositories/promotions";

type MockPrisma = ReturnType<typeof getPrisma>;

function mockPromo(overrides: Partial<PromotionRow> = {}): PromotionRow {
  return {
    id: "promo-1",
    vendorId: "v-1",
    headline: "Summer Sale",
    subtitle: null,
    badgeText: null,
    callToActionText: null,
    imageKey: null,
    altText: null,
    imageNeedsReview: false,
    linkUrl: null,
    priority: 10,
    isActive: true,
    startsAt: null,
    endsAt: null,
    audienceSegment: "ALL",
    channel: "WEBSITE",
    createdAt: new Date(),
    updatedAt: new Date(),
    categoryId: null,
    bundleId: null,
    discountCodeId: "dc-1",
    productId: null,
    discountCode: {
      id: "dc-1",
      code: "SAVE10",
      kind: "PERCENTAGE",
      value: 10,
      minSubtotalPence: 0,
    },
    ...overrides,
  };
}

describe("resolveAutoPromotionAtCheckout (R9, R10)", () => {
  it("returns null when cart has no products", async () => {
    const prisma = {} as MockPrisma;
    const result = await resolveAutoPromotionAtCheckout(prisma, "v-1", []);
    expect(result).toBeNull();
  });

  it("applies store-wide promotion with discount code", async () => {
    const promo = mockPromo({ priority: 10 });
    const prisma = {
      promotion: {
        findMany: vi.fn().mockResolvedValue([promo]),
      },
      product: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "p-1", categoryId: "cat-1", category: { id: "cat-1", parentId: null } },
          ]),
      },
    } as unknown as MockPrisma;

    const result = await resolveAutoPromotionAtCheckout(prisma, "v-1", ["p-1"]);
    expect(result).not.toBeNull();
    expect(result?.discountCode).toBe("SAVE10");
    expect(result?.headline).toBe("Summer Sale");
  });

  it("applies department-scoped promotion when cart contains matching item", async () => {
    const promo = mockPromo({
      categoryId: "cat-drinks",
      discountCode: {
        id: "dc-2",
        code: "DRINKS5",
        kind: "PERCENTAGE",
        value: 5,
        minSubtotalPence: 0,
      },
    });
    const prisma = {
      promotion: {
        findMany: vi.fn().mockResolvedValue([promo]),
      },
      product: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "p-juice",
            categoryId: "cat-drinks",
            category: { id: "cat-drinks", parentId: null },
          },
        ]),
      },
    } as unknown as MockPrisma;

    const result = await resolveAutoPromotionAtCheckout(prisma, "v-1", ["p-juice"]);
    expect(result?.discountCode).toBe("DRINKS5");
  });

  it("does not apply department-scoped promotion when cart items belong to other categories", async () => {
    const promo = mockPromo({
      categoryId: "cat-drinks",
      discountCode: {
        id: "dc-2",
        code: "DRINKS5",
        kind: "PERCENTAGE",
        value: 5,
        minSubtotalPence: 0,
      },
    });
    const prisma = {
      promotion: {
        findMany: vi.fn().mockResolvedValue([promo]),
      },
      product: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "p-meat",
            categoryId: "cat-butchery",
            category: { id: "cat-butchery", parentId: null },
          },
        ]),
      },
    } as unknown as MockPrisma;

    const result = await resolveAutoPromotionAtCheckout(prisma, "v-1", ["p-meat"]);
    expect(result).toBeNull();
  });

  it("applies product-specific promotion when the product is in cart", async () => {
    const promo = mockPromo({
      productId: "p-lamb",
      discountCode: {
        id: "dc-3",
        code: "LAMB20",
        kind: "PERCENTAGE",
        value: 20,
        minSubtotalPence: 0,
      },
    });
    const prisma = {
      promotion: {
        findMany: vi.fn().mockResolvedValue([promo]),
      },
      product: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "p-lamb",
            categoryId: "cat-butchery",
            category: { id: "cat-butchery", parentId: null },
          },
        ]),
      },
    } as unknown as MockPrisma;

    const result = await resolveAutoPromotionAtCheckout(prisma, "v-1", ["p-lamb"]);
    expect(result?.discountCode).toBe("LAMB20");
  });
});
