import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { ingestBrandLogo, ingestBrandLogoFromUrl } from "@/lib/category-image-pipeline";

export async function POST(request: Request) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  try {
    const contentTypeHeader = request.headers.get("content-type") ?? "";

    if (contentTypeHeader.includes("multipart/form-data")) {
      const formData = await request.formData();
      const brandId = String(formData.get("brandId") ?? "").trim();
      const file = formData.get("file");

      if (!brandId) {
        return NextResponse.json({ error: "Missing brandId" }, { status: 400 });
      }
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "Missing image file" }, { status: 400 });
      }

      const blob = file as Blob;
      const arrayBuffer = await blob.arrayBuffer();
      const contentType = blob.type || "image/png";

      const result = await ingestBrandLogo(brandId, auth.vendorId, arrayBuffer, contentType);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      revalidatePath("/staff/brands");
      revalidatePath("/staff/icons");
      return NextResponse.json(result);
    }

    // Default to JSON body for URL imports
    const body = (await request.json().catch(() => ({}))) as {
      brandId?: unknown;
      url?: unknown;
    };
    const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";

    if (!brandId) {
      return NextResponse.json({ error: "Missing brandId" }, { status: 400 });
    }
    if (!url) {
      return NextResponse.json({ error: "Missing image URL" }, { status: 400 });
    }

    const result = await ingestBrandLogoFromUrl(brandId, auth.vendorId, url);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    revalidatePath("/staff/brands");
    revalidatePath("/staff/icons");
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Brand logo upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process logo upload" },
      { status: 500 },
    );
  }
}
