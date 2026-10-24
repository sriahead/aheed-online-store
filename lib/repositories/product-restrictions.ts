import type { getPrisma, getPrismaWs } from "@/lib/db";
import type { ProductRestriction, StockMode } from "@/lib/cart-rules";
import {
  isHardBlock,
  planBulkAction,
  severity,
  type BulkAction,
  type BulkCandidate,
  type BulkPlanEntry,
  type RestrictionActor,
} from "@/lib/product-restriction";

/**
 * #1211 (ADR-007) — restriction writes and the append-only audit trail.
 *
 * Every export takes its client and `vendorId`/`actorUserId` explicitly and reads no request
 * context; `lib/product-restrictions-service.ts` is the request-scoped facade. Every write runs
 * in ONE interactive transaction on the WebSocket client: they use `updateMany`/`createMany`,
 * which crash unconditionally over `getPrisma()` (CLAUDE.md, #382).
 *
 * ROLE checks live with the caller (`lib/product-restriction.ts` decides from the actor). What
 * this layer enforces for EVERY caller, whatever the role, is the role-agnostic part: a hard block
 * is never cleared, a restriction is never loosened by `setProductRestriction`, and a clear only
 * applies to the restriction the admin actually confirmed.
 *
 * APPEND-ONLY: this file only ever `create`s/`createMany`s ProductRestrictionAuditLog rows.
 * tests/product-restriction-audit-append-only.test.ts fails on an update or delete anywhere.
 */

type Db = ReturnType<typeof getPrisma>;
type DbWs = ReturnType<typeof getPrismaWs>;
type Tx = Parameters<Parameters<DbWs["$transaction"]>[0]>[0];
type Reader = Db | DbWs | Tx;

export type RestrictionChangeSource = "PRODUCT_FORM" | "BULK_ACTION" | "IMPORT";

export type SetRestrictionResult = { ok: true; changed: boolean } | { ok: false; error: string };

/**
 * Tighten (or first set) a product's restriction. Hides the product in the same write — the CHECK
 * would refuse the restriction on an active product anyway — and appends RESTRICTION_SET.
 */
export async function setProductRestriction(
  prismaWs: DbWs,
  vendorId: string,
  productId: string,
  to: ProductRestriction,
  actorUserId: string | null,
  reason: string | null,
  source: RestrictionChangeSource,
): Promise<SetRestrictionResult> {
  return prismaWs.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, vendorId },
      select: { id: true, restriction: true },
    });
    if (!product) return { ok: false as const, error: "That product no longer exists." };
    if (product.restriction === to) return { ok: true as const, changed: false };
    if (severity(to) < severity(product.restriction)) {
      return {
        ok: false as const,
        error: "A restriction can only be tightened here. Loosening one needs the admin review.",
      };
    }
    const { count } = await tx.product.updateMany({
      // Conditional on the restriction just read, so two concurrent edits cannot both apply.
      where: { id: productId, vendorId, restriction: product.restriction },
      data: { restriction: to, isActive: false },
    });
    if (count === 0) {
      return { ok: false as const, error: "This product changed while you were editing it." };
    }
    await tx.productRestrictionAuditLog.create({
      data: {
        vendorId,
        productId,
        action: "RESTRICTION_SET",
        fromRestriction: product.restriction,
        toRestriction: to,
        actorUserId,
        source,
        reason,
      },
    });
    return { ok: true as const, changed: true };
  });
}

export type ClearRestrictionResult =
  { ok: true } | { ok: false; kind: "HARD_BLOCK" | "NOT_FOUND" | "CHANGED"; error: string };

/**
 * The ONLY way a restriction is loosened: clear it and enable the product, in one conditional
 * write, with an audit row carrying the admin's reason. `confirmedRestriction` is the restriction
 * the admin saw and confirmed; if the product's restriction is anything else now, nothing is
 * written and no audit row is added.
 */
