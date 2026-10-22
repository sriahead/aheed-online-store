import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { applyPlan, type ImportDb } from "../lib/catalogue-import/apply";
import { buildPlan, listDepartments } from "../lib/catalogue-import/plan";
import { importProfileSchema, type ImportProfile } from "../lib/catalogue-import/profile";
import {
  buildReport,
  compareVendorCounts,
  countByVendor,
  exitCodeFor,
  type CountDb,
} from "../lib/catalogue-import/report";
import { readRows } from "../lib/catalogue-import/rows";
import { assertNotDeployedDatabase } from "./lib/protected-hosts";
import { readSourceGrid, UnsupportedFileError } from "./lib/read-spreadsheet";

/**
 * Import a client's stock export into ONE vendor's catalogue (#1216).
 *
 *   npx tsx scripts/import-catalogue.ts <source.csv|.xlsx|.xls> --profile <profile.json> \
 *       --vendor-slug <slug> [--report <path>]                  # DRY RUN (the default)
 *   npx tsx scripts/import-catalogue.ts <source> --profile <p> --vendor-slug <slug> --apply
 *   npx tsx scripts/import-catalogue.ts <source> --profile <p> --list-departments
 *   npx tsx scripts/import-catalogue.ts --validate-profile <profile.json>
 *
 * WHAT IT GUARANTEES. Every product is created HIDDEN with stock UNKNOWN and quantity 0; every
 * category is created INACTIVE; the client's department and sub-department names are kept exactly
 * (trimmed of leading/trailing whitespace only — nothing is mapped, matched or renamed); nothing is
 * fabricated (no barcode, supplier, cost, stock or VAT is written); nothing is deleted; a re-run
 * writes nothing except a TIGHTENED restriction. It is Node-only and never runs on the Worker.
 *
 * THE DRY RUN IS THE VALIDATION. Without `--apply` it parses, validates, classifies and plans
 * everything, writes the report, and opens no database connection at all — it works with
 * DATABASE_URL and DIRECT_URL unset. `--apply` runs the same plan, after the host guard.
 *
 * EXIT CODES. 0 clean; 2 rows were rejected or a category spelling variant needs a person's review
 * (the valid rows are still written under --apply); 1 anything failed or was refused.
 *
 * THE CLIENT'S FILE AND PROFILE LIVE OUTSIDE THE REPOSITORY (like a vendor manifest): they carry a
 * client's commercial data, and a git commit is permanent. The report goes to `.import-reports/`,
 * which is gitignored for the same reason.
 */

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function loadProfile(path: string): ImportProfile {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return fail(`cannot read profile ${path}: ${error instanceof Error ? error.message : error}`);
  }
  const parsed = importProfileSchema.safeParse(json);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
    return fail(`REFUSING TO RUN: ${path} is not a valid import profile.\n${lines.join("\n")}`);
  }
  return parsed.data;
}

function vendorFromManifest(path: string): { slug: string; id: string } {
  try {
    const json = JSON.parse(readFileSync(path, "utf8")) as { slug?: unknown; id?: unknown };
    if (typeof json.slug === "string" && typeof json.id === "string") {
      return { slug: json.slug, id: json.id };
    }
  } catch {
    // fall through
  }
  return fail(`cannot read a vendor id and slug from manifest ${path}`);
}

