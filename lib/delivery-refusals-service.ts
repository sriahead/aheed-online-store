import { getPrisma } from "@/lib/db";
import type { DeliveryEligibility } from "@/lib/delivery-eligibility";
import { getDeliveryEligibility } from "@/lib/delivery-eligibility-service";
import { refusalRecordFor, refusalWindowStart } from "@/lib/delivery-refusal";
import {
  listRecentDeliveryRefusals,
  recordDeliveryRefusal,
  type DeliveryRefusalSource,
  type DeliveryRefusalSummary,
} from "@/lib/repositories/delivery-refusals";
import { getCurrentVendorProfile } from "@/lib/vendor-service";

/**
 * Request-scoped facade for out-of-area refusal counts (#889), beside — not inside —
 * `lib/repositories/delivery-refusals.ts` for the reason every `*-service.ts` sibling gives: the
 * repository reads no request context. Clients are constructed fresh per call, never cached.
 *
 * `recordRefusalIfOutside` is called from shopper-facing actions (`setDeliveryPostcode`,
 * `place-order`). It must NEVER change what the shopper sees: a failed count is logged and
 * swallowed, because losing one tally is harmless and breaking the postcode control or checkout
 * over it is not.
 */
export async function recordRefusalIfOutside(
  eligibility: DeliveryEligibility,
  source: DeliveryRefusalSource,
): Promise<void> {
  try {
    if (eligibility.status !== "OUTSIDE_DELIVERY_AREA") return;
    const profile = await getCurrentVendorProfile();
    if (!profile) return;

    const record = refusalRecordFor(eligibility, new Date(), profile.timezone);
    if (!record) return;

    await recordDeliveryRefusal(getPrisma(), profile.id, record.district, record.day, source);
  } catch (error) {
    console.error(`delivery refusal count failed (source=${source}):`, error);
  }
}

/**
 * The header postcode control's variant: it has a postcode, not a verdict, so the eligibility
 * lookup happens here — inside the same guard, so a reference-database outage cannot break the
 * control either.
 */
export async function recordRefusalForPostcode(
  postcode: string,
  source: DeliveryRefusalSource,
): Promise<void> {
  try {
    if (postcode.trim() === "") return;
    await recordRefusalIfOutside(await getDeliveryEligibility(postcode), source);
  } catch (error) {
    console.error(`delivery refusal count failed (source=${source}):`, error);
  }
}

/** The staff table on `/staff/delivery-areas`: the last 30 vendor-local days, top 20 districts. */
export async function listRecentRefusalsForCurrentVendor(): Promise<DeliveryRefusalSummary[]> {
  const profile = await getCurrentVendorProfile();
  if (!profile) return [];
  return listRecentDeliveryRefusals(
    getPrisma(),
    profile.id,
    refusalWindowStart(new Date(), profile.timezone),
    20,
  );
}
