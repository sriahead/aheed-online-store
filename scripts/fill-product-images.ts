/**
 * Fill real images for products that still have only a placeholder, a bounded
 * number at a time (#518, answering #504).
 *
 *   npx tsx scripts/fill-product-images.ts --env-file secrets/production.vars --limit 10
 *
 * WHY A SCRIPT AND NOT A CLOUDFLARE CRON TRIGGER
 *
 * `@opennextjs/cloudflare@1.20.2` generates a worker entrypoint that exports
 * `fetch` and nothing else — the string `scheduled` does not appear anywhere in
 * the package. Adding `[triggers] crons = [...]` to `wrangler.toml` would
 * register a trigger that fires into a Worker with no handler to receive it,
 * the same shape as the `proxy.ts` incompatibility recorded in `CLAUDE.md`.
 *
 * A Worker is not needed anyway: `lib/image-generation.ts` calls the Cloudflare
 * REST API (`/accounts/{id}/ai/run/@cf/black-forest-labs/flux-1-schnell`) with
 * an account id and API token, NOT a Workers AI binding. So the pipeline runs
 * in any environment holding those credentials, including a GitHub Actions
 * runner. `.github/workflows/fill-product-images.yml` is what schedules this.
 *
 * WHY IT BUILDS ITS OWN PRISMA CLIENT
 *
 * `lib/products-service.ts`'s wrappers resolve their own client through
 * `lib/db`, which imports `PrismaClient` from `@prisma/client/wasm` — mandatory
 * on Workers, and unloadable in Node (`Unknown file extension ".wasm"`). This
 * script therefore constructs a client from the bare `@prisma/client` specifier
 * exactly as `prisma/seed.ts` does, and passes it explicitly to the repository
 * functions, which take it as a parameter for precisely this reason.
 *
 * WHY THE LIMIT IS MANDATORY IN SPIRIT
 *
 * Every fill that falls through to AI generation is a paid Workers AI call. An
 * uncapped run against a catalogue holding thousands of generated products is
 * an unbounded spend on a schedule nobody is watching. The cap is small by
 * default and this script is sized for the ongoing trickle of newly added
 * products, not for draining a catalogue.
 */

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { MAX_IMAGE_ATTEMPT_FAILURES } from "@/lib/product-image";
import {
  countProductsWithExhaustedImageAttempts,
  getProductsWithoutImages,
  recordImageAttemptFailure,
  saveGeneratedProductImage,
} from "@/lib/repositories/products";

/** Small on purpose — see "WHY THE LIMIT IS MANDATORY IN SPIRIT" above. */
const DEFAULT_LIMIT = 10;

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

async function main() {
  const envPath = flagValue("--env-file");
  if (!envPath) {
    throw new Error(
      "usage: npx tsx scripts/fill-product-images.ts --env-file <path> [--limit N]\n" +
        "  e.g. --env-file secrets/production.vars --limit 10",
    );
  }

  const rawLimit = flagValue("--limit");
  const limit = rawLimit === undefined ? DEFAULT_LIMIT : Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(limit) || limit < 0) {
    throw new Error(`--limit must be a non-negative integer — got "${rawLimit}"`);
  }

  const vars = parseEnvFile(envPath);
  const directUrl = vars.DIRECT_URL ?? vars.DATABASE_URL;
  if (!directUrl) throw new Error(`${envPath} defines neither DIRECT_URL nor DATABASE_URL`);

  // Populated before importing the pipeline: lib/config's readEnv() falls back
  // to process.env outside a Worker context, and this is what points the
  // storage client and the Workers AI credentials at THIS environment.
  for (const [key, value] of Object.entries(vars)) process.env[key] = value;

  console.log(`env file: ${envPath}`);
  console.log(`database: ${hostOf(directUrl)}`);
  console.log(`bucket:   ${vars.S3_BUCKET ?? "(unset)"}`);
  console.log(`limit:    ${limit}`);
  console.log("");

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: directUrl }) });

  let filled = 0;
  let failed = 0;

  try {
    const vendors = await prisma.vendor.findMany({ select: { id: true, slug: true } });

    // The cap is across the whole run, not per vendor, so a second vendor can
    // never multiply the spend a single scheduled run was authorised for.
    let remaining = limit;

    // Imported here rather than at module scope so process.env is already
    // populated when lib/config reads it.
    const { runProductImagePipeline } = await import("@/lib/product-image-pipeline");

    // Deliberately AFTER the client, the query and the pipeline import, not
    // before them. `--limit 0` is the smoke test this script is verified with
    // (#518 R12): its job is to prove the whole module graph loads in real Node
    // and the database is reachable, WITHOUT spending anything on generation.
    // Returning early — the obvious way to write this — would exercise none of
    // that and would pass just as happily if `lib/db`'s WASM query compiler had
    // been pulled in by accident, which is the exact failure this guards.
    if (limit === 0) {
      console.log(
        `loaded pipeline and reached ${vendors.length} vendor(s); limit is 0, filling none`,
      );
      return;
    }

    for (const vendor of vendors) {
      if (remaining === 0) break;

      const products = await getProductsWithoutImages(prisma, vendor.id, remaining);
      if (products.length === 0) continue;

      console.log(`vendor ${vendor.slug}: ${products.length} product(s) to fill`);

      for (const product of products) {
        if (remaining === 0) break;
        try {
          const result = await runProductImagePipeline(product.id, product.name, null);
          if (!result) {
            // No source found and nothing generated. Counts as an attempt —
            // otherwise this product is re-selected forever (#523).
            await recordImageAttemptFailure(prisma, vendor.id, product.id);
            console.log(`  no image source for ${product.name}`);
            failed++;
            remaining--;
            continue;
          }
          await saveGeneratedProductImage(
            prisma,
            vendor.id,
            product.id,
            result.imageKey,
            product.name,
            result.needsReview,
          );
          console.log(`  filled ${product.name} -> ${result.imageKey}`);
          filled++;
        } catch (err) {
          // One product failing must not abandon the rest of the run: a
          // scheduled job that stops at the first bad row silently stops
          // making progress forever.
          console.error(`  FAILED ${product.name}:`, err instanceof Error ? err.message : err);
          // #523 — record it, so a product the pipeline can NEVER fill (Workers AI
          // refuses some halal meat names as NSFW) eventually stops being selected
          // instead of consuming a slot on every scheduled run.
          try {
            await recordImageAttemptFailure(prisma, vendor.id, product.id);
          } catch (recordErr) {
            console.error(
              `    could not record the failure for ${product.name}:`,
              recordErr instanceof Error ? recordErr.message : recordErr,
            );
          }
          failed++;
        }
        remaining--;
      }
    }

    // #523 — say what is being skipped. A give-up rule that silently shrinks the
    // work list is the same class of problem it was built to fix: the run would
    // report "nothing to do" while products sat permanently unfilled and nothing
    // pointed at them.
    let exhausted = 0;
    for (const vendor of vendors) {
      exhausted += await countProductsWithExhaustedImageAttempts(prisma, vendor.id);
    }
    const skipNote =
      exhausted > 0
        ? `, ${exhausted} skipped after ${MAX_IMAGE_ATTEMPT_FAILURES} failed attempts (see #523)`
        : "";
    console.log(`\nfilled ${filled}, failed ${failed}${skipNote}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
