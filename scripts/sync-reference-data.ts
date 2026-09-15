/**
 * Reference-data synchronisation entry point (#764).
 *
 * Usage:
 *   npx tsx scripts/sync-reference-data.ts --env-file .env --source code-point-open
 *   npx tsx scripts/sync-reference-data.ts --env-file .env --source os-open-names
 *   npx tsx scripts/sync-reference-data.ts --env-file .env            # every source, in order
 *   npx tsx scripts/sync-reference-data.ts --env-file .env --force    # re-import even if unchanged
 *
 * ## Why this runs on a Node runner and not in the application Worker
 *
 * Code-Point Open is roughly 1.7 million rows and OS Open Names is a 103 MB archive. Neither
 * decompresses inside a 128 MB Worker isolate, and neither needs to: this is scheduled work with no
 * user waiting on it. `.github/workflows/sync-reference-data.yml` runs it monthly on
 * `ubuntu-latest`, the same shape as `fill-product-images.yml` and the same shape as
 * `prisma migrate deploy` — an explicit `--env-file`, materialised from GitHub environment secrets
 * and deleted in the same job.
 *
 * `workers/scheduler` is deliberately NOT involved. It exists for short, database-light domain jobs
 * invoked over HTTP every fifteen minutes; splitting the cheap "has it changed?" check onto it and
 * the ingest onto Actions would add a mechanism boundary for no benefit, since the check is a single
 * unauthenticated `GET` this job performs itself in a second before exiting.
 *
 * ## Why the Prisma client is built here rather than imported
 *
 * `lib/db.ts` imports `PrismaClient` from `@prisma/client/wasm`, which is mandatory on Workers and
 * which **Node cannot load** — its WASM query compiler fails with `Unknown file extension ".wasm"`.
 * So this script constructs its own client from the **bare** `@prisma/client` specifier, exactly as
 * `prisma/seed.ts` does, and passes it into every source. That is the same property that makes
 * `lib/repositories/*` exercisable from a plain script, and it is why `ReferenceDataSource.apply`
 * takes a client rather than resolving one.
 *
 * It uses `DIRECT_URL`, not the pooled URL: this is a long-running bulk import, which is exactly
 * what a direct connection is for.
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { codePointSource } from "../lib/reference-data/sources/code-point";
import { openNamesSource } from "../lib/reference-data/sources/open-names";
import { syncReferenceData, type SyncRunSummary } from "../lib/reference-data/sync-service";
import type { Db, ReferenceDataSource } from "../lib/reference-data/source";

const SOURCES: ReferenceDataSource<never>[] = [
  codePointSource as unknown as ReferenceDataSource<never>,
  openNamesSource as unknown as ReferenceDataSource<never>,
];

const USAGE = `
Synchronise reference datasets from their publishers.

  --env-file <path>   Environment file to read DIRECT_URL from (default: .env)
  --source <key>      Only this source: ${SOURCES.map((s) => s.key).join(", ")}
  --force             Re-import even when the published version and checksum are unchanged
  --help              Show this message

Safe to re-run: an unchanged source exits without downloading or writing anything, and a failed
run leaves the previous known-good dataset serving.
`.trim();

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(USAGE);
    return;
  }

  const envFile = argValue("--env-file") ?? ".env";
  config({ path: envFile, override: true });

  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    console.error(`No DIRECT_URL found in ${envFile}. Refusing to guess a database.`);
    process.exit(1);
  }

  // Naming the host is what makes the target impossible to get wrong by accident — CLAUDE.md
  // records a migration reaching production because two env files agreed on the wrong project.
  const host = connectionString.match(/@([^/?]+)/)?.[1] ?? "unknown";
  console.log(`reference-data sync -> ${host} (from ${envFile})`);

  const requested = argValue("--source");
  const selected = requested ? SOURCES.filter((source) => source.key === requested) : SOURCES;

  if (selected.length === 0) {
    console.error(`Unknown source "${requested}". Known: ${SOURCES.map((s) => s.key).join(", ")}`);
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  const force = process.argv.includes("--force");
  const summaries: SyncRunSummary[] = [];

  try {
    // Sequential, never parallel: two multi-hundred-megabyte imports at once would compete for
    // memory on the runner and for connections on the database, and there is no deadline here.
    for (const source of selected) {
      summaries.push(await syncReferenceData(prisma as unknown as Db, source, { force }));
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n--- summary ---");
  for (const summary of summaries) {
    console.log(
      `${summary.sourceKey}: ${summary.status} version=${summary.version ?? "-"} ` +
        `changed=${summary.changed} inserted=${summary.inserted} updated=${summary.updated} ` +
        `retired=${summary.retired} unchanged=${summary.unchanged}` +
        (summary.error ? ` error=${summary.error}` : ""),
    );
  }

  // A non-zero exit so a failed scheduled run is visible in Actions rather than silently green.
  if (summaries.some((summary) => summary.status === "FAILED")) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
