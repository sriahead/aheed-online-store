import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { isUniqueViolation } from "../lib/catalogue-import/errors";
import {
  SNAPSHOT_TABLES,
  diffSnapshots,
  type Snapshot,
  type SnapshotTable,
} from "../lib/catalogue-import/snapshot";
import { connectDev } from "./lib/dev-client";

/**
 * Dev-database checks for the catalogue import (#1216 R37). Every mode applies the host guard before
 * any client exists; apart from the snapshot FILE and the unique probe below, nothing is written.
 *
 *   --snapshot <file>                 per-vendor row counts to a JSON file
 *   --diff <a> <b> --except <slug>    exit 1 naming any difference for a vendor other than <slug>
 *   --counts --vendor <slug>          the six counts for one vendor
 *   --audit  --vendor <slug> [--exact]  every restricted product has an audit row; IMPORT rows have the
 *                                     importer's shape; --exact also demands rows == restricted products
 *   --unique-probe --vendor <slug>    provoke a REAL unique violation through each Neon adapter
 *
 * THE PROBE. CLAUDE.md: the two adapters report the same Postgres error under different `.code`
 * values, and a check built against the wrong adapter "looks green" (#232). The probe therefore
 * constructs BOTH clients, asks each to create a `Category` whose slug duplicates an EXISTING category
 * of the vendor, prints the observed `.code`, and asserts `isUniqueViolation` for the client the
 * importer uses (the WebSocket one). Because the slug already exists, the insert can never succeed,
 * so it leaves no row; if it somehow does succeed, the script says so loudly and exits 1.
 */

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function takeSnapshot(prisma: ReturnType<typeof connectDev>["prisma"]): Promise<Snapshot> {
  const vendors = await prisma.vendor.findMany({ select: { id: true, slug: true } });
  const snapshot: Snapshot = { takenAt: new Date().toISOString(), vendors: {} };
  // One count per vendor per table: a handful of vendors, and `count` is typed and unambiguous where
  // `groupBy` is not under this Prisma version.
  for (const { id: vendorId, slug } of vendors) {
    const where = { vendorId };
    snapshot.vendors[vendorId] = {
      slug,
      counts: {
        Vendor: 1,
        VendorDomain: await prisma.vendorDomain.count({ where }),
        Product: await prisma.product.count({ where }),
        Category: await prisma.category.count({ where }),
        Inventory: await prisma.inventory.count({ where }),
        ProductRestrictionAuditLog: await prisma.productRestrictionAuditLog.count({ where }),
      } satisfies Record<SnapshotTable, number>,
    };
  }
  return snapshot;
}

function readSnapshot(path: string): Snapshot {
  return JSON.parse(readFileSync(path, "utf8")) as Snapshot;
}

