import type { AiBudgetCheck } from "@/lib/ai-budget-message";
import type { AiMeter } from "@/lib/ai-meter";
import { getImageGenerationService, IMAGE_GENERATION_MODEL } from "@/lib/image-generation";
import { getStorage } from "@/lib/storage";

/**
 * #1535 — generate one image and store it under a key the CALLER built from data it loaded after
 * its role check, never from request input. Shared by the bundle photo routes and the promotion
 * banner route; the department campaign route predates it and keeps its own inline copy.
 *
 * Order matters: the budget is checked before the paid call, and the image is recorded against the
 * meter as soon as it exists, so a storage failure afterwards cannot hide spend.
 */
export type GeneratedImage =
  | { ok: true; imageKey: string }
  | { ok: false; budgetRefused: AiBudgetCheck }
  | { ok: false; unavailable: true };

export const AI_UNAVAILABLE_MESSAGE = "AI image generation is not configured for this environment.";

export async function generateAndStoreImage(
  prompt: string,
  imageKey: string,
  aiMeter: AiMeter,
): Promise<GeneratedImage> {
  const budget = await aiMeter.check();
  if (!budget.allowed) return { ok: false, budgetRefused: budget };

  const bytes = await getImageGenerationService().generateImage(prompt);
  // null = the service is not configured here; it degrades rather than throwing.
  if (!bytes) return { ok: false, unavailable: true };
  await aiMeter.recordImage({ model: IMAGE_GENERATION_MODEL });

  // Workers AI returns PNG, and the key's extension says so (#364).
  await getStorage().putObject(imageKey, bytes, "image/png");
  return { ok: true, imageKey };
}
