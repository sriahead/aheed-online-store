import { NextResponse } from "next/server";
import { requireVendorRole } from "@/lib/auth-rbac";
import { describeAiBudgetRefusal } from "@/lib/ai-meter";
import { getVendorAiMeter } from "@/lib/ai-meter-service";
import { IMAGE_GENERATION_MODEL } from "@/lib/image-generation";
import { generatePromotionAiForVendor } from "@/lib/promotions-ai-service";
import type { AudienceSegment, PromotionChannel } from "@/lib/promotions-service";

/**
 * AI Promotional Content & Banner Generation API (R13, R14).
 * Combines Behavioural Economics, Cognitive Biases, Pricing Psychology, and Neuromarketing.
 */

export async function POST(request: Request) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      targetType?: unknown;
      categoryId?: unknown;
      productId?: unknown;
      bundleId?: unknown;
      discountCodeId?: unknown;
      audienceSegment?: unknown;
      channel?: unknown;
    };

    const targetType =
      typeof body.targetType === "string"
        ? (body.targetType as "PRODUCT" | "BUNDLE" | "DISCOUNT_CODE" | "GENERIC")
        : "GENERIC";

    const categoryId =
      typeof body.categoryId === "string" && body.categoryId.trim() !== ""
        ? body.categoryId.trim()
        : null;
    const productId =
      typeof body.productId === "string" && body.productId.trim() !== ""
        ? body.productId.trim()
        : null;
    const bundleId =
      typeof body.bundleId === "string" && body.bundleId.trim() !== ""
        ? body.bundleId.trim()
        : null;
    const discountCodeId =
      typeof body.discountCodeId === "string" && body.discountCodeId.trim() !== ""
        ? body.discountCodeId.trim()
        : null;

    const audienceSegment = (
      typeof body.audienceSegment === "string" ? body.audienceSegment : "ALL"
    ) as AudienceSegment;
    const channel = (
      typeof body.channel === "string" ? body.channel : "WEBSITE"
    ) as PromotionChannel;

    // Check vendor's daily AI budget
    const aiMeter = getVendorAiMeter(auth.vendorId, "CAMPAIGN_IMAGE");
    const budget = await aiMeter.check();
    if (!budget.allowed) {
      return NextResponse.json({ error: describeAiBudgetRefusal(budget) }, { status: 429 });
    }

    const result = await generatePromotionAiForVendor(auth.vendorId, {
      targetType,
      categoryId,
      productId,
      bundleId,
      discountCodeId,
      audienceSegment,
      channel,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Record meter usage
    if (result.value.textUsage) {
      await aiMeter.record({
        model: result.value.textModel,
        usage: result.value.textUsage,
      });
    }
    if (result.value.imageKey) {
      await aiMeter.recordImage({ model: IMAGE_GENERATION_MODEL });
    }

    return NextResponse.json({
      headline: result.value.headline,
      subtitle: result.value.subtitle,
      badgeText: result.value.badgeText,
      callToActionText: result.value.callToActionText,
      altText: result.value.altText,
      imageKey: result.value.imageKey,
      imageUrl: result.value.imageUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
