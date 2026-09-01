/**
 * Product image rules (P6b2, #167) — pure, DB-free, session-free.
 *
 * Same posture as lib/catalogue-form.ts (P6b1), lib/staff-orders-query.ts (P6a)
 * and lib/shopping-list.ts (P3d): every decision about what a key MEANS and what
 * an image may BE lives where a test can reach it without a database, a session
 * or a request. features/admin/product-image.ts does the auth, the signing and
 * the repository calls; nothing here knows any of those exist.
 *
 * This module is imported by BOTH the server actions and the browser uploader,
 * which is the other reason it holds no imports: lib/storage.ts carries the
 * aws4fetch signer, and a client component pulling this file must not drag that
 * into the browser bundle.
 */

/** The only content type this slice will sign for, store, or accept back. */
export const IMAGE_CONTENT_TYPE = "image/webp";

/**
 * 2 MiB. A 1200px WebP at quality 0.82 lands around 150-300 KB, so this is
 * roughly ten times the expected size — generous enough that no legitimate
 * photo is refused, small enough that it is still a cap.
 */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Longest edge after downscaling. The storefront never renders larger than this. */
export const MAX_IMAGE_EDGE_PX = 1200;

/** WebP encoder quality. 0.82 is the knee of the size/artefact curve for photos. */
export const IMAGE_QUALITY = 0.82;

/** Lowercase v4 UUID, exactly as crypto.randomUUID() emits it. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SUFFIX = ".webp";

/**
 * `products/{productId}/{uuid}.{ext}` — a NEW key every time.
 *
 * The extension follows the image's ACTUAL content type (#364). It defaults to
 * `.webp` because the browser-upload path is WebP end to end (its presigned PUT
 * is pinned to `IMAGE_CONTENT_TYPE` and attach re-checks `headObject`), so that
 * path's keys are unchanged. The AI and cross-environment copy paths pass the
 * real type, which is how a PNG stops being stored under a `.webp` key.
 *
 * Immutable by construction: replacing a product's image writes a new object and
 * repoints the row, so no CDN cache purge is ever needed. Overwriting at a fixed
 * key would need one, which would mean a purge-scoped Cloudflare token as a new
 * Worker secret and a vendor-specific call inside a deliberately vendor-agnostic
 * port (ADR-003). Keyed on the product id rather than the slug because P6b1 made
 * slugs editable.
 */
export function buildProductImageKey(
  productId: string,
  contentType: string = IMAGE_CONTENT_TYPE,
): string {
  return `products/${productId}/${crypto.randomUUID()}${imageExtensionForContentType(contentType)}`;
}

/**
 * The file extension for an image's ACTUAL content type (#364).
 *
 * This exists because the key used to lie. `buildProductImageKey` and
 * `buildCampaignImageKey` always suffixed `.webp`, but the AI paths store what
 * Workers AI returns — PNG — and the Open Food Facts path stores whatever the
 * remote server sent. The object was written with its real content type, so the
 * CDN served it correctly and nothing was visibly broken; the key simply
 * asserted a format the bytes were not. This repo's standing rule is that image
 * keys are meaningful and immutable, and a meaningful key cannot also be wrong.
 *
 * DEFAULTS TO WEBP AT THE CALL SITE, NOT HERE. The browser-upload path pins its
 * presigned PUT to `IMAGE_CONTENT_TYPE` and re-checks `headObject` on attach, so
 * it is WebP end to end and its keys are unchanged by this. Only the server-side
 * AI and copy paths pass anything else.
 *
 * An unrecognised type gets `.bin` rather than falling back to `.webp`, which
 * would quietly reintroduce exactly the lie this function was written to remove.
 * The extension is cosmetic to serving — the CDN answers on the stored content
 * type — so an honest `.bin` costs nothing and is a visible signal that
 * something unexpected arrived.
 */
export function imageExtensionForContentType(contentType: string | null | undefined): string {
  // Strip any parameters (`image/jpeg; charset=binary`) and normalise case.
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  switch (type) {
    case "image/webp":
      return ".webp";
    case "image/png":
      return ".png";
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/svg+xml":
      return ".svg";
    case "image/avif":
      return ".avif";
    case "image/gif":
      return ".gif";
    default:
      return ".bin";
  }
}

/**
 * Is this exactly a key THIS function could have produced for THIS product?
 *
 * The attach action re-derives nothing from the client, but it does receive the
 * key the browser claims to have uploaded, so the key has to be proven to belong
 * to the product being edited. Anything else — another product's id, a traversal
 * segment, a different suffix, an extra path segment, a leading slash — is
 * refused rather than normalised, because a key that needs normalising is a key
 * that was not generated here.
 *
 * DELIBERATELY STILL WEBP-ONLY after #364 let the builder emit other extensions.
 * This guards exactly one path — the browser upload, whose presigned PUT is
 * pinned to `IMAGE_CONTENT_TYPE` and whose attach step re-checks `headObject`'s
 * content type — so it is WebP end to end. Server-generated keys never pass
 * through here, so accepting other extensions would widen what a client may
 * claim and buy nothing.
 */
