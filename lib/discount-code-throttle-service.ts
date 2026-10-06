import { headers } from "next/headers";
import { getPrisma } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  isDiscountCodeCheckThrottled,
  recordUnknownDiscountCode,
} from "@/lib/repositories/discount-code-throttle";

/**
 * Request-scoped entry points for the discount-code throttle (#988), used by the checkout's two
 * code paths: `previewCheckoutCode` (Apply, and the referral-cookie pre-fill) and `placeOrderAction`.
 * The throttle itself lives in `lib/repositories/discount-code-throttle.ts` and takes its client
 * explicitly, so it can be proven against a real database from a script.
 *
 * Both functions FAIL OPEN: a throttle that cannot reach its table logs (`Discount throttle:`) and
 * lets the code check through. A broken throttle must not stop every shopper from checking out —
 * the throttle protects code secrecy, which is worth less than the checkout itself.
 *
 * The client is resolved per call, never cached across requests (CLAUDE.md).
 */

/**
 * `cf-connecting-ip` on a real request; `x-forwarded-for` is the local-dev fallback. Locally every
 * caller can land in the shared "unknown" bucket — acceptable for development, never on a Worker.
 */
async function resolveClientIp(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Whether this caller must be refused a code check. False if the throttle itself fails. */
export async function isCallerThrottledForCodes(): Promise<boolean> {
  try {
    const [vendorId, ip] = await Promise.all([getCurrentVendorId(), resolveClientIp()]);
    return await isDiscountCodeCheckThrottled(getPrisma(), vendorId, ip);
  } catch (error) {
    console.error("Discount throttle: checking the caller failed; allowing the code check", error);
    return false;
  }
}

/** Counts one unknown code against this caller. Never throws. */
export async function recordCallerUnknownCode(): Promise<void> {
  try {
    const [vendorId, ip] = await Promise.all([getCurrentVendorId(), resolveClientIp()]);
    await recordUnknownDiscountCode(getPrisma(), vendorId, ip);
  } catch (error) {
    console.error("Discount throttle: recording an unknown code failed", error);
  }
}
