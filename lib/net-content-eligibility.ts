import type { Prisma } from "@prisma/client";
import { isPhotoEvidenceSource, type ProductImageSource } from "@/lib/product-image";

/**
 * #900 (R14) — which products the net-content suggester may attempt, and which photo (if any) it
 * may show the model. Both rules are pure so they are unit-tested without a database; the
 * repository and script only apply them.
 */

export interface EligibilityOptions {
  /** Re-attempt products whose earlier suggestions are all settled (none PENDING). */
  includeAttempted: boolean;
  /** Narrow to one product (still subject to every other rule). */
  productId?: string | null;
}

/**
 * Active, no net content yet, never a product with a PENDING suggestion waiting for staff, and —
 * by default — never a product attempted before, so a NO_ANSWER or a rejection is not re-sent on
 * every run. `includeAttempted` lifts only that last rule (e.g. after staff confirm a photo).
 */
export function buildEligibleProductWhere(
  vendorId: string,
  options: EligibilityOptions,
): Prisma.ProductWhereInput {
  return {
    vendorId,
    isActive: true,
    netContentAmount: null,
    ...(options.productId ? { id: options.productId } : {}),
    netContentSuggestions: options.includeAttempted
      ? { none: { status: "PENDING" } }
      : { none: {} },
  };
}

export interface CandidateImage {
  id: string;
  storageKey: string;
  sortOrder: number;
  source: ProductImageSource;
}

/**
 * The lowest-sortOrder image whose source is STAFF_UPLOAD or STAFF_CONFIRMED_PHOTO, or null.
 * An AI-generated, Open Food Facts, placeholder or pre-#900 (UNKNOWN) image is never chosen:
 * see PHOTO_EVIDENCE_SOURCES in lib/product-image.ts for why.
 */
export function choosePhotoEvidence<T extends CandidateImage>(images: readonly T[]): T | null {
  const eligible = images.filter((image) => isPhotoEvidenceSource(image.source));
  if (eligible.length === 0) return null;
  return eligible.reduce((lowest, image) => (image.sortOrder < lowest.sortOrder ? image : lowest));
}
