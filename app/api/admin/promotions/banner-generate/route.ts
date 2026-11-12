import { NextResponse } from "next/server";
import { requireVendorRole } from "@/lib/auth-rbac";
import { describeAiBudgetRefusal } from "@/lib/ai-meter";
import { getVendorAiMeter } from "@/lib/ai-meter-service";
import { AI_UNAVAILABLE_MESSAGE, generateAndStoreImage } from "@/lib/ai-image-store";
import { buildPromotionBannerPrompt } from "@/lib/ai-image-prompts";
import { describePromotionSubjectForVendor } from "@/lib/promotions-ai-service";
import { getEnv } from "@/lib/config";
import { composePublicUrl } from "@/lib/storage";

/**
 * #1535 — "Generate banner only": a new promotion photo that leaves the headline and copy alone
 * ("Generate Message and Banner Using AI" rewrites both).
 *
 * Like the upload and the full AI route, this does NOT save the promotion. It returns the stored
 * key, the form shows it as the banner (flagged for review), and Save writes it. The body names the
 * promotion's target; the subject is looked up here, scoped to the session's vendor, so the caller
 * can only steer the prompt through its own products, bundles and departments plus its headline.
 */
const MAX_HEADLINE = 100;

function optionalId(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export async function POST(request: Request) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      headline?: unknown;
      productId?: unknown;
      bundleId?: unknown;
      categoryId?: unknown;
    };
    const headline =
      typeof body.headline === "string" ? body.headline.trim().slice(0, MAX_HEADLINE) : "";

    const subject = await describePromotionSubjectForVendor(auth.vendorId, {
      productId: optionalId(body.productId),
      bundleId: optionalId(body.bundleId),
      categoryId: optionalId(body.categoryId),
    });
    if (subject === "" && headline === "") {
      return NextResponse.json(
        { error: "Choose what the promotion is for, or write a headline, first." },
        { status: 400 },
      );
    }

    const result = await generateAndStoreImage(
      buildPromotionBannerPrompt(subject, headline),
      `promotions/${auth.vendorId}/${crypto.randomUUID()}.png`,
      getVendorAiMeter(auth.vendorId, "CAMPAIGN_IMAGE"),
    );
    if (!result.ok) {
      return "budgetRefused" in result
        ? NextResponse.json(
            { error: describeAiBudgetRefusal(result.budgetRefused) },
            { status: 429 },
          )
        : NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 503 });
    }

    const { CDN_BASE_URL } = getEnv();
    return NextResponse.json({
      imageKey: result.imageKey,
      imageUrl: CDN_BASE_URL ? composePublicUrl(CDN_BASE_URL, result.imageKey) : null,
    });
  } catch (error) {
    console.error("Promotion banner generation error:", error);
    const message = error instanceof Error ? error.message : "Banner generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
