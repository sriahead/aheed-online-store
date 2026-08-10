"use server";

import { redirect } from "next/navigation";
import { getCartRepository } from "@/lib/repositories/cart";
import { CheckoutError, getOrderRepository } from "@/lib/repositories/orders";
import { getCartIdentity } from "@/lib/cart-identity";
import { getCurrentVendorProfile } from "@/lib/repositories/vendor";
import { isDeliverable } from "@/lib/delivery";

/**
 * Checkout server action (P3b, #96).
 *
 * Money is NEVER read from the form — only contact and address fields are. The
 * subtotal, delivery fee and total are recomputed server-side from the database
 * inside the order transaction, so a tampered form cannot change what is charged.
 */

export type CheckoutState = { error: string | null };

/** Thrown only by `required()` — a missing field is a form problem, not a CheckoutError. */
class MissingFieldError extends Error {}

const FIELD_LABELS: Record<string, string> = {
  recipientName: "Full name",
  email: "Email",
  phone: "Phone number",
  line1: "Street address",
  city: "Town or city",
  postcode: "Postcode",
};

function required(form: FormData, field: string): string {
  const value = String(form.get(field) ?? "").trim();
  if (!value) throw new MissingFieldError(`${FIELD_LABELS[field] ?? field} is required.`);
  return value;
}

function optional(form: FormData, field: string): string | null {
  const value = String(form.get(field) ?? "").trim();
  return value === "" ? null : value;
}

export async function placeOrderAction(
  _prev: CheckoutState,
  form: FormData,
): Promise<CheckoutState> {
  const identity = await getCartIdentity();
  const cartRepo = getCartRepository();
  const summary = await cartRepo.getSummary(identity);

  // Inherited from P3a: an order must never be placed against a cart the shopper
  // never confirmed.
  if (summary.mergePending) {
    return { error: "Please choose which cart to keep before checking out." };
  }
  if (summary.lines.length === 0) {
    return { error: "Your cart is empty." };
  }

  const vendor = await getCurrentVendorProfile();
  if (!vendor) return { error: "This store is unavailable." };

  let orderNumber: string;
  try {
    const postcode = required(form, "postcode");
    if (!isDeliverable(postcode, vendor.deliveryPrefixes)) {
      return {
        error: `Sorry — we don't deliver to ${postcode} yet.`,
      };
    }

    const email = identity.userId ? optional(form, "email") : required(form, "email");

    // The cart id is resolved server-side from the identity, never submitted —
    // and through the repository, so this layer never touches Prisma.
    const cartId = await cartRepo.getCartId(identity);
    if (!cartId) return { error: "Your cart is empty." };

    const placed = await getOrderRepository().createOrder({
      cartId,
      userId: identity.userId,
      guestEmail: identity.userId ? null : email,
      address: {
        recipientName: required(form, "recipientName"),
        phone: required(form, "phone"),
        line1: required(form, "line1"),
        line2: optional(form, "line2"),
        city: required(form, "city"),
        postcode,
        notes: optional(form, "notes"),
      },
      rules: {
        deliveryFeePence: vendor.deliveryFeePence,
        freeDeliveryThresholdPence: vendor.freeDeliveryThresholdPence,
        minimumOrderPence: vendor.minimumOrderPence,
      },
      vendorSlug: vendor.slug,
    });
    orderNumber = placed.orderNumber;
  } catch (error) {
    if (error instanceof MissingFieldError) return { error: error.message };
    if (error instanceof CheckoutError) return { error: error.message };
    throw error;
  }

  // Outside the try: redirect() throws a control-flow signal that must not be
  // caught and reported as a checkout failure.
  redirect(`/checkout/${orderNumber}`);
}
