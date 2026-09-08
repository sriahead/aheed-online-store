import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { neon } from "@neondatabase/serverless";
import { checkDestructiveTarget } from "@/lib/db-target-guard";
import { parseEnvFile } from "./lib/env-file";
import {
  ERROR_EVENT_INSERT_SQL,
  buildErrorEventInsertParams,
  recordErrorEventDirect,
} from "@/lib/error-event-fallback";

/**
 * Proves R15 and R16 (#674) against a REAL database.
 *
 * WHY A LIVE SCRIPT AND NOT ANOTHER UNIT TEST. `tests/error-event-fallback.test.ts`
 * pins the statement's shape and both failure modes against an injected
 * executor — our own code, checked against our own assumptions. It cannot
 * establish that Postgres accepts the statement at all. Two things here are
 * exactly the kind that a hand-built double gets wrong because its author
 * assumed them: that `"id"` must be supplied (the column has no database
 * default, since Prisma mints that uuid client-side) and that `"createdAt"`
 * must NOT be (it has one). Either mistake passes every unit test and fails on
 * the first real insert. That is the trap `CLAUDE.md` records for Prisma driver
 * error codes and the Workers AI response shape.
 *
 * WHAT IT ALSO DEMONSTRATES, just by completing. This runs in plain Node under
 * `tsx`, and `lib/error-event-fallback.ts` loads and executes there. That is the
 * whole design claim: the fallback shares no machinery with the WASM query
 * compiler whose constructor panicked in #674 — Node cannot even load that
 * compiler, so a path that touched it would die here with
 * ERR_UNKNOWN_FILE_EXTENSION rather than write a row.
 *
 * GUARDED. It creates and deletes a row, so `lib/db-target-guard.ts` refuses the
 * staging and production endpoints outright; `tests/db-target-guard.test.ts`
 * proves that refusal works, which is why nobody has to point this at staging
 * to watch it refuse.
 *
 *   npx tsx scripts/verify-error-event-fallback.ts > fallback-run.txt 2>&1
 *
 * DO NOT PIPE THIS TO `head` OR ANYTHING THAT CLOSES THE PIPE EARLY. The reader
 * closing the pipe sends SIGPIPE, which can kill the process before the cleanup
 * below runs, leaving a fixture row behind — that has happened here before
 * (#411/#412). Redirect to a file and read the file.
 */

/** The marker this run's row carries, so a leak is findable and deletable. */
const FIXTURE_PATH = `/__verify-error-event-fallback/${Date.now()}`;

/**
 * Reads one key from a gitignored secrets file, tolerating its absence.
 *
 * Uses the shared `parseEnvFile` rather than a private reader: #645 records that
 * a fifth hand-rolled copy escaped #505's consolidation and that two scripts now
 * carry it, so adding a third would deepen a defect this repo has already filed.
 */
function readSecret(path: string, key: string): string | undefined {
  try {
    return parseEnvFile(path)[key];
  } catch {
    return undefined; // absent in CI; the guard treats that as "no constraint from this file"
  }
}

async function main() {
  const targetUrl = process.env.DATABASE_URL;

  const verdict = checkDestructiveTarget(targetUrl, [
    { label: "the STAGING database", url: readSecret("secrets/staging.vars", "DIRECT_URL") },
    {
      label: "the STAGING database (pooled)",
      url: readSecret("secrets/staging.vars", "DATABASE_URL"),
    },
    { label: "the PRODUCTION database", url: readSecret("secrets/production.vars", "DIRECT_URL") },
    {
      label: "the PRODUCTION database (pooled)",
      url: readSecret("secrets/production.vars", "DATABASE_URL"),
    },
  ]);

  if (!verdict.allowed) {
    console.error(`REFUSED: ${verdict.reason}`);
    console.error("This script only ever runs against the dev Neon branch.");
    process.exit(1);
  }

  console.log(`Target endpoint: ${verdict.endpoint}`);

  const sql = neon(targetUrl as string);
  let failures = 0;

  const countRows = async (): Promise<number> => {
    const rows = (await sql.query('SELECT COUNT(*)::int AS n FROM "ErrorEvent"')) as {
      n: number;
    }[];
    return rows[0].n;
  };

  const before = await countRows();
  console.log(`Row count before: ${before}`);

  // The input the fallback is asked to persist. `path` deliberately carries a
  // query string so the stored value proves the shared row builder ran.
  const input = {
    message: "verify-error-event-fallback: synthetic row",
    stack: "at verifyErrorEventFallback (scripts/verify-error-event-fallback.ts)",
    digest: "674",
    path: `${FIXTURE_PATH}?secret=should-be-stripped`,
    method: "GET",
    routerKind: "App Router",
    routeType: "render",
  };

  // Exercise the REAL export, with no injected executor — this is the code path
  // instrumentation.ts takes, resolving its own connection through readEnv.
  const persisted = await recordErrorEventDirect(input);
  console.log(`recordErrorEventDirect returned: ${persisted}`);
  if (!persisted) {
    console.error("FAIL: the fallback reported that it did not persist the row.");
    failures += 1;
  }

  const stored = (await sql.query(
    'SELECT "id", "digest", "message", "stack", "path", "method", "routerKind", "routeType", "createdAt" FROM "ErrorEvent" WHERE "path" = $1',
    [FIXTURE_PATH],
  )) as Record<string, unknown>[];

  console.log(`Rows matching the fixture path: ${stored.length}`);

  if (stored.length !== 1) {
    console.error(`FAIL: expected exactly 1 row at ${FIXTURE_PATH}, found ${stored.length}.`);
    failures += 1;
  } else {
    const row = stored[0];
    console.log("Stored row:", JSON.stringify(row, null, 2));

    const expected: Record<string, unknown> = {
      digest: input.digest,
      message: input.message,
      stack: input.stack,
      path: FIXTURE_PATH, // query string stripped by the shared row builder
      method: input.method,
      routerKind: input.routerKind,
      routeType: input.routeType,
    };

    for (const [column, want] of Object.entries(expected)) {
      if (row[column] === want) {
        console.log(`  OK   ${column}`);
      } else {
        console.error(
          `  FAIL ${column}: expected ${JSON.stringify(want)}, got ${JSON.stringify(row[column])}`,
        );
        failures += 1;
      }
    }

    // The two columns whose handling a unit test cannot settle.
    if (typeof row.id === "string" && row.id.length > 0) {
      console.log("  OK   id was supplied by the fallback (no database default exists)");
    } else {
      console.error("  FAIL id is missing or empty.");
      failures += 1;
    }

    if (row.createdAt instanceof Date || typeof row.createdAt === "string") {
      console.log("  OK   createdAt was stamped by the database (not sent by the insert)");
    } else {
      console.error("  FAIL createdAt was not populated by the database.");
      failures += 1;
    }
  }

  // Cleanup, always — this is the section a SIGPIPE would skip.
  const deleted = (await sql.query('DELETE FROM "ErrorEvent" WHERE "path" = $1 RETURNING "id"', [
    FIXTURE_PATH,
  ])) as unknown[];
  console.log(`deleted ${deleted.length} fixture row(s)`);

  const after = await countRows();
  console.log(`Row count after: ${after}`);
  if (after !== before) {
    console.error(`FAIL: row count changed (${before} -> ${after}); a fixture row may remain.`);
    failures += 1;
  }

  // Recorded so a reader can see the statement that actually ran.
  console.log(`Statement used: ${ERROR_EVENT_INSERT_SQL}`);
  console.log(`Parameter count: ${buildErrorEventInsertParams(input).length}`);

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

main().catch((error) => {
  console.error("Unexpected failure:", error);
  process.exit(1);
});
