import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { describeAiBudgetRefusal } from "@/lib/ai-meter";
import { getVendorAiMeter } from "@/lib/ai-meter-service";
import { AI_UNAVAILABLE_MESSAGE, generateAndStoreImage } from "@/lib/ai-image-store";
import { bundleImageAltText, buildBundleImagePrompt } from "@/lib/ai-image-prompts";
import { buildGeneratedBundleImageKey } from "@/lib/bundle-image";
import { listBundlesWithoutImagesForVendor, saveBundleImageForVendor } from "@/lib/bundles-service";

/**
 * #1535 — "Fill missing bundle photos". One click fills at most this many, live bundles first, for
 * the reason `app/api/admin/jobs/backfill-images/route.ts` caps products: each one is a paid call.
 */
const BACKFILL_BATCH = 10;

export async function POST() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const bundles = await listBundlesWithoutImagesForVendor(auth.vendorId, BACKFILL_BATCH);
  if (bundles.length === 0) {
    return NextResponse.json({ message: "Every bundle already has a photo.", processed: 0 });
  }

  // One meter for the run, built for this request's vendor (#1017).
  const aiMeter = getVendorAiMeter(auth.vendorId, "BUNDLE_IMAGE");
  let processed = 0;
  let failed = 0;

  for (const bundle of bundles) {
    try {
      const result = await generateAndStoreImage(
        buildBundleImagePrompt(bundle.name, bundle.items),
        buildGeneratedBundleImageKey(bundle.id),
        aiMeter,
      );
      if (!result.ok) {
        // Every later bundle would be refused for the same reason, so stop here. Still 200: the
        // progress so far is real, and `budgetRefused` tells the button to show it as a refusal.
        if (processed > 0) revalidateBundles();
        return NextResponse.json({
          message:
            "budgetRefused" in result
              ? describeAiBudgetRefusal(result.budgetRefused)
              : AI_UNAVAILABLE_MESSAGE,
          processed,
          totalFound: bundles.length,
          budgetRefused: true,
        });
      }
      const saved = await saveBundleImageForVendor(
        auth.vendorId,
        bundle.id,
        result.imageKey,
        bundleImageAltText(bundle.name, bundle.items),
        true,
      );
      if (saved.ok) processed++;
      else failed++;
    } catch (err) {
      console.error(`Failed to fill a photo for bundle ${bundle.id}`, err);
      failed++;
    }
  }

  if (processed > 0) revalidateBundles();
  return NextResponse.json({
    message: failed > 0 ? `Done, but ${failed} could not be filled.` : "Bundle photos filled.",
    processed,
    totalFound: bundles.length,
  });
}

function revalidateBundles() {
  revalidatePath("/staff/bundles");
  revalidatePath("/categories");
}
