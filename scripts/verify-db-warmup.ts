import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { PrismaClient } from "@prisma/client";
import {
  DB_WARMUP_DEFAULTS,
  getDbWarmupConfig,
  saveDbWarmupConfig,
} from "@/lib/repositories/db-warmup";

/**
 * #1491 R3 — the warm-up config repository against REAL Postgres, over `PrismaNeonHttp` (what
 * `getPrisma()` resolves at runtime), so an upsert that only worked over WebSocket would fail here too.
 *
 * Usage: `npx tsx scripts/verify-db-warmup.ts`
 *
 * Writes `.env`'s database, which must be DEV — check DIRECT_URL/DATABASE_URL in the process
 * environment and compare `.env` against `secrets/*.vars` first (CLAUDE.md). Needs migration
 * `20261110130000_db_warmup_config` applied. Restores the table to exactly what it held before
 * (deletes the row if there was none), including after a failed check.
 */

let failures = 0;
function check(label: string, passed: boolean, detail?: string): void {
  if (passed) console.log(`  PASS  ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — check .env against secrets/*.vars");
  console.log(`  database host: ${new URL(url).hostname}`);
  const { PrismaNeonHttp } = await import("@prisma/adapter-neon");
  const prisma = new PrismaClient({ adapter: new PrismaNeonHttp(url, {}) });
  const db = prisma as never;

  const before = await prisma.dbWarmupConfig.findUnique({ where: { id: "default" } });
  try {
    if (before) await prisma.dbWarmupConfig.delete({ where: { id: "default" } });

    const defaults = await getDbWarmupConfig(db);
    check(
      "defaults when no row",
      JSON.stringify(defaults) === JSON.stringify(DB_WARMUP_DEFAULTS),
      JSON.stringify(defaults),
    );

    await saveDbWarmupConfig(
      db,
      {
        enabled: true,
        mode: "CUSTOM",
        activityEnabled: false,
        activityMinutes: 45,
        leadMinutes: 15,
        customStart: "07:00",
        customEnd: "21:00",
        computeMilliUnits: 500,
        priceMicroUsdPerCuHour: 106000,
      },
      "verify@verify.invalid",
    );
    await saveDbWarmupConfig(
      db,
      { ...DB_WARMUP_DEFAULTS, enabled: true, mode: "ACTIVITY_ONLY" },
      "verify@verify.invalid",
    );
    const saved = await getDbWarmupConfig(db);
    const rows = await prisma.dbWarmupConfig.count();
    check(
      "upsert round-trip (second save updates the single row)",
      rows === 1 &&
        saved.enabled === true &&
        saved.mode === "ACTIVITY_ONLY" &&
        saved.updatedBy === "verify@verify.invalid" &&
        saved.updatedAt instanceof Date,
      `${rows} row(s), ${JSON.stringify(saved)}`,
    );
  } finally {
    await prisma.dbWarmupConfig.deleteMany({ where: { id: "default" } });
    if (before) await prisma.dbWarmupConfig.create({ data: before });
    const after = await prisma.dbWarmupConfig.findUnique({ where: { id: "default" } });
    const restored = before ? JSON.stringify(after) === JSON.stringify(before) : after === null;
    console.log(`  cleanup: ${restored ? "0 rows left / restored" : "NOT restored"}`);
    if (!restored) failures += 1;
    await prisma.$disconnect();
  }

  if (failures > 0) {
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nALL CHECKS PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
