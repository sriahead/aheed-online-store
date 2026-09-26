import type { getPrisma, getPrismaWs } from "@/lib/db";
import { deriveUnitPricePenceForSort, type NetContentUnit } from "@/components/product/unit-price";
import type { NetContentEvidenceSource } from "@/lib/net-content-suggester";
import type { UnitLabelCheck } from "@/lib/net-content-label-check";
import type { ProductImageSource } from "@/lib/product-image";
import { buildEligibleProductWhere, type EligibilityOptions } from "@/lib/net-content-eligibility";
import type { SummaryRow } from "@/lib/net-content-pilot-summary";

/**
 * #900 — NetContentSuggestion persistence. Every export takes its client and vendorId explicitly
 * (CLAUDE.md's repository rule), so `scripts/suggest-net-content.ts` runs these in plain Node and
 * `lib/net-content-suggestions-service.ts` is the only request-scoped caller.
 *
 * THE SAFETY PROPERTY LIVES HERE: `reviewNetContentSuggestion` is the only function in the
 * codebase that copies a suggestion onto a Product, and it runs only on a staff decision.
 */

type Db = ReturnType<typeof getPrisma>;
type DbWs = ReturnType<typeof getPrismaWs>;

export interface EligibleProduct {
  id: string;
  name: string;
  unitLabel: string;
  basePrice: number;
  images: { id: string; storageKey: string; sortOrder: number; source: ProductImageSource }[];
}

/** Products the suggester may attempt (R14), oldest first so repeated runs walk the catalogue. */
export async function listEligibleProductsForNetContent(
  prisma: Db,
  vendorId: string,
  options: EligibilityOptions,
  limit: number,
): Promise<EligibleProduct[]> {
  return prisma.product.findMany({
    where: buildEligibleProductWhere(vendorId, options),
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
    select: {
      id: true,
      name: true,
      unitLabel: true,
      basePrice: true,
      images: { select: { id: true, storageKey: true, sortOrder: true, source: true } },
    },
  });
}

