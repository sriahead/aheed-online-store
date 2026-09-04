/**
 * Post-migration check for P2.6 slice 3 (#566) — run with `npx tsx
 * scripts/verify-search-synonyms-migration.ts` against the DEV Neon branch.
 *
 * Confirms the migration created what it should AND, more importantly, that the three
 * hand-authored `pg_trgm` indexes are still present. `prisma migrate dev` proposed dropping all
 * three again (the fourth recorded occurrence of CLAUDE.md's GAP-011 drift); the statements were
 * removed from the migration before it was applied, and this is the check that the removal
 * actually held rather than merely looking right in the file.
 *
 * Uses the bare `@prisma/client` specifier, as `prisma/seed.ts` does — this runs in real Node,
 * where `@prisma/client/wasm`'s query compiler cannot load.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const TRIGRAM_INDEXES = [
  "Order_guestEmail_trgm_idx",
  "Order_orderNumber_trgm_idx",
  "User_email_trgm_idx",
];

async function main() {
  // `engineType = "client"` requires an explicit driver adapter — a bare `new PrismaClient()`
  // throws P2038. Same construction as prisma/seed.ts, which also runs in real Node.
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DIRECT_URL/DATABASE_URL is empty — is .env loading?");
  console.log("connecting to:", connectionString.replace(/:[^:@/]+@/, ":****@"));

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  let failures = 0;

  try {
    const synonymCount = await prisma.searchSynonym.count();
    console.log(`SearchSynonym table reachable — ${synonymCount} row(s).`);

    // Proves the new nullable column exists and is selectable.
    const logSample = await prisma.searchQueryLog.findMany({
      select: { id: true, directNameMatch: true },
      take: 1,
    });
    console.log(`SearchQueryLog.directNameMatch selectable — sampled ${logSample.length} row(s).`);

    // indexname::text — pg_indexes.indexname is Postgres type `name`, which the Neon driver
    // adapter cannot deserialize (UnsupportedNativeDataType).
    const present = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname::text AS indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname::text = ANY(${TRIGRAM_INDEXES})
    `;
    const found = new Set(present.map((row) => row.indexname));

    for (const name of TRIGRAM_INDEXES) {
      if (found.has(name)) {
        console.log(`pg_trgm index present: ${name}`);
      } else {
        console.error(`MISSING pg_trgm index: ${name}`);
        failures += 1;
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  if (failures > 0) {
    console.error(`\nFAILED — ${failures} expected object(s) missing.`);
    process.exitCode = 1;
    return;
  }
  console.log("\nAll expected objects present.");
}

void main();
