import { getAiEnv } from "@/lib/config";
import { getImageGenerationService, IMAGE_GENERATION_MODEL } from "@/lib/image-generation";
import { getStorage } from "@/lib/storage";
import { composePublicUrl } from "@/lib/storage";
import { getEnv } from "@/lib/config";
import {
  extractWorkersAiReplyText,
  extractWorkersAiUsage,
  WORKERS_AI_MODEL_REQUEST_OPTIONS,
  type WorkersAiUsage,
} from "@/lib/workers-ai";
import type { AudienceSegment, PromotionChannel } from "@prisma/client";

/**
 * AI-generated promotional content and banners (R13, R14).
 * Grounded in Behavioural Economics, Cognitive Biases, Pricing Psychology, and Neuromarketing.
 */

export const DEFAULT_PROMOTION_TEXT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export interface PromotionAiInput {
  vendorId: string;
  storeName?: string;
  storeDescription?: string | null;
  targetType: "PRODUCT" | "BUNDLE" | "DISCOUNT_CODE" | "GENERIC";
  itemDetails?: {
    name: string;
    description?: string | null;
    basePricePence?: number | null;
    originalPricePence?: number | null;
    savingsPence?: number | null;
    multiBuyQuantity?: number | null;
    multiBuyPricePence?: number | null;
    discountKind?: "PERCENTAGE" | "FIXED_AMOUNT";
    discountValue?: number;
  } | null;
  categoryName?: string | null;
  audienceSegment: AudienceSegment;
  channel: PromotionChannel;
}

export interface PromotionAiOutput {
  headline: string;
  subtitle: string;
  badgeText: string;
  callToActionText: string;
  altText: string;
  imageKey: string | null;
  imageUrl: string | null;
  textModel: string;
  textUsage?: WorkersAiUsage;
}

export function buildPromotionPrompt(input: PromotionAiInput): string {
  const lines: string[] = [
    "You are an expert e-commerce marketing copywriter and creative director specializing in conversion psychology.",
    "Generate engaging, conversion-focused promotional content incorporating these 4 core disciplines:",
    "1. BEHAVIOURAL ECONOMICS: Apply loss aversion (urgency, avoiding regret), choice architecture, and price anchoring.",
    "2. COGNITIVE BIASES: Integrate social proof ('Customer favourite', 'Top rated'), default effect, and reduce decision fatigue.",
    "3. PRICING PSYCHOLOGY: Emphasize clear transparent value, savings, and multibuy advantages.",
    "4. NEUROMARKETING: Use sensory, emotive, action-oriented language, vibrant visual framing, and high-impact CTAs.",
    "",
    `Target Marketing Channel: ${input.channel}`,
    `Target Audience: ${input.audienceSegment}`,
  ];

  if (input.storeDescription) {
    lines.push(`Store Context: ${input.storeDescription}`);
  }

  if (input.categoryName) {
    lines.push(`Department / Category: ${input.categoryName}`);
  }

  lines.push(`Offer Type: ${input.targetType}`);

  if (input.itemDetails) {
    const d = input.itemDetails;
    lines.push(`Item Name: ${d.name}`);
    if (d.description) lines.push(`Item Details: ${d.description}`);
    if (d.basePricePence) {
      lines.push(`Current Selling Price: £${(d.basePricePence / 100).toFixed(2)}`);
    }
    if (d.originalPricePence && d.basePricePence && d.originalPricePence > d.basePricePence) {
      const saving = d.originalPricePence - d.basePricePence;
      lines.push(`Regular/Was Price: £${(d.originalPricePence / 100).toFixed(2)}`);
      lines.push(`Net Savings: £${(saving / 100).toFixed(2)}`);
    }
    if (d.multiBuyQuantity && d.multiBuyPricePence) {
      lines.push(
        `Multi-buy Deal: ${d.multiBuyQuantity} items for £${(d.multiBuyPricePence / 100).toFixed(2)}`,
      );
    }
    if (d.discountKind && d.discountValue) {
      lines.push(
        `Discount: ${d.discountValue}${d.discountKind === "PERCENTAGE" ? "% OFF" : "p OFF"}`,
      );
    }
  }

  lines.push(
    "",
    "Output MUST be a single raw valid JSON object with EXACTLY these keys (no markdown, no quotes around the JSON, no commentary):",
    "{",
    '  "headline": "Punchy, persuasive headline under 50 characters",',
    '  "subtitle": "Compelling value proposition under 120 characters",',
    '  "badgeText": "Short urgency or social proof tag under 20 characters (e.g. Save 20%, Customer Top Pick, Limited Offer)",',
    '  "callToActionText": "Direct action button label under 20 characters (e.g. Shop Deal, Claim Offer, Order Now)",',
    '  "altText": "Descriptive accessibility text for the banner photograph under 100 characters",',
    '  "imagePrompt": "Detailed commercial photography visual prompt for Flux text-to-image. Appetizing, vibrant, clean studio lighting, shallow depth of field, high contrast, professional e-commerce hero banner."',
    "}",
  );

  return lines.join("\n");
}

