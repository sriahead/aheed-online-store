import type { getPrisma } from "@/lib/db";
import { isUniqueViolation } from "./prisma-errors";

/**
 * Pure repository for a store's receiving email addresses (#1217).
 *
 * Every export takes its Prisma client explicitly (tests/repository-client-injection.test.ts) and
 * reads no request context (tests/repository-purity.test.ts). Each write is a singular, childless
 * create or a deleteMany, so `getPrisma()` (HTTP) is safe for all of them — none opens an implicit
 * transaction (CLAUDE.md, Database).
 *
 * `findInboundAddress` is un-scoped by design, like the host → vendor lookup: the address IS what
 * identifies the vendor. Allowlisted with that reason in tests/repository-vendor-scoping.test.ts.
 */

type Db = ReturnType<typeof getPrisma>;

export type InboundAddressPurposeValue = "ORDERS" | "SUPPORT";

export interface InboundAddressRow {
  id: string;
  vendorId: string;
  address: string;
  purpose: InboundAddressPurposeValue;
  forwardTo: string;
  createdAt: Date;
}

export function normaliseAddress(address: string): string {
  return address.trim().toLowerCase();
}

/** The address row, matched case-insensitively (rows are stored lower-case), or null. */
export async function findInboundAddress(
  prisma: Db,
  address: string,
): Promise<InboundAddressRow | null> {
  return prisma.vendorInboundAddress.findUnique({
    where: { address: normaliseAddress(address) },
  });
}

export async function listInboundAddresses(
  prisma: Db,
  vendorId: string,
): Promise<InboundAddressRow[]> {
  return prisma.vendorInboundAddress.findMany({
    where: { vendorId },
    orderBy: [{ purpose: "asc" }, { address: "asc" }],
  });
}

export type CreateInboundAddressResult =
  { ok: true; row: InboundAddressRow } | { ok: false; reason: "duplicate" };

/**
 * Creates one address for the vendor. A duplicate address — registered to any vendor — comes back
 * as `{ ok: false, reason: "duplicate" }`. The unique index is the guard, not a pre-read, so two
 * concurrent saves cannot both succeed; `isUniqueViolation` accepts both adapters' codes.
 */
export async function createInboundAddress(
  prisma: Db,
  vendorId: string,
  input: { address: string; purpose: InboundAddressPurposeValue; forwardTo: string },
): Promise<CreateInboundAddressResult> {
  try {
    const row = await prisma.vendorInboundAddress.create({
      data: {
        vendorId,
        address: normaliseAddress(input.address),
        purpose: input.purpose,
        forwardTo: normaliseAddress(input.forwardTo),
      },
    });
    return { ok: true, row };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "duplicate" };
    throw error;
  }
}

/** Removes one of THIS vendor's addresses. Returns how many rows went (0 or 1). */
export async function deleteInboundAddress(
  prisma: Db,
  vendorId: string,
  id: string,
): Promise<number> {
  const { count } = await prisma.vendorInboundAddress.deleteMany({ where: { id, vendorId } });
  return count;
}

/** The vendor's own order with this number, or null — the cross-vendor guard for R18. */
export async function findVendorOrderNumber(
  prisma: Db,
  vendorId: string,
  orderNumber: string,
): Promise<string | null> {
  const order = await prisma.order.findFirst({
    where: { vendorId, orderNumber },
    select: { orderNumber: true },
  });
  return order?.orderNumber ?? null;
}
