import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { groupOfferProductsByDepartment } from "@/lib/whatsapp-offers";
import { listOfferProducts, type ProductSummary } from "@/lib/repositories/products";
import { visibleCategoryWhere } from "@/lib/category-visibility";
import type { StorefrontCategoryNode } from "@/lib/repositories/categories";
import {
  formatCampaignValidity,
  WhatsappOffersView,
  type WhatsappOffersViewProps,
} from "@/app/(storefront)/whatsapp-offers/page";

vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));

function sampleProduct(overrides: Partial<ProductSummary> = {}): ProductSummary {
  return {
    id: "prod-1",
    slug: "sample-item",
    name: "Sample Item",
    basePrice: 199,
    unitLabel: "1 pack",
    originalPrice: 299,
    isHalal: false,
    isFresh: false,
    isOrganic: false,
    isVegetarian: false,
    isGlutenFree: false,
    isHmcCertified: false,
    origin: null,
    brand: null,
    averageRating: 0,
    reviewCount: 0,
    netContentAmount: null,
    netContentUnit: null,
    primaryImage: { storageKey: "vendors/v1/prod-1.webp", alt: "Sample Item", isPrimary: true },
    inStock: true,
    stockQuantity: 12,
    stockMode: "TRACKED",
    lowStockThreshold: 5,
    expectedRestockDay: null,
    tier: null,
    cardSpecifications: [],
    ...overrides,
  };
}

function baseProps(overrides: Partial<WhatsappOffersViewProps> = {}): WhatsappOffersViewProps {
  return {
    vendorName: "First Store",
    whatsappCommunityUrl: "https://chat.whatsapp.com/FTgLVoelRw7262i0OvAIzS",
    qrImageUrl: "https://cdn.example/vendors/v1/whatsapp-qr.png",
    departments: [
      { id: "dept-1", slug: "dept-one", name: "Department One" },
      { id: "dept-2", slug: "dept-two", name: "Department Two" },
    ],
    liveCampaigns: [],
    bundles: [],
    offerGroups: [
      {
        department: { id: "dept-1", slug: "dept-one", name: "Department One" },
        products: [sampleProduct()],
      },
    ],
    gridDensity: "STANDARD",
    cdnBaseUrl: "https://cdn.example",
    cartQuantities: new Map(),
    favouriteState: () => "signed-out",
    ...overrides,
  };
}

describe("listOfferProducts (#1233 R6)", () => {
  it("queries active on-offer products in visible categories, selects categoryId, and attaches active tiers", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "prod-1",
        slug: "offer-item",
        name: "Offer Item",
        basePrice: 250,
        unitLabel: "1 pack",
        originalPrice: 350,
        isActive: true,
        isHalal: false,
        isFresh: false,
        isOrganic: false,
        isVegetarian: false,
        isGlutenFree: false,
        isHmcCertified: false,
        origin: null,
        brand: null,
        averageRating: 0,
        reviewCount: 0,
        netContentAmount: null,
        netContentUnit: null,
        restriction: null,
        inventory: {
          quantity: 5,
          stockMode: "TRACKED",
          lowStockThreshold: 5,
          expectedRestockDate: null,
        },
        images: [{ storageKey: "vendors/v1/p1.webp", altText: "Offer Item" }],
        attributeValues: [],
        categoryId: "subcat-1",
      },
    ]);
    const tierFindMany = vi.fn().mockResolvedValue([
      {
        productId: "prod-1",
        groupQuantity: 3,
        groupPricePence: 600,
        isActive: true,
      },
    ]);

    const prisma = {
      product: { findMany },
      productPriceTier: { findMany: tierFindMany },
    } as any;

    const result = await listOfferProducts(prisma, "vendor-1", 50);

    expect(findMany).toHaveBeenCalledTimes(1);
    const callArg = findMany.mock.calls[0][0];
    expect(callArg.where).toMatchObject({
      vendorId: "vendor-1",
      isActive: true,
      category: visibleCategoryWhere,
      AND: [{ OR: [{ originalPrice: { not: null } }, { priceTier: { isNot: null } }] }],
    });
    expect(callArg.take).toBe(50);
    expect(callArg.select.categoryId).toBe(true);

    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe("subcat-1");
    expect(result[0].product.id).toBe("prod-1");
    expect(result[0].product.tier).toEqual({
      groupQuantity: 3,
      groupPricePence: 600,
      isActive: true,
    });
  });
});

