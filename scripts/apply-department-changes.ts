import "dotenv/config"; // load .env in THIS process, regardless of how it's launched
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  describeChange,
  planDepartmentChanges,
  type DepartmentChange,
} from "../prisma/department-changes";

/**
 * #1131 — apply the owner's department changes to ONE vendor, against the database in `DIRECT_URL`:
 * hide the five departments, create the Fish department with Fresh Fish and Frozen Fish, and set the
 * header search placeholder. `--restore` shows the five departments again and changes nothing else.
 *
 *   npx tsx scripts/apply-department-changes.ts --vendor <slug>                    # dry run
 *   npx tsx scripts/apply-department-changes.ts --vendor <slug> --apply            # write
 *   npx tsx scripts/apply-department-changes.ts --vendor <slug> --apply --restore  # undo the hiding
 *
 * A DRY RUN IS THE DEFAULT: without `--apply` it prints what it would do and writes nothing. Every
 * decision comes from `planDepartmentChanges` (`prisma/department-changes.ts`), so a second
 * `--apply` finds nothing to do. Hiding rewrites no product, sub-category or promotion — see that
 * module and `lib/category-visibility.ts`.
 *
 * For staging or production, point `DIRECT_URL` at that database's direct URL from
 * `secrets/<env>.vars`, exactly as `scripts/seed-footer-defaults.ts` is run. The script prints the
 * target host before anything else, so a wrong database is visible before a write. A Node script
 * against `DIRECT_URL`, like the seed — never the Worker. No raw SQL.
 */

function parseArgs(argv: readonly string[]) {
  const vendorIndex = argv.indexOf("--vendor");
  const vendor = vendorIndex >= 0 ? argv[vendorIndex + 1] : undefined;
  return {
    vendor: vendor && !vendor.startsWith("--") ? vendor : undefined,
    apply: argv.includes("--apply"),
    restore: argv.includes("--restore"),
  };
}

async function write(prisma: PrismaClient, vendorId: string, change: DepartmentChange) {
  switch (change.kind) {
    case "hide":
    case "show":
      // Singular update, scoped by vendor as well as id: an id from another vendor matches nothing.
      await prisma.category.update({
        where: { id: change.id, vendorId },
        data: { isActive: change.kind === "show" },
      });
      return;
    case "create-department":
      await prisma.category.create({
        data: { vendorId, slug: change.slug, name: change.name, parentId: null, isActive: true },
      });
      return;
    case "create-subcategory": {
      // Re-read the parent: it may have been created by an earlier change in this same run.
      const parent = await prisma.category.findFirst({
        where: { vendorId, slug: change.parentSlug, parentId: null },
        select: { id: true },
      });
      if (!parent) throw new Error(`parent ${change.parentSlug} not found for ${change.slug}`);
      const siblings = await prisma.category.count({ where: { vendorId, parentId: parent.id } });
      await prisma.category.create({
        data: {
          vendorId,
          slug: change.slug,
          name: change.name,
          parentId: parent.id,
          sortOrder: siblings,
          isActive: true,
        },
      });
      return;
    }
    case "set-search-placeholder":
      await prisma.vendorConfig.update({
        where: { vendorId },
        data: { searchPlaceholder: change.to },
      });
      return;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.vendor) {
    console.error("--vendor <slug> is required, e.g. --vendor aheed-food-centre");
    process.exit(1);
  }
  if (args.restore && !args.apply) {
    console.log("--restore without --apply is a dry run of the restore.");
  }

  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    console.error("DIRECT_URL is empty — set it to the target database's direct (non-pooled) URL.");
    process.exit(1);
  }
  const host = new URL(connectionString).host;
  console.log(`target database host: ${host}`);

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { slug: args.vendor },
      select: {
        id: true,
        name: true,
        config: { select: { searchPlaceholder: true } },
        categories: {
          select: { id: true, slug: true, name: true, parentId: true, isActive: true },
        },
      },
    });
    if (!vendor) {
      console.error(`No vendor with slug "${args.vendor}" on ${host} — nothing written.`);
      process.exitCode = 1;
      return;
    }

    const mode = args.restore ? "restore" : "apply";
    const plan = planDepartmentChanges(
      {
        categories: vendor.categories,
        searchPlaceholder: vendor.config?.searchPlaceholder,
        hasConfig: vendor.config !== null,
      },
      mode,
    );

    console.log(`${vendor.name} (${args.vendor}), ${mode}${args.apply ? "" : " — DRY RUN"}:`);
    for (const note of plan.notes) console.log(`  note: ${note}`);
    if (plan.changes.length === 0) {
      console.log("  no changes — this vendor is already in that state.");
      return;
    }
    for (const change of plan.changes) console.log(`  ${describeChange(change)}`);

    if (!args.apply) {
      console.log("Dry run only: nothing written. Add --apply to write these changes.");
      return;
    }
    for (const change of plan.changes) await write(prisma, vendor.id, change);
    console.log(`done: ${plan.changes.length} change(s) written on ${host}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
