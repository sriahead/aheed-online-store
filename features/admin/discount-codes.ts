"use server";

import { revalidatePath } from "next/cache";
import { requireVendorRole } from "@/lib/auth-rbac";
import { normaliseCode, type DiscountKind } from "@/lib/discounts";
import {
  createCodeForVendor,
  deactivateCodeForVendor,
  type CreateCodeInput,
} from "@/lib/repositories/discounts";

/**
 * Discount-code admin actions (P5b, #145) — the write half of `/staff/discounts`.
 *
 * Both actions run `requireVendorRole` THEMSELVES rather than trusting the page
 * that rendered the form. A server action is a public endpoint at a stable id:
 * anyone who has seen the page once can POST to it forever, so the page's check
 * protects the page, not this. Same posture P4b's advance-status and P5a's
 * loyalty-config actions take.
 *
 * STAFF is deliberately excluded: creating money-off is an owner decision, not a
 * packing-floor one.
 *
 * The vendor is resolved from the request host inside `requireVendorRole`, never
 * from the form, so no submitted field can redirect the write to another
 * vendor's rows.
 *
 * There is deliberately NO edit action. Changing a live code's value would ask
 * whether past orders re-price (they must not) and would create a window where
 * two shoppers used "the same code" at different rates. Deactivate and create a
 * replacement.
 */

export type DiscountCodeState = { error: string | null; saved: boolean };

class InvalidFieldError extends Error {}

const FIELD_LABELS: Record<string, string> = {
  code: "Code",
  value: "Value",
  minSubtotalPence: "Minimum order",
  remainingRedemptions: "Total uses",
  maxPerCustomer: "Uses per customer",
};

/** A whole number ≥ `min`. Rejects "", "abc", "1.5" and negatives identically. */
function integerField(form: FormData, field: string, min: number): number {
  const raw = String(form.get(field) ?? "").trim();
  const parsed = Number(raw);
  if (raw === "" || !Number.isInteger(parsed) || parsed < min) {
    throw new InvalidFieldError(
      `${FIELD_LABELS[field] ?? field} must be a whole number of at least ${min}.`,
    );
  }
  return parsed;
}

/** Same, but an empty value means "no limit" rather than an error. */
function optionalIntegerField(form: FormData, field: string, min: number): number | null {
  const raw = String(form.get(field) ?? "").trim();
  if (raw === "") return null;
  return integerField(form, field, min);
}

function optionalDateField(form: FormData, field: string): Date | null {
  const raw = String(form.get(field) ?? "").trim();
  if (raw === "") return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidFieldError("Dates must be valid.");
  }
  return parsed;
}

function kindField(form: FormData): DiscountKind {
  const raw = String(form.get("kind") ?? "").trim();
  if (raw !== "PERCENTAGE" && raw !== "FIXED_AMOUNT") {
    throw new InvalidFieldError("Choose a percentage or a fixed amount.");
  }
  return raw;
}

export async function createDiscountCode(
  _prev: DiscountCodeState,
  form: FormData,
): Promise<DiscountCodeState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    // Returned as data, never thrown — matching lib/auth-rbac.ts's posture, so a
    // refusal renders as a message rather than a 500.
    return { error: refusal(auth.status), saved: false };
  }

  let input: CreateCodeInput;
  try {
    const code = normaliseCode(String(form.get("code") ?? ""));
    if (code === "") throw new InvalidFieldError("Code is required.");

    const kind = kindField(form);
    // A percentage above 100% would produce a discount larger than the goods.
    // The clamp in lib/discounts.ts would catch it at checkout, but a code that
    // silently means something other than what was typed should not exist.
    const value = integerField(form, "value", 1);
    if (kind === "PERCENTAGE" && value > 10000) {
      throw new InvalidFieldError("A percentage can't be more than 100% (10000 basis points).");
    }

    const startsAt = optionalDateField(form, "startsAt") ?? new Date();
    const endsAt = optionalDateField(form, "endsAt");
    if (endsAt !== null && endsAt.getTime() < startsAt.getTime()) {
      throw new InvalidFieldError("The end date can't be before the start date.");
    }

    input = {
      code,
      description: emptyToNull(form, "description"),
      kind,
      value,
      minSubtotalPence: integerField(form, "minSubtotalPence", 0),
      startsAt,
      endsAt,
      remainingRedemptions: optionalIntegerField(form, "remainingRedemptions", 1),
      maxPerCustomer: optionalIntegerField(form, "maxPerCustomer", 1),
    };
  } catch (error) {
    if (error instanceof InvalidFieldError) return { error: error.message, saved: false };
    throw error;
  }

  const result = await createCodeForVendor(auth.vendorId, input);
  if (!result.ok) return { error: result.error, saved: false };

  revalidatePath("/staff/discounts");
  return { error: null, saved: true };
}

export async function deactivateDiscountCode(
  _prev: DiscountCodeState,
  form: FormData,
): Promise<DiscountCodeState> {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return { error: refusal(auth.status), saved: false };

  const codeId = String(form.get("codeId") ?? "").trim();
  if (codeId === "") return { error: "No code selected.", saved: false };

  // Scoped by vendorId in the repository's WHERE, so another vendor's code id is
  // indistinguishable from one that doesn't exist: count 0, nothing written.
  const count = await deactivateCodeForVendor(auth.vendorId, codeId);
  if (count === 0) return { error: "That code no longer exists.", saved: false };

  revalidatePath("/staff/discounts");
  return { error: null, saved: true };
}

function refusal(status: number): string {
  return status === 401
    ? "Please sign in as a store admin to manage discount codes."
    : "You don't have permission to manage this store's discount codes.";
}

function emptyToNull(form: FormData, field: string): string | null {
  const raw = String(form.get(field) ?? "").trim();
  return raw === "" ? null : raw;
}
