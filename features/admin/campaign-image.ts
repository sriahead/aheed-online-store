"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getStorage } from "@/lib/storage";
import {
  IMAGE_CONTENT_TYPE,
  MAX_IMAGE_BYTES,
  type ImageActionResult,
  type UploadTicket,
} from "@/lib/product-image";
import { buildCampaignImageKey, isCampaignImageKey } from "@/lib/campaign-image";
import { saveCampaignImageForVendor } from "@/lib/campaigns-service";
import { getCategoryForAdmin } from "@/lib/repositories/categories";

/**
 * Campaign banner upload actions (P8.5e, #356) — the image half of
 * `/staff/promotions`, mirroring `features/admin/storefront.ts`'s vendor-logo
 * pair and `features/admin/product-image.ts`'s presign/attach shape exactly.
 *
 * ONLY ASYNC FUNCTIONS MAY BE EXPORTED FROM THIS FILE (CLAUDE.md's Server
 * Actions section — the P6b1/#159 trap).
 *
 * Each action runs `requireVendorRole("ADMIN")` itself; a server action is a
 * public endpoint at a stable id, so the page's own check protects the page,
 * not this.
 */

const PRESIGN_TTL_SECONDS = 300;

function refusal(status: 401 | 403): string {
  return status === 401
    ? "Please sign in as a store admin to manage this department's campaign."
    : "You don't have permission to manage this store's campaigns.";
}

/**
 * Presign a single upload for one department's category.
 *
 * Takes no key — only the category and how many bytes the client intends to
 * send — for the same reason `requestImageUpload` does: if the caller could
 * name the key, an admin of one vendor could obtain a valid signature for a
 * PUT over another vendor's object.
 */
export async function requestCampaignImageUpload(
  categoryId: string,
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

  const category = await getCategoryForAdmin(auth.vendorId, categoryId);
  if (!category) return { ok: false, error: "That department no longer exists." };

  const key = buildCampaignImageKey(categoryId);
  const url = await getStorage().presignPut(key, IMAGE_CONTENT_TYPE, PRESIGN_TTL_SECONDS);

  return { ok: true, value: { url, key } };
}

/**
 * Record an upload that has already landed, after proving it actually did.
 *
 * Requires an EXISTING campaign row for this category — see
 * `setCampaignImage`'s comment for why this doesn't upsert one into being.
 * `altText` is required whenever an image is attached (R20/R21): an image with
 * no alt text is rejected here rather than stored and left for later.
 */
export async function attachCampaignImage(
  categoryId: string,
  storageKey: string,
  altText: string,
): Promise<ImageActionResult<void>> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: refusal(auth.status) };

  const trimmedAlt = altText.trim();
  if (trimmedAlt === "") {
    return { ok: false, error: "Describe the photo (alt text) before saving it." };
  }

  if (!isCampaignImageKey(storageKey, categoryId)) {
    return { ok: false, error: "Invalid upload key." };
  }

  const meta = await getStorage().headObject(storageKey);
  if (!meta) {
    return { ok: false, error: "The uploaded file could not be verified." };
  }
  if (meta.contentType !== IMAGE_CONTENT_TYPE) {
    await getStorage().deleteObject(storageKey);
    return { ok: false, error: "Images must be uploaded as WebP." };
  }
  if (meta.contentLength && meta.contentLength > MAX_IMAGE_BYTES) {
    await getStorage().deleteObject(storageKey);
    return { ok: false, error: "The uploaded file exceeded the size limit." };
  }

  const result = await saveCampaignImageForVendor(
    auth.vendorId,
    categoryId,
    storageKey,
    trimmedAlt,
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/staff/promotions");
  revalidatePath("/", "layout");
  return { ok: true, value: undefined };
}
