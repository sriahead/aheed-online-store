import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { runCategoryImagePipeline } from "@/lib/category-image-pipeline";
import { describeAiBudgetRefusal } from "@/lib/ai-meter";
import { getVendorAiMeter } from "@/lib/ai-meter-service";
import type { CategoryImageStyle } from "@/lib/category-image";

export async function POST(request: Request) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as { categoryId?: unknown; style?: unknown };
    const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
    if (!categoryId) {
      return NextResponse.json({ error: "Missing categoryId" }, { status: 400 });
    }

    const style: CategoryImageStyle = body.style === "3d-icon" ? "3d-icon" : "photo";

    const result = await runCategoryImagePipeline(categoryId, style, auth.vendorId, {
      aiMeter: getVendorAiMeter(auth.vendorId, "PRODUCT_IMAGE"),
    });

    if (result && "budgetRefused" in result) {
      return NextResponse.json(
        { error: describeAiBudgetRefusal(result.budgetRefused) },
        { status: 429 },
      );
    }

    if (!result) {
      return NextResponse.json(
        { error: "Failed to generate or persist category image" },
        { status: 500 },
      );
    }

    revalidatePath("/staff/categories");
    revalidatePath(`/staff/categories/${categoryId}`);
    revalidatePath("/categories");
    revalidatePath("/");

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Category image generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
