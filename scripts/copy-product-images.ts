/**
 * Copy a real product image from one environment to another for every product
 * in the DESTINATION that still has only a placeholder (#518).
 *
 *   npx tsx scripts/copy-product-images.ts \
 *     --from secrets/staging.vars --to secrets/production.vars
 *
 * WHY THIS IS NOT A BUCKET-TO-BUCKET COPY
 *
 * Two key schemes are in play. Seeded placeholders are `products/{slug}/main.svg`
 * — slug-derived, so byte-identical in every environment. Generated images are
 * `buildProductImageKey(productId)` = `products/{productId}/{uuid}.webp`, built
 * from the product's DATABASE ID plus a fresh UUID, and product ids are
 * generated per environment by the seed's own `create` calls. So a source
 * environment's generated keys address nothing in the destination: copying
 * objects key-for-key would place bytes where no destination row points, and
 * every row would still resolve to a 404.
 *
 * The copy is therefore row-aware. Products are matched across environments by
 * `(vendorId, slug)` — the only identifier the seed makes stable — and a NEW
 * destination key is minted from the DESTINATION product's id.
 *
 * WHY THE DESTINATION DRIVES THE QUERY
 *
 * The work list comes from the destination ("which products here still have
 * only a placeholder?"), never from the source ("what images does the source
 * have?"). That direction is a correctness property, not a style choice:
 * staging holds `p5b-validation-fixture`, an artifact of P5b's validation that
 * is absent from `prisma/seed.ts`'s CATALOGUE and must never appear in a live
 * store. Enumerating the source would sweep it up; enumerating the destination
 * cannot, because the seed never creates it there.
 *
 * READS BOTH DATABASES, WRITES ROWS AND OBJECTS IN THE DESTINATION ONLY.
 * Nothing here mutates the source.
 *
 * IDEMPOTENT. Once a product has a real image it is no longer selected, so a
 * second run copies zero and changes nothing.
 *
 * TAKES EXPLICIT --from/--to ENV FILES RATHER THAN AMBIENT ENV, and prints the
 * hosts and buckets it resolved before doing anything — `CLAUDE.md` records
 * `.env` and `.dev.vars` drifting into agreement on the PRODUCTION host while
 * every surrounding value said staging (#119), and P5a's migration reaching
 * production ahead of its promotion PR. Naming both files at the command line
 * is what makes the target impossible to get wrong by accident.
 */

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  buildProductImageKey,
  isPlaceholderImageKey,
  PLACEHOLDER_IMAGE_SUFFIX,
} from "@/lib/product-image";
import { saveGeneratedProductImage } from "@/lib/repositories/products";
import type { StorageService } from "@/lib/storage";

