import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { checkDestructiveTarget } from "@/lib/db-target-guard";

/**
 * #273 (P8.1b) — remove the two hand-inserted `DiscountRedemption` fixture rows
 * from the DEV Neon branch.
 *
 * The rows carry `seq` 888888 and 999999 and were written directly rather than
 * by `placeOrder`, so they bypass every guarantee the checkout path provides:
 * they render a discount line on orders that were never discounted, which makes
 * the dev branch unusable as evidence for anything about order money.
 *
 * A checked-in script rather than an ad-hoc statement, so the action is
 * reviewable, repeatable and — most importantly — GUARDED. `lib/db-target-guard.ts`
 * refuses to run against the staging or production endpoints, and
 * `tests/db-target-guard.test.ts` is what proves that refusal works; nothing
 * asks a human to point this script at staging to find out.
 *
 * Runs in Node (via tsx), NOT workerd, so it builds its own client from the bare
 * `@prisma/client` like prisma/seed.ts and scripts/verify-data-rights.ts, and
 * never lib/db.ts's `@prisma/client/wasm`.
 *
 *   npx tsx scripts/remove-fixture-redemptions.ts --dry-run
 *   npx tsx scripts/remove-fixture-redemptions.ts
 */

/** The two fixture rows, named exactly. Nothing here deletes by range. */
const FIXTURE_SEQS = [888888, 999999];

/** Read a connection string out of a gitignored secrets file without importing it. */
function readVar(path: string, key: string): string | undefined {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return undefined; // absent in CI; the guard treats that as "no constraint from this file"
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"#]*)"?/);
    if (match && match[1] === key) return match[2].trim();
  }
  return undefined;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const targetUrl = process.env.DIRECT_URL;

  const verdict = checkDestructiveTarget(targetUrl, [
    { label: "the STAGING database", url: readVar("secrets/staging.vars", "DIRECT_URL") },
    {
      label: "the STAGING database (pooled)",
      url: readVar("secrets/staging.vars", "DATABASE_URL"),
    },
    { label: "the PRODUCTION database", url: readVar("secrets/production.vars", "DIRECT_URL") },
    {
      label: "the PRODUCTION database (pooled)",
      url: readVar("secrets/production.vars", "DATABASE_URL"),
    },
  ]);

  if (!verdict.allowed) {
    console.error(`REFUSED: ${verdict.reason}`);
    console.error("This script only ever runs against the dev Neon branch.");
    process.exit(1);
  }

  console.log(`Target endpoint: ${verdict.endpoint}`);

  const adapter = new PrismaNeon({ connectionString: targetUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    // Reported BEFORE the delete: after the rows are gone there is no way to
    // name which orders to re-check, and R15 asks for exactly that list.
    const doomed = await prisma.discountRedemption.findMany({
      where: { seq: { in: FIXTURE_SEQS } },
      select: {
        id: true,
        seq: true,
        amountPence: true,
        order: { select: { orderNumber: true } },
      },
    });

    if (doomed.length === 0) {
      console.log("No fixture redemptions found — nothing to do.");
      return;
    }

    console.log(`Found ${doomed.length} fixture redemption row(s):`);
    for (const row of doomed) {
      console.log(
        `  seq=${row.seq}  order=${row.order.orderNumber}  amountPence=${row.amountPence}`,
      );
    }
    console.log("Affected order numbers (re-check these render no discount line):");
    console.log(`  ${doomed.map((r) => r.order.orderNumber).join(", ")}`);

    if (dryRun) {
      console.log("--dry-run given — nothing deleted.");
      return;
    }

    const { count } = await prisma.discountRedemption.deleteMany({
      where: { seq: { in: FIXTURE_SEQS } },
    });
    console.log(`Deleted ${count} row(s).`);

    const remaining = await prisma.discountRedemption.count({ where: { seq: { gte: 888888 } } });
    console.log(`Remaining rows with seq >= 888888: ${remaining}`);
    if (remaining !== 0) {
      console.error("Expected 0 remaining — something else wrote a high-seq row.");
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
