/**
 * Does this environment's reference data match its configuration? (#771)
 *
 *   npx tsx scripts/verify-reference-coverage.ts --env-file .env
 *   npx tsx scripts/verify-reference-coverage.ts --env-file secrets/production.vars
 *
 * ## Why this exists
 *
 * Nothing compared configured coverage against materialised coverage, and two separate failures
 * hid in that gap for as long as they existed: `LU` sat materialised and unsupported while
 * configuration said `MK,RG`, and staging answered UNVERIFIED for every postcode because its
 * deployed Worker version carried no reference binding at all. Neither is visible from
 * `lint`/`typecheck`/`test`/`build`, neither logs anything, and both look exactly like a healthy
 * environment from the outside.
 *
 * `/api/health`'s `reference` block answers the same question for a DEPLOYED environment. This
 * script answers it for a DATABASE, named by an env file — which is the form needed before a
 * deploy exists, after a sync run, and against production's reference branch, whose application
 * does not yet serve the route at all.
 *
 * ## Read-only, deliberately
 *
 * It opens no transaction and issues no write of any kind. It is safe to run against production at
 * any time, which is the property that makes it usable as a check rather than a ceremony.
 *
 * Plain `@neondatabase/serverless` rather than the generated Prisma client: this is a Node script
 * reporting on a database's shape, including the case where the schema is not there at all — which
 * a Prisma client answers with `P2021 table does not exist` rather than a usable report. Raw SQL is
 * permitted here for the same reason it is permitted in migrations: `CLAUDE.md`'s ban governs
 * application code under `app/`, `features/`, `components/` and `lib/repositories/*`, not scripts.
 *
 * Exit code: 0 when every source's covered areas equal the configured areas, non-zero otherwise —
 * so this can gate a validation step rather than needing a human to read the output.
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

interface CountRow {
  area: string;
  total: number;
  active: number;
}

const REFERENCE_TABLES = [
  "PlaceReference",
  "PostcodeReference",
  "ReferenceAreaCoverage",
  "ReferenceDataSyncRun",
  "ReferenceDataset",
];

async function main() {
  const envFile = argValue("--env-file") ?? ".env";
  config({ path: envFile, override: true });

  const connectionString = process.env.UK_LOCATION_REF_DIRECT_URL;
  if (!connectionString) {
    console.error(
      `No UK_LOCATION_REF_DIRECT_URL found in ${envFile}. This is the dedicated ` +
        `uk-location-reference database, NOT Aheed's own DIRECT_URL.`,
    );
    process.exit(1);
  }

  // Naming the host is what makes the target impossible to get wrong by accident — dev and staging
  // share one reference branch and production has its own, and two env files have agreed on the
  // wrong project here before.
  const host = connectionString.match(/@([^/?]+)/)?.[1] ?? "unknown";
  const required = (process.env.UK_LOCATION_REF_POSTCODE_AREAS ?? "")
    .split(",")
    .map((area) => area.trim().toUpperCase())
    .filter((area) => area !== "")
    .sort();

  console.log(`reference coverage check -> ${host} (from ${envFile})`);
  console.log(`configured areas: ${required.join(", ") || "(none)"}`);

  const sql = neon(connectionString);
  const problems: string[] = [];

  const tables = (await sql.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  )) as Array<{ table_name: string }>;
  const present = new Set(tables.map((row) => row.table_name));
  console.log(`\npublic tables (${tables.length}): ${tables.map((t) => t.table_name).join(", ") || "(none)"}`); // prettier-ignore

  const missingTables = REFERENCE_TABLES.filter((table) => !present.has(table));
  if (missingTables.length > 0) {
    // Not migrated is a legitimate state for a new environment, and it is reported rather than
    // crashed on — but it is never a pass.
    problems.push(`reference schema not applied: missing ${missingTables.join(", ")}`);
    console.log(`\nSchema not applied — run \`npm run ref:migrate\` against this database.`);
    report(problems);
    return;
  }

  const postcodes = (await sql.query(
    'select "postcodeArea" as area, count(*)::int as total, count(*) filter (where "isActive")::int as active from "PostcodeReference" group by 1 order by 1',
  )) as CountRow[];
  console.log("\nPostcodeReference by area:");
  for (const row of postcodes) console.log(`  ${row.area}: ${row.total} (active ${row.active})`);
  if (postcodes.length === 0) console.log("  (none)");

  const places = (await sql.query(
    'select coalesce("postcodeArea", \'(unattributed)\') as area, count(*)::int as total, count(*) filter (where "isActive")::int as active from "PlaceReference" group by 1 order by 1',
  )) as CountRow[];
  console.log("\nPlaceReference by area:");
  for (const row of places) console.log(`  ${row.area}: ${row.total} (active ${row.active})`);
  if (places.length === 0) console.log("  (none)");

  const coverage = (await sql.query(
    'select "sourceKey", "postcodeArea", "sourceVersion", "recordCount", "materialisedAt" from "ReferenceAreaCoverage" order by "sourceKey", "postcodeArea"',
  )) as Array<{
    sourceKey: string;
    postcodeArea: string;
    sourceVersion: string;
    recordCount: number;
    materialisedAt: Date;
  }>;
  console.log("\nReferenceAreaCoverage:");
  for (const row of coverage) {
    console.log(
      `  ${row.sourceKey} / ${row.postcodeArea} version=${row.sourceVersion} records=${row.recordCount} at=${row.materialisedAt.toISOString()}`,
    );
  }
  if (coverage.length === 0) console.log("  (none)");

  const datasets = (await sql.query(
    'select "sourceKey", "sourceVersion", "syncStatus", "recordCount", "cacheVersion", "lastSyncedAt", "syncError" from "ReferenceDataset" order by "sourceKey"',
  )) as Array<{
    sourceKey: string;
    sourceVersion: string | null;
    syncStatus: string;
    recordCount: number;
    cacheVersion: number;
    lastSyncedAt: Date | null;
    syncError: string | null;
  }>;
  console.log("\nReferenceDataset:");
  for (const row of datasets) {
    console.log(
      `  ${row.sourceKey} version=${row.sourceVersion ?? "-"} status=${row.syncStatus} ` +
        `records=${row.recordCount} cacheVersion=${row.cacheVersion} ` +
        `lastSynced=${row.lastSyncedAt?.toISOString() ?? "never"} error=${row.syncError ?? "-"}`,
    );
  }
  if (datasets.length === 0) console.log("  (none)");

  const runs = (await sql.query(
    'select "startedAt", status, "sourceVersion", "requestedAreas", inserted, updated, retired, unchanged, "errorMessage" from "ReferenceDataSyncRun" order by "startedAt" desc limit 5',
  )) as Array<{
    startedAt: Date;
    status: string;
    sourceVersion: string | null;
    requestedAreas: string | null;
    inserted: number;
    updated: number;
    retired: number;
    unchanged: number;
    errorMessage: string | null;
  }>;
  console.log("\nReferenceDataSyncRun (5 newest):");
  for (const row of runs) {
    console.log(
      `  ${row.startedAt.toISOString()} ${row.status} version=${row.sourceVersion ?? "-"} ` +
        `areas=[${row.requestedAreas ?? "-"}] ins=${row.inserted} upd=${row.updated} ` +
        `ret=${row.retired} unch=${row.unchanged} err=${row.errorMessage ?? "-"}`,
    );
  }
  if (runs.length === 0) console.log("  (none)");

  // THE ACTUAL CHECK. Everything above is context for a human; this is what decides the exit code.
  if (required.length === 0) {
    problems.push(
      "UK_LOCATION_REF_POSTCODE_AREAS is unset — cannot tell what coverage is expected",
    );
  }

  const sourceKeys = [...new Set([...datasets.map((d) => d.sourceKey), ...coverage.map((c) => c.sourceKey)])].sort(); // prettier-ignore
  console.log("\ncoverage vs configuration:");
  if (sourceKeys.length === 0) {
    console.log("  no dataset has ever been synced here");
    problems.push("no dataset rows — this environment has never completed a sync");
  }

  for (const sourceKey of sourceKeys) {
    const covered = coverage
      .filter((row) => row.sourceKey === sourceKey)
      .map((row) => row.postcodeArea)
      .sort();
    const missing = required.filter((area) => !covered.includes(area));
    const unsupported = covered.filter((area) => !required.includes(area));

    console.log(
      `  ${sourceKey}: covered=[${covered.join(",")}] missing=[${missing.join(",")}] unsupported=[${unsupported.join(",")}]`,
    );
    if (missing.length > 0) problems.push(`${sourceKey}: required but not covered: ${missing.join(", ")}`); // prettier-ignore
    if (unsupported.length > 0) problems.push(`${sourceKey}: covered but not required: ${unsupported.join(", ")} — run --decommission`); // prettier-ignore
  }

  // Rows for an area with no coverage row are invisible to the comparison above but are exactly
  // what a half-finished decommission would leave behind.
  for (const [label, rows] of [
    ["PostcodeReference", postcodes],
    ["PlaceReference", places],
  ] as const) {
    const orphaned = rows
      .map((row) => row.area)
      .filter((area) => area !== "(unattributed)" && !required.includes(area));
    if (orphaned.length > 0) {
      problems.push(`${label}: rows for non-required area(s): ${orphaned.join(", ")}`);
    }
  }

  report(problems);
}

function report(problems: string[]): void {
  if (problems.length === 0) {
    console.log("\nOK — materialised coverage matches configuration.");
    return;
  }
  console.log("\nDRIFT:");
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
