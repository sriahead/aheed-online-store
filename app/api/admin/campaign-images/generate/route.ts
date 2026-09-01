import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getCategoryForAdmin } from "@/lib/categories-service";
import { getCampaignForVendorCategory, saveCampaignImageForVendor } from "@/lib/campaigns-service";
import { getImageGenerationService } from "@/lib/image-generation";
import { getStorage } from "@/lib/storage";
import { buildCampaignImageKey } from "@/lib/campaign-image";

/**
 * Generate a department campaign banner with AI (P8.5f).
 *
 * Mirrors `app/api/admin/product-images/generate/route.ts` in shape and guard,
 * and reuses the same `lib/image-generation.ts` port (Cloudflare Workers AI via
 * REST `fetch`, already 429/backoff aware) that has backed product images since
 * P8. Nothing new is provisioned; this is the second caller of an existing port.
 *
 * ## Why the body carries only a categoryId
 *
 * The prompt and the storage key are both built HERE, from data this route loads
 * itself after the role check. If the caller could name either, an admin of one
 * vendor could aim a write at another vendor's object (the same reasoning
 * `requestCampaignImageUpload` gives for not accepting a key), or steer the model
 * with arbitrary text under this store's branding.
 */

/** Alt text is never optional — an image without it is an accessibility defect. */
function deriveAltText(categoryName: string, headline: string | null): string {
  return headline && headline.trim() !== ""
    ? `${headline.trim()} — ${categoryName} campaign banner`
    : `${categoryName} campaign banner`;
}

function buildPrompt(
  categoryName: string,
  headline: string | null,
  subtitle: string | null,
): string {
  const copy = [headline, subtitle].filter((part) => part && part.trim() !== "").join(". ");
  const subject = copy === "" ? categoryName : `${categoryName}: ${copy}`;

  return (
    `Photographic marketing banner for a UK grocery store's ${subject}. ` +
    `Appetising natural daylight, shallow depth of field, clean uncluttered ` +
    `composition with space for text overlay. No text, no words, no logos.`
  );
}

export async function POST(request: Request) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as { categoryId?: unknown };
    const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
    if (categoryId === "") {
      return NextResponse.json({ error: "Missing categoryId" }, { status: 400 });
    }

    const [category, campaign] = await Promise.all([
      getCategoryForAdmin(auth.vendorId, categoryId),
      getCampaignForVendorCategory(auth.vendorId, categoryId),
    ]);
    if (!category) {
      return NextResponse.json({ error: "That department no longer exists." }, { status: 404 });
    }
    // setCampaignImage refuses to upsert a row into being, so fail before
    // spending an AI generation on an image that could not be attached.
    if (!campaign) {
      return NextResponse.json(
        { error: "Save the campaign's headline before generating a photo." },
        { status: 400 },
      );
    }

    const image = await getImageGenerationService().generateImage(
      buildPrompt(category.name, campaign.headline, campaign.subtitle),
    );
    // null = the service is not configured (missing account id or API token); it
    // degrades rather than throwing, so this is the "AI unavailable" branch.
    if (!image) {
      return NextResponse.json(
        { error: "AI image generation is not configured for this environment." },
        { status: 503 },
      );
    }

    /*
     * #364 — Workers AI returns PNG bytes, and the key now says so.
     *
     * This used to suffix `.webp` regardless, on the reasoning that the key had
     * to keep passing `isCampaignImageKey`. That reasoning did not hold:
     * `isCampaignImageKey` guards the BROWSER-UPLOAD path only — a key generated
     * here never passes through it — so the suffix was constrained by a check
     * this code path never runs. The object is still stored with its real
     * content type, which is what the CDN serves on; now the key agrees with it.
     */
    const contentType = "image/png";
    const key = buildCampaignImageKey(categoryId, contentType);
    await getStorage().putObject(key, image, contentType);

    // The alt text the admin last saved for this campaign wins; otherwise one is
    // derived. R25: no path here writes an imageKey with an empty altText.
    const existingAlt = campaign.altText?.trim() ?? "";
    const altText =
      existingAlt !== "" ? existingAlt : deriveAltText(category.name, campaign.headline);

    const saved = await saveCampaignImageForVendor(auth.vendorId, categoryId, key, altText);
    if (!saved.ok) {
      return NextResponse.json({ error: saved.error }, { status: 400 });
    }

    // Same surfaces `attachCampaignImage` refreshes — a generated banner is
    // live on the storefront hero the moment it is attached.
    revalidatePath("/staff/promotions");
    revalidatePath("/", "layout");

    return NextResponse.json({ imageKey: key, altText });
  } catch (error) {
    console.error("Campaign image generation error:", error);
    const message = error instanceof Error ? error.message : "Image generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
