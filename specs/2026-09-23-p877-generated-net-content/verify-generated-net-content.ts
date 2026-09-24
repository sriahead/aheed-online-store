import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { deriveUnitPricePenceForSort, isNetContentUnit } from "@/components/product/unit-price";
import { GENERATED_SLUG_PREFIX } from "../../prisma/generate-catalogue";

/**
 * Live verification for #877 — requirements.md R8 (and R9, which runs it after a seed).
 *
 * READ-ONLY. It never writes, so it needs no destructive-target guard; it prints the database HOST
 * first so the operator can confirm it is dev before trusting any number below it.
 *
 * For each vendor it reports:
 *   (a) generated (`gen-`) rows, and how many carry net content;
 *   (b) rows where exactly one of the two net content fields is set;
 *   (c) generated rows with net content whose `unitPricePencePerBaseUnit` differs from
 *       `deriveUnitPricePenceForSort` of that row's own price and net content;
 *   (d) non-generated rows with net content (#877 must not have touched them).
 *
 * Exits non-zero if (b), (c) or (d) is non-zero for any vendor, or if a vendor has generated rows
 * and none of them carry net content.
 *
 *   npx tsx specs/2026-09-23-p877-generated-net-content/verify-generated-net-content.ts
 *   npx tsx specs/2026-09-23-p877-generated-net-content/verify-generated-net-content.ts --env-file .env
 *
 * `--env-file` defaults to `.env`, the file `npm run db:seed` reads. Uses `DIRECT_URL`, falling back
 * to `DATABASE_URL`, exactly as `prisma/seed.ts` does, so it reads the database the seed wrote.
 */

const envFlag = process.argv.indexOf("--env-file");
const envFile = envFlag >= 0 ? process.argv[envFlag + 1] : ".env";
if (!envFile) throw new Error("--env-file needs a path");
config({ path: envFile, override: true, quiet: true });

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error(`DIRECT_URL/DATABASE_URL is empty after loading ${envFile}`);

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

async function main() {
  console.log(`env file: ${envFile}`);
  console.log(`database host: ${new URL(connectionString as string).host}\n`);

  const vendors = await prisma.vendor.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  let failed = false;

  for (const { id: vendorId } of vendors) {
    const products = await prisma.product.findMany({
      where: { vendorId },
      select: {
        slug: true,
        basePrice: true,
        netContentAmount: true,
        netContentUnit: true,
        unitPricePencePerBaseUnit: true,
      },
    });

    const generated = products.filter((p) => p.slug.startsWith(GENERATED_SLUG_PREFIX));
    const withNetContent = (p: (typeof products)[number]) =>
      p.netContentAmount !== null && p.netContentUnit !== null;

    const generatedWithNetContent = generated.filter(withNetContent);
    const halfSet = products.filter(
      (p) => (p.netContentAmount === null) !== (p.netContentUnit === null),
    ).length;
    const sortKeyMismatch = generatedWithNetContent.filter((p) => {
      const unit = p.netContentUnit as string;
      const expected = isNetContentUnit(unit)
        ? deriveUnitPricePenceForSort(p.basePrice, {
            amount: p.netContentAmount as number,
            unit,
          })
        : null;
      return p.unitPricePencePerBaseUnit !== expected;
    }).length;
    const curatedWithNetContent = products.filter(
      (p) => !p.slug.startsWith(GENERATED_SLUG_PREFIX) && withNetContent(p),
    ).length;

    const share =
      generated.length > 0
        ? ` (${((100 * generatedWithNetContent.length) / generated.length).toFixed(1)}%)`
        : "";
    console.log(`vendor ${vendorId}`);
    console.log(
      `  (a) generated rows: ${generated.length}, with net content: ${generatedWithNetContent.length}${share}`,
    );
    console.log(`  (b) rows with exactly one net content field set: ${halfSet}`);
    console.log(
      `  (c) generated rows whose sort key disagrees with its derivation: ${sortKeyMismatch}`,
    );
    console.log(`  (d) non-generated rows with net content: ${curatedWithNetContent}`);

    const noCoverage = generated.length > 0 && generatedWithNetContent.length === 0;
    if (noCoverage) console.log("  FAIL  generated rows exist but none carry net content");
    if (halfSet > 0 || sortKeyMismatch > 0 || curatedWithNetContent > 0 || noCoverage) {
      console.log("  FAIL");
      failed = true;
    } else {
      console.log("  PASS");
    }
  }

  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
