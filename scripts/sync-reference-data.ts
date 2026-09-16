/**
 * Reference-data synchronisation entry point (#764).
 *
 * Usage:
 *   npx tsx scripts/sync-reference-data.ts --env-file .env --source code-point-open
 *   npx tsx scripts/sync-reference-data.ts --env-file .env --source os-open-names
 *   npx tsx scripts/sync-reference-data.ts --env-file .env            # every source, in order
 *   npx tsx scripts/sync-reference-data.ts --env-file .env --force    # re-import even if unchanged
 *   npx tsx scripts/sync-reference-data.ts --env-file .env --decommission --dry-run
 *   npx tsx scripts/sync-reference-data.ts --env-file .env --decommission
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
 * `lib/reference-db.ts` imports the generated client's `/wasm` entry, which is mandatory on Workers
 * and which **Node cannot load** — its WASM query compiler fails with `Unknown file extension
 * ".wasm"`. So this script imports the generated reference client's **Node** entry point directly
 * and passes the resulting client into every source, exactly as `prisma/seed.ts` uses the bare
 * `@prisma/client`. That is the same property that makes `lib/repositories/*` exercisable from a
 * plain script, and it is why every stage of `ReferenceDataSource` takes a client rather than
 * resolving one.
 *
 * It uses `UK_LOCATION_REF_DIRECT_URL`, not the pooled URL: this is a long-running bulk import against
 * the dedicated `uk-location-reference` database, which is exactly what a direct connection is for.
 *
 * ## Coverage comes from configuration
 *
 * Which postcode areas to materialise is `UK_LOCATION_REF_POSTCODE_AREAS`, overridable per run with
 * `--areas`. No area literal appears anywhere in the schema, the sources, the repositories or the
 * application — adding one is configuration plus a run, never a code change.
 *
 * ## Removing an area is a separate, opt-in mode (#770)
 *
 * Configuration drives coverage in both directions, but only the additive direction happens
 * automatically. `--decommission` retires areas that are materialised and no longer required; it
 * downloads nothing, imports nothing, and is never passed by
 * `.github/workflows/sync-reference-data.yml`. That asymmetry is deliberate: the scheduled job runs
 * unattended against production, and a destructive action driven by a value one mistyped GitHub
 * variable could empty is not something to run unattended.
 */
import { config } from "dotenv";
import { PrismaClient } from "@aheed/reference-client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { codePointSource } from "../lib/reference-data/sources/code-point";
import { openNamesSource } from "../lib/reference-data/sources/open-names";
import {
  decommissionUnsupportedAreas,
  syncReferenceData,
  type DecommissionRunSummary,
  type SyncRunSummary,
} from "../lib/reference-data/sync-service";
import type { Db, ReferenceDataSource } from "../lib/reference-data/source";

const SOURCES: ReferenceDataSource<never>[] = [
  codePointSource as unknown as ReferenceDataSource<never>,
  openNamesSource as unknown as ReferenceDataSource<never>,
];

