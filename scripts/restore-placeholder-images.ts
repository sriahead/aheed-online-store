/**
 * Upload the placeholder object for every placeholder key an environment's
 * database still references (#502).
 *
 *   npx tsx scripts/restore-placeholder-images.ts --env-file secrets/staging.vars
 *
 * WHY THIS SCRIPT EXISTS
 *
 * `prisma/seed.ts` writes both the `ProductImage` rows and the objects those
 * rows point at, but its generated-catalogue path guarded BOTH behind a
 * row-only check — so once a database held the rows, no later seed run uploaded
 * the objects. Rows and objects diverged per environment: every
 * `products/gen-<subcategory>/main.svg` key existed in the dev bucket and returned 404 from
 * staging's, while staging's pages went on referencing them. The seed defect is
 * fixed in the same slice; this script repairs the environments that already
 * drifted, which a seed fix alone cannot do for a database whose rows are
 * already in place.
 *
 * READS THE DATABASE, WRITES ONLY STORAGE. There is no code path here that
 * mutates a row. That is what makes it safe to point at staging — unlike
 * `scripts/verify-repository-injection.ts`, which creates rows and therefore
 * refuses any host but dev.
 *
 * IDEMPOTENT. Every upload is the same key with the same bytes, so a second run
 * reports the same count and changes nothing.
 *
 * TAKES AN EXPLICIT --env-file RATHER THAN AMBIENT ENV. `CLAUDE.md` records
 * `.env` and `.dev.vars` drifting into agreement on the PRODUCTION host while
 * every surrounding value in the file said staging (#119, and P5a's migration
 * that reached production ahead of its promotion PR). Naming the file at the
 * command line, and printing the host and bucket it resolved to before doing
 * anything, is what makes the target impossible to be wrong about by accident.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PLACEHOLDER_IMAGE_SUFFIX } from "@/lib/product-image";

/**
 * Parse a `KEY=value` env file into a plain record.
 *
 * Hand-rolled rather than reusing `dotenv`, because these files are not all
 * dotenv-clean: this repo's own `.env` has spaces around `=` and trailing
 * `# comment`s on the same line as values, which `CLAUDE.md`'s env-format rule
 * warns has silently broken connection strings here before. Quoted values are
 * taken verbatim up to the closing quote, so a `#` inside a URL survives.
 */
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
    // Unquoted: a trailing comment is whatever follows the first `#`.
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

async function main() {
  const fileFlag = process.argv.indexOf("--env-file");
  if (fileFlag === -1 || !process.argv[fileFlag + 1]) {
    throw new Error(
      "usage: npx tsx scripts/restore-placeholder-images.ts --env-file <path>\n" +
        "  e.g. --env-file .env            (dev)\n" +
        "       --env-file secrets/staging.vars",
    );
  }
  const envPath = process.argv[fileFlag + 1];
  const vars = parseEnvFile(envPath);

  const directUrl = vars.DIRECT_URL ?? vars.DATABASE_URL;
  if (!directUrl) throw new Error(`${envPath} defines neither DIRECT_URL nor DATABASE_URL`);
  for (const required of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"]) {
    if (!vars[required]) throw new Error(`${envPath} is missing ${required}`);
  }

  // `lib/storage`'s getStorage() reads through lib/config's readEnv(), which
  // falls back to process.env outside a Worker request context. Populating it
  // from the named file is what points the storage client at THIS environment's
  // bucket rather than whatever a stray .env happened to hold.
  for (const [key, value] of Object.entries(vars)) process.env[key] = value;
  const { getStorage } = await import("@/lib/storage");

  // Printed BEFORE any work, so an operator reading the output can stop a run
  // pointed at the wrong environment while it still hasn't done anything.
  console.log(`env file:    ${envPath}`);
  console.log(`database:    ${hostOf(directUrl)}`);
  console.log(`bucket:      ${vars.S3_BUCKET}`);
  console.log(`cdn:         ${vars.CDN_BASE_URL ?? "(unset)"}`);
  console.log("");

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: directUrl }) });
  const storage = getStorage();

  try {
    const rows = await prisma.productImage.findMany({
      where: { storageKey: { endsWith: PLACEHOLDER_IMAGE_SUFFIX } },
      select: { storageKey: true },
      distinct: ["storageKey"],
      orderBy: { storageKey: "asc" },
    });

    if (rows.length === 0) {
      console.log("uploaded 0 distinct placeholder key(s) — nothing references one");
      return;
    }

    const placeholder = readFileSync(
      join(import.meta.dirname, "..", "prisma", "seed-assets", "placeholder-product.svg"),
      "utf8",
    );

    for (const { storageKey } of rows) {
      await storage.putObject(storageKey, placeholder, "image/svg+xml");
      console.log(`  put ${storageKey}`);
    }

    console.log(`\nuploaded ${rows.length} distinct placeholder key(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
