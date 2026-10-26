import { getImageGenerationService, IMAGE_GENERATION_MODEL } from "./image-generation";
import type { AiMeter } from "./ai-meter";
import type { AiBudgetCheck } from "./ai-budget-message";
import { getStorage } from "./storage";
import {
  buildCategoryImageKey,
  buildCategoryImagePrompt,
  type CategoryImageStyle,
} from "./category-image";
import { getCategoryForAdmin, updateCategoryForVendor } from "./categories-service";

export interface CategoryPipelineResult {
  imageKey: string;
  imageUrl: string;
}

export interface CategoryPipelineBudgetRefused {
  budgetRefused: AiBudgetCheck;
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

  const prompt = buildCategoryImagePrompt(category.name, style);
  const aiSvc = getImageGenerationService();
  const imageBuffer = await aiSvc.generateImage(prompt);
  if (!imageBuffer) return null;

  await options.aiMeter.recordImage({ model: IMAGE_GENERATION_MODEL });

  const storage = getStorage();
  const imageKey = buildCategoryImageKey(vendorId, category.slug, "image/png");
  await storage.putObject(imageKey, imageBuffer, "image/png");

  await updateCategoryForVendor(vendorId, categoryId, {
    name: category.name,
    slug: category.slug,
    parentId: category.parentId,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    imageKey,
    allowsCustomNote: category.allowsCustomNote,
  });

  return {
    imageKey,
    imageUrl: storage.publicUrl(imageKey),
  };
}
