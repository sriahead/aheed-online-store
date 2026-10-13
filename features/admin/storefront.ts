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
import {
  applyVendorTheme,
  updateVendorLogoKey,
  updateVendorMarkKey,
  replaceVendorFooterHours,
  saveVendorHoursOverride,
  deleteVendorHoursOverride,
  updateVendorStorefrontConfig,
} from "@/lib/vendor-service";
import type { VendorStorefrontConfigInput, BrandPrimitives } from "@/lib/repositories/vendor";
import { parseDeliveryRules, type DeliveryRulesFormState } from "@/lib/delivery-rules-form";
import { parseSocialContact, type SocialContactFormState } from "@/lib/social-contact-form";
import {
  parseCatalogueSettings,
  type CatalogueSettingsFormState,
} from "@/lib/catalogue-settings-form";
import {
  parseBrandColourForm,
  parseBrandPrimitives,
  type BrandColourFormState,
} from "@/lib/brand-colour-form";
import {
  parseProductGridDensity,
  type ProductGridDensityFormState,
} from "@/lib/product-grid-density";
import { parseFooterContact, type FooterContactFormState } from "@/lib/footer-contact-form";
import {
  OVERRIDE_CLOSE_FIELD,
  OVERRIDE_CLOSED_FIELD,
  OVERRIDE_DATE_FIELD,
  OVERRIDE_ID_FIELD,
  OVERRIDE_LABEL_FIELD,
  OVERRIDE_OPEN_FIELD,
  PAYMENT_BADGE_FIELD,
  WEEKDAYS,
  parseHoursOverride,
  parseWeeklyHours,
  weekdayCloseField,
  weekdayClosedField,
  weekdayOpenField,
  type FooterHoursFormState,
  type HoursOverrideFormState,
} from "@/lib/footer-hours-form";
import { calendarDayInZone } from "@/lib/local-datetime";
import { isUniqueViolation } from "@/lib/repositories/prisma-errors";
import {
  MARK_CONTENT_TYPE,
  MARK_FILES,
  buildVendorMarkFolder,
  isVendorMarkKey,
  markFileKeys,
  type MarkFileId,
} from "@/lib/vendor-mark";
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

/**
 * #1069 — presign the five PNGs of one square-mark upload, all under one fresh folder.
 *
 * Each length is checked before anything is presigned, so a refused set signs nothing. The
 * returned `markStorageKey` is the `512.png` key — the one `attachVendorMark` takes back.
 */
export async function requestMarkUpload(byteLengths: Record<MarkFileId, number>): Promise<
  ImageActionResult<{
    markStorageKey: string;
    uploads: Record<MarkFileId, string>;
  }>
> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: refusal(auth.status) };

  for (const file of MARK_FILES) {
    const length = byteLengths?.[file.id];
    if (!Number.isInteger(length) || length <= 0 || length > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        error: `Images must be under ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`,
      };
    }
  }

  const folder = buildVendorMarkFolder(auth.vendorId);
  const storage = getStorage();
  const entries = await Promise.all(
    MARK_FILES.map(
      async (file) =>
        [
          file.id,
          await storage.presignPut(
            `${folder}/${file.name}`,
            MARK_CONTENT_TYPE,
            PRESIGN_TTL_SECONDS,
          ),
        ] as const,
    ),
  );

  return {
    ok: true,
    value: {
      markStorageKey: `${folder}/512.png`,
      uploads: Object.fromEntries(entries) as Record<MarkFileId, string>,
    },
  };
}

/**
 * #1069 — attach an uploaded square mark, or attach nothing.
 *
 * All five files are checked before the column is written. If any is missing, is not a PNG or is
 * over the size limit, every one of the five that DOES exist is deleted and nothing is written —
 * a half set would give a vendor a favicon with no home-screen icon, or a header mark that 404s.
 * The ownership check runs first and touches no storage at all, so a key under another vendor's
 * prefix can neither be attached nor probed.
 */
