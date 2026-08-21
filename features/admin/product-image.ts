"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getStorage } from "@/lib/storage";
import {
  IMAGE_CONTENT_TYPE,
  MAX_IMAGE_BYTES,
  buildProductImageKey,
  isProductImageKey,
  type ImageActionResult,
  type UploadTicket,
} from "@/lib/product-image";
import {
  addProductImage as addProductImageRow,
  getProductForAdmin,
  promoteProductImage as promoteProductImageRow,
  removeProductImage as removeProductImageRow,
  reorderProductImages as reorderProductImagesRow,
  setPrimaryProductImage,
  approveProductImageRow,
} from "@/lib/repositories/products";

/**
 * Product image upload actions (P6b2, #167) — the image half of the catalogue
 * write path P6b1 opened for fields.
 *
 * ONLY ASYNC FUNCTIONS MAY BE EXPORTED FROM THIS FILE. Next validates a
 * "use server" module's ENTIRE export set the moment any one action in it is
 * dispatched, so a single exported constant makes every action here 500 for
 * every caller — and `next build`, `tsc --noEmit` and `npm test` all stay green
 * while it does. That is exactly how P6b1 (#159) shipped a broken write path to
 * its own validation stage. Constants and types live in lib/product-image.ts;
 * module-level values below are deliberately NOT exported.
 *
 * Each action runs `requireVendorRole("ADMIN")` itself. A server action is a
 * public endpoint at a stable, build-time id — anyone who has loaded the page
 * once can POST to it forever — so the page's own check protects the page, not
 * these. Same posture as P6b1's saveProduct and P4b's advance-status.
 *
 * The two actions are deliberately independent: attachProductImage re-runs every
 * check requestImageUpload made, because nothing guarantees they were called by
 * the same person, in that order, or at all.
 */

/**
 * Five minutes. Long enough for a slow phone upload, short enough that a URL
 * leaked out of a browser history is useless by the time anyone finds it.
 */
const PRESIGN_TTL_SECONDS = 300;

/**
 * One refusal for "no such product in this vendor" AND for "no such product
 * anywhere". A distinct message would turn this action into an oracle telling
 * one vendor's admin which product ids exist in another's catalogue.
 */
const NOT_FOUND = "That product no longer exists.";

function refusal(status: 401 | 403): string {
  return status === 401
    ? "Please sign in as a store admin to manage product images."
    : "You don't have permission to manage this store's product images.";
}

/**
 * Presign a single upload for one product.
 *
 * Takes NO key and NO filename — only the product and how many bytes the client
 * intends to send. The key is built here, from the product id this vendor was
 * proven to own. If the caller could name the key, an admin of one vendor could
 * obtain a perfectly valid signature for a PUT over ANOTHER vendor's object: a
 * signature proves who is asking, never what they should be allowed to ask for.
 */
export async function requestImageUpload(
  productId: string,
  byteLength: number,
): Promise<ImageActionResult<UploadTicket>> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: refusal(auth.status) };

  // Checked before the product lookup so an oversized file costs no query, and
  // enforced again after upload by headObject — the client's claim about its own
  // size is a courtesy, not evidence.
  if (!Number.isInteger(byteLength) || byteLength <= 0 || byteLength > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `Images must be under ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`,
    };
  }

  const product = await getProductForAdmin(auth.vendorId, productId);
  if (!product) return { ok: false, error: NOT_FOUND };

  const key = buildProductImageKey(product.id);
  const url = await getStorage().presignPut(key, IMAGE_CONTENT_TYPE, PRESIGN_TTL_SECONDS);

  return { ok: true, value: { url, key } };
}

/**
 * Record an upload that has already landed, after proving it actually did.
 *
 * A presigned PUT cannot police a body the Worker never sees, so this asks
 * storage what arrived — it must exist, be a WebP, and be within the cap —
 * before any row changes. Bytes are written before the row deliberately: the
 * reverse order risks a ProductImage row pointing at an object that was never
 * uploaded, which is a visibly broken product page, where this order risks
 * orphaned bytes, which are invisible and tracked in #174.
 */
