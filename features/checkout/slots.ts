"use server";

import { getAvailableSlotsForVendor } from "@/lib/fulfilment-slots-service";
import type { FulfilmentMethod } from "@/lib/repositories/fulfilment-slots";

export async function getAvailableSlotsForDate(
  vendorId: string,
  method: FulfilmentMethod,
  /** #811 — a `YYYY-MM-DD` calendar day, never an instant. */
  day: string,
) {
  return getAvailableSlotsForVendor(vendorId, method, day);
}
