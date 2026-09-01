/**
 * Remove named `VendorDomain` rows from one environment (#519).
 *
 *   npx tsx scripts/remove-vendor-domains.ts --env-file secrets/production.vars \
 *     --remove staging.aheedfoodcentre.nocaped.com --remove srimart-staging.nocaped.com
 *
 * Add `--apply` to actually delete. Without it this is a DRY RUN and writes nothing.
 *
 * WHY THIS EXISTS
 *
 * Production's `VendorDomain` table held two STAGING hosts
 * (`staging.aheedfoodcentre.nocaped.com`, `srimart-staging.nocaped.com`) alongside the two correct
 * production ones, all four marked `isCanonical: true` — so each vendor had two canonical hosts.
 * They were almost certainly written by an earlier seed run pointed at production while carrying
 * staging's `SEED_*_HOST` values, the same class of confusion as #119 and P5a's misdirected
 * migration.
 *
 * WHY THEY WERE NOT SIMPLY LEFT ALONE
 *
 * They are inert in normal operation: staging's Worker resolves tenants against STAGING's
 * database, so nothing ever asks production's database about a staging host. They stop being inert
 * the moment something else resolves a host against production's data — a restore into another
 * environment, a shared-database diagnostic, a future preview environment. `lib/tenant.ts` treats a
 * `VendorDomain` match as authoritative, so a stale row is a silent mis-tenanting waiting for the
 * right conditions.
 *
 * WHY IT TAKES EXPLICIT HOSTS RATHER THAN A PATTERN
 *
 * A rule like "delete anything containing 'staging'" is exactly the kind of cleverness that
 * deletes a legitimate row in an environment nobody was thinking about when it was written.
 * Naming each host on the command line means the blast radius is visible in the shell history.
 *
 * THE LAST-CANONICAL-HOST GUARD IS THE LOAD-BEARING SAFETY CHECK. Removing a vendor's only
 * canonical host sends every request for that vendor to `/coming-soon` — a live outage. This
 * refuses to do that, whatever was passed on the command line.
 */

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

/** Same hand-rolled parser as the sibling scripts — see restore-placeholder-images.ts for why. */
function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rest] = match;
    const quote = rest[0];
    if (quote === '"' || quote === "'") {
      const end = rest.indexOf(quote, 1);
      if (end > 0) {
        out[key] = rest.slice(1, end);
        continue;
      }
    }
    out[key] = rest.split("#")[0].trim();
  }
  return out;
}

function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString).host;
  } catch {
    return "(unparseable)";
  }
}

/** Every `--remove <host>` on the command line, lowercased to match how rows are stored. */
function removalTargets(): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === "--remove" && process.argv[i + 1]) {
      out.push(process.argv[i + 1].trim().toLowerCase());
    }
  }
  return out;
}

async function main() {
  const fileFlag = process.argv.indexOf("--env-file");
  const envPath = fileFlag === -1 ? undefined : process.argv[fileFlag + 1];
  const targets = removalTargets();
  const apply = process.argv.includes("--apply");

  if (!envPath || targets.length === 0) {
    throw new Error(
      "usage: npx tsx scripts/remove-vendor-domains.ts --env-file <path> --remove <host> [--remove <host>] [--apply]\n" +
        "  without --apply this is a dry run and writes nothing",
    );
  }

  const vars = parseEnvFile(envPath);
  const directUrl = vars.DIRECT_URL ?? vars.DATABASE_URL;
  if (!directUrl) throw new Error(`${envPath} defines neither DIRECT_URL nor DATABASE_URL`);

  console.log(`env file: ${envPath}`);
  console.log(`database: ${hostOf(directUrl)}`);
  console.log(`mode:     ${apply ? "APPLY (rows will be deleted)" : "DRY RUN (no writes)"}`);
  console.log("");

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: directUrl }) });

  try {
    const rows = await prisma.vendorDomain.findMany({
      select: {
        id: true,
        host: true,
        isCanonical: true,
        vendorId: true,
        vendor: { select: { slug: true } },
      },
      orderBy: { host: "asc" },
    });

    console.log("current VendorDomain rows:");
    for (const r of rows) {
      const mark = targets.includes(r.host) ? "  <-- to remove" : "";
      console.log(`  ${r.vendor.slug.padEnd(20)} ${r.host}  canonical=${r.isCanonical}${mark}`);
    }
    console.log("");

    const doomed = rows.filter((r) => targets.includes(r.host));
    const missing = targets.filter((t) => !rows.some((r) => r.host === t));
    for (const m of missing) console.log(`  note: no row for "${m}" — nothing to remove`);

    if (doomed.length === 0) {
      console.log("\nnothing to do");
      return;
    }

    // The guard that matters: never leave a vendor with no canonical host. Doing so routes every
    // request for that vendor to /coming-soon, which is a live outage rather than a tidy-up.
    for (const vendorId of new Set(doomed.map((d) => d.vendorId))) {
      const survivingCanonical = rows.filter(
        (r) => r.vendorId === vendorId && r.isCanonical && !targets.includes(r.host),
      );
      if (survivingCanonical.length === 0) {
        const slug = rows.find((r) => r.vendorId === vendorId)?.vendor.slug ?? vendorId;
        throw new Error(
          `refusing to run: removing these hosts would leave vendor "${slug}" with no canonical ` +
            `host, sending every request for it to /coming-soon`,
        );
      }
    }

    if (!apply) {
      console.log(`\nDRY RUN — would remove ${doomed.length} row(s). Re-run with --apply.`);
      return;
    }

    for (const d of doomed) {
      await prisma.vendorDomain.delete({ where: { id: d.id } });
      console.log(`  removed ${d.host} (${d.vendor.slug})`);
    }
    console.log(`\nremoved ${doomed.length} row(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
