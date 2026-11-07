import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { parseEnvFile } from "./lib/env-file";

function resolveConnectionString(): string {
  const envFlagIndex = process.argv.indexOf("--env-file");
  if (envFlagIndex !== -1 && process.argv[envFlagIndex + 1]) {
    const envVars = parseEnvFile(process.argv[envFlagIndex + 1]);
    const conn = envVars.DIRECT_URL || envVars.DATABASE_URL;
    if (conn) return conn;
  }
  return process.env.DIRECT_URL || process.env.DATABASE_URL || "";
}

const connectionString = resolveConnectionString();
if (!connectionString) {
  console.error("Neither DIRECT_URL nor DATABASE_URL is set in environment or env-file.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString }),
});

export interface CatalogueBackup {
  metadata: {
    timestamp: string;
    vendorId: string;
    vendorSlug: string;
    vendorName: string;
    productCount: number;
    categoryCount: number;
    inventoryCount: number;
    orderCount: number;
    orderItemCount: number;
  };
  vendor: {
    id: string;
    slug: string;
    name: string;
    status: string;
  };
  categories: Array<{
    id: string;
    slug: string;
    name: string;
    imageKey: string | null;
    sortOrder: number;
    parentId: string | null;
  }>;
  products: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    categoryId: string;
    basePrice: number;
    unitLabel: string;
    isActive: boolean;
    netContentAmount: number | null;
    netContentUnit: string | null;
    origin: string | null;
    isHalal: boolean;
    isFresh: boolean;
    isOrganic: boolean;
    isVegetarian: boolean;
    isGlutenFree: boolean;
    isHmcCertified: boolean;
    isFeatured: boolean;
    inventory: {
      id: string;
      quantity: number;
      stockMode: string;
      lowStockThreshold: number;
      expectedRestockDate: string | null;
    } | null;
    orderItemIds: string[];
  }>;
}

export async function backupCatalogue(vendorId: string, outputDir = ".backups"): Promise<string> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, slug: true, name: true, status: true },
  });

  if (!vendor) {
    throw new Error(`Vendor ${vendorId} not found.`);
  }

  const categories = await prisma.category.findMany({
    where: { vendorId },
    select: {
      id: true,
      slug: true,
      name: true,
      imageKey: true,
      sortOrder: true,
      parentId: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  const products = await prisma.product.findMany({
    where: { vendorId },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      categoryId: true,
      basePrice: true,
      unitLabel: true,
      isActive: true,
      netContentAmount: true,
      netContentUnit: true,
      origin: true,
      isHalal: true,
      isFresh: true,
      isOrganic: true,
      isVegetarian: true,
      isGlutenFree: true,
      isHmcCertified: true,
      isFeatured: true,
      inventory: {
        select: {
          id: true,
          quantity: true,
          stockMode: true,
          lowStockThreshold: true,
          expectedRestockDate: true,
        },
      },
      orderItems: {
        select: { id: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const orderCount = await prisma.order.count({
    where: { vendorId },
  });

  const orderItemCount = await prisma.orderItem.count({
    where: { order: { vendorId } },
  });

  const backupData: CatalogueBackup = {
    metadata: {
      timestamp: new Date().toISOString(),
      vendorId: vendor.id,
      vendorSlug: vendor.slug,
      vendorName: vendor.name,
      productCount: products.length,
      categoryCount: categories.length,
      inventoryCount: products.filter((p) => p.inventory !== null).length,
      orderCount,
      orderItemCount,
    },
    vendor: {
      id: vendor.id,
      slug: vendor.slug,
      name: vendor.name,
      status: vendor.status,
    },
    categories,
    products: products.map((p) => ({
      ...p,
      inventory: p.inventory
        ? {
            ...p.inventory,
            expectedRestockDate: p.inventory.expectedRestockDate
              ? p.inventory.expectedRestockDate.toISOString()
              : null,
          }
        : null,
      orderItemIds: p.orderItems.map((oi) => oi.id),
    })),
  };

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestampStr = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `backup-${vendor.slug}-${timestampStr}.json`;
  const filePath = path.join(outputDir, fileName);

  fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), "utf8");
  console.log(`Catalogue backup saved to ${filePath}`);
  console.log(
    `Summary: ${products.length} products, ${categories.length} categories, ${orderCount} orders, ${orderItemCount} order items.`,
  );
  return filePath;
}

if (process.argv[1] && process.argv[1].endsWith("backup-aheed-catalogue.ts")) {
  const vendorFlagIndex = process.argv.indexOf("--vendor-id");
  const vendorId =
    vendorFlagIndex !== -1
      ? process.argv[vendorFlagIndex + 1]
      : process.argv[2] && !process.argv[2].startsWith("--")
        ? process.argv[2]
        : "a4ed0000-0000-4000-a000-000000000001";
  backupCatalogue(vendorId)
    .catch((err) => {
      console.error("Backup failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