describe("groupOfferProductsByDepartment (#1233 R7)", () => {
  const tree: StorefrontCategoryNode[] = [
    { id: "dept-1", slug: "fresh-items", name: "Fresh Items", parentId: null, isActive: true },
    { id: "sub-1a", slug: "leafy", name: "Leafy", parentId: "dept-1", isActive: true },
    { id: "dept-2", slug: "empty-dept", name: "Empty Dept", parentId: null, isActive: true },
    { id: "dept-3", slug: "essentials", name: "Essentials", parentId: null, isActive: true },
  ];

  it("groups direct department products and subcategory products under their top-level department in tree order, omitting empty departments", () => {
    const p1 = sampleProduct({ id: "p1", name: "Direct Dept 1" });
    const p2 = sampleProduct({ id: "p2", name: "Subcategory of Dept 1" });
    const p3 = sampleProduct({ id: "p3", name: "Direct Dept 3" });

    const groups = groupOfferProductsByDepartment(
      [
        { product: p3, categoryId: "dept-3" },
        { product: p1, categoryId: "dept-1" },
        { product: p2, categoryId: "sub-1a" },
      ],
      tree,
    );

    expect(groups.map((g) => g.department.slug)).toEqual(["fresh-items", "essentials"]);
    expect(groups[0].products.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(groups[1].products.map((p) => p.id)).toEqual(["p3"]);
  });
});

describe("formatCampaignValidity (#1233 R15a)", () => {
  it("formats start and end dates, single-sided bounds, and null", () => {
    const start = new Date("2026-10-20T00:00:00.000Z");
    const end = new Date("2026-10-31T00:00:00.000Z");

    expect(formatCampaignValidity(start, end)).toBe("Valid 20 Oct 2026 – 31 Oct 2026");
    expect(formatCampaignValidity(null, end)).toBe("Valid until 31 Oct 2026");
    expect(formatCampaignValidity(start, null)).toBe("From 20 Oct 2026");
    expect(formatCampaignValidity(null, null)).toBeNull();
  });
});

describe("WhatsappOffersView (#1233 R13, R14, R15)", () => {
  it("renders the top WhatsApp banner, QR code image, and bottom WhatsApp CTA when whatsappCommunityUrl and qrImageUrl are present (R13)", () => {
    const html = renderToStaticMarkup(createElement(WhatsappOffersView, baseProps()));

    expect(html).toContain("Stay Updated with Our Latest Offers!");
    expect(html).toContain(
      "Join the First Store WhatsApp group to discover special promotions, exclusive deals, fresh arrivals, and exciting savings on your favourite products.",
    );
    expect(html).toContain("Join Our WhatsApp Group");
    expect(html).toContain("Free to join. Leave anytime.");
    expect(html).toContain('href="https://chat.whatsapp.com/FTgLVoelRw7262i0OvAIzS"');
    expect(html).toContain('src="https://cdn.example/vendors/v1/whatsapp-qr.png"');
    expect(html).toContain('alt="Scan to join the First Store WhatsApp group"');
    expect(html).toContain("Never miss a deal at First Store");
  });

  it("omits the QR code card when qrImageUrl is null while keeping the WhatsApp join button (R13b)", () => {
    const html = renderToStaticMarkup(
      createElement(WhatsappOffersView, baseProps({ qrImageUrl: null })),
    );

    expect(html).toContain("Stay Updated with Our Latest Offers!");
    expect(html).toContain("Join Our WhatsApp Group");
    expect(html).not.toContain("Scan to join the First Store WhatsApp group");
  });

  it("hides both the top WhatsApp banner and bottom WhatsApp CTA when whatsappCommunityUrl is null (#239, R14)", () => {
    const html = renderToStaticMarkup(
      createElement(
        WhatsappOffersView,
        baseProps({
          vendorName: "Second Store",
          whatsappCommunityUrl: null,
          qrImageUrl: "https://cdn.example/vendors/v2/whatsapp-qr.png",
        }),
      ),
    );

    expect(html).not.toContain("Stay Updated with Our Latest Offers!");
    expect(html).not.toContain("Join Our WhatsApp Group");
    expect(html).not.toContain("chat.whatsapp.com");
    expect(html).not.toContain("Never miss a deal at");
    expect(html).toContain("Latest Offers &amp; Deals");
    expect(html).toContain("Department One");
  });

  it("renders live department campaigns with validity dates and department product groups (R15a, R15c)", () => {
    const html = renderToStaticMarkup(
      createElement(
        WhatsappOffersView,
        baseProps({
          liveCampaigns: [
            {
              department: { id: "dept-1", slug: "dept-one", name: "Department One" },
              campaign: {
                id: "camp-1",
                categoryId: "dept-1",
                headline: "Weekend Half-Price Event",
                subtitle: "Selected items across the department",
                imageKey: null,
                altText: null,
                linkUrl: "/categories/dept-one?onOffer=1",
                isActive: true,
                startsAt: new Date("2026-10-20T00:00:00.000Z"),
                endsAt: new Date("2026-10-27T00:00:00.000Z"),
              },
            },
          ],
        }),
      ),
    );

    expect(html).toContain("Weekend Half-Price Event");
    expect(html).toContain("Selected items across the department");
    expect(html).toContain("Valid 20 Oct 2026 – 27 Oct 2026");
    expect(html).toContain('href="/categories/dept-one?onOffer=1"');
    expect(html).toContain("Sample Item");
  });

  it("renders the friendly empty state when there are no offers, bundles, or live campaigns (R15d)", () => {
    const html = renderToStaticMarkup(
      createElement(
        WhatsappOffersView,
        baseProps({
          liveCampaigns: [],
          bundles: [],
          offerGroups: [],
        }),
      ),
    );

    expect(html).toContain("New promotions are on the way");
    expect(html).toContain("Shop all departments");
    expect(html).toContain('href="/categories"');
  });
});
