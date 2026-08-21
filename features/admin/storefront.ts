"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getStorage } from "@/lib/storage";
import { IMAGE_CONTENT_TYPE, MAX_IMAGE_BYTES, type ImageActionResult, type UploadTicket } from "@/lib/product-image";
import { getPrisma } from "@/lib/db";
import crypto from "crypto";

const PRESIGN_TTL_SECONDS = 300;

function refusal(status: 401 | 403): string {
  return status === 401
    ? "You must be signed in to do that."
    : "You don't have permission to do that.";
}

function buildVendorLogoKey(vendorId: string): string {
  return `vendors/${vendorId}/logo-${crypto.randomUUID()}.webp`;
}

export async function requestLogoUpload(
  byteLength: number,
): Promise<ImageActionResult<UploadTicket>> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: refusal(auth.status) };

  if (!Number.isInteger(byteLength) || byteLength <= 0 || byteLength > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `Images must be under ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`,
    };
  }

  const key = buildVendorLogoKey(auth.vendorId);
  const url = await getStorage().presignPut(key, IMAGE_CONTENT_TYPE, PRESIGN_TTL_SECONDS);

  return { ok: true, value: { url, key } };
}

export async function attachVendorLogo(key: string): Promise<ImageActionResult<void>> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: refusal(auth.status) };

  if (!key.startsWith(`vendors/${auth.vendorId}/logo-`) || !key.endsWith(".webp")) {
    return { ok: false, error: "Invalid upload key." };
  }

  const meta = await getStorage().headObject(key);
  if (!meta) {
    return { ok: false, error: "The uploaded file could not be verified." };
  }
  if (meta.contentType !== IMAGE_CONTENT_TYPE) {
    await getStorage().deleteObject(key);
    return { ok: false, error: "Images must be uploaded as WebP." };
  }
  if (meta.contentLength && meta.contentLength > MAX_IMAGE_BYTES) {
    await getStorage().deleteObject(key);
    return { ok: false, error: "The uploaded file exceeded the size limit." };
  }

  const db = getPrisma();
  
  await db.vendorBranding.update({
    where: { vendorId: auth.vendorId },
    data: { logoStorageKey: key },
  });

  revalidatePath("/staff/storefront");
  revalidatePath("/", "layout");
  return { ok: true, value: undefined };
}

export async function updateStorefrontConfig(data: {
  bannerNote: string | null;
  heroSubtitle: string | null;
  brandGreenDark?: string;
  brandGreen?: string;
  brandOrange?: string;
  brandRed?: string;
  brandCream?: string;
  brandGreenTint?: string;
  brandOrangeTint?: string;
  brandRedTint?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: refusal(auth.status) };

  const db = getPrisma();
  
  await db.$transaction(async (tx) => {
    await tx.vendorConfig.update({
      where: { vendorId: auth.vendorId },
      data: {
        bannerNote: data.bannerNote,
        heroSubtitle: data.heroSubtitle,
      },
    });
    
    const brandingUpdates: any = {};
    if (data.brandGreenDark) brandingUpdates.brandGreenDark = data.brandGreenDark;
    if (data.brandGreen) brandingUpdates.brandGreen = data.brandGreen;
    if (data.brandOrange) brandingUpdates.brandOrange = data.brandOrange;
    if (data.brandRed) brandingUpdates.brandRed = data.brandRed;
    if (data.brandCream) brandingUpdates.brandCream = data.brandCream;
    if (data.brandGreenTint) brandingUpdates.brandGreenTint = data.brandGreenTint;
    if (data.brandOrangeTint) brandingUpdates.brandOrangeTint = data.brandOrangeTint;
    if (data.brandRedTint) brandingUpdates.brandRedTint = data.brandRedTint;
    
    if (Object.keys(brandingUpdates).length > 0) {
      await tx.vendorBranding.update({
        where: { vendorId: auth.vendorId },
        data: brandingUpdates,
      });
    }
  });

  revalidatePath("/staff/storefront");
  revalidatePath("/", "layout");
  return { ok: true };
}
