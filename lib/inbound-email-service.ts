import { getPrisma } from "@/lib/db";
import {
  findInboundAddress,
  findVendorOrderNumber,
  type InboundAddressPurposeValue,
} from "@/lib/repositories/inbound-address";

/**
 * The resolve path behind POST /api/inbound-email/resolve (#1217): which vendor owns the address a
 * message was sent to, where to forward it, and whether it is order-related. READS ONLY — nothing
 * about a received message is stored (R19). The dashboard's writes live in
 * lib/client-setup-service.ts.
 */

type Db = ReturnType<typeof getPrisma>;

export interface InboundResolution {
  forwardTo: string;
  vendorId: string;
  purpose: InboundAddressPurposeValue;
  orderRelated: boolean;
  orderNumber: string | null;
}

/**
 * `buildOrderNumber`'s shape (lib/order-totals.ts): `{3-char prefix}-{YYYYMMDD}-{6 chars}`, matched
 * case-insensitively anywhere in the subject. Deliberately looser than the generator's alphabet —
 * the database lookup, not the pattern, decides whether it is real.
 */
const ORDER_NUMBER_PATTERN = /\b([A-Z0-9]{3}-\d{8}-[A-Z0-9]{6})\b/gi;

export function extractOrderNumberCandidates(subject: string): string[] {
  return [...new Set([...subject.matchAll(ORDER_NUMBER_PATTERN)].map((m) => m[1].toUpperCase()))];
}

/** Pure over its client, so a plain script can exercise it against a real database. */
export async function resolveInboundEmailWith(
  prisma: Db,
  input: { to: string; subject: string },
): Promise<InboundResolution | null> {
  const row = await findInboundAddress(prisma, input.to);
  if (!row) return null;

  let orderNumber: string | null = null;
  for (const candidate of extractOrderNumberCandidates(input.subject)) {
    orderNumber = await findVendorOrderNumber(prisma, row.vendorId, candidate);
    if (orderNumber) break;
  }

  return {
    forwardTo: row.forwardTo,
    vendorId: row.vendorId,
    purpose: row.purpose,
    orderRelated: row.purpose === "ORDERS" || orderNumber !== null,
    orderNumber,
  };
}

export async function resolveInboundEmail(input: {
  to: string;
  subject: string;
}): Promise<InboundResolution | null> {
  return resolveInboundEmailWith(getPrisma(), input);
}