export async function attachVendorMark(markStorageKey: string): Promise<ImageActionResult<void>> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: refusal(auth.status) };

  const keys =
    typeof markStorageKey === "string" && isVendorMarkKey(markStorageKey, auth.vendorId)
      ? markFileKeys(markStorageKey)
      : null;
  if (!keys) {
    return { ok: false, error: "Invalid upload key." };
  }

  const storage = getStorage();
  const heads = await Promise.all(
    MARK_FILES.map(async (file) => ({
      key: keys[file.id],
      head: await storage.headObject(keys[file.id]),
    })),
  );

  const problem = heads.find(
    ({ head }) =>
      !head ||
      head.contentType !== MARK_CONTENT_TYPE ||
      (head.contentLength !== null && head.contentLength > MAX_IMAGE_BYTES),
  );
  if (problem) {
    await Promise.all(heads.filter(({ head }) => head).map(({ key }) => storage.deleteObject(key)));
    return {
      ok: false,
      error: !problem.head
        ? "The upload was incomplete — please try again."
        : problem.head.contentType !== MARK_CONTENT_TYPE
          ? "Images must be uploaded as PNG."
          : "The uploaded file exceeded the size limit.",
    };
  }

  await updateVendorMarkKey(auth.vendorId, markStorageKey);

  revalidatePath("/staff/storefront");
  revalidatePath("/", "layout");
  return { ok: true, value: undefined };
}

export async function updateStorefrontConfig(
  prevState: BrandColourFormState,
  formData: FormData,
): Promise<BrandColourFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ...prevState, error: refusal(auth.status), saved: false };

  const parsed = parseBrandColourForm(formData);
  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  await updateVendorStorefrontConfig(auth.vendorId, parsed.value);

  revalidatePath("/staff/storefront");
  revalidatePath("/", "layout");
  return { error: null, field: null, saved: true };
}

/**
 * Apply a seeded theme or custom theme (#75, #714) — copies its eight brand primitives onto this vendor's
 * `VendorBranding` row. The vendor comes from the session, never from the submission,
 * same as every other action in this file.
 */
export async function applyStorefrontTheme(
  themeRef: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: refusal(auth.status) };

  const result = await applyVendorTheme(auth.vendorId, themeRef);
  if (!result.ok) return { ok: false, error: "That theme could not be found." };

  revalidatePath("/staff/storefront");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Save current colours as a reusable vendor theme (#714).
 * Returns an error if the name is already used by this vendor.
 */
export async function saveStorefrontTheme(
  name: string,
  primitives: BrandPrimitives,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: refusal(auth.status) };

  if (!name || name.trim() === "") {
    return { ok: false, error: "Theme name cannot be empty." };
  }

  // #782 — the theme path writes the same eight colour columns the branding form does, and
  // was never validated. `#713` closed the form; this closes the second writer. Reuses that
  // slice's validator rather than a parallel one.
  const parsed = parseBrandPrimitives(primitives);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error.message };
  }

  try {
    await import("@/lib/vendor-service").then((m) =>
      m.saveVendorTheme(auth.vendorId, name.trim(), parsed.value),
    );
  } catch (err: unknown) {
    // #782 — this checked `P2002` directly, which is what the WEBSOCKET adapter throws.
    // `saveVendorTheme` runs through `getPrisma()` (HTTP), which surfaces a unique-constraint
    // violation as the raw Postgres SQLSTATE `23505`, so this branch could never fire and a
    // duplicate name produced the generic message below. The shared predicate accepts both.
    if (isUniqueViolation(err)) {
      return { ok: false, error: "You already have a saved theme with that name." };
    }
    return { ok: false, error: "An unexpected error occurred saving the theme." };
  }

  revalidatePath("/staff/storefront");
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
    offerCollection: formData.get("offerCollection") === "on",
    addressLine1: String(formData.get("collectionAddressLine1") ?? ""),
    addressLine2: String(formData.get("collectionAddressLine2") ?? ""),
    city: String(formData.get("collectionCity") ?? ""),
    postcode: String(formData.get("collectionPostcode") ?? ""),
  });

  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  // Only the three delivery columns are passed. `bannerNote`/`heroSubtitle` and the three social
  // columns are omitted entirely rather than sent as null, so Prisma leaves the vendor's copy and
  // contact links untouched — this action has no business rewriting either.
  await updateVendorStorefrontConfig(auth.vendorId, parsed.value);

  revalidatePath("/staff/storefront");
  revalidatePath("/", "layout");
  return { error: null, field: null, saved: true };
}

/**
 * Save this store's social and contact links (P9.2, #407 / #405).
 *
 * Its own action and its own form, for the same two reasons `updateDeliveryRules` is separate: the
 * branding form submits without these fields and must keep leaving them alone, and an invalid URL
 * needs a FIELD-LEVEL error rendered against the input that caused it — which the branding form's
 * fire-and-forget `useTransition` shape cannot express.
 *
 * Validation lives in `lib/social-contact-form.ts`, DB-free and unit-tested. It is load-bearing
 * here in a way the copy fields never were: these three values land inside an `href`, so the
 * parser accepts exactly one URL scheme (`https:`) rather than checking the value merely looks
 * like a link. A stored `javascript:` URL would be a live script link for every visitor.
 *
 * The vendor comes from the session — `requireVendorRole("ADMIN")` — and is never taken from the
 * submission, so there is no vendor field for a caller to forge.
 */
