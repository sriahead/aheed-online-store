import { getImageGenerationService, IMAGE_GENERATION_MODEL } from "./image-generation";
import type { AiMeter } from "./ai-meter";
import type { AiBudgetCheck } from "./ai-budget-message";
import { getStorage } from "./storage";
import {
  buildBrandLogoKey,
  buildBrandLogoPrompt,
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

export async function runBrandLogoPipeline(
  brandId: string,
  style: CategoryImageStyle,
  vendorId: string,
  options: { aiMeter: AiMeter },
): Promise<CategoryPipelineResult | CategoryPipelineBudgetRefused | null> {
  const prismaWs = getPrismaWs();
  const brand = await prismaWs.brand.findFirst({
    where: { id: brandId, vendorId },
  });
  if (!brand) return null;

  const budgetCheck = await options.aiMeter.check();
  if (!budgetCheck.allowed) {
    return { budgetRefused: budgetCheck };
  }

  const prompt = buildBrandLogoPrompt(brand.name, style, await vendorPromptPalette(vendorId));
  const aiSvc = getImageGenerationService();
  const imageBuffer = await aiSvc.generateImage(prompt);
  if (!imageBuffer) return null;

  await options.aiMeter.recordImage({ model: IMAGE_GENERATION_MODEL });

  const storage = getStorage();
  const imageKey = buildBrandLogoKey(vendorId, brand.slug, "image/png");
  await storage.putObject(imageKey, imageBuffer, "image/png");

  const brandSlot = `brand:${brand.slug}`;
  const asset = await createCategoryAsset(prismaWs, vendorId, {
    slot: brandSlot,
    storageKey: imageKey,
    style,
    isSelected: true,
  });

  await prismaWs.brand.update({
    where: { id: brand.id },
    data: { imageKey },
  });

  return {
    imageKey,
    imageUrl: storage.publicUrl(imageKey),
    asset,
  };
}

export interface BrandLogoIngestResult {
  ok: true;
  imageKey: string;
  imageUrl: string;
  asset: CategoryAssetSummary;
}

export async function ingestBrandLogo(
  brandId: string,
  vendorId: string,
  buffer: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<BrandLogoIngestResult | { error: string }> {
  const prismaWs = getPrismaWs();
  const brand = await prismaWs.brand.findFirst({
    where: { id: brandId, vendorId },
  });
  if (!brand) return { error: "Brand not found" };

  const cleanContentType = contentType.split(";")[0].trim().toLowerCase();
  const allowedTypes = new Set([
    "image/png",
    "image/webp",
    "image/jpeg",
    "image/jpg",
    "image/svg+xml",
    "image/avif",
  ]);
  if (!allowedTypes.has(cleanContentType)) {
    return {
      error: `Unsupported image type: ${cleanContentType}. Please upload PNG, WebP, SVG, or JPEG.`,
    };
  }

  const storage = getStorage();
  const imageKey = buildBrandLogoKey(vendorId, brand.slug, cleanContentType);
  await storage.putObject(imageKey, buffer, cleanContentType);

  const brandSlot = `brand:${brand.slug}`;
  const asset = await createCategoryAsset(prismaWs, vendorId, {
    slot: brandSlot,
    storageKey: imageKey,
    style: "photo",
    isSelected: true,
  });

  return {
    ok: true,
    imageKey,
    imageUrl: storage.publicUrl(imageKey),
    asset,
  };
}

export async function ingestBrandLogoFromUrl(
  brandId: string,
  vendorId: string,
  urlStr: string,
): Promise<BrandLogoIngestResult | { error: string }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlStr);
  } catch {
    return { error: "Invalid URL provided." };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return { error: "URL must use HTTP or HTTPS protocol." };
  }

  // SSRF protection: reject private/loopback hostnames
  const hostname = parsedUrl.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("169.254.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
  ) {
    return { error: "Cannot import images from internal or loopback addresses." };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "AheedOnlineStore/1.0 (Brand Logo Importer)",
        Accept: "image/png,image/webp,image/jpeg,image/svg+xml,*/*",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { error: `Failed to fetch image from URL: HTTP ${res.status} ${res.statusText}` };
    }

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const allowedTypes = new Set([
      "image/png",
      "image/webp",
      "image/jpeg",
      "image/jpg",
      "image/svg+xml",
      "image/avif",
    ]);

    let resolvedType = contentType;
    if (!allowedTypes.has(resolvedType)) {
      const pathLower = parsedUrl.pathname.toLowerCase();
      if (pathLower.endsWith(".png")) resolvedType = "image/png";
      else if (pathLower.endsWith(".webp")) resolvedType = "image/webp";
      else if (pathLower.endsWith(".jpg") || pathLower.endsWith(".jpeg"))
        resolvedType = "image/jpeg";
      else if (pathLower.endsWith(".svg")) resolvedType = "image/svg+xml";
      else {
        return {
          error: `URL returned content-type "${contentType}", which is not a supported image format.`,
        };
      }
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > 5 * 1024 * 1024) {
      return { error: "Image file exceeds the 5MB size limit." };
    }
    if (arrayBuffer.byteLength === 0) {
      return { error: "Image file is empty." };
    }

    return ingestBrandLogo(brandId, vendorId, arrayBuffer, resolvedType);
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { error: "Image download timed out after 10 seconds." };
    }
    return { error: err instanceof Error ? err.message : "Failed to download image from URL." };
  }
}
