import { getPrisma } from "@/lib/db";
import {
  findInboundAddress,
  findVendorOrderNumber,
  type InboundAddressPurposeValue,
} from "@/lib/repositories/inbound-address";
import { fetchVendorProfile } from "@/lib/repositories/vendor";
import { sendOrderAlertForVendor } from "@/lib/order-alert-service";
import type { OrderAlertBrief } from "@/lib/order-alert/brief";
import type { OrderAlertSummary } from "@/lib/order-alert/send";

/**
 * The resolve path behind POST /api/inbound-email/resolve (#1217): which vendor owns the address a
 * message was sent to, where to forward it, and whether it is order-related. READS ONLY — nothing
 * about a received message is stored (R19). The dashboard's writes live in
 * lib/client-setup-service.ts. `alertForInboundEmail` (#1390) reuses the same resolution.
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

export type InboundAlertOutcome = { alerted: false } | ({ alerted: true } & OrderAlertSummary);

/**
 * #1390 R11 — behind POST /api/inbound-email/alert, called by the Worker after it has forwarded the
 * message. Re-resolves the address (the caller's word is not trusted for the vendor), and alerts
 * the store's recipients when the message is order-related. `null` means no store owns the address.
 * Stores nothing and logs nothing from the message.
 */
export interface InboundAlertDeps {
  storeName(vendorId: string): Promise<string>;
  send(vendorId: string, brief: OrderAlertBrief): Promise<OrderAlertSummary>;
}

/** Pure over its client and deps, so a test or plain script can exercise it. */
export async function alertForInboundEmailWith(
  prisma: Db,
  input: { to: string; subject: string; fromName: string | null },
  deps: InboundAlertDeps,
): Promise<InboundAlertOutcome | null> {
  const resolution = await resolveInboundEmailWith(prisma, input);
  if (!resolution) return null;
  if (!resolution.orderRelated) return { alerted: false };
  const summary = await deps.send(resolution.vendorId, {
    source: "email",
    storeName: await deps.storeName(resolution.vendorId),
    orderNumber: resolution.orderNumber,
    senderName: input.fromName,
    subject: input.subject,
  });
  return { alerted: true, ...summary };
}

export async function alertForInboundEmail(input: {
  to: string;
  subject: string;
  fromName: string | null;
}): Promise<InboundAlertOutcome | null> {
  const prisma = getPrisma();
  return alertForInboundEmailWith(prisma, input, {
    storeName: async (vendorId) => (await fetchVendorProfile(prisma, vendorId)).name,
    send: sendOrderAlertForVendor,
  });
}

export async function resolveInboundEmail(input: {
  to: string;
  subject: string;
}): Promise<InboundResolution | null> {
  return resolveInboundEmailWith(getPrisma(), input);
}
