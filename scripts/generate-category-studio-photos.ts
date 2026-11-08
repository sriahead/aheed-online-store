import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { parseEnvFile } from "./lib/env-file";
import { getImageGenerationService, IMAGE_GENERATION_MODEL } from "../lib/image-generation";
import { getStorage } from "../lib/storage";
import { buildCategoryImageKey, CIRCULAR_FRAMING_CLAUSE } from "../lib/category-image";
import { createCategoryAsset } from "../lib/repositories/category-assets";

/**
 * Curated generic visual descriptions for studio grocery photography.
 * Explicitly forbids brand logos, trademarks, and text, ensuring clean generic studio presentation.
 */
const CATEGORY_STUDIO_DESCRIPTIONS: Record<string, string> = {
  "soft-drinks": "Chilled refreshing fruit sodas, sparkling water, and iced drinks in clear unbranded glassware with ice cubes, citrus slices, and condensation, appetizing commercial beverage photography",
  "confectionery": "Assortment of artisan gourmet chocolate truffles, wrapped sweets, and colorful candies artfully arranged, glossy commercial studio confectionery photography",
  "crisps-snacks": "An appetizing ceramic bowl filled with golden crispy potato crisps, salted pretzels, and roasted nuts, sharp focus commercial snack photography",
  "chilled-foods": "Fresh chilled deli selection of artisan cheeses, creamy yogurt pots, and fresh dips, appetizing supermarket deli photography",
  "cakes": "Delicious freshly baked vanilla and chocolate sponge cakes with delicate cream frosting and berries, bakery studio photography",
  "food-to-go": "Fresh artisanal supermarket deli lunch meal box with a roll and fresh salad pot, clean commercial food photography",
  "ice-cream": "Artisanal scoops of vanilla, strawberry, and chocolate ice cream in a chilled glass sundae bowl with crisp wafer biscuits, premium dessert photography",
  "household-sundries": "Neatly arranged eco-friendly household cleaning essentials, sponges, wooden brush, and spray bottle, clean bright retail photography",
  "flowers-plants": "A vibrant fresh floral bouquet of seasonal blooms and a neat green potted plant, bright commercial studio photography",
  "default": "An abundant arrangement of pantry grocery essentials including grains, pasta, olive oil bottle, and aromatic spices in glass jars, authentic grocery photography",
  "misc": "Assortment of everyday essential grocery goods and fresh pantry staples neatly presented on a countertop, clean retail grocery photography",
  "non-food": "Modern minimalist home goods, kitchen utensils, and household utility items arranged neatly, high quality studio photography",
  "seasonal": "Festive seasonal gourmet treats, ribbon-tied gift basket, and celebratory confections, warm commercial holiday photography",
  "greeting-cards": "Elegant stationery greeting cards in envelopes with a fountain pen, stylish clean studio paper photography",
  "stationary": "Crisp notebook journal, stylish pens, and neat desk stationery arranged in an orderly flatlay, clean bright studio photography",
  "tobacco": "Cured golden whole tobacco leaves, vintage wooden pipe, and matches arranged artistically, warm classic studio still-life photography",
  "alcohol": "Unbranded dark glass wine bottle beside an elegant wine goblet with red wine and fresh dark grapes, sophisticated studio still life",
  "news": "A neatly folded morning newspaper and a glossy lifestyle magazine beside a cup of black coffee, clean commercial still life",
  "stamps": "Classic philatelic postage stamps and vintage postal envelopes neatly displayed, sharp macro studio photography",
  "phone-cards": "Modern digital mobile top-up card and microchip SIM card graphic concept, sleek clean studio presentation",
  "e-pay": "Sleek modern contactless payment card and portable payment terminal concept, clean fintech retail photography",
  "instant-lottery": "Colorful lottery scratch tickets and sparkling golden lucky tokens, sharp macro commercial photography",
  "cdtapesvideo": "Classic compact discs in clear jewel cases and retro studio audio headphones, clean product photography",
};

async function main() {
  const envPath = "secrets/merqify-production.vars";
  const vars = parseEnvFile(envPath);
  for (const [k, v] of Object.entries(vars)) {
    process.env[k] = v;
  }

  const directUrl = vars.DIRECT_URL;
  if (!directUrl) throw new Error("Missing DIRECT_URL in merqify-production.vars");

  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: directUrl }) });
  const vendorId = "a4ed0000-0000-4000-a000-000000000001";

  const categories = await prisma.category.findMany({
    where: { vendorId, imageKey: null },
    select: { id: true, name: true, slug: true },
    orderBy: { sortOrder: "asc" },
  });

  console.log(`Found ${categories.length} categories missing images in production.`);
  if (categories.length === 0) {
    console.log("Nothing to do.");
    await prisma.$disconnect();
    return;
  }

  const aiSvc = getImageGenerationService();
  const storage = getStorage();

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const subject = CATEGORY_STUDIO_DESCRIPTIONS[cat.slug] || 
      `Appetizing commercial studio grocery photography of ${cat.name.toLowerCase()}, genuine retail product presentation`;

    const prompt = 
      `Commercial studio grocery photography of ${subject}. ` +
      `Realistic retail presentation, authentic textures, soft studio softbox lighting, genuine product photography, high resolution, sharp focus. ` +
      `No brand logos, no copyrighted trademarks, no commercial brand names, no text, no watermark. ` +
      `${CIRCULAR_FRAMING_CLAUSE}`;

    console.log(`[${i + 1}/${categories.length}] Generating for "${cat.name}" (${cat.slug})...`);

    try {
      const buffer = await aiSvc.generateImage(prompt);
      if (!buffer) {
        console.warn(`  Failed: AI service returned null for ${cat.slug}`);
        failed++;
        continue;
      }

      const storageKey = buildCategoryImageKey(vendorId, cat.slug, "image/png");
      await storage.putObject(storageKey, buffer, "image/png");

      await createCategoryAsset(prisma as any, vendorId, {
        categoryId: cat.id,
        storageKey,
        style: "photo",
        isSelected: true,
      });

      console.log(`  ✓ Saved & assigned: ${storageKey}`);
      succeeded++;
    } catch (err) {
      console.error(`  ✗ Error generating for ${cat.slug}:`, err);
      failed++;
    }
  }

  console.log(`\nFinished: ${succeeded} succeeded, ${failed} failed.`);
  await prisma.$disconnect();
}

main().catch(console.error);
