import type { getPrisma } from "@/lib/db";

/**
 * The durable record of a refused Stripe payment binding (#454, P9.2).
 *
 * #429 made `app/api/webhooks/stripe/route.ts` fail closed: an event that
 * cannot be proved to be about this order's stored `Payment` row does not move
 * the order. That is correct, and it is not changed here. Its cost is that a
 * refusal against a GENUINE payment leaves a charged shopper's order stuck
 * `PENDING_PAYMENT`, and the route's only trace is a `console.error` — it
 * returns 200 and nothing throws, so `instrumentation.ts`'s `onRequestError`
 * never fires and no `ErrorEvent` row is written either.
 *
 * WHY A TABLE RATHER THAN A QUERY OVER EXISTING STATE
 *
 * `#454` originally suggested finding these by querying `PENDING_PAYMENT`
 * orders with a non-null `Payment.providerReference` past a threshold. That
 * bucket holds three different causes with three different remediations: an
 * abandoned checkout awaiting its `expired` webhook; a webhook that never
 * arrived (#101, remediation is to re-drive); and a refused binding (this,
 * remediation must NOT re-drive). Nothing in the order or payment row separates
 * them, and the refused case is the rare one hiding inside the common one. The
 * refusal is an EVENT, so recording it when it happens is the only thing that
 * makes the set exact.
 *
 * Every export takes its Prisma client explicitly and reads no request context,
 * so a plain `tsx` script can exercise this against a real database with no
 * live Workers request — `tests/repository-purity.test.ts` and
 * `tests/repository-client-injection.test.ts` both enforce that.
 */

// Long enough to outlive any realistic investigation of a stranded order, which
// is the whole reason these rows exist; the table takes one row per LOUD refusal
// and the expected rate is zero, so this is not a volume concern. Sweep pattern
// and probability copied from lib/repositories/order-lookup-rate-limit.ts.
// deleteMany is confirmed safe on the HTTP adapter (getPrisma()) per CLAUDE.md —
// unlike updateMany/createMany, neither of which this module uses.
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const SWEEP_PROBABILITY = 0.01;

/** What the refused event claimed. Every field is nullable — `unbindable` is precisely the case where they aren't all known. */
export interface RecordPaymentBindingRefusalInput {
  orderNumber: string;
  reason: string;
  provider: string;
  claimedProviderReference: string | null;
  claimedAmountPence: number | null;
  claimedCurrency: string | null;
}

/**
 * Records one refusal. Never throws for a missing order — a `not-found` refusal
 * is itself worth recording, and is exactly the case with no order to attach to.
 *
 * The order lookup is UN-SCOPED by necessity, the same exemption
 * `findOrderForWebhook` carries and for the same reason: a payment provider's
 * webhook arrives with an order number and no host, so there is no vendor to
 * scope by. `tests/repository-vendor-scoping.test.ts` records it deliberately.
 * The caller is the webhook path only; nothing reachable from unauthenticated
 * user input may call this.
 *
 * `storedCurrency` comes off the ORDER, not the payment — `Payment` has no
 * currency column, and `confirmPayment`'s binding compares `Order.currency`.
 */
export async function recordPaymentBindingRefusal(
  prisma: ReturnType<typeof getPrisma>,
  input: RecordPaymentBindingRefusalInput,
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { orderNumber: input.orderNumber },
    select: {
      id: true,
      vendorId: true,
      currency: true,
      payment: { select: { providerReference: true, amountPence: true } },
    },
  });

  await prisma.paymentBindingRefusal.create({
    data: {
      orderNumber: input.orderNumber,
      reason: input.reason,
      provider: input.provider,
      claimedProviderReference: input.claimedProviderReference,
      claimedAmountPence: input.claimedAmountPence,
      claimedCurrency: input.claimedCurrency,
      orderId: order?.id ?? null,
      vendorId: order?.vendorId ?? null,
      storedProviderReference: order?.payment?.providerReference ?? null,
      storedAmountPence: order?.payment?.amountPence ?? null,
      storedCurrency: order?.currency ?? null,
    },
  });

  if (Math.random() < SWEEP_PROBABILITY) {
    await prisma.paymentBindingRefusal.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
    });
  }
}

