import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
/**
 * #1482 R30a — READ-ONLY check of a database's VendorEnquiry shape and migration checksum.
 *
 *   npx tsx scripts/check-enquiry-schema.ts <secrets file> <URL key>
 *   e.g. secrets/afc-production.vars AFC_DIRECT_URL, or secrets/merqify-production.vars DIRECT_URL
 *
 * Prints whether 20261109225000_vendor_enquiries' applied checksum matches the file, VendorEnquiry's
 * columns, whether VendorEnquiryReply exists, and the row count. Writes nothing. Run it against both
 * production databases right after promoting #1482 to confirm the reshape migration converted them
 * (auto mode blocks production reads, so the owner runs it).
 */
const line = readFileSync(process.argv[2], "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith(process.argv[3] + "="))!;
const url = line
  .slice(process.argv[3].length + 1)
  .trim()
  .replace(/^["']|["']$/g, "");
console.log("host", new URL(url).hostname);
const p = new PrismaClient({ adapter: new PrismaNeonHttp(url, {}) });
(async () => {
  const fileSum = createHash("sha256")
    .update(readFileSync("prisma/migrations/20261109225000_vendor_enquiries/migration.sql"))
    .digest("hex");
  const rows = await p.$queryRaw<
    { checksum: string; finished_at: Date | null }[]
  >`SELECT checksum, finished_at FROM "_prisma_migrations" WHERE migration_name = '20261109225000_vendor_enquiries'`;
  console.log(
    "applied:",
    rows.map((r) => ({ finished: r.finished_at, matchesFile: r.checksum === fileSum })),
  );
  const cols = await p.$queryRaw<
    { column_name: string; data_type: string; udt_name: string }[]
  >`SELECT column_name::text AS column_name, data_type::text AS data_type, udt_name::text AS udt_name FROM information_schema.columns WHERE table_name = 'VendorEnquiry' ORDER BY ordinal_position`;
  console.log("VendorEnquiry:", cols.map((c) => `${c.column_name}:${c.udt_name}`).join(", "));
  const t = await p.$queryRaw<
    { n: bigint }[]
  >`SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_name = 'VendorEnquiryReply'`;
  console.log("VendorEnquiryReply table exists:", Number(t[0].n) > 0);
  const c = await p.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "VendorEnquiry"`;
  console.log("VendorEnquiry rows:", Number(c[0].n));
  await p.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