export async function updateSocialContact(
  _prev: SocialContactFormState,
  formData: FormData,
): Promise<SocialContactFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { error: refusal(auth.status), field: null, saved: false };

  const parsed = parseSocialContact({
    facebookUrl: String(formData.get("facebookUrl") ?? ""),
    instagramUrl: String(formData.get("instagramUrl") ?? ""),
    whatsappNumber: String(formData.get("whatsappNumber") ?? ""),
  });

  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  await updateVendorStorefrontConfig(auth.vendorId, parsed.value);

  revalidatePath("/staff/storefront");
  revalidatePath("/", "layout");
  return { error: null, field: null, saved: true };
}

/**
 * Save which product labels the staff product form offers, and the store description the AI
 * prompts are given (#905).
 *
 * Its own action and its own form, for the same reason `updateDeliveryRules` and
 * `updateSocialContact` are separate: every other form submits without these seven fields and must
 * keep leaving them alone. Validation (HMC needs Halal; a one-line description of at most 200
 * characters) lives in `lib/catalogue-settings-form.ts`, DB-free and unit-tested.
 *
 * Switching a label off here changes what the product form OFFERS, not what any product stores —
 * `saveProduct` strips a disabled label from its write, so nothing is cleared by this save.
 *
 * The vendor comes from the session — `requireVendorRole("ADMIN")` — never from the submission.
 */
export async function updateCatalogueSettings(
  _prev: CatalogueSettingsFormState,
  formData: FormData,
): Promise<CatalogueSettingsFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { error: refusal(auth.status), field: null, saved: false };

  const checkbox = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  };
  const parsed = parseCatalogueSettings({
    showHalalLabel: checkbox("showHalalLabel"),
    showFreshLabel: checkbox("showFreshLabel"),
    showOrganicLabel: checkbox("showOrganicLabel"),
    showVegetarianLabel: checkbox("showVegetarianLabel"),
    showGlutenFreeLabel: checkbox("showGlutenFreeLabel"),
    showHmcCertification: checkbox("showHmcCertification"),
    storeDescription: String(formData.get("storeDescription") ?? ""),
  });

  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  await updateVendorStorefrontConfig(auth.vendorId, parsed.value);

  revalidatePath("/staff/storefront");
  revalidatePath("/staff/products", "layout");
  revalidatePath("/", "layout");
  return { error: null, field: null, saved: true };
}

/**
 * Save this vendor's product listing density (#962), one of the presets in
 * `lib/product-grid-density.ts`.
 *
 * Its own action and its own form, for the same reason `updateCatalogueSettings` is: every other
 * storefront form submits without this field and must keep leaving it alone. An unknown value is
 * refused, not coerced, and nothing is written.
 *
 * The vendor comes from the session — `requireVendorRole("ADMIN")` — never from the submission.
 */
export async function updateProductGridDensity(
  _prev: ProductGridDensityFormState,
  formData: FormData,
): Promise<ProductGridDensityFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { error: refusal(auth.status), saved: false };

  const parsed = parseProductGridDensity(formData.get("productGridDensity"));
  if (!parsed.ok) return { error: parsed.error.message, saved: false };

  await updateVendorStorefrontConfig(auth.vendorId, { productGridDensity: parsed.value });

  revalidatePath("/staff/storefront");
  revalidatePath("/", "layout");
  return { error: null, saved: true };
}

/**
 * Save the storefront footer's contact & legal details (#1055).
 *
 * Its own action and its own form, for the reason every form on this page is separate: the others
 * submit without these seven fields and must keep leaving them alone, and a bad email needs a
 * FIELD-LEVEL error against the input that caused it. Validation lives in
 * `lib/footer-contact-form.ts`, DB-free and unit-tested.
 *
 * The vendor comes from the session — `requireVendorRole("ADMIN")` — never from the submission.
 */
