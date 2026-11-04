"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import {
  PROMOTION_FIELDS,
  parsePromotionForm,
  type PromotionFormState,
} from "@/lib/promotion-form";
import {
  createPromotionForVendor,
  updatePromotionForVendor,
  deletePromotionForVendor,
} from "@/lib/promotions-service";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { STORE_TIMEZONE } from "@/lib/local-datetime";
import { readForm } from "@/lib/catalogue-form";
import { getStorage } from "@/lib/storage";
import {
  IMAGE_CONTENT_TYPE,
  MAX_IMAGE_BYTES,
  type ImageActionResult,
  type UploadTicket,
} from "@/lib/product-image";

/**
 * Promotion write actions (R6) — ONLY async functions exported.
 */

const PRESIGN_TTL_SECONDS = 300;

function refusal(status: number): PromotionFormState {
  return {
    error:
      status === 401
        ? "Please sign in as a store staff or admin to manage promotions."
        : "You don't have permission to manage this store's promotions.",
    field: null,
    saved: false,
    promotionId: null,
  };
}

/**
 * Server action to create or update a promotion.
 */
export async function savePromotion(
  _prev: PromotionFormState,
  form: FormData,
): Promise<PromotionFormState> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return refusal(auth.status);

  const id = String(form.get("id") ?? "").trim();
  const timezone = (await getCurrentVendorProfile())?.timezone ?? STORE_TIMEZONE;

  const parsed = parsePromotionForm(readForm(form, PROMOTION_FIELDS), timezone);
  if (!parsed.ok) {
    return {
      error: parsed.error.message,
      field: parsed.error.field,
      saved: false,
      promotionId: id || null,
    };
  }

  const values = parsed.value;

  if (id) {
    const result = await updatePromotionForVendor(auth.vendorId, id, values);
    if (!result.ok) {
      return {
        error: result.error,
        field: result.field ?? null,
        saved: false,
        promotionId: id,
      };
    }
  } else {
    const result = await createPromotionForVendor(auth.vendorId, values);
    if (!result.ok) {
      return {
        error: result.error,
        field: result.field ?? null,
        saved: false,
        promotionId: null,
      };
    }
  }

  revalidatePath("/staff/promotions");
  revalidatePath("/", "layout");

  return { error: null, field: null, saved: true, promotionId: id || null };
}

/**
 * Server action to delete a promotion.
 */
export async function deletePromotionAction(
  promotionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    return {
      ok: false,
      error:
        auth.status === 401
          ? "Please sign in to delete promotions."
          : "You don't have permission to delete promotions.",
    };
  }

  const result = await deletePromotionForVendor(auth.vendorId, promotionId);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/staff/promotions");
  revalidatePath("/", "layout");

  return { ok: true };
}

/**
 * Request a presigned URL to upload a promotional banner.
 */
export async function requestPromotionBannerUpload(
  byteLength: number,
): Promise<ImageActionResult<UploadTicket>> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    return {
      ok: false,
      error:
        auth.status === 401
          ? "Please sign in to upload promotional banners."
          : "You don't have permission to upload promotional banners.",
    };
  }

  if (byteLength <= 0 || byteLength > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `Banner must be between 1 byte and ${MAX_IMAGE_BYTES / (1024 * 1024)} MB.`,
    };
  }

  const key = `promotions/${auth.vendorId}/${crypto.randomUUID()}.webp`;
  const storage = getStorage();
  const url = await storage.presignPut(key, IMAGE_CONTENT_TYPE, PRESIGN_TTL_SECONDS);

  return { ok: true, value: { url, key } };
}
