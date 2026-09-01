/**
 * #489 — query-level latency harness, and the catalogue-shape summary that makes the seed's
 * scale claims checkable from one command.
 *
 *   npx tsx scripts/measure-catalogue-queries.ts
 *   npx tsx scripts/measure-catalogue-queries.ts --samples 25 > shape-and-timings.txt
 *
 * WHY THIS IS A SECOND HARNESS AND NOT PART OF `scripts/measure-nfr.ts`.
 * That file's own docstring makes it deliberately HTTP-only — "no Prisma, no repository imports,
 * no session cookie, no database credential" — which is what lets it run from a clean checkout or
 * in CI (P7d R4/R6). Adding Prisma imports there would silently revoke that property. The two
 * answer different questions: `measure-nfr.ts` measures route TTFB through the deployed edge, this
 * measures query time against the database, and `docs/developer-portal/nfr-baseline.md` already
 * reports them in separate tables under separate caveats.
 *
 * WHY IT CAN CALL REPOSITORY FUNCTIONS AT ALL.
 * Every function below takes `prisma` and `vendorId` as explicit parameters, so this script can
 * hand them a client built from the BARE `@prisma/client` specifier — exactly as `prisma/seed.ts`
 * and `scripts/verify-repository-injection.ts` do. A repository function that resolved its own
 * client through `lib/db` could not be measured this way at all: `lib/db.ts` builds from
 * `@prisma/client/wasm`, whose query compiler real Node cannot load. That property is what #252
 * and #409/#411/#412 exist to protect, and this harness is now a second consumer of it.
 *
 * READ-ONLY. It creates nothing and deletes nothing, so unlike
 * `scripts/verify-repository-injection.ts` it does not refuse to run against a deployed database —
 * it prints the host instead, which is the figure `nfr-baseline.md` is required to record (R19).
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { performance } from "node:perf_hooks";
import {
  getAvailableSpecialities,
  listProducts,
  listProductsByCategory,
  searchProducts,
} from "@/lib/repositories/products";
import { getCategoryBySlug } from "@/lib/repositories/categories";
import {
  getFinancialsForStaff,
  listOrdersForStaff,
  listOrdersForUser,
} from "@/lib/repositories/orders";
import { GENERATED_SLUG_PREFIX } from "../prisma/generate-catalogue";

const DEFAULT_SAMPLES = 15;
const PAGE_SIZE = 24;

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args.set(token.slice(2), "true");
    else {
      args.set(token.slice(2), next);
      i += 1;
    }
  }
  return args;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] as number;
}

type Timing = { label: string; p50Ms: number; p95Ms: number; samples: number; note?: string };

/**
 * One warm-up call, then `samples` timed calls. The warm-up is excluded on purpose and for a
 * reason the existing baseline already documents: a single cold outlier moves p95 outright.
 */
async function time(label: string, samples: number, fn: () => Promise<unknown>): Promise<Timing> {
  try {
    await fn(); // warm-up, discarded
  } catch (error) {
    return {
      label,
      p50Ms: Number.NaN,
      p95Ms: Number.NaN,
      samples: 0,
      note: `skipped: ${(error as Error).message}`,
    };
  }
  const durations: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    const start = performance.now();
    await fn();
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  return {
    label,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    samples,
  };
}