export async function updateFooterContact(
  _prev: FooterContactFormState,
  formData: FormData,
): Promise<FooterContactFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { error: refusal(auth.status), field: null, saved: false };

  const checkbox = formData.get("showSecureCheckoutNote");
  const parsed = parseFooterContact({
    contactPhone: String(formData.get("contactPhone") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
    companyNumber: String(formData.get("companyNumber") ?? ""),
    vatNumber: String(formData.get("vatNumber") ?? ""),
    registeredOffice: String(formData.get("registeredOffice") ?? ""),
    openingHoursNote: String(formData.get("openingHoursNote") ?? ""),
    showSecureCheckoutNote: typeof checkbox === "string" ? checkbox : null,
  });

  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  // Only the seven footer columns are passed; every other config field is omitted (undefined), so
  // Prisma leaves branding, delivery rules and social links untouched.
  await updateVendorStorefrontConfig(auth.vendorId, parsed.value);

  revalidatePath("/staff/storefront");
  revalidatePath("/", "layout");
  return { error: null, field: null, saved: true };
}

/**
 * Save the storefront footer's weekly opening hours and payment badges (#1055, #1060).
 *
 * The submission is the COMPLETE set for both: the repository deletes and re-inserts this vendor's
 * rows in one WebSocket transaction (`createMany` cannot run over the HTTP adapter, #382), so a
 * failure leaves the previous set intact rather than an empty footer. A weekday left blank (and not
 * ticked closed) is "not set", and the footer omits it.
 *
 * The vendor comes from the session — `requireVendorRole("ADMIN")` — never from the submission.
 */
export async function updateFooterHours(
  _prev: FooterHoursFormState,
  formData: FormData,
): Promise<FooterHoursFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { error: refusal(auth.status), field: null, saved: false };

  const parsed = parseWeeklyHours({
    days: WEEKDAYS.map(({ dayOfWeek }) => ({
      dayOfWeek,
      open: String(formData.get(weekdayOpenField(dayOfWeek)) ?? ""),
      close: String(formData.get(weekdayCloseField(dayOfWeek)) ?? ""),
      closed: formData.get(weekdayClosedField(dayOfWeek)) === "on",
    })),
    badges: formData.getAll(PAYMENT_BADGE_FIELD).map(String),
  });

  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  await replaceVendorFooterHours(auth.vendorId, parsed.value);

  revalidatePath("/staff/storefront");
  revalidatePath("/", "layout");
  return { error: null, field: null, saved: true };
}

/**
 * Save one holiday / closure date (#1060). Saving a date that already has an override replaces it;
 * that is how an admin edits one. "Today" is the store's calendar day (`STORE_TIMEZONE`), never the
 * server's UTC date.
 *
 * The vendor comes from the session — `requireVendorRole("ADMIN")` — never from the submission.
 */
export async function saveHoursOverride(
  _prev: HoursOverrideFormState,
  formData: FormData,
): Promise<HoursOverrideFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { error: refusal(auth.status), field: null, saved: false };

  const today = calendarDayInZone(new Date());
  const parsed = parseHoursOverride(
    {
      date: String(formData.get(OVERRIDE_DATE_FIELD) ?? ""),
      label: String(formData.get(OVERRIDE_LABEL_FIELD) ?? ""),
      open: String(formData.get(OVERRIDE_OPEN_FIELD) ?? ""),
      close: String(formData.get(OVERRIDE_CLOSE_FIELD) ?? ""),
      closed: formData.get(OVERRIDE_CLOSED_FIELD) === "on",
    },
    today,
  );

  if (!parsed.ok) {
    return { error: parsed.error.message, field: parsed.error.field, saved: false };
  }

  const result = await saveVendorHoursOverride(auth.vendorId, today, parsed.value);
  if (!result.ok) {
    return {
      error: "You already have 50 upcoming dates. Delete one before adding another.",
      field: OVERRIDE_DATE_FIELD,
      saved: false,
    };
  }

  revalidatePath("/staff/storefront");
  revalidatePath("/", "layout");
  return { error: null, field: null, saved: true };
}

/**
 * Delete one holiday / closure date (#1060). The repository scopes the delete by the session's
 * vendor as well as the id, so an id belonging to another vendor deletes nothing.
 */
export async function deleteHoursOverride(
  _prev: HoursOverrideFormState,
  formData: FormData,
): Promise<HoursOverrideFormState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { error: refusal(auth.status), field: null, saved: false };

  const id = String(formData.get(OVERRIDE_ID_FIELD) ?? "");
  if (id === "") return { error: "Nothing to delete.", field: null, saved: false };

  await deleteVendorHoursOverride(auth.vendorId, id);

  revalidatePath("/staff/storefront");
  revalidatePath("/", "layout");
  return { error: null, field: null, saved: true };
}