export function isProductImageKey(key: string, productId: string): boolean {
  const parts = key.split("/");
  if (parts.length !== 3) return false;

  const [prefix, id, file] = parts;
  if (prefix !== "products") return false;
  if (id !== productId) return false;
  if (!file.endsWith(SUFFIX)) return false;

  return UUID_PATTERN.test(file.slice(0, -SUFFIX.length));
}

/**
 * Scale (width, height) down so the longest edge is at most `maxEdge`, keeping
 * the aspect ratio. Never scales UP — a small image stays its own size rather
 * than being blown up to the cap.
 *
 * Pure and exported so R22's dimension rule is unit-testable without a canvas:
 * the browser has the only <canvas>, but it should not also hold the only copy
 * of the arithmetic.
 */
export function fitWithinEdge(
  width: number,
  height: number,
  maxEdge: number = MAX_IMAGE_EDGE_PX,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };

  const scale = maxEdge / longest;
  return {
    // round, not floor: floor turns a 1200x1200 source into 1200x1199 for some
    // ratios, which reads as an off-by-one bug in every screenshot afterwards.
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * The filename both seed paths write for a shared placeholder object:
 * `products/{slug}/main.svg` for a curated product, and
 * `products/gen-{categorySlug}/main.svg` for the generated catalogue, where a
 * whole subcategory shares one object.
 */
export const PLACEHOLDER_IMAGE_SUFFIX = "/main.svg";

/**
 * Is this key a seeded placeholder rather than a real product image? (#502)
 *
 * The distinction the "Auto-fill Missing Images" job actually needs. Its
 * original predicate asked for products with NO `ProductImage` row, which
 * matched nothing at all: the seed gives every product a placeholder row, so
 * `images: { none: {} }` returned 0 for both vendors while thousands of cards
 * rendered a grey "No image" box.
 *
 * Derived from the key's SHAPE rather than a database column, deliberately.
 * `buildProductImageKey` always ends its filename with a UUID plus an
 * extension, so a real image can never end in `main.svg` and no migration is
 * needed to tell the two apart. (This said "only ever emits `.webp`" until
 * #364, which let the extension follow the real content type — the reasoning is
 * unchanged, because what distinguishes a placeholder is the `main` stem, not
 * the extension.) Pure and exported for the same reason as everything else in
 * this file: the rule deciding what counts as "needs a real image" should be
 * checkable without a database.
 *
 * `PLACEHOLDER_IMAGE_SUFFIX` is exported alongside it because
 * `lib/repositories/products.ts` needs the same rule inside a Prisma `where`
 * (as an `endsWith` filter) rather than as a predicate over already-fetched
 * rows. Both spellings read the one constant, so the SQL filter and the
 * in-memory check cannot drift apart.
 */
export function isPlaceholderImageKey(key: string): boolean {
  return key.endsWith(PLACEHOLDER_IMAGE_SUFFIX);
}

/**
 * How many failed pipeline attempts before a product stops being offered for
 * automatic image filling (#523).
 *
 * Some products can never succeed. Workers AI returns
 * `AiError: Input prompt contains NSFW content` for `Halal Chicken Thighs 1kg`
 * on every attempt — a false positive on a raw-meat name, and this store is a
 * halal butcher, so the names most exposed to it are exactly its defining
 * department. `getProductsWithoutImages` is newest-first and BOUNDED, so
 * without a give-up rule one such product is re-selected on every scheduled
 * run, consumes a slot, fails, and the genuinely fillable backlog behind it is
 * never reached — while the job reports success.
 *
 * Three rather than one because the same filter is demonstrably flaky in both
 * directions: `Gulab Jamun 1kg` and `Extra Noodles 1L` were each refused once
 * and then accepted on a retry. One strike would give up on products that do
 * work; a large number would defeat the purpose.
 *
 * Lives here, pure, so the threshold is testable without a database — and so
 * the repository filter and any future admin surface read one constant rather
 * than two literals that can drift.
 */
export const MAX_IMAGE_ATTEMPT_FAILURES = 3;

/** Has this product exhausted its automatic image-fill attempts? (#523) */
export function hasExhaustedImageAttempts(failures: number): boolean {
  return failures >= MAX_IMAGE_ATTEMPT_FAILURES;
}

/** What `requestImageUpload` hands back on success. */
export interface UploadTicket {
  /** Presigned, short-lived, single-key PUT URL. */
  url: string;
  /** The key the server chose — the client echoes it back to `attachProductImage`. */
  key: string;
}

/** Both actions return refusals as data, matching lib/auth-rbac.ts's posture. */
export type ImageActionResult<T> = { ok: true; value: T } | { ok: false; error: string };