/**
 * Parse a `KEY=value` env file into a plain record.
 *
 * Hand-rolled rather than reusing `dotenv`, matching
 * `scripts/restore-placeholder-images.ts`: these files are not all dotenv-clean
 * (this repo's own `.env` has spaces around `=` and trailing `# comment`s, which
 * `CLAUDE.md`'s env-format rule warns has silently broken connection strings
 * here). Quoted values are taken verbatim, so a `#` inside a URL survives.
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

function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const REQUIRED_S3 = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"] as const;

function loadEnvironment(label: string, envPath: string) {
  const vars = parseEnvFile(envPath);
  const directUrl = vars.DIRECT_URL ?? vars.DATABASE_URL;
  if (!directUrl)
    throw new Error(`${label} (${envPath}) defines neither DIRECT_URL nor DATABASE_URL`);
  for (const required of REQUIRED_S3) {
    if (!vars[required]) throw new Error(`${label} (${envPath}) is missing ${required}`);
  }
  return { vars, directUrl, envPath };
}

async function main() {
  const fromPath = flagValue("--from");
  const toPath = flagValue("--to");
  if (!fromPath || !toPath) {
    throw new Error(
      "usage: npx tsx scripts/copy-product-images.ts --from <env-file> --to <env-file>\n" +
        "  e.g. --from secrets/staging.vars --to secrets/production.vars",
    );
  }

  const source = loadEnvironment("source", fromPath);
  const dest = loadEnvironment("destination", toPath);

  // Printed BEFORE any read or write, so an operator can stop a run pointed at
  // the wrong environment while it still hasn't touched anything. Host and
  // bucket only — never a connection string, which carries the password.
  console.log(`source      env file: ${source.envPath}`);
  console.log(`            database: ${hostOf(source.directUrl)}`);
  console.log(`            bucket:   ${source.vars.S3_BUCKET}`);
  console.log(`destination env file: ${dest.envPath}`);
  console.log(`            database: ${hostOf(dest.directUrl)}`);
  console.log(`            bucket:   ${dest.vars.S3_BUCKET}`);
  console.log("");

  if (source.vars.S3_BUCKET === dest.vars.S3_BUCKET) {
    throw new Error(
      `refusing to run: source and destination resolve to the same bucket (${dest.vars.S3_BUCKET})`,
    );
  }

  // `getStorage()` reads through lib/config's getEnv(), which is NOT cached and
  // falls back to process.env outside a Worker request context. It captures its
  // env and signer at construction, so building one client per environment with
  // process.env swapped in between yields two independent, correctly-pointed
  // clients.
  const { getStorage } = await import("@/lib/storage");
  const applyEnv = (vars: Record<string, string>) => {
    for (const [key, value] of Object.entries(vars)) process.env[key] = value;
  };
  applyEnv(source.vars);
  const sourceStorage: StorageService = getStorage();
  applyEnv(dest.vars);
  const destStorage: StorageService = getStorage();

  const sourcePrisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: source.directUrl }),
  });
  const destPrisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: dest.directUrl }),
  });

  let copied = 0;
  let skipped = 0;
  let failedCount = 0;

  try {
    // The driving query: destination products whose images are ALL placeholders.
    // `every` on an empty relation is vacuously true, so this covers a product
    // with no image row at all without a second branch (#502).
    const needing = await destPrisma.product.findMany({
      where: { images: { every: { storageKey: { endsWith: PLACEHOLDER_IMAGE_SUFFIX } } } },
      select: { id: true, slug: true, name: true, vendorId: true },
      orderBy: [{ vendorId: "asc" }, { slug: "asc" }],
    });

    console.log(`destination products needing an image: ${needing.length}\n`);

    for (const product of needing) {
      try {
        await copyOne(product);
      } catch (err) {
        // One product failing must not abandon the rest, and the message must
        // name the product: a bare "fetch failed" from undici carries no key,
        // no bucket and no slug, which is useless when 8 products are in flight.
        console.error(`  FAILED ${product.slug}: ${err instanceof Error ? err.message : err}`);
        failedCount++;
      }
    }

    async function copyOne(product: {
      id: string;
      slug: string;
      name: string;
      vendorId: string;
    }): Promise<void> {
      const sourceProduct = await sourcePrisma.product.findFirst({
        where: { vendorId: product.vendorId, slug: product.slug },
        select: {
          imageNeedsReview: true,
          images: {
            select: { storageKey: true, alt: true, isPrimary: true },
            orderBy: { isPrimary: "desc" },
          },
        },
      });

      if (!sourceProduct) {
        console.log(`  skip ${product.slug} — no such product in the source`);
        skipped++;
        return;
      }

      // Prefer the source's primary; `orderBy isPrimary desc` above already puts
      // it first, so this is "the best real image the source has".
      const sourceImage = sourceProduct.images.find((i) => !isPlaceholderImageKey(i.storageKey));
      if (!sourceImage) {
        console.log(`  skip ${product.slug} — source has only a placeholder`);
        skipped++;
        return;
      }

      // headObject first for the content type: getObject returns bytes only, and
      // guessing the type from the key extension would be wrong for exactly the
      // images #364 describes (PNG bytes stored under a .webp key).
      const head = await sourceStorage.headObject(sourceImage.storageKey);
      const bytes = await sourceStorage.getObject(sourceImage.storageKey);
      if (!bytes) {
        console.log(`  skip ${product.slug} — source row points at a missing object`);
        skipped++;
        return;
      }

      // A NEW key, minted from the DESTINATION product's id. Reusing the
      // source's key is the defect this script exists to avoid.
      //
      // #364 — the key carries the copied bytes' real content type, so a PNG
      // copied across does not land under a `.webp` key at the destination.
      const copiedType = head?.contentType ?? "image/webp";
      const destKey = buildProductImageKey(product.id, copiedType);
      await destStorage.putObject(destKey, bytes, copiedType);

      // Reuses the repository function the AI pipeline already writes through,
      // so "claim primary, drop the placeholder it replaces" cannot drift
      // between the two paths.
      await saveGeneratedProductImage(
        destPrisma,
        product.vendorId,
        product.id,
        destKey,
        sourceImage.alt ?? product.name,
        sourceProduct.imageNeedsReview,
      );

      console.log(`  copied ${product.slug} -> ${destKey} (${bytes.byteLength} bytes)`);
      copied++;
    }

    console.log(`\ncopied ${copied}, skipped ${skipped}, failed ${failedCount}`);
    if (failedCount > 0) process.exitCode = 1;
  } finally {
    await sourcePrisma.$disconnect();
    await destPrisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