export async function clearRestrictionAndEnable(
  prismaWs: DbWs,
  vendorId: string,
  productId: string,
  confirmedRestriction: ProductRestriction,
  actorUserId: string,
  reason: string,
  source: RestrictionChangeSource,
): Promise<ClearRestrictionResult> {
  if (isHardBlock(confirmedRestriction)) {
    return { ok: false, kind: "HARD_BLOCK", error: "This product cannot be made available." };
  }
  return prismaWs.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, vendorId },
      select: { id: true },
    });
    if (!product) {
      return {
        ok: false as const,
        kind: "NOT_FOUND" as const,
        error: "That product no longer exists.",
      };
    }
    const applied = await clearAndEnableInTx(
      tx,
      vendorId,
      productId,
      confirmedRestriction,
      actorUserId,
      reason,
      source,
    );
    if (!applied) {
      return {
        ok: false as const,
        kind: "CHANGED" as const,
        error: "This product's restriction changed since you loaded it. Review it again.",
      };
    }
    return { ok: true as const };
  });
}

/** One conditional clear + its audit row. Returns false (and writes nothing) on a stale confirm. */
async function clearAndEnableInTx(
  tx: Tx,
  vendorId: string,
  productId: string,
  confirmedRestriction: ProductRestriction,
  actorUserId: string,
  reason: string,
  source: RestrictionChangeSource,
): Promise<boolean> {
  if (isHardBlock(confirmedRestriction)) return false;
  const { count } = await tx.product.updateMany({
    where: { id: productId, vendorId, restriction: confirmedRestriction },
    data: { restriction: null, isActive: true },
  });
  if (count === 0) return false;
  await tx.productRestrictionAuditLog.create({
    data: {
      vendorId,
      productId,
      action: "RESTRICTION_CLEARED",
      fromRestriction: confirmedRestriction,
      toRestriction: null,
      actorUserId,
      source,
      reason,
    },
  });
  return true;
}

