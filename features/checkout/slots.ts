"use server";

import { getAvailableSlotsForVendor } from "@/lib/fulfilment-slots-service";
import type { FulfilmentMethod } from "@/lib/repositories/fulfilment-slots";

export async function getAvailableSlotsForDate(
  vendorId: string,
  method: FulfilmentMethod,
  dateStr: string,
) {
  return getAvailableSlotsForVendor(vendorId, method, dateStr);
}
