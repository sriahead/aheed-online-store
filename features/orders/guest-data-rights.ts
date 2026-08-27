"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentVendorId } from "@/lib/tenant";
import { getGuestDataRightsService } from "@/lib/data-rights-service";
import { checkOrderLookupRateLimitForVendor } from "@/lib/order-lookup-rate-limit-service";
import {
  guestErasureSummary,
  parseGuestErasure,
  type DataRightsFormState,
} from "@/lib/data-rights-form";

/**
 * Guest Art. 17 erasure (P7 closeout, #251 / #222) — the write half of
 * /orders/lookup.
 *
 * The credential is the order-number/email pair, the same one the lookup itself
 * requires, and it is verified at the query level inside
 * `eraseGuestOrderData`'s transaction rather than here. A server action is a
 * public endpoint at a stable id: anyone who has loaded the page once can POST
 * to it forever, so nothing the page already checked can be trusted by this
 * function. It re-resolves the vendor from the request host and re-proves the
 * pair from scratch.
 *
 * EVERY EXPORT HERE IS AN ASYNC FUNCTION. The form state constants and field
 * rules live in lib/data-rights-form.ts because a same-file value export makes
 * every action in a "use server" file 500 at runtime, while build, typecheck
 * and test all stay green (#159).
 */

/**
 * Cloudflare always sets CF-Connecting-IP on a real request; x-forwarded-for is
 * the fallback for `next dev` and local tooling. Same resolution the lookup page
 * uses — deliberately identical, so a caller cannot get a fresh rate-limit
 * budget by switching between the read and the write path.
 */
async function resolveClientIp(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function eraseGuestOrder(
  _prev: DataRightsFormState,
  formData: FormData,
): Promise<DataRightsFormState> {
  const parsed = parseGuestErasure(
    formData.get("orderNumber") as string | null,
    formData.get("email") as string | null,
    formData.get("confirmErase") as string | null,
  );
  if (!parsed.ok) return parsed.state;

  const vendorId = await getCurrentVendorId();

  // Throttle BEFORE any read of order data. An erasure endpoint that answers
  // "no such order" quickly enough is an oracle for guessing order/email pairs,
  // which is the same exposure the lookup's own limiter exists to close — so it
  // shares that limiter and its budget rather than getting one of its own.
  const { allowed } = await checkOrderLookupRateLimitForVendor(vendorId, await resolveClientIp());
  if (!allowed) {
    return {
      error: "Too many attempts. Please wait a minute and try again.",
      field: null,
      done: null,
    };
  }

  const result = await getGuestDataRightsService().eraseGuestOrder(
    parsed.value.orderNumber,
    parsed.value.email,
  );

  if (!result) {
    // Deliberately the same message the lookup gives for a failed match, and
    // deliberately not distinguishing "no such order" from "wrong email" or
    // "already erased" — each of those is a fact about someone else's order.
    return {
      error: "Order number and email combination did not match our records.",
      field: null,
      done: null,
    };
  }

  revalidatePath("/orders/lookup");
  return { error: null, field: null, done: guestErasureSummary(result.orderNumber) };
}
