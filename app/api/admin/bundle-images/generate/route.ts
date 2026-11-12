import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { describeAiBudgetRefusal } from "@/lib/ai-meter";
import { getVendorAiMeter } from "@/lib/ai-meter-service";
import { AI_UNAVAILABLE_MESSAGE, generateAndStoreImage } from "@/lib/ai-image-store";
import { bundleImageAltText, buildBundleImagePrompt } from "@/lib/ai-image-prompts";
import { buildGeneratedBundleImageKey } from "@/lib/bundle-image";
import { getBundleForVendor, saveBundleImageForVendor } from "@/lib/bundles-service";

/**
 * #1535 — generate a bundle photo with AI, from the bundle's own contents.
 *
 * ADMIN only, like every other AI image route: each call is a paid generation. The body carries
 * only the bundle id; the prompt and the key are built here from data loaded after the role check,
 * for the reason `app/api/admin/campaign-images/generate/route.ts` gives.
 */
export async function POST(request: Request) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as { bundleId?: unknown };
    const bundleId = typeof body.bundleId === "string" ? body.bundleId.trim() : "";
    if (bundleId === "") {
      return NextResponse.json({ error: "Missing bundleId" }, { status: 400 });
    }

    const bundle = await getBundleForVendor(auth.vendorId, bundleId);
    if (!bundle) {
      return NextResponse.json({ error: "That bundle no longer exists." }, { status: 404 });
    }

    const items = bundle.items.map((item) => ({ name: item.name, quantity: item.quantity }));
    const result = await generateAndStoreImage(
      buildBundleImagePrompt(bundle.name, items),
      buildGeneratedBundleImageKey(bundle.id),
      getVendorAiMeter(auth.vendorId, "BUNDLE_IMAGE"),
    );
    if (!result.ok) {
      return "budgetRefused" in result
        ? NextResponse.json(
            { error: describeAiBudgetRefusal(result.budgetRefused) },
            { status: 429 },
          )
        : NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 503 });
    }

    // The alt text the admin already wrote wins; otherwise it is derived from the contents.
    const altText = bundle.altText?.trim() || bundleImageAltText(bundle.name, items);
    const saved = await saveBundleImageForVendor(
      auth.vendorId,
      bundle.id,
      result.imageKey,
      altText,
      true,
    );
    if (!saved.ok) {
      return NextResponse.json({ error: saved.error }, { status: 400 });
    }

    revalidatePath("/staff/bundles");
    revalidatePath(`/staff/bundles/${bundle.id}`);
    revalidatePath("/categories");
    return NextResponse.json({ imageKey: result.imageKey, altText });
  } catch (error) {
    console.error("Bundle image generation error:", error);
    const message = error instanceof Error ? error.message : "Image generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
