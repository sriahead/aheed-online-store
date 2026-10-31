import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { runCategoryImagePipeline, runSlotAssetPipeline } from "@/lib/category-image-pipeline";
import { describeAiBudgetRefusal } from "@/lib/ai-meter";
import { getVendorAiMeter } from "@/lib/ai-meter-service";
import type { CategoryImageStyle } from "@/lib/category-image";
import { isIconSlotId } from "@/lib/icon-slots";

export async function POST(request: Request) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      categoryId?: unknown;
      slot?: unknown;
      style?: unknown;
    };
    const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
    const slot = typeof body.slot === "string" ? body.slot.trim() : "";

    if (!categoryId && !slot) {
      return NextResponse.json({ error: "Missing categoryId" }, { status: 400 });
    }

    // #1288 R10: only a registered slot can be generated, checked before any AI budget is touched.
    if (!categoryId && !isIconSlotId(slot)) {
      return NextResponse.json({ error: "Unknown slot" }, { status: 400 });
    }

    const style: CategoryImageStyle = body.style === "3d-icon" ? "3d-icon" : "photo";

    const aiMeter = getVendorAiMeter(auth.vendorId, "PRODUCT_IMAGE");
    const result = categoryId
      ? await runCategoryImagePipeline(categoryId, style, auth.vendorId, { aiMeter })
      : await runSlotAssetPipeline(slot, style, auth.vendorId, { aiMeter });

    if (result && "budgetRefused" in result) {
      return NextResponse.json(
        { error: describeAiBudgetRefusal(result.budgetRefused) },
        { status: 429 },
      );
    }

    if (!result) {
      return NextResponse.json({ error: "Failed to generate or persist asset" }, { status: 500 });
    }

    revalidatePath("/staff/categories");
    if (categoryId) {
      revalidatePath(`/staff/categories/${categoryId}`);
    }
    revalidatePath("/staff/icons");
    revalidatePath("/categories");
    revalidatePath("/");

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Category/slot image generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