const USAGE = `
Synchronise reference datasets from their publishers.

  --env-file <path>   Environment file holding UK_LOCATION_REF_DIRECT_URL (default: .env)
  --source <key>      Only this source: ${SOURCES.map((s) => s.key).join(", ")}
  --areas <list>      Postcode areas to materialise, comma-separated (default:
                      UK_LOCATION_REF_POSTCODE_AREAS)
  --force             Re-import even when the release and coverage are both unchanged
  --decommission      Remove coverage and rows for areas that are materialised but NOT required.
                      Downloads nothing and imports nothing — this mode only deletes.
  --dry-run           With --decommission, report what would be removed and remove nothing.
  --help              Show this message

Safe to re-run: a source whose release AND coverage are both unchanged exits without downloading or
writing anything, and a failed run leaves the previous known-good dataset serving. Adding an area to
--areas imports just that area, even when the upstream release has not moved.

--decommission is the one destructive mode and is never used by the scheduled workflow. It removes
each unsupported area's coverage row BEFORE its data rows, so the area degrades to UNVERIFIED rather
than passing through a window where it reads as INVALID. It refuses outright when no areas are
configured, because "nothing is required" must never mean "remove everything". Run it with
--dry-run first.
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

  const connectionString = process.env.UK_LOCATION_REF_DIRECT_URL;
  if (!connectionString) {
    console.error(
      `No UK_LOCATION_REF_DIRECT_URL found in ${envFile}. This is the dedicated uk-location-reference ` +
        `database, NOT Aheed's own DIRECT_URL. Refusing to guess a database.`,
    );
    process.exit(1);
  }

  const areas = (argValue("--areas") ?? process.env.UK_LOCATION_REF_POSTCODE_AREAS ?? "")
    .split(",")
    .map((area) => area.trim().toUpperCase())
    .filter((area) => area !== "");

  if (areas.length === 0) {
    console.error(
      "No postcode areas configured. Set UK_LOCATION_REF_POSTCODE_AREAS in the env file, or pass " +
        "--areas MK,RG. Refusing to import the whole of Great Britain by accident.",
    );
    process.exit(1);
  }

  // Naming the host is what makes the target impossible to get wrong by accident — CLAUDE.md
  // records a migration reaching production because two env files agreed on the wrong project.
  const host = connectionString.match(/@([^/?]+)/)?.[1] ?? "unknown";
  console.log(`reference-data sync -> ${host} (from ${envFile})`);
  console.log(`required postcode areas: ${areas.join(", ")}`);

  const requested = argValue("--source");
  const selected = requested ? SOURCES.filter((source) => source.key === requested) : SOURCES;

  if (selected.length === 0) {
    console.error(`Unknown source "${requested}". Known: ${SOURCES.map((s) => s.key).join(", ")}`);
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  const force = process.argv.includes("--force");
  const decommission = process.argv.includes("--decommission");
  const dryRun = process.argv.includes("--dry-run");

  // The two modes are deliberately exclusive rather than sequential. Decommissioning deletes and
  // importing downloads; running both under one invocation would make a destructive step a side
  // effect of a routine one, which is the shape this flag exists to avoid.
  if (decommission) {
    const summaries: DecommissionRunSummary[] = [];
    console.log(dryRun ? "mode: decommission (DRY RUN — nothing will be removed)" : "mode: decommission"); // prettier-ignore

    try {
      for (const source of selected) {
        summaries.push(
          await decommissionUnsupportedAreas(prisma as unknown as Db, source, { areas, dryRun }),
        );
      }
    } finally {
      await prisma.$disconnect();
    }

    console.log("\n--- summary ---");
    for (const summary of summaries) {
      console.log(
        `${summary.sourceKey}: ${summary.status} removed=[${summary.removedAreas.join(",")}] ` +
          `deleted=${summary.deleted} dryRun=${summary.dryRun}` +
          (summary.error ? ` error=${summary.error}` : ""),
      );
    }

    if (summaries.some((summary) => summary.status === "FAILED")) process.exit(1);
    return;
  }

  if (dryRun) {
    console.error("--dry-run is only meaningful with --decommission. Refusing to guess.");
    await prisma.$disconnect();
    process.exit(1);
  }

  const summaries: SyncRunSummary[] = [];

  try {
    // Sequential, never parallel: two multi-hundred-megabyte imports at once would compete for
    // memory on the runner and for connections on the database, and there is no deadline here.
    for (const source of selected) {
      summaries.push(await syncReferenceData(prisma as unknown as Db, source, { areas, force }));
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n--- summary ---");
  for (const summary of summaries) {
    console.log(
      `${summary.sourceKey}: ${summary.status} version=${summary.version ?? "-"} ` +
        `changed=${summary.changed} areas=[${summary.importedAreas.join(",")}] ` +
        `inserted=${summary.inserted} updated=${summary.updated} ` +
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
