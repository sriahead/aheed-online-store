import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import {
  runBrandLogoPipeline,
  runCategoryImagePipeline,
  runSlotAssetPipeline,
} from "@/lib/category-image-pipeline";
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
      brandId?: unknown;
      style?: unknown;
    };
    const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
    const slot = typeof body.slot === "string" ? body.slot.trim() : "";
    const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";

    if (!categoryId && !slot && !brandId) {
      return NextResponse.json({ error: "Missing categoryId, slot, or brandId" }, { status: 400 });
    }

    // #1288 R10: only a registered slot can be generated, checked before any AI budget is touched.
    if (!categoryId && !brandId && !isIconSlotId(slot) && !slot.startsWith("brand:")) {
      return NextResponse.json({ error: "Unknown slot" }, { status: 400 });
    }

    const style: CategoryImageStyle = body.style === "3d-icon" ? "3d-icon" : "photo";

    const aiMeter = getVendorAiMeter(auth.vendorId, "PRODUCT_IMAGE");
    let result;
    if (brandId) {
      result = await runBrandLogoPipeline(brandId, style, auth.vendorId, { aiMeter });
    } else if (categoryId) {
      result = await runCategoryImagePipeline(categoryId, style, auth.vendorId, { aiMeter });
    } else {
      result = await runSlotAssetPipeline(slot, style, auth.vendorId, { aiMeter });
    }

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
    revalidatePath("/staff/brands");
    revalidatePath("/staff/icons");
    revalidatePath("/categories");
    revalidatePath("/");

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Category/slot/brand image generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