export function parsePromotionAiResponse(raw: string): {
  headline: string;
  subtitle: string;
  badgeText: string;
  callToActionText: string;
  altText: string;
  imagePrompt: string;
} | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const headline = typeof parsed.headline === "string" ? parsed.headline.trim() : "";
    const subtitle = typeof parsed.subtitle === "string" ? parsed.subtitle.trim() : "";
    const badgeText = typeof parsed.badgeText === "string" ? parsed.badgeText.trim() : "";
    const callToActionText =
      typeof parsed.callToActionText === "string" ? parsed.callToActionText.trim() : "Shop Now";
    const altText = typeof parsed.altText === "string" ? parsed.altText.trim() : headline;
    const imagePrompt = typeof parsed.imagePrompt === "string" ? parsed.imagePrompt.trim() : "";

    if (!headline) return null;

    return {
      headline: headline.slice(0, 100),
      subtitle: subtitle.slice(0, 200),
      badgeText: badgeText.slice(0, 40),
      callToActionText: callToActionText.slice(0, 40),
      altText: altText.slice(0, 150),
      imagePrompt: imagePrompt || `${headline} commercial grocery hero banner photo`,
    };
  } catch {
    return null;
  }
}

/**
 * Core generation orchestrator for promotional campaigns.
 */
export async function generatePromotionAiContent(
  input: PromotionAiInput,
): Promise<{ ok: true; value: PromotionAiOutput } | { ok: false; error: string }> {
  const env = getAiEnv();
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    return {
      ok: false,
      error: "AI generation is not configured for this environment.",
    };
  }

  const model = DEFAULT_PROMOTION_TEXT_MODEL;
  const prompt = buildPromotionPrompt(input);

  let textRes: Response;
  try {
    textRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(WORKERS_AI_MODEL_REQUEST_OPTIONS[model] ?? {}),
          messages: [{ role: "user", content: prompt }],
        }),
      },
    );
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to call AI text model",
    };
  }

  if (!textRes.ok) {
    const errorText = await textRes.text();
    return { ok: false, error: `AI text generation failed: ${errorText}` };
  }

  const textJson = (await textRes.json()) as Record<string, unknown>;
  const rawReply = extractWorkersAiReplyText(textJson);
  const textUsage = extractWorkersAiUsage(textJson);

  if (!rawReply) {
    return { ok: false, error: "AI model returned an empty response." };
  }

  const copy = parsePromotionAiResponse(rawReply);
  if (!copy) {
    return { ok: false, error: "Could not parse promotional copy from AI response." };
  }

  // Next, generate the banner image using Flux
  const imageBytes = await getImageGenerationService().generateImage(copy.imagePrompt);

  let imageKey: string | null = null;
  let imageUrl: string | null = null;

  if (imageBytes) {
    const storageKey = `promotions/${input.vendorId}/${crypto.randomUUID()}.png`;
    const storage = getStorage();
    await storage.putObject(storageKey, imageBytes, "image/png");
    imageKey = storageKey;
    const { CDN_BASE_URL } = getEnv();
    if (CDN_BASE_URL) {
      imageUrl = composePublicUrl(CDN_BASE_URL, storageKey);
    }
  }

  return {
    ok: true,
    value: {
      headline: copy.headline,
      subtitle: copy.subtitle,
      badgeText: copy.badgeText,
      callToActionText: copy.callToActionText,
      altText: copy.altText,
      imageKey,
      imageUrl,
      textModel: model,
      textUsage,
    },
  };
}
