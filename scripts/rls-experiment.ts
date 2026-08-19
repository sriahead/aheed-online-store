import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { PrismaClient } from "@prisma/client";
import { PrismaNeon, PrismaNeonHttp } from "@prisma/adapter-neon";

/**
 * P7 closeout (#251 / #220) — the experiment ADR-004 decision 2's deferred
 * row-level-security question actually turns on.
 *
 * RLS needs the current tenant communicated to Postgres per request, and the
 * conventional carrier is a session GUC set with `SET LOCAL app.current_vendor`
 * that a policy then reads via `current_setting(...)`. That only works if the
 * SET and the guarded query land on the SAME session. This app's primary client
 * is `PrismaNeonHttp` (lib/db.ts) — stateless fetch, one HTTP request per query
 * — so whether a session exists at all is the question, not an implementation
 * detail.
 *
 * Runs in Node (via tsx), NOT workerd, so it builds its own clients from the
 * bare `@prisma/client` like prisma/seed.ts and scripts/verify-data-rights.ts
 * do — never lib/db.ts's `@prisma/client/wasm`, which does not resolve under
 * Node. The adapters are configured identically to lib/db.ts's, which is what
 * makes the result transferable to the running app.
 *
 * Raw SQL here is deliberate and in bounds: CLAUDE.md's "no raw SQL" rule
 * governs application code (app/, features/, components/, lib/repositories/*),
 * and this is a one-off probe of a database capability. Nothing here runs at
 * request time and nothing here ships.
 *
 * READ-ONLY. It sets a GUC, reads it back, and creates no rows, no schema and
 * no policies. Safe against any branch; point it at a dev branch anyway.
 *
 *   npx tsx scripts/rls-experiment.ts
 */

const GUC = "app.current_vendor";
const VENDOR = "a4ed0000-0000-4000-a000-000000000001";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — check .env");
  return url;
}

function maskedHost(url: string): string {
  return url.replace(/:[^:@/]+@/, ":****@").replace(/\?.*$/, "");
}

/** HTTP (fetch) client — the one lib/db.ts's getPrisma() returns. */
function httpClient(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaNeonHttp(connectionString(), {}) });
}

/** WebSocket client — the one lib/db.ts's getPrismaWs() returns, for transactions. */
function wsClient(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaNeon({ connectionString: connectionString() }) });
}

type Outcome = { name: string; verdict: "SURVIVES" | "LOST" | "ERROR"; detail: string };
const results: Outcome[] = [];

function record(name: string, verdict: Outcome["verdict"], detail: string) {
  results.push({ name, verdict, detail });
  const mark = verdict === "SURVIVES" ? "SURVIVES" : verdict === "LOST" ? "LOST    " : "ERROR   ";
  console.log(`  [${mark}] ${name}`);
  console.log(`             ${detail}`);
}

/** `current_setting(name, true)` returns NULL instead of erroring when unset. */
const READ_GUC = `SELECT current_setting('${GUC}', true) AS value`;

/**
 * A: two separate queries on the HTTP client.
 * This is the shape every repository read has today.
 */
async function separateHttpQueries() {
  const prisma = httpClient();
  try {
    await prisma.$executeRawUnsafe(`SET ${GUC} = '${VENDOR}'`);
    const rows = await prisma.$queryRawUnsafe<{ value: string | null }[]>(READ_GUC);
    const value = rows[0]?.value ?? null;
    record(
      "A. HTTP client, SET and read as two separate queries",
      value === VENDOR ? "SURVIVES" : "LOST",
      value === VENDOR
        ? `read back ${value}`
        : `read back ${value === null ? "NULL" : `"${value}"`} — the second request did not see the first request's session`,
    );
  } catch (error) {
    record(
      "A. HTTP client, SET and read as two separate queries",
      "ERROR",
      String(error).slice(0, 300),
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * B: both statements inside one batched $transaction on the HTTP client.
 * Neon's HTTP endpoint supports a batched transaction, so if the GUC survives
 * anywhere over HTTP it is here.
 */
async function batchedHttpTransaction() {
  const prisma = httpClient();
  try {
    const [, rows] = await prisma.$transaction([
      prisma.$executeRawUnsafe(`SET LOCAL ${GUC} = '${VENDOR}'`),
      prisma.$queryRawUnsafe<{ value: string | null }[]>(READ_GUC),
    ]);
    const value = (rows as { value: string | null }[])[0]?.value ?? null;
    record(
      "B. HTTP client, SET LOCAL and read in one batched $transaction",
      value === VENDOR ? "SURVIVES" : "LOST",
      value === VENDOR
        ? `read back ${value} — a GUC does survive inside a single batched transaction`
        : `read back ${value === null ? "NULL" : `"${value}"`}`,
    );
  } catch (error) {
    record(
      "B. HTTP client, SET LOCAL and read in one batched $transaction",
      "ERROR",
      String(error).slice(0, 300),
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * C: interactive transaction on the WebSocket client.
 * This is the only place lib/db.ts opens a real session today.
 */
async function interactiveWsTransaction() {
  const prisma = wsClient();
  try {
    const value = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ${GUC} = '${VENDOR}'`);
      const rows = await tx.$queryRawUnsafe<{ value: string | null }[]>(READ_GUC);
      return rows[0]?.value ?? null;
    });
    record(
      "C. WebSocket client, SET LOCAL then read inside one interactive $transaction",
      value === VENDOR ? "SURVIVES" : "LOST",
      value === VENDOR
        ? `read back ${value} — a real session exists here`
        : `read back ${value === null ? "NULL" : `"${value}"`}`,
    );
  } catch (error) {
    record(
      "C. WebSocket client, SET LOCAL then read inside one interactive $transaction",
      "ERROR",
      String(error).slice(0, 300),
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * D: does the WebSocket client leak a GUC between transactions?
 * If it does, pooling would make a stale tenant id visible to the next caller —
 * which would be worse than having no RLS at all.
 */
async function wsAcrossTransactions() {
  const prisma = wsClient();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ${GUC} = '${VENDOR}'`);
    });
    const rows = await prisma.$queryRawUnsafe<{ value: string | null }[]>(READ_GUC);
    const value = rows[0]?.value ?? null;
    record(
      "D. WebSocket client, GUC set in a previous transaction, read outside it",
      value === VENDOR ? "SURVIVES" : "LOST",
      value === VENDOR
        ? `read back ${value} — SET LOCAL leaked past its transaction`
        : `read back ${value === null ? "NULL" : `"${value}"`} — correctly scoped to the transaction`,
    );
  } catch (error) {
    record(
      "D. WebSocket client, GUC set in a previous transaction, read outside it",
      "ERROR",
      String(error).slice(0, 300),
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  console.log(`RLS session-GUC experiment (#251 / #220)`);
  console.log(`target: ${maskedHost(connectionString())}`);
  console.log(`GUC:    ${GUC}`);
  console.log(`run at: ${new Date().toISOString()}`);
  console.log();

  await separateHttpQueries();
  await batchedHttpTransaction();
  await interactiveWsTransaction();
  await wsAcrossTransactions();

  console.log();
  console.log("summary");
  for (const r of results) console.log(`  ${r.verdict.padEnd(9)} ${r.name}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("experiment failed to run:", error);
    process.exit(1);
  });
