import { describe, expect, it, vi } from "vitest";
import {
  listPlatformVendors,
  listPlatformDomains,
  getPlatformOverviewMetrics,
  getPlatformHealthSummary,
} from "@/lib/repositories/platform-admin";

function mockPrisma() {
  return {
    vendor: {
      findMany: vi.fn(async () => [
        {
          id: "vendor-1",
          slug: "aheed-food-centre",
          name: "Aheed Food Centre",
          status: "ACTIVE",
          createdAt: new Date("2026-01-01"),
          domains: [{ id: "dom-1", host: "aheedfoodcentre.nocaped.com", isCanonical: true }],
          _count: {
            categories: 12,
            products: 120,
            memberships: 3,
            deliveryAreas: 4,
          },
        },
      ]),
      count: vi.fn(async () => 2),
    },
    product: {
      count: vi.fn(async () => 110),
    },
    vendorDomain: {
      findMany: vi.fn(async () => [
        {
          id: "dom-1",
          host: "aheedfoodcentre.nocaped.com",
          isCanonical: true,
          createdAt: new Date("2026-01-01"),
          vendor: {
            id: "vendor-1",
            slug: "aheed-food-centre",
            name: "Aheed Food Centre",
            status: "ACTIVE",
          },
        },
      ]),
      count: vi.fn(async () => 2),
    },
    user: {
      count: vi.fn(async () => 50),
    },
    errorEvent: {
      count: vi.fn(async () => 5),
    },
    healthCheck: {
      findFirst: vi.fn(async () => ({
        checkedAt: new Date("2026-10-25T19:00:00Z"),
      })),
    },
  };
}

describe("Platform Admin Repository (#1269)", () => {
  it("listPlatformVendors returns vendor summaries with catalogue counts", async () => {
    const prisma = mockPrisma();
    const vendors = await listPlatformVendors(prisma as never);

    expect(vendors).toHaveLength(1);
    expect(vendors[0].name).toBe("Aheed Food Centre");
    expect(vendors[0].canonicalHost).toBe("aheedfoodcentre.nocaped.com");
    expect(vendors[0].totalProducts).toBe(120);
    expect(vendors[0].activeProducts).toBe(110);
    expect(vendors[0].totalCategories).toBe(12);
  });

  it("listPlatformDomains returns all registered hostnames across vendors", async () => {
    const prisma = mockPrisma();
    const domains = await listPlatformDomains(prisma as never);

    expect(domains).toHaveLength(1);
    expect(domains[0].host).toBe("aheedfoodcentre.nocaped.com");
    expect(domains[0].isCanonical).toBe(true);
    expect(domains[0].vendor.name).toBe("Aheed Food Centre");
  });

  it("getPlatformOverviewMetrics aggregates cross-tenant counts", async () => {
    const prisma = mockPrisma();
    const metrics = await getPlatformOverviewMetrics(prisma as never);

    expect(metrics.totalVendors).toBe(2);
    expect(metrics.activeVendors).toBe(2);
    expect(metrics.totalProducts).toBe(110);
    expect(metrics.totalUsers).toBe(50);
    expect(metrics.recentErrorsCount).toBe(5);
  });

  it("getPlatformHealthSummary pings database and retrieves health status", async () => {
    const prisma = mockPrisma();
    const health = await getPlatformHealthSummary(prisma as never);

    expect(health.dbConnected).toBe(true);
    expect(health.dbPingMs).toBeGreaterThanOrEqual(0);
    expect(health.recentErrorCount).toBe(5);
    expect(health.lastCheckedAt).toEqual(new Date("2026-10-25T19:00:00Z"));
    expect(health.totalVendors).toBe(2);
  });
});