/** The fields the bulk rules read, for this vendor's products among `ids`. */
export async function loadBulkCandidates(
  db: Reader,
  vendorId: string,
  ids: readonly string[],
): Promise<BulkCandidate[]> {
  if (ids.length === 0) return [];
  const rows = await db.product.findMany({
    where: { vendorId, id: { in: [...ids] } },
    select: {
      id: true,
      name: true,
      isActive: true,
      restriction: true,
      inventory: { select: { stockMode: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    restriction: row.restriction,
    stockMode: (row.inventory?.stockMode ?? "UNKNOWN") as StockMode,
  }));
}

/** The preview: the plan as it stands right now, with no confirmation given. Writes nothing. */
export async function previewBulkAction(
  db: Reader,
  vendorId: string,
  action: BulkAction,
  ids: readonly string[],
  actor: RestrictionActor,
): Promise<BulkPlanEntry[]> {
  const candidates = await loadBulkCandidates(db, vendorId, ids);
  return planBulkAction(action, ids, candidates, actor, { confirmed: false, reason: null });
}

export interface BulkResultLine {
  productId: string;
  name: string;
  reason?: string;
}

export interface BulkResult {
  updated: BulkResultLine[];
  skipped: BulkResultLine[];
  failed: BulkResultLine[];
}

const CHANGED_SINCE_SELECTED = "Changed since you selected it — nothing was written";

/**
 * Apply a bulk action. The plan is RECOMPUTED here, inside the transaction, from the database —
 * never taken from the client — so a tampered or stale preview cannot enable anything the rules
 * would not. Each product is written with a condition on the state the plan was made from; a
 * product that changed in between matches nothing and is reported as failed, not forced.
 */
export async function applyBulkAction(
  prismaWs: DbWs,
  vendorId: string,
  action: BulkAction,
  ids: readonly string[],
  actor: RestrictionActor,
  actorUserId: string,
  confirmation: { confirmed: boolean; reason: string | null },
  skipLabel: (entry: BulkPlanEntry) => string,
): Promise<BulkResult> {
  return prismaWs.$transaction(async (tx) => {
    const candidates = await loadBulkCandidates(tx, vendorId, ids);
    const plan = planBulkAction(action, ids, candidates, actor, confirmation);
    const result: BulkResult = { updated: [], skipped: [], failed: [] };

    for (const entry of plan) {
      const name = entry.name ?? entry.productId;
      const { outcome } = entry;
      switch (outcome.kind) {
        case "SKIPPED":
          result.skipped.push({ productId: entry.productId, name, reason: skipLabel(entry) });
          break;
        case "NO_CHANGE":
          result.skipped.push({
            productId: entry.productId,
            name,
            reason: "Already in that state",
          });
          break;
        case "ENABLE": {
          const { count } = await tx.product.updateMany({
            where: { id: entry.productId, vendorId, restriction: null, isActive: false },
            data: { isActive: true },
          });
          (count === 1 ? result.updated : result.failed).push(
            count === 1
              ? { productId: entry.productId, name }
              : { productId: entry.productId, name, reason: CHANGED_SINCE_SELECTED },
          );
          break;
        }
        case "ENABLE_CLEARING": {
          const applied = await clearAndEnableInTx(
            tx,
            vendorId,
            entry.productId,
            outcome.restriction,
            actorUserId,
            (confirmation.reason ?? "").trim(),
            "BULK_ACTION",
          );
          (applied ? result.updated : result.failed).push(
            applied
              ? { productId: entry.productId, name, reason: "Restriction cleared" }
              : { productId: entry.productId, name, reason: CHANGED_SINCE_SELECTED },
          );
          break;
        }
        case "DISABLE": {
          const { count } = await tx.product.updateMany({
            where: { id: entry.productId, vendorId, isActive: true },
            data: { isActive: false },
          });
          (count === 1 ? result.updated : result.failed).push(
            count === 1
              ? { productId: entry.productId, name }
              : { productId: entry.productId, name, reason: CHANGED_SINCE_SELECTED },
          );
          break;
        }
        case "MARK_UNTRACKED":
          // Collected below: one createMany for missing rows plus one updateMany.
          break;
      }
    }

    const untrack = plan.filter((e) => e.outcome.kind === "MARK_UNTRACKED");
    if (untrack.length > 0) {
      const untrackIds = untrack.map((e) => e.productId);
      // Products with no Inventory row get one; quantity 0 because UNTRACKED ignores it.
      await tx.inventory.createMany({
        data: untrackIds.map((productId) => ({
          vendorId,
          productId,
          quantity: 0,
          stockMode: "UNTRACKED" as const,
        })),
        skipDuplicates: true,
      });
      await tx.inventory.updateMany({
        where: { vendorId, productId: { in: untrackIds } },
        data: { stockMode: "UNTRACKED" },
      });
      for (const e of untrack) {
        result.updated.push({ productId: e.productId, name: e.name ?? e.productId });
      }
    }

    return result;
  });
}

export interface RestrictionAuditEntry {
  id: string;
  createdAt: Date;
  action: "RESTRICTION_SET" | "RESTRICTION_CLEARED";
  fromRestriction: ProductRestriction | null;
  toRestriction: ProductRestriction | null;
  /** Null when the change was written by a catalogue import, or the user has since been deleted. */
  actorName: string | null;
  actorUserId: string | null;
  source: RestrictionChangeSource;
  reason: string | null;
}

/** The newest `take` audit entries for one product, newest first. Read-only. */
export async function listRestrictionAudit(
  prisma: Db,
  vendorId: string,
  productId: string,
  take = 20,
): Promise<RestrictionAuditEntry[]> {
  const rows = await prisma.productRestrictionAuditLog.findMany({
    where: { vendorId, productId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      createdAt: true,
      action: true,
      fromRestriction: true,
      toRestriction: true,
      actorUserId: true,
      actor: { select: { name: true, email: true } },
      source: true,
      reason: true,
    },
  });
  return rows.map(({ actor, ...row }) => ({
    ...row,
    actorName: actor ? actor.name || actor.email : null,
  }));
}
