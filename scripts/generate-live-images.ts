import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { saveGeneratedProductImage, recordImageAttemptFailure } from "@/lib/repositories/products";
import { setBundleImage } from "@/lib/repositories/bundles";
import { PLACEHOLDER_IMAGE_SUFFIX } from "@/lib/product-image";
import { parseEnvFile } from "./lib/env-file";

/**
 * #1521 — generate images for a cell's LIVE offer items: active products with no real image,
 * active bundles with no image, and active promotion banners with no image.
 *
 *   npx tsx scripts/generate-live-images.ts --env-file <secrets file> --vendor-slug <slug> [--limit N]
 *   … --apply [--production]
 *
 * The owner chose generated images for these (2026-11-11). Products go through the existing
 * `runProductImagePipeline` with Open Food Facts OFF — a name search for fresh meat or fish returns
 * unrelated branded packs — and every image is flagged "Image needs review" as that pipeline always
 * does. Bundles and banners use the same Workers AI model with prompts that ask for no text (a model
 * draws letters badly). Every call is charged to the vendor's daily AI budget (#1017); a refusal
 * stops the run, nothing is written off. `--limit` caps the images in one run (default 40).
 *
 * WHAT THE FIRST RUN SHOWED (staging, 2026-11-11) — read before relying on this for go-live:
 *   - Every image must be LOOKED AT. "Baby Chicken" produced a live chick, "Medium Chicken" bundles
 *     and the whole-chicken banner produced live birds, "Turkey Box" produced whole chickens. They
 *     were removed; a butcher's listing cannot show a live animal.
 *   - The model draws garbled text onto anything packaged or "advertising"-like, whatever "no text"
 *     says. Prompts therefore name only the food, surface and light (see `bundlePrompt`).
 *   - It refuses some cut names as NSFW ("Chicken Breast", "Chicken Thigh") even reworded.
 *   - 33 images used the store's whole daily AI allowance (3,000 neurons).
 *   Real photographs of the actual stock are the better source; this script is a stop-gap.
 *
 * The env file supplies the database (`DIRECT_URL`, or a dedicated cell's `AFC_DIRECT_URL`), the
 * bucket (`S3_*`, `CDN_BASE_URL`) and the Workers AI credentials. Dry run by default; a production
 * env file also needs `--production`.
 */

/**
 * PLAIN PHOTOGRAPH DESCRIPTIONS ONLY. The first run (2026-11-11) used "advertising", "promotional
 * banner" and a headline in the prompt, and the model drew garbled text into those images whatever
 * "no text" said ("Wolle Chicken", "Greve Chicken"). It ignores negatives; it follows nouns. So a
 * prompt names only the food, the surface and the light — never a headline, price or marketing word.
 */
export function bundlePrompt(itemNames: readonly string[]): string {
  return `A photograph of ${itemNames.join(", ")} together on a clean white kitchen counter, natural daylight, shallow depth of field.`;
}

