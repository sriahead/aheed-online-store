import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { selectCategoryAssetForVendor } from "@/lib/category-assets-service";

export async function POST(request: Request) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      assetId?: unknown;
      id?: unknown;
    };
    const assetId = typeof body.assetId === "string" ? body.assetId : typeof body.id === "string" ? body.id : null;

    if (!assetId) {
      return NextResponse.json({ error: "Missing assetId" }, { status: 400 });
    }

    const result = await selectCategoryAssetForVendor(auth.vendorId, assetId);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to select asset" },
        { status: 404 },
      );
    }

    revalidatePath("/staff/categories");
    if (result.asset?.categoryId) {
      revalidatePath(`/staff/categories/${result.asset.categoryId}`);
    }
    revalidatePath("/staff/icons");
    revalidatePath("/categories");
    revalidatePath("/");

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Select category asset error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
