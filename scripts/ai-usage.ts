/**
 * #1017 — read a vendor's Workers AI spend for today, and set its daily neuron budget.
 *
 *   npx tsx scripts/ai-usage.ts --env-file .dev.vars                       # every vendor
 *   npx tsx scripts/ai-usage.ts --env-file .dev.vars --vendor aheed        # one vendor, by feature
 *   npx tsx scripts/ai-usage.ts --env-file .dev.vars --vendor aheed --set-budget 5000
 *
 * Every vendor shares one Cloudflare account, so this ledger (`AiUsageEvent`) is the only per-vendor
 * AI cost figure there is, and `VendorConfig.aiDailyNeuronBudget` the only per-vendor cap. There is
 * deliberately no staff UI for either yet (see the #1016/#1017 plan); this script is how the owner
 * reads one and changes the other, with no deploy. "Today" is the UTC day, because Cloudflare's daily
 * allowance resets at 00:00 UTC.
 *
 * Same conventions as scripts/fill-product-images.ts: an explicit --env-file, the database host
 * printed before any query, and the bare `@prisma/client` (Node cannot load the WASM build).
 */

import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { startOfUtcDay } from "@/lib/ai-meter";
import { DEFAULT_AI_DAILY_NEURON_BUDGET } from "@/lib/repositories/ai-usage";
import { parseEnvFile } from "./lib/env-file";

function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString).host;
  } catch {
    return "(unparseable)";
  }
}

function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function neurons(milliNeurons: number): string {
  return (milliNeurons / 1000).toFixed(1);
}

async function main() {
  const envPath = flagValue("--env-file");
  if (!envPath) {
    fail("usage: npx tsx scripts/ai-usage.ts --env-file <path> [--vendor <slug> [--set-budget N]]");
  }

  const vendorSlug = flagValue("--vendor");
  const rawBudget = flagValue("--set-budget");
  let newBudget: number | null = null;
  if (rawBudget !== undefined) {
    if (!vendorSlug) fail("--set-budget needs --vendor <slug>");
    newBudget = Number(rawBudget);
    if (!Number.isInteger(newBudget) || newBudget < 0) {
      fail(`--set-budget must be a whole number of neurons, 0 or more — got "${rawBudget}"`);
    }
  }

  const vars = parseEnvFile(envPath);
  const directUrl = vars.DIRECT_URL ?? vars.DATABASE_URL;
  if (!directUrl) fail(`${envPath} defines neither DIRECT_URL nor DATABASE_URL`);

  console.log(`env file: ${envPath}`);
  console.log(`database: ${hostOf(directUrl)}`);

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: directUrl }) });
  try {
    const vendors = await prisma.vendor.findMany({
      where: vendorSlug ? { slug: vendorSlug } : {},
      select: { id: true, slug: true, config: { select: { aiDailyNeuronBudget: true } } },
      orderBy: { slug: "asc" },
    });
    if (vendorSlug && vendors.length === 0) fail(`no vendor has the slug "${vendorSlug}"`);

    if (newBudget !== null) {
      const vendor = vendors[0];
      if (!vendor.config) {
        fail(`vendor "${vendor.slug}" has no VendorConfig row, so there is no budget to set`);
      }
      await prisma.vendorConfig.update({
        where: { vendorId: vendor.id },
        data: { aiDailyNeuronBudget: newBudget },
      });
      console.log(
        `${vendor.slug}: aiDailyNeuronBudget ${vendor.config.aiDailyNeuronBudget} -> ${newBudget}`,
      );
      return;
    }

    const since = startOfUtcDay(new Date());
    console.log(`since:    ${since.toISOString()} (00:00 UTC today)`);
    console.log("");

    const rows = await prisma.aiUsageEvent.groupBy({
      by: ["vendorId", "feature"],
      where: { vendorId: { in: vendors.map((vendor) => vendor.id) }, createdAt: { gte: since } },
      _sum: { milliNeurons: true },
      _count: { _all: true },
    });

    for (const vendor of vendors) {
      const own = rows.filter((row) => row.vendorId === vendor.id);
      const total = own.reduce((sum, row) => sum + (row._sum.milliNeurons ?? 0), 0);
      const budget = vendor.config?.aiDailyNeuronBudget ?? DEFAULT_AI_DAILY_NEURON_BUDGET;
      const budgetNote = vendor.config ? "" : " (default; no VendorConfig row)";
      console.log(`${vendor.slug}: ${neurons(total)} of ${budget} neurons today${budgetNote}`);
      if (vendorSlug) {
        for (const row of own) {
          console.log(
            `  ${row.feature}: ${neurons(row._sum.milliNeurons ?? 0)} neurons, ` +
              `${row._count._all} call(s)`,
          );
        }
        if (own.length === 0) console.log("  no AI calls recorded today");
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