/** "Turkey Box Offers" → "frozen turkey in cardboard boxes": a headline's food words, marketing dropped. */
export function subjectFromHeadline(headline: string): string {
  const food = headline
    .replace(/\b(offers?|multi-buy|deals?|bulk|sale|save|special|best value)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return /\bbox(es)?\b/i.test(food)
    ? `frozen ${food
        .replace(/\bbox(es)?\b/gi, "")
        .trim()
        .toLowerCase()} in cardboard boxes`
    : food.toLowerCase();
}

/** A banner is pictured from what it sells: its bundle's products, else its headline's food words. */
export function promotionPrompt(subjects: readonly string[]): string {
  return `A wide photograph of ${subjects.join(", ")} on a rustic wooden table, warm natural light, plenty of empty background on the left side.`;
}

/**
 * Workers AI refuses some butchery words as "NSFW" (seen 2026-11-11 on "Chicken Breast"; #523 saw
 * the same on halal meat names). Only the PROMPT is reworded — the product keeps its real name.
 */
export function safeForImageModel(text: string): string {
  // Whole phrases first: "chicken fillet" and "chicken drumsticks" were still refused on their own.
  return text
    .replace(/\bchicken\s+breasts?\b/gi, "poultry fillets on a butcher's tray")
    .replace(/\bchicken\s+thighs?(\s+boneless)?\b/gi, "boneless poultry pieces on a butcher's tray")
    .replace(/\bchicken\s+drumsticks?\b/gi, "poultry drumsticks on a butcher's tray")
    .replace(/\bbreasts?\b/gi, "fillet")
    .replace(/\bthighs?\b/gi, "leg meat")
    .replace(/\bniblets?\b/gi, "bite-size pieces");
}

export function productPromptName(name: string): string {
  // "Medium Chicken (1100–1200g)" → "Medium Chicken": sizes and pack notes confuse the model.
  return safeForImageModel(
    name
      .replace(/\([^)]*\)/g, "")
      .replace(/\s[–-]\s.*$/, "")
      .trim(),
  );
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const envPath = flag("--env-file");
  const vendorSlug = flag("--vendor-slug");
  const apply = process.argv.includes("--apply");
  const production = process.argv.includes("--production");
  const limit = Number.parseInt(flag("--limit") ?? "40", 10);
  if (!envPath || !vendorSlug || !Number.isFinite(limit) || limit < 0) {
    throw new Error("usage: see the header of scripts/generate-live-images.ts");
  }
  if (apply && /production/i.test(envPath) && !production) {
    throw new Error("REFUSED: a production env file also needs --production (staging first)");
  }
  const vars = parseEnvFile(envPath);
  const directUrl = vars.DIRECT_URL ?? vars.AFC_DIRECT_URL;
  if (!directUrl) throw new Error(`${envPath} defines neither DIRECT_URL nor AFC_DIRECT_URL`);
  // Before importing the pipeline: lib/config falls back to process.env outside a Worker.
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
  process.env.DIRECT_URL = directUrl;
  process.env.DATABASE_URL = vars.DATABASE_URL ?? vars.AFC_DATABASE_URL ?? directUrl;
  console.log(`database: ${new URL(directUrl).hostname}`);
  console.log(`bucket:   ${vars.S3_BUCKET ?? "(unset)"}  cdn: ${vars.CDN_BASE_URL ?? "(unset)"}`);
  console.log(apply ? `MODE: APPLY (limit ${limit})` : "MODE: dry run (generates nothing)");

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: directUrl }) });
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { slug: vendorSlug },
      select: { id: true },
    });
    if (!vendor) throw new Error(`no vendor with slug ${vendorSlug}`);
    const vendorId = vendor.id;
    const products = await prisma.product.findMany({
      where: {
        vendorId,
        isActive: true,
        images: { every: { storageKey: { endsWith: PLACEHOLDER_IMAGE_SUFFIX } } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const bundles = await prisma.bundle.findMany({
      where: { vendorId, isActive: true, imageKey: null },
      select: {
        id: true,
        name: true,
        items: { orderBy: { sortOrder: "asc" }, select: { product: { select: { name: true } } } },
      },
    });
    const promotions = await prisma.promotion.findMany({
      where: { vendorId, isActive: true, imageKey: null },
      select: {
        id: true,
        headline: true,
        category: { select: { name: true } },
        bundle: { select: { items: { select: { product: { select: { name: true } } } } } },
      },
    });
    console.log(
      `\nto generate: ${products.length} product(s), ${bundles.length} bundle(s), ${promotions.length} promotion(s)`,
    );
    for (const x of products) console.log(`  product   ${x.name}`);
    for (const b of bundles) console.log(`  bundle    ${b.name}`);
    for (const pr of promotions) console.log(`  promotion ${pr.headline}`);
    if (!apply) {
      console.log("\ndry run only. To generate: --apply");
      return;
    }

    const { runProductImagePipeline } = await import("@/lib/product-image-pipeline");
    const { getImageGenerationService, IMAGE_GENERATION_MODEL } =
      await import("@/lib/image-generation");
    const { getStorage } = await import("@/lib/storage");
    const { createAiMeter, describeAiBudgetRefusal } = await import("@/lib/ai-meter");
    const { getAiEnv } = await import("@/lib/config");
    const plan = getAiEnv().WORKERS_AI_PLAN;
    const ai = getImageGenerationService();
    const storage = getStorage();
    let remaining = limit;
    let made = 0;

    const productMeter = createAiMeter(prisma, vendorId, "PRODUCT_IMAGE", plan);
    for (const x of products) {
      if (remaining-- <= 0) break;
      // One refused or failed item must not end the run (same rule as fill-product-images.ts):
      // generateImage THROWS on a model refusal rather than returning null.
      let r: Awaited<ReturnType<typeof runProductImagePipeline>>;
      try {
        r = await runProductImagePipeline(x.id, productPromptName(x.name), null, {
          aiMeter: productMeter,
          useOpenFoodFacts: false,
        });
      } catch (err) {
        await recordImageAttemptFailure(prisma, vendorId, x.id);
        console.log(
          `  FAILED ${x.name} [prompt name "${productPromptName(x.name)}"]: ${err instanceof Error ? err.message.slice(0, 90) : err}`,
        );
        continue;
      }
      if (r && "budgetRefused" in r) {
        console.log(`  STOP: ${describeAiBudgetRefusal(r.budgetRefused)}`);
        return;
      }
      if (!r) {
        await recordImageAttemptFailure(prisma, vendorId, x.id);
        console.log(`  no image for ${x.name} (the model may have refused the prompt)`);
        continue;
      }
      await saveGeneratedProductImage(
        prisma,
        vendorId,
        x.id,
        r.imageKey,
        x.name,
        r.needsReview,
        r.source,
      );
      console.log(`  product   ${x.name} -> ${r.imageKey}`);
      made++;
    }

    const campaignMeter = createAiMeter(prisma, vendorId, "CAMPAIGN_IMAGE", plan);
    const generate = async (prompt: string): Promise<ArrayBuffer | null | "refused"> => {
      const budget = await campaignMeter.check();
      if (!budget.allowed) {
        console.log(`  STOP: ${describeAiBudgetRefusal(budget)}`);
        return "refused";
      }
      try {
        const bytes = await ai.generateImage(prompt);
        if (bytes) await campaignMeter.recordImage({ model: IMAGE_GENERATION_MODEL });
        return bytes;
      } catch (err) {
        console.log(
          `  FAILED [${prompt.slice(0, 70)}…]: ${err instanceof Error ? err.message.slice(0, 90) : err}`,
        );
        return null;
      }
    };
    for (const b of bundles) {
      if (remaining-- <= 0) break;
      const bytes = await generate(
        bundlePrompt([...new Set(b.items.map((i) => productPromptName(i.product.name)))]),
      );
      if (bytes === "refused") return;
      if (!bytes) {
        console.log(`  no image for bundle ${b.name}`);
        continue;
      }
      const key = `bundles/${b.id}/${crypto.randomUUID()}.png`;
      await storage.putObject(key, bytes, "image/png");
      const res = await setBundleImage(prisma, vendorId, b.id, key, b.name);
      if (!res.ok) throw new Error(res.error);
      console.log(`  bundle    ${b.name} -> ${key}`);
      made++;
    }
    for (const pr of promotions) {
      if (remaining-- <= 0) break;
      const subjects = pr.bundle?.items.length
        ? [...new Set(pr.bundle.items.map((i) => productPromptName(i.product.name)))]
        : [safeForImageModel(subjectFromHeadline(pr.headline))];
      const bytes = await generate(promotionPrompt(subjects));
      if (bytes === "refused") return;
      if (!bytes) {
        console.log(`  no image for promotion ${pr.headline}`);
        continue;
      }
      const key = `promotions/${vendorId}/${crypto.randomUUID()}.png`;
      await storage.putObject(key, bytes, "image/png");
      await prisma.promotion.updateMany({
        where: { id: pr.id, vendorId },
        data: { imageKey: key, altText: pr.headline },
      });
      console.log(`  promotion ${pr.headline} -> ${key}`);
      made++;
    }
    console.log(`\nAPPLIED: ${made} image(s) generated and stored`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("generate-live-images.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
