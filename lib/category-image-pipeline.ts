import { getImageGenerationService, IMAGE_GENERATION_MODEL } from "./image-generation";
import type { AiMeter } from "./ai-meter";
import type { AiBudgetCheck } from "./ai-budget-message";
import { getStorage } from "./storage";
import {
  buildCategoryImageKey,
  buildCategoryImagePrompt,
  buildSlotAssetKey,
  buildSlotAssetPrompt,
  type CategoryImageStyle,
  type PromptPalette,
} from "./category-image";
import { fetchVendorProfile } from "./vendor-service";
import { getCategoryForAdmin } from "./categories-service";
import { getPrismaWs } from "./db";
import { createCategoryAsset, type CategoryAssetSummary } from "./repositories/category-assets";

export interface CategoryPipelineResult {
  imageKey: string;
  imageUrl: string;
  asset?: CategoryAssetSummary;
}

export interface CategoryPipelineBudgetRefused {
  budgetRefused: AiBudgetCheck;
}

/**
 * The vendor's own colours for the prompt (#1288 R23): `green` is the brand primary, `orange` the
 * accent — the same primitives `brandStyle()` themes the storefront with.
 */
async function vendorPromptPalette(vendorId: string): Promise<PromptPalette> {
  const { primitives } = await fetchVendorProfile(vendorId);
  return { primary: primitives.green, accent: primitives.orange };
}

export async function runCategoryImagePipeline(
  categoryId: string,
  style: CategoryImageStyle,
  vendorId: string,
  options: { aiMeter: AiMeter },
): Promise<CategoryPipelineResult | CategoryPipelineBudgetRefused | null> {
  const category = await getCategoryForAdmin(vendorId, categoryId);
  if (!category) return null;

  const budgetCheck = await options.aiMeter.check();
  if (!budgetCheck.allowed) {
    return { budgetRefused: budgetCheck };
  }

  const prompt = buildCategoryImagePrompt(
    category.name,
    style,
    await vendorPromptPalette(vendorId),
  );
  const aiSvc = getImageGenerationService();
  const imageBuffer = await aiSvc.generateImage(prompt);
  if (!imageBuffer) return null;

  await options.aiMeter.recordImage({ model: IMAGE_GENERATION_MODEL });

  const storage = getStorage();
  const imageKey = buildCategoryImageKey(vendorId, category.slug, "image/png");
  await storage.putObject(imageKey, imageBuffer, "image/png");

  const prismaWs = getPrismaWs();
  const asset = await createCategoryAsset(prismaWs, vendorId, {
    categoryId,
    storageKey: imageKey,
    style,
    isSelected: true,
  });

  return {
    imageKey,
    imageUrl: storage.publicUrl(imageKey),
    asset,
  };
}

export async function runSlotAssetPipeline(
  slot: string,
  style: CategoryImageStyle,
  vendorId: string,
  options: { aiMeter: AiMeter },
): Promise<CategoryPipelineResult | CategoryPipelineBudgetRefused | null> {
  const budgetCheck = await options.aiMeter.check();
  if (!budgetCheck.allowed) {
    return { budgetRefused: budgetCheck };
  }

  const prompt = buildSlotAssetPrompt(slot, style, await vendorPromptPalette(vendorId));
  const aiSvc = getImageGenerationService();
  const imageBuffer = await aiSvc.generateImage(prompt);
  if (!imageBuffer) return null;

  await options.aiMeter.recordImage({ model: IMAGE_GENERATION_MODEL });

  const storage = getStorage();
  const imageKey = buildSlotAssetKey(vendorId, slot, "image/png");
  await storage.putObject(imageKey, imageBuffer, "image/png");

  const prismaWs = getPrismaWs();
  const asset = await createCategoryAsset(prismaWs, vendorId, {
    slot,
    storageKey: imageKey,
    style,
    isSelected: true,
  });

  return {
    imageKey,
    imageUrl: storage.publicUrl(imageKey),
    asset,
  };
}