async function main() {
  const args = process.argv.slice(2);

  const validateProfile = flag(args, "--validate-profile");
  if (validateProfile !== undefined) {
    loadProfile(validateProfile);
    console.log(`profile ${validateProfile} is valid`);
    return;
  }

  const valueFlags = new Set(["--profile", "--vendor-slug", "--manifest", "--report"]);
  const source = args.find((a, i) => !a.startsWith("--") && !valueFlags.has(args[i - 1] ?? ""));
  const profilePath = flag(args, "--profile");
  const apply = args.includes("--apply");
  const listOnly = args.includes("--list-departments");
  const manifestPath = flag(args, "--manifest");
  const manifest = manifestPath ? vendorFromManifest(manifestPath) : null;
  const vendorSlug = flag(args, "--vendor-slug") ?? manifest?.slug;

  if (!source || !profilePath) {
    return fail(
      "usage: npx tsx scripts/import-catalogue.ts <source.csv|.xlsx|.xls> --profile <profile.json> " +
        "--vendor-slug <slug> [--apply] [--report <path>] [--list-departments]\n" +
        "       npx tsx scripts/import-catalogue.ts --validate-profile <profile.json>",
    );
  }
  if (!listOnly && !vendorSlug)
    return fail("--vendor-slug <slug> (or --manifest <path>) is required");

  const profile = loadProfile(profilePath);

  let sheet;
  try {
    sheet = readSourceGrid(source);
  } catch (error) {
    if (error instanceof UnsupportedFileError) return fail(error.message);
    return fail(`cannot read ${source}: ${error instanceof Error ? error.message : error}`);
  }

  const read = readRows(sheet.grid, profile, sheet.firstRowNumber);
  if (!read.ok) return fail(`REFUSING TO RUN: ${read.error}`);
  console.log(
    `read ${read.rows.length} data row(s) from sheet "${sheet.sheetName}" ` +
      `(header on source row ${read.headerSourceRow}; discarded ${read.discarded.aboveHeader} above ` +
      `the header and ${read.discarded.footer} footer row(s))`,
  );

  if (listOnly) {
    for (const d of listDepartments(read.rows, profile)) {
      console.log(`${String(d.rows).padStart(6)}  ${d.treatment.padEnd(16)}  ${d.department}`);
    }
    return;
  }

  const plan = buildPlan(read.rows, profile);
  const readSummary = {
    rowsRead: read.rows.length,
    discardedAboveHeader: read.discarded.aboveHeader,
    discardedFooter: read.discarded.footer,
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath =
    flag(args, "--report") ?? join(".import-reports", `${vendorSlug}-${stamp}.json`);
  const writeReport = (report: unknown) => {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  };

  console.log(
    `planned ${plan.products.length} product(s) in ${plan.categories.length} categor(ies); ` +
      `${plan.rejected.length} row(s) rejected`,
  );
  if (plan.unreviewedDepartments.length > 0) {
    console.log(
      `${plan.unreviewedDepartments.length} department(s) are in none of the profile's reviewed lists ` +
        "and import as NEEDS_REVIEW (listed in the report)",
    );
  }
  if (plan.categoryNameVariants.length > 0) {
    console.log(
      `${plan.categoryNameVariants.length} category name variant(s) need review (reported, not merged silently)`,
    );
  }

  if (!apply) {
    const report = buildReport({
      mode: "dry-run",
      vendor: vendorSlug!,
      now: new Date(),
      read: readSummary,
      plan,
    });
    writeReport(report);
    console.log(`\nDRY RUN: nothing was written. Report: ${reportPath}`);
    process.exit(exitCodeFor(report));
  }

  // ---- --apply ----------------------------------------------------------------------------
  if (plan.products.length === 0)
    return fail("REFUSING TO APPLY: the source contains no valid row");

  // #490 — before any client exists, with no override.
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  const { host } = assertNotDeployedDatabase(connectionString);
  console.log(`database: ${host ?? "(unparseable)"} — not staging/production`);

  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: connectionString as string }),
  });
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { slug: vendorSlug! },
      select: { id: true, slug: true },
    });
    if (!vendor) return fail(`REFUSING TO APPLY: no vendor with slug "${vendorSlug}" exists`);
    if (manifest && manifest.id !== vendor.id) {
      return fail(
        `REFUSING TO APPLY: manifest id ${manifest.id} does not match vendor "${vendor.slug}"`,
      );
    }

    const before = await countByVendor(prisma as unknown as CountDb);
    const applied = await applyPlan(prisma as unknown as ImportDb, vendor.id, plan);
    const after = await countByVendor(prisma as unknown as CountDb);
    const isolation = compareVendorCounts(before, after, vendor.id);

    const report = buildReport({
      mode: "apply",
      vendor: vendor.slug,
      now: new Date(),
      read: readSummary,
      plan,
      applied,
      isolation,
    });
    writeReport(report);

    console.log(
      `\ncreated ${applied.productsCreated} product(s) and ${applied.categoriesCreated} categor(ies); ` +
        `${applied.existingUnchanged} existing unchanged; ${applied.restrictionTightened} restriction(s) tightened; ` +
        `${applied.failedDepartments} department(s) failed`,
    );
    for (const d of applied.departments.filter(
      (x) => x.status === "FAILED" || x.status === "ALREADY_EXISTS",
    )) {
      console.error(`  ${d.status}: ${d.department}: ${d.error}`);
    }
    for (const [id, tables] of Object.entries(after)) {
      if (id === vendor.id) continue;
      console.log(
        `other vendor ${id}: ${JSON.stringify(tables)} (before: ${JSON.stringify(before[id] ?? {})})`,
      );
    }
    if (!isolation.ok) {
      console.error("ISOLATION FAILED: another vendor's row counts changed:");
      for (const d of isolation.differences) {
        console.error(`  ${d.vendorId} ${d.table}: ${d.before} -> ${d.after}`);
      }
      process.exit(1);
    }
    console.log(`isolation: every other vendor's row counts are unchanged. Report: ${reportPath}`);
    process.exit(exitCodeFor(report));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