export interface NewSuggestion {
  productId: string;
  productImageId: string | null;
  /** All six null for a NO_ANSWER row (R15). */
  value: {
    amount: number;
    unit: NetContentUnit;
    confidence: number;
    evidenceSource: NetContentEvidenceSource;
    evidenceText: string;
    unitLabelCheck: UnitLabelCheck;
  } | null;
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** One row per model reply. Singular create with no nested writes, so either client works. */
export async function createNetContentSuggestion(
  prisma: Db,
  vendorId: string,
  input: NewSuggestion,
): Promise<{ id: string; status: "PENDING" | "NO_ANSWER" }> {
  const status = input.value ? ("PENDING" as const) : ("NO_ANSWER" as const);
  const row = await prisma.netContentSuggestion.create({
    data: {
      vendorId,
      productId: input.productId,
      productImageId: input.productImageId,
      amount: input.value?.amount ?? null,
      unit: input.value?.unit ?? null,
      confidence: input.value?.confidence ?? null,
      evidenceSource: input.value?.evidenceSource ?? null,
      evidenceText: input.value?.evidenceText ?? null,
      unitLabelCheck: input.value?.unitLabelCheck ?? null,
      model: input.model,
      latencyMs: input.latencyMs,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      status,
    },
    select: { id: true },
  });
  return { id: row.id, status };
}

export interface PendingSuggestionRow {
  id: string;
  amount: number;
  unit: NetContentUnit;
  confidence: number;
  evidenceSource: NetContentEvidenceSource;
  evidenceText: string;
  unitLabelCheck: UnitLabelCheck | null;
  model: string;
  createdAt: Date;
  product: { id: string; name: string; unitLabel: string; basePrice: number };
  productImage: { storageKey: string } | null;
}

/** The staff queue (R18): this vendor's PENDING rows only. */
export async function listPendingNetContentSuggestions(
  prisma: Db,
  vendorId: string,
): Promise<PendingSuggestionRow[]> {
  const rows = await prisma.netContentSuggestion.findMany({
    where: { vendorId, status: "PENDING" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      amount: true,
      unit: true,
      confidence: true,
      evidenceSource: true,
      evidenceText: true,
      unitLabelCheck: true,
      model: true,
      createdAt: true,
      product: { select: { id: true, name: true, unitLabel: true, basePrice: true } },
      productImage: { select: { storageKey: true } },
    },
  });
  // A PENDING row always carries its values (R15); the filter narrows the nullable column types
  // and drops anything that somehow does not, rather than rendering a blank suggestion.
  return rows.flatMap((row) =>
    row.amount !== null &&
    row.unit !== null &&
    row.confidence !== null &&
    row.evidenceSource !== null &&
    row.evidenceText !== null
      ? [
          {
            ...row,
            amount: row.amount,
            unit: row.unit,
            confidence: row.confidence,
            evidenceSource: row.evidenceSource,
            evidenceText: row.evidenceText,
          },
        ]
      : [],
  );
}

/** Every row's measurement fields, for the pilot summary (R22). */
export async function listNetContentSummaryRows(
  prisma: Db,
  vendorId: string,
): Promise<SummaryRow[]> {
  return prisma.netContentSuggestion.findMany({
    where: { vendorId },
    select: {
      status: true,
      unitLabelCheck: true,
      latencyMs: true,
      inputTokens: true,
      outputTokens: true,
      model: true,
    },
  });
}

export type ReviewDecision =
  { kind: "accept" } | { kind: "edit"; amount: number; unit: NetContentUnit };

export type ReviewResult =
  | { ok: true; productId: string; status: "ACCEPTED" | "EDITED" | "REJECTED" }
  | { ok: false; error: string };

const NOT_FOUND = "That suggestion no longer exists.";
const ALREADY_REVIEWED = "That suggestion has already been reviewed.";
const HAS_NET_CONTENT =
  "This product already has a net content. Change it on the product page instead.";

/** Thrown inside the transaction to roll it back; never escapes this module. */
class ReviewRefusal extends Error {}

/**
 * Accept or Edit (R19/R20) — the ONLY write that copies a suggestion onto a Product.
 *
 * One interactive transaction on the WebSocket client (#382: `updateMany` crashes over HTTP).
 * Both writes are compare-and-set, repeating in `where` the fact they depend on:
 * - the product is updated only while its `netContentAmount` is still null, so a value a person
 *   entered is never overwritten, even by a click that raced them;
 * - the suggestion is settled only while it is still PENDING, so a double click cannot review it
 *   twice.
 * A zero count on either throws, rolling back both.
 */
export async function reviewNetContentSuggestion(
  prismaWs: DbWs,
  vendorId: string,
  suggestionId: string,
  reviewerUserId: string,
  decision: ReviewDecision,
): Promise<ReviewResult> {
  try {
    return await prismaWs.$transaction(async (tx) => {
      const suggestion = await tx.netContentSuggestion.findFirst({
        where: { id: suggestionId, vendorId },
        select: {
          status: true,
          amount: true,
          unit: true,
          product: { select: { id: true, basePrice: true, netContentAmount: true } },
        },
      });
      if (!suggestion) throw new ReviewRefusal(NOT_FOUND);
      if (suggestion.status !== "PENDING") throw new ReviewRefusal(ALREADY_REVIEWED);
      if (suggestion.amount === null || suggestion.unit === null) {
        throw new ReviewRefusal(ALREADY_REVIEWED);
      }
      if (suggestion.product.netContentAmount !== null) throw new ReviewRefusal(HAS_NET_CONTENT);

      const final =
        decision.kind === "edit"
          ? { amount: decision.amount, unit: decision.unit }
          : { amount: suggestion.amount, unit: suggestion.unit };
      const status =
        final.amount === suggestion.amount && final.unit === suggestion.unit
          ? ("ACCEPTED" as const)
          : ("EDITED" as const);

      const product = await tx.product.updateMany({
        where: { id: suggestion.product.id, vendorId, netContentAmount: null },
        data: {
          netContentAmount: final.amount,
          netContentUnit: final.unit,
          // Same derivation every other product write uses (R31 of #398).
          unitPricePencePerBaseUnit: deriveUnitPricePenceForSort(
            suggestion.product.basePrice,
            final,
          ),
        },
      });
      if (product.count === 0) throw new ReviewRefusal(HAS_NET_CONTENT);

      const settled = await tx.netContentSuggestion.updateMany({
        where: { id: suggestionId, vendorId, status: "PENDING" },
        data: {
          status,
          finalAmount: final.amount,
          finalUnit: final.unit,
          reviewedByUserId: reviewerUserId,
          reviewedAt: new Date(),
        },
      });
      if (settled.count === 0) throw new ReviewRefusal(ALREADY_REVIEWED);

      return { ok: true as const, productId: suggestion.product.id, status };
    });
  } catch (error) {
    if (error instanceof ReviewRefusal) return { ok: false, error: error.message };
    throw error;
  }
}

/**
 * Reject (R21): records the decision, never touches Product. Read-then-singular-update over the
 * HTTP client; a double reject that races is refused by the status check on all but the rare
 * simultaneous case, where both writes record the same decision — harmless.
 */
export async function rejectNetContentSuggestion(
  prisma: Db,
  vendorId: string,
  suggestionId: string,
  reviewerUserId: string,
): Promise<ReviewResult> {
  const suggestion = await prisma.netContentSuggestion.findFirst({
    where: { id: suggestionId, vendorId },
    select: { id: true, status: true, productId: true },
  });
  if (!suggestion) return { ok: false, error: NOT_FOUND };
  if (suggestion.status !== "PENDING") return { ok: false, error: ALREADY_REVIEWED };

  await prisma.netContentSuggestion.update({
    where: { id: suggestion.id },
    data: { status: "REJECTED", reviewedByUserId: reviewerUserId, reviewedAt: new Date() },
  });
  return { ok: true, productId: suggestion.productId, status: "REJECTED" };
}