async function main() {
  const args = process.argv.slice(2);

  // --diff needs no database at all.
  const diffIndex = args.indexOf("--diff");
  if (diffIndex >= 0) {
    const [a, b] = [args[diffIndex + 1], args[diffIndex + 2]];
    const except = arg(args, "--except");
    if (!a || !b || !except) {
      console.error("usage: --diff <a.json> <b.json> --except <vendor-slug>");
      process.exit(1);
    }
    const differences = diffSnapshots(readSnapshot(a), readSnapshot(b), except);
    if (differences.length === 0) {
      console.log("no differences");
      return;
    }
    for (const d of differences) {
      console.error(`DIFFERENT  ${d.slug} ${d.table}: ${d.before} -> ${d.after}`);
    }
    process.exit(1);
  }

  const vendorSlug = arg(args, "--vendor");
  const { prisma, host } = connectDev("ws");
  console.log(`database: ${host ?? "(unparseable)"} — not staging/production`);
  try {
    const snapshotPath = arg(args, "--snapshot");
    if (snapshotPath) {
      const snapshot = await takeSnapshot(prisma);
      mkdirSync(dirname(snapshotPath), { recursive: true });
      writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
      console.log(
        `snapshot of ${Object.keys(snapshot.vendors).length} vendor(s) written to ${snapshotPath}`,
      );
      return;
    }

    if (!vendorSlug) {
      console.error(
        "usage: --snapshot <file> | --diff <a> <b> --except <slug> | --counts|--audit|--unique-probe --vendor <slug>",
      );
      process.exit(1);
    }
    const vendor = await prisma.vendor.findUnique({
      where: { slug: vendorSlug },
      select: { id: true },
    });
    if (!vendor) {
      console.error(`vendor "${vendorSlug}" does not exist`);
      process.exit(1);
    }
    const vendorId = vendor.id;

    if (args.includes("--counts")) {
      const snapshot = await takeSnapshot(prisma);
      for (const t of SNAPSHOT_TABLES) console.log(`${t}: ${snapshot.vendors[vendorId].counts[t]}`);
      return;
    }

    if (args.includes("--audit")) {
      const restricted = await prisma.product.count({
        where: { vendorId, NOT: { restriction: null } },
      });
      const unaudited = await prisma.product.count({
        where: { vendorId, NOT: { restriction: null }, restrictionAuditLogs: { none: {} } },
      });
      const importRows = await prisma.productRestrictionAuditLog.findMany({
        where: { vendorId, source: "IMPORT" },
        select: { action: true, actorUserId: true },
      });
      const badShape = importRows.filter(
        (r) => r.action !== "RESTRICTION_SET" || r.actorUserId !== null,
      ).length;
      const allRows = await prisma.productRestrictionAuditLog.count({ where: { vendorId } });
      const onUnrestricted = await prisma.productRestrictionAuditLog.count({
        where: { vendorId, product: { restriction: null } },
      });
      console.log(`restricted products: ${restricted}`);
      console.log(`restricted products with no audit row: ${unaudited}`);
      console.log(`IMPORT audit rows: ${importRows.length}`);
      console.log(`IMPORT audit rows that are not RESTRICTION_SET with a null actor: ${badShape}`);
      console.log(`audit rows (all sources): ${allRows}`);
      console.log(`audit rows on products that are now unrestricted: ${onUnrestricted}`);

      // Always: every restricted product has a trail, and every IMPORT row has the importer's shape.
      let ok = unaudited === 0 && badShape === 0;
      // --exact is for the moment right after a first import of a vendor nobody has touched: one
      // audit row per restricted product and none on an unrestricted one. It is NOT the default,
      // because a legitimate admin clear or a tightened re-import adds rows that break equality.
      if (args.includes("--exact")) {
        const exact = allRows === restricted && onUnrestricted === 0;
        console.log(
          `exact (rows == restricted products, none on unrestricted): ${exact ? "yes" : "NO"}`,
        );
        ok = ok && exact;
      }
      if (!ok) {
        console.error("FAIL: see the counts above");
        process.exit(1);
      }
      return;
    }

    if (args.includes("--unique-probe")) {
      const existing = await prisma.category.findFirst({
        where: { vendorId },
        select: { slug: true, name: true },
      });
      if (!existing) {
        console.error("the vendor has no category to duplicate; import something first");
        process.exit(1);
      }
      const observed: Record<string, string> = {};
      let importerClientRecognised = false;
      for (const kind of ["ws", "http"] as const) {
        const { prisma: client } = connectDev(kind);
        try {
          await client.category.create({
            data: { vendorId, slug: existing.slug, name: existing.name },
          });
          console.error(`DISASTER: a duplicate category was CREATED through the ${kind} client`);
          process.exit(1);
        } catch (error) {
          const code = (error as { code?: unknown } | null)?.code;
          observed[kind] = code === undefined ? "(no .code)" : String(code);
          console.log(`${kind} client observed .code = ${observed[kind]}`);
          if (kind === "ws") importerClientRecognised = isUniqueViolation(error);
        } finally {
          await client.$disconnect();
        }
      }
      console.log(
        `unique predicate true for importer client: ${importerClientRecognised ? "yes" : "no"}`,
      );
      if (!importerClientRecognised) process.exit(1);
      return;
    }

    console.error("no mode given");
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
