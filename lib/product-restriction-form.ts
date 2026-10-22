/**
 * #1211 — form state and parsing for the restriction controls and the bulk actions. A plain
 * module: `features/admin/product-restrictions.ts` is "use server" and may export only async
 * functions (CLAUDE.md), so the state shapes, their initial values and the parsers live here.
 */
import type { ProductRestriction } from "@/lib/cart-rules";
import {
  MAX_BULK_SELECTION,
  MAX_RESTRICTION_REASON_LENGTH,
  isBulkAction,
  isProductRestriction,
  type BulkAction,
  type BulkPlanEntry,
} from "@/lib/product-restriction";
import type { BulkResult } from "@/lib/repositories/product-restrictions";

export interface RestrictionFormState {
  error: string | null;
  saved: boolean;
}

export const initialRestrictionFormState: RestrictionFormState = { error: null, saved: false };

export type BulkActionState =
  | { phase: "idle"; error: string | null }
  | {
      phase: "preview";
      action: BulkAction;
      productIds: string[];
      plan: BulkPlanEntry[];
      /** True when the actor is an ADMIN and at least one overridable product is selected. */
      offersConfirmation: boolean;
      error: string | null;
    }
  | { phase: "applied"; action: BulkAction; result: BulkResult; error: null };

export const initialBulkActionState: BulkActionState = { phase: "idle", error: null };

/**
 * The id the /staff/products row checkboxes bind to with `form=`, like /staff/orders' bulk
 * advance. Here, not in the client component, because the server-rendered list needs the VALUE —
 * a constant imported from a "use client" module reaches a server component as a client reference.
 */
export const BULK_PRODUCTS_FORM_ID = "bulk-products";

export const BULK_ACTION_LABELS: Record<BulkAction, string> = {
  ENABLE: "Make available",
  DISABLE: "Hide",
  MARK_UNTRACKED: "Mark stock as not tracked",
};

/** A reason, trimmed and capped; "" when absent. */
export function readReason(form: FormData): string {
  return String(form.get("reason") ?? "")
    .trim()
    .slice(0, MAX_RESTRICTION_REASON_LENGTH);
}

export function readConfirmed(form: FormData): boolean {
  return form.get("confirmed") === "on" || form.get("confirmed") === "true";
}

export function readRestriction(form: FormData, field: string): ProductRestriction | null {
  const value = String(form.get(field) ?? "");
  return isProductRestriction(value) ? value : null;
}

export type BulkRequest =
  { ok: true; action: BulkAction; productIds: string[] } | { ok: false; error: string };

/** The bulk form's action and selection: de-duplicated, non-empty, at most MAX_BULK_SELECTION. */
export function readBulkRequest(form: FormData): BulkRequest {
  const action = String(form.get("bulkAction") ?? "");
  if (!isBulkAction(action)) return { ok: false, error: "Choose an action." };
  const productIds = [
    ...new Set(
      form
        .getAll("productId")
        .map((value) => String(value).trim())
        .filter((value) => value !== ""),
    ),
  ];
  if (productIds.length === 0) return { ok: false, error: "Select at least one product." };
  if (productIds.length > MAX_BULK_SELECTION) {
    return { ok: false, error: `Select at most ${MAX_BULK_SELECTION} products at a time.` };
  }
  return { ok: true, action, productIds };
}