/** One row of the staff recovery worklist. */
export interface BindingRefusalRow {
  id: string;
  orderNumber: string;
  reason: string;
  provider: string;
  claimedProviderReference: string | null;
  claimedAmountPence: number | null;
  claimedCurrency: string | null;
  storedProviderReference: string | null;
  storedAmountPence: number | null;
  storedCurrency: string | null;
  resolution: string | null;
  resolutionDetail: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  orderStatus: string | null;
}

const REFUSAL_SELECT = {
  id: true,
  orderNumber: true,
  reason: true,
  provider: true,
  claimedProviderReference: true,
  claimedAmountPence: true,
  claimedCurrency: true,
  storedProviderReference: true,
  storedAmountPence: true,
  storedCurrency: true,
  resolution: true,
  resolutionDetail: true,
  resolvedAt: true,
  createdAt: true,
  order: { select: { status: true } },
} as const;

function toRow(row: { order: { status: string } | null; [k: string]: unknown }): BindingRefusalRow {
  const { order, ...rest } = row;
  return {
    ...(rest as Omit<BindingRefusalRow, "orderStatus">),
    orderStatus: order?.status ?? null,
  };
}

/**
 * This vendor's refusals, newest first.
 *
 * A refusal that resolved to NO vendor (`not-found` — the event named an order
 * that does not exist) is deliberately absent from every vendor's list: there is
 * no vendor to attribute it to, and by construction it stranded no order. Those
 * rows are kept for forensics and read from the database directly. This page is
 * a recovery worklist, not an audit console.
 */
export async function listBindingRefusalsForVendor(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  take: number,
): Promise<BindingRefusalRow[]> {
  const rows = await prisma.paymentBindingRefusal.findMany({
    where: { vendorId },
    orderBy: { createdAt: "desc" },
    take,
    select: REFUSAL_SELECT,
  });
  return rows.map(toRow);
}

/** The order's own stored session, plus what a recovery would have to satisfy. */
export interface RefusalRecoveryTarget {
  id: string;
  orderNumber: string;
  storedProviderReference: string | null;
  orderStatus: string | null;
}

/**
 * One refusal, scoped to the vendor. Null — not a throw, and not another
 * vendor's row — when the id belongs to someone else, so a forged id performs no
 * read of that row's data (R16).
 */
export async function findBindingRefusalForVendor(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  id: string,
): Promise<RefusalRecoveryTarget | null> {
  const row = await prisma.paymentBindingRefusal.findFirst({
    where: { id, vendorId },
    select: {
      id: true,
      orderNumber: true,
      storedProviderReference: true,
      order: { select: { status: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    storedProviderReference: row.storedProviderReference,
    orderStatus: row.order?.status ?? null,
  };
}

/**
 * Records what Stripe said about the order's own stored session.
 *
 * Vendor-scoped in the `where` itself rather than by a check-then-act read, so
 * there is no window between proving ownership and writing. `vendorId` is an
 * extra filter alongside the unique `id`, which Prisma permits and which makes a
 * cross-tenant write match zero rows and throw `P2025` instead of succeeding.
 * A singular `update`, never `updateMany` — the latter is unconditionally fatal
 * on the HTTP adapter this path runs on (CLAUDE.md).
 */
export async function recordRefusalResolution(
  prisma: ReturnType<typeof getPrisma>,
  vendorId: string,
  id: string,
  resolution: string,
  resolutionDetail: string,
): Promise<void> {
  await prisma.paymentBindingRefusal.update({
    where: { id, vendorId },
    data: { resolution, resolutionDetail, resolvedAt: new Date() },
  });
}
