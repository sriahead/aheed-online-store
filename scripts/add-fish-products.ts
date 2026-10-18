import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { createProductForVendor } from "@/lib/repositories/products";
import { describeFishChange, planFishProducts } from "../prisma/fish-products";
import { writeFishProductChanges } from "../prisma/fish-products-write";

/**
 * #1147 — add the Fish department's products to ONE vendor, against the database in `DIRECT_URL`.
 *
 *   npx tsx scripts/add-fish-products.ts --vendor <slug>                              # dry run
 *   npx tsx scripts/add-fish-products.ts --vendor <slug> --apply                      # write, hidden
 *   npx tsx scripts/add-fish-products.ts --vendor <slug> --apply --active --stock 10  # write, on sale
 *
 * A DRY RUN IS THE DEFAULT: without `--apply` it prints what it would create and writes nothing.
 * Products are created HIDDEN (not visible in the shop) with ZERO stock unless `--active` and
 * `--stock <n>` say otherwise, so a live shop is never offered a product at a price nobody has
 * confirmed; the owner switches each one on in the staff panel. Every decision comes from
 * `planFishProducts` (`prisma/fish-products.ts`), and the writes go through
 * `createProductForVendor`, the function the staff panel uses, so the unit-price sort key and the
 * inventory row are written exactly as they are for a product made by hand.
 *
 * It only CREATES. A product that already exists (by slug) is skipped and never changed, so an edit
 * made in the staff panel survives a re-run. It needs the Fish department and both sub-categories
 * to exist: run `scripts/apply-department-changes.ts --apply` for the vendor first.
 *
 * For staging or production, point `DIRECT_URL` at that database's direct URL from
 * `secrets/<env>.vars`, exactly as `scripts/apply-department-changes.ts` is run. The script prints
 * the target host before it connects, so a wrong database is visible before a write. A Node script
 * against `DIRECT_URL`, like the seed — never the Worker. No raw SQL.
 */

const MAX_STOCK = 1000;

function parseArgs(argv: readonly string[]) {
  const valueOf = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const vendor = valueOf("--vendor");
  const stockRaw = valueOf("--stock");
  return {
    vendor: vendor && !vendor.startsWith("--") ? vendor : undefined,
    apply: argv.includes("--apply"),
    active: argv.includes("--active"),
    stockGiven: argv.includes("--stock"),
    stockRaw,
  };
}

/** `--stock` must be a whole number from 0 to 1000; absent means 0. */
function parseStock(args: ReturnType<typeof parseArgs>): number | null {
  if (!args.stockGiven) return 0;
  if (args.stockRaw === undefined || !/^\d+$/.test(args.stockRaw)) return null;
  const stock = Number(args.stockRaw);
  return stock <= MAX_STOCK ? stock : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.vendor) {
    console.error("--vendor <slug> is required, e.g. --vendor aheed-food-centre");
    process.exit(1);
  }
  const stock = parseStock(args);
  if (stock === null) {
    console.error(`--stock must be a whole number from 0 to ${MAX_STOCK}.`);
    process.exit(1);
  }

  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    console.error("DIRECT_URL is empty — set it to the target database's direct (non-pooled) URL.");
    process.exit(1);
  }
  const host = new URL(connectionString).host;
  console.log(`target database host: ${host}`);

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { slug: args.vendor },
      select: {
        id: true,
        name: true,
        categories: { select: { id: true, slug: true, parentId: true, isActive: true } },
      },
    });
    if (!vendor) {
      console.error(`No vendor with slug "${args.vendor}" on ${host} — nothing written.`);
      process.exitCode = 1;
      return;
    }

    const existing = await prisma.product.findMany({
      where: { vendorId: vendor.id },
      select: { slug: true },
    });
    const plan = planFishProducts({
      categories: vendor.categories,
      existingProductSlugs: existing.map((product) => product.slug),
    });

    console.log(
      `${vendor.name} (${args.vendor}), products ${args.active ? "visible" : "hidden"}, stock ${stock}` +
        `${args.apply ? "" : " — DRY RUN"}:`,
    );
    if (plan.blocked) {
      console.error(plan.blocked);
      process.exitCode = 1;
      return;
    }

    const treeIds = Object.values(plan.categoryIds);
    const countTree = () =>
      prisma.product.count({ where: { vendorId: vendor.id, categoryId: { in: treeIds } } });

    for (const note of plan.notes) console.log(`  note: ${note}`);
    if (plan.changes.length === 0) {
      console.log("  no products to create — every product in the list already exists.");
      console.log(`products in the Fish tree: ${await countTree()}`);
      return;
    }
    for (const change of plan.changes) console.log(`  ${describeFishChange(change)}`);

    if (!args.apply) {
      console.log(`products in the Fish tree: ${await countTree()}`);
      console.log("Dry run only: nothing written. Add --apply to write these products.");
      return;
    }

    const summary = await writeFishProductChanges(
      (input) => createProductForVendor(prisma, vendor.id, input),
      plan.categoryIds,
      plan.changes,
      { active: args.active, stock },
    );
    for (const slug of summary.skipped)
      console.log(`  skipped ${slug}: that slug was taken meanwhile`);
    console.log(`done: ${summary.created.length} product(s) created on ${host}`);
    console.log(`products in the Fish tree: ${await countTree()}`);
    if (summary.failed) {
      console.error(
        `stopped at ${summary.failed.slug}: ${summary.failed.error}. ` +
          "What was created stays; run the same command again to create the rest.",
      );
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
