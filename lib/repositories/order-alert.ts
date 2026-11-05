import type { OrderAlertChannel } from "@prisma/client/wasm";
import type { getPrisma } from "@/lib/db";
import { isUniqueViolation } from "./prisma-errors";

/**
 * Pure repository for a store's order-alert recipients (#1390).
 *
 * Every export takes its Prisma client and `vendorId` explicitly
 * (tests/repository-client-injection.test.ts) and reads no request context
 * (tests/repository-purity.test.ts). Each write is a singular, childless create or a deleteMany, so
 * `getPrisma()` (HTTP) is safe for all of them; none opens an implicit transaction (CLAUDE.md,
 * Database).
 */

type Db = ReturnType<typeof getPrisma>;

export interface OrderAlertRecipientRow {
  id: string;
  vendorId: string;
  channel: OrderAlertChannel;
  destination: string;
  createdAt: Date;
}

export async function listOrderAlertRecipients(
  prisma: Db,
  vendorId: string,
): Promise<OrderAlertRecipientRow[]> {
  return prisma.vendorOrderAlertRecipient.findMany({
    where: { vendorId },
    orderBy: [{ channel: "asc" }, { createdAt: "asc" }],
  });
}

/** One of THIS vendor's recipients, or null when the id belongs to no row of theirs. */
export async function findOrderAlertRecipient(
  prisma: Db,
  vendorId: string,
  id: string,
): Promise<OrderAlertRecipientRow | null> {
  return prisma.vendorOrderAlertRecipient.findFirst({ where: { id, vendorId } });
}

export type CreateOrderAlertRecipientResult = { ok: true } | { ok: false; reason: "duplicate" };

/**
 * The `@@unique([vendorId, channel, destination])` index is the duplicate guard, not a pre-read;
 * `isUniqueViolation` accepts both adapters' codes.
 */
export async function createOrderAlertRecipient(
  prisma: Db,
  vendorId: string,
  input: { channel: OrderAlertChannel; destination: string },
): Promise<CreateOrderAlertRecipientResult> {
  try {
    await prisma.vendorOrderAlertRecipient.create({
      data: { vendorId, channel: input.channel, destination: input.destination },
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "duplicate" };
    throw error;
  }
}

/** Removes one of THIS vendor's recipients. Returns how many rows went (0 or 1). */
export async function deleteOrderAlertRecipient(
  prisma: Db,
  vendorId: string,
  id: string,
): Promise<number> {
  const { count } = await prisma.vendorOrderAlertRecipient.deleteMany({ where: { id, vendorId } });
  return count;
}
