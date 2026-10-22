import { getPrisma, getPrismaWs } from "@/lib/db";
import type { ProductRestriction } from "@/lib/cart-rules";
import {
  BULK_SKIP_LABELS,
  type BulkAction,
  type BulkPlanEntry,
  type RestrictionActor,
} from "@/lib/product-restriction";
import {
  applyBulkAction as applyBulkActionRepo,
  clearRestrictionAndEnable as clearRestrictionAndEnableRepo,
  listRestrictionAudit as listRestrictionAuditRepo,
  previewBulkAction as previewBulkActionRepo,
  setProductRestriction as setProductRestrictionRepo,
  type BulkResult,
  type ClearRestrictionResult,
  type RestrictionAuditEntry,
  type SetRestrictionResult,
} from "@/lib/repositories/product-restrictions";

/**
 * #1211 — request-scoped facade over lib/repositories/product-restrictions.ts. It only resolves the
 * client: writes on `getPrismaWs()` (interactive transactions, updateMany/createMany), reads on
 * `getPrisma()`. A fresh client per call, never cached (CLAUDE.md). Role decisions are made by the
 * server actions from `requireVendorRole`, before these are reached.
 */

export function setProductRestriction(
  vendorId: string,
  productId: string,
  to: ProductRestriction,
  actorUserId: string,
  reason: string | null,
): Promise<SetRestrictionResult> {
  return setProductRestrictionRepo(
    getPrismaWs(),
    vendorId,
    productId,
    to,
    actorUserId,
    reason,
    "PRODUCT_FORM",
  );
}

export function clearRestrictionAndEnable(
  vendorId: string,
  productId: string,
  confirmedRestriction: ProductRestriction,
  actorUserId: string,
  reason: string,
): Promise<ClearRestrictionResult> {
  return clearRestrictionAndEnableRepo(
    getPrismaWs(),
    vendorId,
    productId,
    confirmedRestriction,
    actorUserId,
    reason,
    "PRODUCT_FORM",
  );
}

export function previewBulkAction(
  vendorId: string,
  action: BulkAction,
  ids: readonly string[],
  actor: RestrictionActor,
): Promise<BulkPlanEntry[]> {
  return previewBulkActionRepo(getPrisma(), vendorId, action, ids, actor);
}

export function applyBulkAction(
  vendorId: string,
  action: BulkAction,
  ids: readonly string[],
  actor: RestrictionActor,
  actorUserId: string,
  confirmation: { confirmed: boolean; reason: string | null },
): Promise<BulkResult> {
  return applyBulkActionRepo(
    getPrismaWs(),
    vendorId,
    action,
    ids,
    actor,
    actorUserId,
    confirmation,
    (entry) => (entry.outcome.kind === "SKIPPED" ? BULK_SKIP_LABELS[entry.outcome.reason] : ""),
  );
}

export function listRestrictionAudit(
  vendorId: string,
  productId: string,
): Promise<RestrictionAuditEntry[]> {
  return listRestrictionAuditRepo(getPrisma(), vendorId, productId);
}