export async function attachProductImage(
  productId: string,
  storageKey: string,
  alt: string,
): Promise<ImageActionResult<{ url: string }>> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: refusal(auth.status) };

  const product = await getProductForAdmin(auth.vendorId, productId);
  if (!product) return { ok: false, error: NOT_FOUND };

  // The key came from the client, so it is proven to be one we could have issued
  // for THIS product rather than trusted. Refused, never normalised: a key that
  // needs normalising was not generated here.
  if (!isProductImageKey(storageKey, product.id)) {
    return { ok: false, error: "That upload doesn't belong to this product." };
  }

  const head = await getStorage().headObject(storageKey);
  if (!head) {
    return { ok: false, error: "That upload didn't arrive — please try again." };
  }
  if (head.contentType !== IMAGE_CONTENT_TYPE) {
    return { ok: false, error: "That upload isn't a WebP image." };
  }
  if (head.contentLength !== null && head.contentLength > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `Images must be under ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`,
    };
  }

  const result = await setPrimaryProductImage(auth.vendorId, product.id, storageKey, alt);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/staff/products/${product.id}`);
  revalidatePath("/staff/products");
  // The storefront renders this image by slug, and category pages list the card.
  revalidatePath(`/products/${product.slug}`);
  revalidatePath("/categories", "layout");

  // The public URL is composed HERE. lib/storage carries the aws4fetch signer,
  // so the browser uploader must never import it to build this itself.
  return { ok: true, value: { url: getStorage().publicUrl(storageKey) } };
}

function revalidateProductSurfaces(productId: string, slug: string): void {
  revalidatePath(`/staff/products/${productId}`);
  revalidatePath("/staff/products");
  revalidatePath(`/products/${slug}`);
  revalidatePath("/categories", "layout");
}

/**
 * Add a second (or third, ...) image — #211's actual gap: attachProductImage
 * above only ever repoints the primary. Same upload precondition as
 * attachProductImage (a presigned PUT cannot police a body the Worker never
 * sees, so this asks storage what actually landed before any row changes).
 */
export async function addProductImage(
  productId: string,
  storageKey: string,
  alt: string,
): Promise<ImageActionResult<{ url: string }>> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: refusal(auth.status) };

  const product = await getProductForAdmin(auth.vendorId, productId);
  if (!product) return { ok: false, error: NOT_FOUND };

  if (!isProductImageKey(storageKey, product.id)) {
    return { ok: false, error: "That upload doesn't belong to this product." };
  }

  const head = await getStorage().headObject(storageKey);
  if (!head) {
    return { ok: false, error: "That upload didn't arrive — please try again." };
  }
  if (head.contentType !== IMAGE_CONTENT_TYPE) {
    return { ok: false, error: "That upload isn't a WebP image." };
  }
  if (head.contentLength !== null && head.contentLength > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `Images must be under ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`,
    };
  }

  const result = await addProductImageRow(auth.vendorId, product.id, storageKey, alt);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateProductSurfaces(product.id, product.slug);
  return { ok: true, value: { url: getStorage().publicUrl(storageKey) } };
}

/** Promote an existing image to primary — moves isPrimary, never touches storageKey. */
export async function promoteProductImage(
  productId: string,
  imageId: string,
): Promise<ImageActionResult<null>> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: refusal(auth.status) };

  const result = await promoteProductImageRow(auth.vendorId, productId, imageId);
  if (!result.ok) return { ok: false, error: result.error };

  const product = await getProductForAdmin(auth.vendorId, productId);
  if (product) revalidateProductSurfaces(product.id, product.slug);
  return { ok: true, value: null };
}

/**
 * Remove an image: deletes its row, then its storage object. The repository
 * call is DB-only (Presentation -> Service -> Repository -> Prisma,
 * specs/architecture.md) — this Service-layer action is what's allowed to
 * know both ProductRepository and StorageService exist, matching how
 * attachProductImage above calls headObject itself rather than teaching the
 * repository about storage.
 */
export async function removeProductImage(
  productId: string,
  imageId: string,
): Promise<ImageActionResult<null>> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: refusal(auth.status) };

  const result = await removeProductImageRow(auth.vendorId, productId, imageId);
  if (!result.ok) return { ok: false, error: result.error };

  await getStorage().deleteObject(result.storageKey);

  const product = await getProductForAdmin(auth.vendorId, productId);
  if (product) revalidateProductSurfaces(product.id, product.slug);
  return { ok: true, value: null };
}

/** Reorder a product's images to the given id order. */
export async function reorderProductImages(
  productId: string,
  orderedImageIds: string[],
): Promise<ImageActionResult<null>> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: refusal(auth.status) };

  const result = await reorderProductImagesRow(auth.vendorId, productId, orderedImageIds);
  if (!result.ok) return { ok: false, error: result.error };

  const product = await getProductForAdmin(auth.vendorId, productId);
  if (product) revalidateProductSurfaces(product.id, product.slug);
  return { ok: true, value: null };
}

export async function approveProductImage(productId: string): Promise<ImageActionResult<null>> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { ok: false, error: refusal(auth.status) };

  const result = await approveProductImageRow(auth.vendorId, productId);
  if (!result.ok) return { ok: false, error: result.error };

  const product = await getProductForAdmin(auth.vendorId, productId);
  if (product) revalidateProductSurfaces(product.id, product.slug);
  return { ok: true, value: null };
}
