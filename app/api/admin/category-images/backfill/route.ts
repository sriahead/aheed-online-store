import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { runCategoryImagePipeline } from "@/lib/category-image-pipeline";
import { describeAiBudgetRefusal } from "@/lib/ai-meter";
import { getVendorAiMeter } from "@/lib/ai-meter-service";
import { listCategoriesForAdmin } from "@/lib/categories-service";
import type { CategoryImageStyle } from "@/lib/category-image";

const BACKFILL_BATCH = 5;

export async function POST(request: Request) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    let style: CategoryImageStyle = "photo";
    try {
      const body = (await request.json()) as { style?: unknown };
      if (body?.style === "3d-icon") style = "3d-icon";
    } catch {
      // Body absent or invalid JSON — use default photo style
    }

    const allCategories = await listCategoriesForAdmin(auth.vendorId);
    // Categories missing an imageKey
    const missing = allCategories.filter((c) => !c.imageKey || c.imageKey.trim() === "");

    if (missing.length === 0) {
      return NextResponse.json({
        message: "All categories already have images assigned.",
        processed: 0,
        totalRemaining: 0,
      });
    }

    const batch = missing.slice(0, BACKFILL_BATCH);
    const aiMeter = getVendorAiMeter(auth.vendorId, "PRODUCT_IMAGE");

    let processed = 0;
    for (const category of batch) {
      const result = await runCategoryImagePipeline(category.id, style, auth.vendorId, {
        aiMeter,
      });

      if (result && "budgetRefused" in result) {
        return NextResponse.json({
          message: `${describeAiBudgetRefusal(result.budgetRefused)} (${processed} generated before budget limit reached)`,
          processed,
          totalRemaining: missing.length - processed,
        });
      }

      if (result) {
        processed++;
      }
    }

    revalidatePath("/staff/categories");
    revalidatePath("/categories");
    revalidatePath("/");

    return NextResponse.json({
      message: `Backfill batch complete: ${processed} category image(s) generated.`,
      processed,
      totalRemaining: missing.length - processed,
    });
  } catch (error: any) {
    console.error("Category image backfill error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
