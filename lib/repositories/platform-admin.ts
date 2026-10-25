import type { getPrisma } from "@/lib/db";

/**
 * Pure repository for Platform Administration (issue #1269).
 *
 * Adheres strictly to:
 * - tests/repository-purity.test.ts (zero request context imports)
 * - tests/repository-client-injection.test.ts (injected prisma client)
 */

type Db = ReturnType<typeof getPrisma>;

export interface PlatformVendorSummary {
  id: string;
  slug: string;
  name: string;
  status: string;
  createdAt: Date;
  locality: string | null;
  canonicalHost: string | null;
  domains: Array<{
    id: string;
    host: string;
    isCanonical: boolean;
  }>;
  totalCategories: number;
  totalProducts: number;
  activeProducts: number;
  totalTeamMembers: number;
  totalDeliveryAreas: number;
  logoKey: string | null;
}

export interface PlatformDomainSummary {
  id: string;
  host: string;
  isCanonical: boolean;
  createdAt: Date;
  vendor: {
    id: string;
    slug: string;
    name: string;
    status: string;
  };
}

export interface PlatformOverviewMetrics {
  totalVendors: number;
  activeVendors: number;
  totalDomains: number;
  totalUsers: number;
  totalProducts: number;
  totalActiveProducts: number;
  recentErrorsCount: number;
}

export interface PlatformHealthSummary {
  dbConnected: boolean;
  dbPingMs: number;
  lastCheckedAt: Date | null;
  recentErrorCount: number;
  totalVendors: number;
}

/**
 * List all vendors across the platform with aggregated statistics.
 */
export async function listPlatformVendors(prisma: Db): Promise<PlatformVendorSummary[]> {
  const vendors = await prisma.vendor.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      branding: {
        select: {
          name: true,
          logoStorageKey: true,
        },
      },
      config: {
        select: {
          localityName: true,
        },
      },
      domains: {
        select: {
          id: true,
          host: true,
          isCanonical: true,
        },
        orderBy: [{ isCanonical: "desc" }, { host: "asc" }],
      },
      _count: {
        select: {
          categories: true,
          products: true,
          memberships: true,
          deliveryAreas: true,
        },
      },
    },
  });

  const activeProductCounts = await Promise.all(
    vendors.map((v) =>
      prisma.product.count({
        where: {
          vendorId: v.id,
          isActive: true,
        },
      }),
    ),
  );

  return vendors.map((v, i) => {
    const canonical = v.domains.find((d) => d.isCanonical) ?? v.domains[0] ?? null;
    return {
      id: v.id,
      slug: v.slug,
      name: v.branding?.name || v.name,
      status: v.status,
      createdAt: v.createdAt,
      locality: v.config?.localityName ?? null,
      canonicalHost: canonical ? canonical.host : null,
      domains: v.domains,
      totalCategories: v._count.categories,
      totalProducts: v._count.products,
      activeProducts: activeProductCounts[i] ?? 0,
      totalTeamMembers: v._count.memberships,
      totalDeliveryAreas: v._count.deliveryAreas,
      logoKey: v.branding?.logoStorageKey ?? null,
    };
  });
}

/**
 * List all registered domains mapped across the platform.
 */
export async function listPlatformDomains(prisma: Db): Promise<PlatformDomainSummary[]> {
  const domains = await prisma.vendorDomain.findMany({
    orderBy: [{ host: "asc" }],
    include: {
      vendor: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
        },
      },
    },
  });

  return domains.map((d) => ({
    id: d.id,
    host: d.host,
    isCanonical: d.isCanonical,
    createdAt: d.createdAt,
    vendor: {
      id: d.vendor.id,
      slug: d.vendor.slug,
      name: d.vendor.name,
      status: d.vendor.status,
    },
  }));
}

/**
 * Global metrics across the platform.
 */
export async function getPlatformOverviewMetrics(prisma: Db): Promise<PlatformOverviewMetrics> {
  const [
    totalVendors,
    activeVendors,
    totalDomains,
    totalUsers,
    totalProducts,
    totalActiveProducts,
    recentErrorsCount,
  ] = await Promise.all([
    prisma.vendor.count(),
    prisma.vendor.count({ where: { status: "ACTIVE" } }),
    prisma.vendorDomain.count(),
    prisma.user.count(),
    prisma.product.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.errorEvent.count().catch(() => 0),
  ]);

  return {
    totalVendors,
    activeVendors,
    totalDomains,
    totalUsers,
    totalProducts,
    totalActiveProducts,
    recentErrorsCount,
  };
}

/**
 * Platform health indicators.
 */
export async function getPlatformHealthSummary(prisma: Db): Promise<PlatformHealthSummary> {
  const start = Date.now();
  let dbConnected = false;
  let lastCheckedAt: Date | null = null;
  let recentErrorCount = 0;
  let totalVendors = 0;

  try {
    const [latestCheck, errorCount, vendorsCount] = await Promise.all([
      prisma.healthCheck.findFirst({ orderBy: { checkedAt: "desc" }, select: { checkedAt: true } }),
      prisma.errorEvent.count().catch(() => 0),
      prisma.vendor.count(),
    ]);
    dbConnected = true;
    lastCheckedAt = latestCheck?.checkedAt ?? null;
    recentErrorCount = errorCount;
    totalVendors = vendorsCount;
  } catch {
    dbConnected = false;
  }
  const dbPingMs = Date.now() - start;

  return {
    dbConnected,
    dbPingMs,
    lastCheckedAt,
    recentErrorCount,
    totalVendors,
  };
}
