"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import {
  actorFromVia,
  decideEnable,
  decideSetRestriction,
  restrictedEnableError,
  summarisePlanRisks,
  type RestrictionActor,
} from "@/lib/product-restriction";
import {
  readBulkRequest,
  readConfirmed,
  readReason,
  readRestriction,
  type BulkActionState,
  type RestrictionFormState,
} from "@/lib/product-restriction-form";
import {
  applyBulkAction,
  clearRestrictionAndEnable,
  previewBulkAction,
  setProductRestriction,
} from "@/lib/product-restrictions-service";

/**
 * #1211 (ADR-007) — the restriction controls on /staff/products/[id] and the bulk actions on
 * /staff/products. Every decision is made by lib/product-restriction.ts from the actor
 * `requireVendorRole` resolved — never from anything the client sent — and the repository
 * re-checks the role-agnostic half inside its transaction.
 *
 * "use server": this file may export ONLY async functions (CLAUDE.md). State shapes, initial
 * values and parsers live in lib/product-restriction-form.ts.
 */

function refused(status: 401 | 403): string {
  return status === 401
    ? "Your session has expired. Sign in again."
    : "You don't have permission to change products.";
}

function revalidateProduct(productId: string): void {
  revalidatePath("/staff/products");
  revalidatePath(`/staff/products/${productId}`);
  revalidatePath("/staff/inventory");
  revalidatePath("/", "layout");
}

/** ADMIN only: set or tighten a product's restriction. Always hides the product. */
export async function setRestrictionAction(
  _prev: RestrictionFormState,
  form: FormData,
): Promise<RestrictionFormState> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return { error: refused(auth.status), saved: false };
  const actor: RestrictionActor = actorFromVia(auth.via);

  const productId = String(form.get("productId") ?? "").trim();
  const current = readRestriction(form, "currentRestriction");
  const to = readRestriction(form, "restriction");
  if (productId === "" || to === null) {
    return { error: "Choose a restriction.", saved: false };
  }

  const decision = decideSetRestriction(current, to, actor);
  if (decision.kind === "REFUSED") {
    return {
      error:
        decision.reason === "ADMIN_ONLY"
          ? "Only an admin can change a product's restriction."
          : "A restriction can only be tightened here.",
      saved: false,
    };
  }
  if (decision.kind === "NO_CHANGE") return { error: null, saved: true };

  const reason = readReason(form);
  const result = await setProductRestriction(
    auth.vendorId,
    productId,
    to,
    auth.user.id,
    reason === "" ? null : reason,
  );
  if (!result.ok) return { error: result.error, saved: false };
  revalidateProduct(productId);
  return { error: null, saved: true };
}

/** ADMIN only, overridable restrictions only, confirmation + reason required: clear and enable. */
export async function clearAndEnableAction(
  _prev: RestrictionFormState,
  form: FormData,
): Promise<RestrictionFormState> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return { error: refused(auth.status), saved: false };

  const productId = String(form.get("productId") ?? "").trim();
  const confirmedRestriction = readRestriction(form, "confirmedRestriction");
  if (productId === "" || confirmedRestriction === null) {
    return { error: "This product has no restriction to clear.", saved: false };
  }

  const reason = readReason(form);
  const decision = decideEnable({
    restriction: confirmedRestriction,
    actor: actorFromVia(auth.via),
    confirmed: readConfirmed(form),
    reason,
  });
  switch (decision.kind) {
    case "REFUSED":
      return {
        error:
          decision.reason === "HARD_BLOCK"
            ? restrictedEnableError(confirmedRestriction)
            : "Only an admin can make a restricted product available.",
        saved: false,
      };
    case "NEEDS_CONFIRMATION":
      return { error: "Tick the confirmation and give a reason to continue.", saved: false };
    case "ENABLE":
      // Unreachable: a non-null restriction never decides ENABLE. Refuse rather than guess.
      return { error: "Nothing to clear.", saved: false };
    case "ENABLE_CLEARING":
      break;
  }

  const result = await clearRestrictionAndEnable(
    auth.vendorId,
    productId,
    confirmedRestriction,
    auth.user.id,
    reason,
  );
  if (!result.ok) return { error: result.error, saved: false };
  revalidateProduct(productId);
  return { error: null, saved: true };
}

/**
 * The bulk form. `intent=preview` plans and writes nothing; `intent=apply` RECOMPUTES the plan
 * from the database inside the write transaction (the preview is never trusted), and returns the
 * updated / skipped / failed lists. `intent=reset` returns to the empty state.
 */
export async function bulkProductAction(
  _prev: BulkActionState,
  form: FormData,
): Promise<BulkActionState> {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) return { phase: "idle", error: refused(auth.status) };
  const actor = actorFromVia(auth.via);

  const intent = String(form.get("intent") ?? "preview");
  if (intent === "reset") return { phase: "idle", error: null };

  const request = readBulkRequest(form);
  if (!request.ok) return { phase: "idle", error: request.error };

  if (intent !== "apply") {
    const plan = await previewBulkAction(auth.vendorId, request.action, request.productIds, actor);
    const { overridable } = summarisePlanRisks(plan);
    return {
      phase: "preview",
      action: request.action,
      productIds: request.productIds,
      plan,
      offersConfirmation:
        actor === "ADMIN" && request.action === "ENABLE" && overridable.length > 0,
      error: null,
    };
  }

  const result = await applyBulkAction(
    auth.vendorId,
    request.action,
    request.productIds,
    actor,
    auth.user.id,
    { confirmed: readConfirmed(form), reason: readReason(form) || null },
  );
  revalidatePath("/staff/products");
  revalidatePath("/staff/inventory");
  revalidatePath("/", "layout");
  return { phase: "applied", action: request.action, result, error: null };
}
