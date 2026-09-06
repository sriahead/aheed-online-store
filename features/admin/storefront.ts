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
import { updateVendorLogoKey, updateVendorStorefrontConfig } from "@/lib/vendor-service";
import type { VendorStorefrontConfigInput } from "@/lib/repositories/vendor";
import { parseDeliveryRules, type DeliveryRulesFormState } from "@/lib/delivery-rules-form";
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

  await updateVendorLogoKey(auth.vendorId, key);

  revalidatePath("/staff/storefront");
  revalidatePath("/", "layout");
  return { ok: true, value: undefined };
}

export async function updateStorefrontConfig(
  data: VendorStorefrontConfigInput,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: refusal(auth.status) };

  await updateVendorStorefrontConfig(auth.vendorId, data);

  revalidatePath("/staff/storefront");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Save this store's delivery rules (P9.2, #634).
 *
 * Separate from `updateStorefrontConfig` above rather than folded into it, for two reasons. The
 * branding form submits without these fields and must keep leaving them alone — one action taking
 * an optional group would make "not submitted" and "cleared" the same shape at the call site. And
 * these three need a FIELD-LEVEL error to render against the input that caused it, which the
 * branding form's fire-and-forget `useTransition` shape cannot express.
 *
 * Validation lives in `lib/delivery-rules-form.ts`, DB-free and unit-tested. It matters more here
 * than on a normal settings screen: `lib/order-totals.ts` reads all three on the checkout path, so
 * until #634 their only writer was `prisma/seed.ts` and a bad value could not exist.
 *
 * The vendor comes from the session — `requireVendorRole("ADMIN")` — and is never taken from the
 * submission, so there is no vendor field for a caller to forge.
 */
export async function updateDeliveryRules(
  _prev: DeliveryRulesFormState,
  formData: FormData,
): Promise<DeliveryRulesFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { error: refusal(auth.status), field: null, saved: false };

  const parsed = parseDeliveryRules({
    deliveryFee: String(formData.get("deliveryFee") ?? ""),
    freeDeliveryThreshold: String(formData.get("freeDeliveryThreshold") ?? ""),
    minimumOrder: String(formData.get("minimumOrder") ?? ""),
  });

  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  // Only the three delivery columns are passed. `bannerNote`/`heroSubtitle` are
  // omitted entirely rather than sent as null, so Prisma leaves the vendor's
  // copy untouched — this action has no business rewriting it.
  await updateVendorStorefrontConfig(auth.vendorId, parsed.value);

  revalidatePath("/staff/storefront");
  revalidatePath("/", "layout");
  return { error: null, field: null, saved: true };
}
