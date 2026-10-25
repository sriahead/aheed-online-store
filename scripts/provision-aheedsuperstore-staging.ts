import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { parseEnvFile } from "./lib/env-file";
import { manifestSchema, provisionVendor, type Manifest } from "./provision-vendor";

/**
 * Provision Aheed Superstore test vendor for staging evaluation (#1265).
 *
 *   npx tsx scripts/provision-aheedsuperstore-staging.ts --env-file secrets/staging.vars          # dry-run
 *   npx tsx scripts/provision-aheedsuperstore-staging.ts --env-file secrets/staging.vars --apply  # write
 *
 * Guards:
 * - Refuses production database host unconditionally.
 * - Dry-run by default without --apply.
 * - Upserts on stable primary keys; idempotent re-runs change nothing.
 * - Invariant: verifies zero catalogue items created.
 */

const MANIFEST_PATH = "prisma/manifests/aheedsuperstore.json";

function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString).host.toLowerCase().replace(/-pooler\./, ".");
  } catch {
    return "(unparseable)";
  }
}

export function assertNotProduction(targetHost: string): void {
  try {
    const prodVars = parseEnvFile("secrets/production.vars");
    for (const key of ["DIRECT_URL", "DATABASE_URL"]) {
      if (prodVars[key] && hostOf(prodVars[key]) === targetHost) {
        throw new Error(
          `REFUSING TO RUN: Target database host "${targetHost}" matches production DIRECT_URL/DATABASE_URL.`,
        );
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("REFUSING TO RUN")) throw err;
    // If secrets/production.vars doesn't exist, check hostname heuristic
    if (targetHost.includes("prod") || targetHost.includes("production")) {
      throw new Error(
        `REFUSING TO RUN: Target database host "${targetHost}" appears to be a production database.`,
      );
    }
  }
}

export async function runStagingProvisioning(
  connectionString: string,
  manifest: Manifest,
  apply: boolean,
): Promise<{
  vendorId: string;
  vendorDomain: string;
  initialProductCount: number;
  initialCategoryCount: number;
}> {
  const targetHost = hostOf(connectionString);
  assertNotProduction(targetHost);

  console.log(`Connecting to: ${targetHost} (apply = ${apply})`);

  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });

  try {
    // Record baseline row counts
    const existingVendors = await prisma.vendor.findMany({
      select: { id: true, slug: true },
    });
    console.log(`Existing vendors in database (${existingVendors.length}):`);
    for (const v of existingVendors) {
      const prodCount = await prisma.product.count({ where: { vendorId: v.id } });
      console.log(`  - ${v.slug} (${v.id}): ${prodCount} products`);
    }

    if (!apply) {
      console.log("\n[DRY RUN] Would provision:");
      console.log(`  - Vendor: ${manifest.name} (${manifest.slug}, ID: ${manifest.id})`);
      console.log(`  - Host: ${manifest.host}`);
      console.log(`  - Delivery Prefixes: ${manifest.deliveryPrefixes.join(", ")}`);
      console.log("Pass --apply to execute writes.");
      return {
        vendorId: manifest.id,
        vendorDomain: manifest.host,
        initialProductCount: 0,
        initialCategoryCount: 0,
      };
    }

    // Apply provisioning
    console.log(`\nProvisioning ${manifest.slug}...`);
    await provisionVendor(prisma, manifest);

    // Link demo-admin or demo-store-admin to the new vendor as ADMIN if users exist
    const adminUsers = await prisma.user.findMany({
      where: {
        email: { in: ["demo-admin@example.com", "demo-store-admin@example.com"] },
      },
      select: { id: true, email: true },
    });

    for (const user of adminUsers) {
      await prisma.vendorMembership.upsert({
        where: {
          userId_vendorId: {
            userId: user.id,
            vendorId: manifest.id,
          },
        },
        create: {
          userId: user.id,
          vendorId: manifest.id,
          role: "ADMIN",
        },
        update: {
          role: "ADMIN",
        },
      });
      console.log(`Linked admin membership for ${user.email} -> ${manifest.slug} (ADMIN)`);
    }

    // Verify empty catalogue invariant
    const prodCount = await prisma.product.count({ where: { vendorId: manifest.id } });
    const catCount = await prisma.category.count({ where: { vendorId: manifest.id } });
    console.log(`\nCatalogue verification for ${manifest.slug}:`);
    console.log(`  - Products: ${prodCount} (expected: 0)`);
    console.log(`  - Categories: ${catCount} (expected: 0)`);

    if (prodCount !== 0 || catCount !== 0) {
      throw new Error(`Invariant violation: new vendor must start with 0 products and categories.`);
    }

    return {
      vendorId: manifest.id,
      vendorDomain: manifest.host,
      initialProductCount: prodCount,
      initialCategoryCount: catCount,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const envFileIdx = args.indexOf("--env-file");
  const envFilePath = envFileIdx >= 0 ? args[envFileIdx + 1] : undefined;

  let connectionString: string | undefined;

  if (envFilePath) {
    const vars = parseEnvFile(envFilePath);
    connectionString = vars.DIRECT_URL ?? vars.DATABASE_URL;
  } else {
    connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  }

  if (!connectionString) {
    console.error("No database connection string provided. Use --env-file or set DIRECT_URL.");
    process.exit(1);
  }

  const rawManifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const parsed = manifestSchema.parse(rawManifest);

  await runStagingProvisioning(connectionString, parsed, apply);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
