import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getStorage } from "@/lib/storage";
import {
  listCategoryAssetsForVendor,
  deleteCategoryAssetForVendor,
} from "@/lib/category-assets-service";

export async function GET(request: Request) {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId") || undefined;
    const slot = searchParams.get("slot") || undefined;
    const style = searchParams.get("style") || undefined;

    const assets = await listCategoryAssetsForVendor(auth.vendorId, {
      categoryId,
      slot,
      style,
    });

    const storage = getStorage();
    const enriched = assets.map((a) => ({
      ...a,
      imageUrl: storage.publicUrl(a.storageKey),
    }));

    return NextResponse.json({ assets: enriched });
  } catch (error: any) {
    console.error("List category assets error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    let assetId: string | null = null;
    const url = new URL(request.url);
    assetId = url.searchParams.get("id");

    if (!assetId) {
      const body = (await request.json().catch(() => ({}))) as { id?: unknown; assetId?: unknown };
      assetId =
        typeof body.id === "string"
          ? body.id
          : typeof body.assetId === "string"
            ? body.assetId
            : null;
    }

    if (!assetId) {
      return NextResponse.json({ error: "Missing assetId" }, { status: 400 });
    }

    const result = await deleteCategoryAssetForVendor(auth.vendorId, assetId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error || "Asset not found" }, { status: 404 });
    }

    if (result.storageKey) {
      try {
        const storage = getStorage();
        await storage.deleteObject(result.storageKey);
      } catch (storageError) {
        console.warn("Storage deletion warning (safe to proceed):", storageError);
      }
    }

    revalidatePath("/staff/categories");
    if (result.categoryId) {
      revalidatePath(`/staff/categories/${result.categoryId}`);
    }
    revalidatePath("/staff/icons");
    revalidatePath("/categories");
    revalidatePath("/");

    return NextResponse.json({ ok: true, deletedId: assetId });
  } catch (error: any) {
    console.error("Delete category asset error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