/** #489 R16b — everything a reader needs to check R1-R5, R8, R11 and R12 without writing a query. */
async function shapeSummary(prisma: PrismaClient, vendorId: string, vendorLabel: string) {
  const [total, generated, topLevel, subCategories] = await Promise.all([
    prisma.product.count({ where: { vendorId } }),
    prisma.product.count({ where: { vendorId, slug: { startsWith: GENERATED_SLUG_PREFIX } } }),
    prisma.category.count({ where: { vendorId, parentId: null } }),
    prisma.category.count({ where: { vendorId, parentId: { not: null } } }),
  ]);

  // A category whose parent itself has a parent — i.e. a third level. Must always be 0 (R3).
  const children = await prisma.category.findMany({
    where: { vendorId, parentId: { not: null } },
    select: { parentId: true },
  });
  const parentIds = [...new Set(children.map((c) => c.parentId as string))];
  const deeperThanTwo =
    parentIds.length === 0
      ? 0
      : await prisma.category.count({ where: { id: { in: parentIds }, parentId: { not: null } } });

  const generatedProducts = await prisma.product.findMany({
    where: { vendorId, slug: { startsWith: GENERATED_SLUG_PREFIX } },
    select: {
      id: true,
      images: { select: { storageKey: true, isPrimary: true } },
      inventory: { select: { id: true } },
    },
  });
  const distinctKeys = new Set(
    generatedProducts.flatMap((p) => p.images.map((image) => image.storageKey)),
  );
  const withOnePrimaryImage = generatedProducts.filter(
    (p) => p.images.filter((image) => image.isPrimary).length === 1,
  ).length;
  const withOneInventoryRow = generatedProducts.filter((p) => p.inventory !== null).length;

  console.log(`--- catalogue shape: ${vendorLabel} (${vendorId}) ---`);
  console.log(`  totalProducts:                        ${total}`);
  console.log(`  generatedProducts:                    ${generated}`);
  console.log(`  topLevelCategories:                   ${topLevel}`);
  console.log(`  subCategories:                        ${subCategories}`);
  console.log(`  categoriesDeeperThanTwoLevels:        ${deeperThanTwo}`);
  console.log(`  distinctGeneratedStorageKeys:         ${distinctKeys.size}`);
  console.log(`  generatedWithExactlyOnePrimaryImage:  ${withOnePrimaryImage}`);
  console.log(`  generatedWithExactlyOneInventoryRow:  ${withOneInventoryRow}`);
  console.log("");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const samples = Number.parseInt(args.get("samples") ?? String(DEFAULT_SAMPLES), 10);

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DIRECT_URL/DATABASE_URL is empty — check .env is present and loading.");
  }
  // R19 — the host is what the recorded measurement has to name. Host only, never the
  // connection string: a grep for `BASE_URL` once printed a Neon password in full (#175).
  const host = (() => {
    try {
      return new URL(connectionString).host;
    } catch {
      return "(unparseable)";
    }
  })();
  console.log(`database host: ${host}`);
  console.log(`samples per query: ${samples} (plus one discarded warm-up)\n`);

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

  const aheed = await prisma.vendor.findFirst({
    where: { slug: "aheed-food-centre" },
    select: { id: true },
  });
  if (!aheed) throw new Error("Aheed vendor not found — seed the database first.");
  const srimart = await prisma.vendor.findFirst({
    where: { slug: "srimart" },
    select: { id: true },
  });

  await shapeSummary(prisma, aheed.id, "Aheed Food Centre");
  if (srimart) await shapeSummary(prisma, srimart.id, "SriMart");
  else console.log("--- SriMart not present (SEED_SRIMART_HOST was unset when seeding) ---\n");

  // Inputs resolved from the database rather than hardcoded, so this keeps working after a reseed.
  const category = await prisma.category.findFirst({
    where: { vendorId: aheed.id, parentId: { not: null } },
    select: { id: true, slug: true },
  });
  const userWithOrders = await prisma.order.findFirst({
    where: { vendorId: aheed.id, userId: { not: null } },
    select: { userId: true },
  });

  const timings: Timing[] = [];
  timings.push(
    await time("storefront catalogue listing (listProducts)", samples, () =>
      listProducts(prisma as never, aheed.id, { take: PAGE_SIZE }),
    ),
  );
  timings.push(
    await time("category page products (listProductsByCategory)", samples, async () => {
      if (!category) throw new Error("no subcategory found");
      return listProductsByCategory(prisma as never, aheed.id, [category.id], {
        take: PAGE_SIZE,
      });
    }),
  );
  timings.push(
    await time("category page (getCategoryBySlug)", samples, async () => {
      if (!category) throw new Error("no subcategory found");
      return getCategoryBySlug(prisma as never, aheed.id, category.slug);
    }),
  );
  timings.push(
    await time("product search (searchProducts)", samples, () =>
      searchProducts(prisma as never, aheed.id, "rice", { take: PAGE_SIZE }),
    ),
  );
  timings.push(
    await time("speciality facets (getAvailableSpecialities)", samples, () =>
      getAvailableSpecialities(prisma as never, aheed.id),
    ),
  );
  timings.push(
    await time("staff order list, no search (listOrdersForStaff)", samples, () =>
      listOrdersForStaff(prisma as never, aheed.id, {
        take: 20,
        filter: { statuses: [], search: null },
      }),
    ),
  );
  timings.push(
    await time("order history (listOrdersForUser)", samples, async () => {
      if (!userWithOrders?.userId) throw new Error("no user with orders");
      return listOrdersForUser(prisma as never, aheed.id, userWithOrders.userId, { take: 20 });
    }),
  );
  timings.push(
    await time("staff financials aggregate (getFinancialsForStaff)", samples, () =>
      getFinancialsForStaff(prisma as never, aheed.id),
    ),
  );

  console.log("--- query timings (client-observed, wall-clock around the Prisma call) ---\n");
  console.log("| Query | p50 | p95 |");
  console.log("|---|---|---|");
  for (const t of timings) {
    if (t.samples === 0) {
      console.log(`| ${t.label} | — | — | ${t.note ?? ""}`);
    } else {
      console.log(`| ${t.label} | ${t.p50Ms.toFixed(1)} ms | ${t.p95Ms.toFixed(1)} ms |`);
    }
  }
  console.log("");
  console.log(
    "Target: API p95 < 400 ms (specs/mission.md). These are QUERY times, not route TTFB —",
  );
  console.log("a route also pays request parsing, rendering and the network hop to the edge.");

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
