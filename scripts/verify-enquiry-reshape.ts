import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";

/**
 * #1482 R30a — proves `20261110120000_vendor_enquiries_reshape` against REAL Postgres before CI
 * applies it to AFC staging, AFC production and Merqify production (the three databases that hold
 * the ORIGINAL `20261109225000_vendor_enquiries` shape).
 *
 * Usage: `npx tsx scripts/verify-enquiry-reshape.ts`
 *
 * Writes only inside two throwaway schemas it creates on `.env`'s database, which must be DEV —
 * check DIRECT_URL/DATABASE_URL in the process environment and compare `.env` against
 * `secrets/*.vars` first (CLAUDE.md). Both schemas are dropped before exit, including after a failed
 * check. Raw SQL is fine here: this is a verification script, not application code.
 *
 *   old_<run>: the original shape + one replied and one open enquiry -> reshape -> new shape, reply
 *              row kept, status default intact; then reshape AGAIN -> no-op (idempotent).
 *   new_<run>: the edited (current) migration -> reshape -> nothing changes.
 */

const RUN = randomUUID().slice(0, 8);
const OLD = `reshape_old_${RUN}`;
const NEW = `reshape_new_${RUN}`;

const RESHAPE = readFileSync(
  "prisma/migrations/20261110120000_vendor_enquiries_reshape/migration.sql",
  "utf8",
);
const CURRENT = readFileSync(
  "prisma/migrations/20261109225000_vendor_enquiries/migration.sql",
  "utf8",
);

/** The ORIGINAL text of 20261109225000_vendor_enquiries, as applied by hand on 2026-11-09. */
const ORIGINAL = `
CREATE TABLE "VendorEnquiry" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "senderName" TEXT,
    "senderEmail" TEXT NOT NULL,
    "senderPhone" TEXT,
    "toAddress" TEXT,
    "orderNumber" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "replyBody" TEXT,
    "repliedAt" TIMESTAMP(3),
    "repliedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VendorEnquiry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VendorEnquiry_vendorId_createdAt_idx" ON "VendorEnquiry"("vendorId", "createdAt");
CREATE INDEX "VendorEnquiry_vendorId_status_idx" ON "VendorEnquiry"("vendorId", "status");
ALTER TABLE "VendorEnquiry" ADD CONSTRAINT "VendorEnquiry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

let failures = 0;
function check(label: string, passed: boolean, detail?: string): void {
  if (passed) console.log(`  PASS  ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url)
    throw new Error("DIRECT_URL/DATABASE_URL is not set — check .env against secrets/*.vars");
  console.log(`  database host: ${new URL(url).hostname}`);
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();

  const columns = async (schema: string) =>
    (
      await client.query<{ c: string }>(
        `SELECT column_name::text || ':' || udt_name::text AS c FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'VendorEnquiry' ORDER BY ordinal_position`,
        [schema],
      )
    ).rows.map((r) => r.c);

  try {
    // ── old shape -> reshape ──────────────────────────────────────────────────────────────────
    await client.query(`CREATE SCHEMA "${OLD}"`);
    await client.query(`SET search_path TO "${OLD}"`);
    await client.query(`CREATE TABLE "Vendor" ("id" TEXT PRIMARY KEY)`);
    await client.query(ORIGINAL);
    await client.query(`INSERT INTO "Vendor" VALUES ('v1')`);
    await client.query(
      `INSERT INTO "VendorEnquiry" ("id","vendorId","source","type","senderEmail","subject","message","status","replyBody","repliedAt","repliedBy","updatedAt")
       VALUES ('e1','v1','CONTACT_FORM','ENQUIRY','a@x.invalid','s1','m1','REPLIED','the reply','2026-11-09 10:00','staff@x.invalid', now()),
              ('e2','v1','INBOUND_EMAIL','ORDERS','b@x.invalid','s2','m2','OPEN',NULL,NULL,NULL, now())`,
    );

    await client.query(RESHAPE);
    const after = await columns(OLD);
    check(
      "old shape: source/status are enums, reply columns gone",
      after.includes("source:EnquirySource") &&
        after.includes("status:EnquiryStatus") &&
        !after.some((c) => /^(replyBody|repliedAt|repliedBy):/.test(c)),
      after.join(", "),
    );
    const replies = await client.query<{ enquiryId: string; body: string; sentBy: string }>(
      `SELECT "enquiryId", "body", "sentBy" FROM "VendorEnquiryReply"`,
    );
    check(
      "old shape: the recorded reply was kept in VendorEnquiryReply",
      replies.rows.length === 1 &&
        replies.rows[0].enquiryId === "e1" &&
        replies.rows[0].body === "the reply" &&
        replies.rows[0].sentBy === "staff@x.invalid",
      JSON.stringify(replies.rows),
    );
    const kept = await client.query<{ id: string; status: string }>(
      `SELECT "id", "status"::text AS status FROM "VendorEnquiry" ORDER BY "id"`,
    );
    check(
      "old shape: both enquiries kept with their statuses",
      JSON.stringify(kept.rows) ===
        JSON.stringify([
          { id: "e1", status: "REPLIED" },
          { id: "e2", status: "OPEN" },
        ]),
      JSON.stringify(kept.rows),
    );
    await client.query(
      `INSERT INTO "VendorEnquiry" ("id","vendorId","source","type","senderEmail","subject","message","updatedAt")
       VALUES ('e3','v1','CONTACT_FORM','ENQUIRY','c@x.invalid','s3','m3', now())`,
    );
    const def = await client.query<{ status: string }>(
      `SELECT "status"::text AS status FROM "VendorEnquiry" WHERE "id" = 'e3'`,
    );
    check("old shape: status still defaults to OPEN", def.rows[0]?.status === "OPEN");
    const fk = await client.query(`DELETE FROM "VendorEnquiry" WHERE "id" = 'e1' RETURNING "id"`);
    const orphan = await client.query(
      `SELECT 1 FROM "VendorEnquiryReply" WHERE "enquiryId" = 'e1'`,
    );
    check(
      "old shape: reply FK cascades on enquiry delete",
      fk.rowCount === 1 && orphan.rowCount === 0,
    );

    const before2 = await columns(OLD);
    await client.query(RESHAPE);
    check(
      "idempotent: a second run changes nothing",
      JSON.stringify(await columns(OLD)) === JSON.stringify(before2),
    );

    // ── new shape -> reshape is a no-op ───────────────────────────────────────────────────────
    await client.query(`CREATE SCHEMA "${NEW}"`);
    await client.query(`SET search_path TO "${NEW}"`);
    await client.query(`CREATE TABLE "Vendor" ("id" TEXT PRIMARY KEY)`);
    await client.query(CURRENT);
    const newBefore = await columns(NEW);
    await client.query(RESHAPE);
    check(
      "new shape: reshape is a no-op",
      JSON.stringify(await columns(NEW)) === JSON.stringify(newBefore) &&
        newBefore.includes("status:EnquiryStatus"),
      newBefore.join(", "),
    );
  } finally {
    await client.query(`SET search_path TO public`);
    await client.query(`DROP SCHEMA IF EXISTS "${OLD}" CASCADE`);
    await client.query(`DROP SCHEMA IF EXISTS "${NEW}" CASCADE`);
    const left = await client.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name IN ($1, $2)`,
      [OLD, NEW],
    );
    console.log(`  cleanup: ${left.rowCount} schema(s) left`);
    if (left.rowCount !== 0) failures += 1;
    client.release();
    await pool.end();
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
