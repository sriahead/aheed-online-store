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
import { buildBundleImageKey, isBundleImageKey } from "@/lib/bundle-image";
import { getBundleForVendor, saveBundleImageForVendor } from "@/lib/bundles-service";

/**
 * Bundle image upload actions (P8.5c, #347) — mirroring
 * `features/admin/campaign-image.ts`'s presign/attach pair exactly (P8.5e),
 * which in turn mirrors `features/admin/product-image.ts`.
 *
 * ONLY ASYNC FUNCTIONS MAY BE EXPORTED FROM THIS FILE (CLAUDE.md's Server
 * Actions section — the P6b1/#159 trap).
 */

const PRESIGN_TTL_SECONDS = 300;

function refusal(status: 401 | 403): string {
  return status === 401
    ? "Please sign in as a store admin to manage this store's bundles."
    : "You don't have permission to manage this store's bundles.";
}

/**
 * Presign a single upload for one bundle.
 *
 * Takes no key — only the bundle and how many bytes the client intends to send.
 * If the caller could name the key, an admin of one vendor could obtain a valid
 * signature for a PUT over another vendor's object.
 */
export async function requestBundleImageUpload(
  bundleId: string,
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

  const bundle = await getBundleForVendor(auth.vendorId, bundleId);
  if (!bundle) return { ok: false, error: "That bundle no longer exists." };

  const key = buildBundleImageKey(bundleId);
  const url = await getStorage().presignPut(key, IMAGE_CONTENT_TYPE, PRESIGN_TTL_SECONDS);

  return { ok: true, value: { url, key } };
}

/**
 * Record an upload that has already landed, after proving it actually did.
 *
 * `altText` is required whenever an image is attached (R31): an image with no
 * alt text is refused here rather than stored and left for later.
 */
export async function attachBundleImage(
  bundleId: string,
  storageKey: string,
  altText: string,
): Promise<ImageActionResult<void>> {
  console.log("[382-diag-STEP] 1: before requireVendorRole");
  const auth = await requireVendorRole("ADMIN");
  console.log("[382-diag-STEP] 2: after requireVendorRole, ok=", auth.ok);
  if (!auth.ok) return { ok: false, error: refusal(auth.status) };

  const trimmedAlt = altText.trim();
  if (trimmedAlt === "") {
    return { ok: false, error: "Describe the photo (alt text) before saving it." };
  }

  if (!isBundleImageKey(storageKey, bundleId)) {
    return { ok: false, error: "Invalid upload key." };
  }

  console.log("[382-diag-STEP] 3: before headObject");
  const meta = await getStorage().headObject(storageKey);
  console.log("[382-diag-STEP] 4: after headObject, meta=", JSON.stringify(meta));
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

  console.log("[382-diag-STEP] 5: before saveBundleImageForVendor");
  const result = await saveBundleImageForVendor(auth.vendorId, bundleId, storageKey, trimmedAlt);
  console.log("[382-diag-STEP] 6: after saveBundleImageForVendor, ok=", result.ok);
  if (!result.ok) return { ok: false, error: result.error };

  console.log("[382-diag-STEP] 7: before revalidatePath x3");
  revalidatePath("/staff/bundles");
  revalidatePath(`/staff/bundles/${bundleId}`);
  revalidatePath("/categories");
  console.log("[382-diag-STEP] 8: after revalidatePath x3, returning ok");
  return { ok: true, value: undefined };
}
