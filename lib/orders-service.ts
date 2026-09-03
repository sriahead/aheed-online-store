import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  advanceOrderStatus,
  advanceOrderStatusBulk,
  cancelUnpaidOrder,
  confirmPayment,
  countOrdersForStaff,
  failPayment,
  findOrderForGuestLookup,
  findOrderForStaff,
  findOrderForUser,
  findOrderForViewer,
  findOrderForWebhook,
  getFinancialsForStaff,
  listOrdersForStaff,
  listOrdersForUser,
  placeOrder,
  type OrderRepository,
  type PaymentBinding,
  type PaymentTransitionRefusal,
} from "@/lib/repositories/orders";
import { recordPaymentBindingRefusal } from "@/lib/repositories/payment-binding-refusals";

/**
 * Request-scoped wrappers around `lib/repositories/orders.ts` (#252) — the three
 * factories that used to live inside that module, moved out so every export
 * there takes its client and `vendorId` explicitly.
 *
 * That property is load-bearing for this module above all others: `placeOrder`'s
 * atomicity, the stock-decrement compare-and-set, and `advanceOrderStatus`'s
 * transition guard are the codebase's most important concurrency guarantees, and
 * none can be proven from a plain `tsx` script if the only entry point needs a
 * live Workers request. `tests/repository-purity.test.ts` enforces the location.
 *
 * All three construct their client fresh per call and never cache it across
 * requests (CLAUDE.md).
 */
export function getOrderRepository(): OrderRepository {
  const prisma = getPrisma();
  let vendorIdPromise: Promise<string> | undefined;
  const vendorId = () => (vendorIdPromise ??= getCurrentVendorId());

  return {
    async createOrder(input) {
      return placeOrder(getPrismaWs(), await vendorId(), input);
    },

    async getByOrderNumber(orderNumber, viewerUserId, confirmationToken) {
      return findOrderForViewer(
        prisma,
        await vendorId(),
        orderNumber,
        viewerUserId,
        confirmationToken,
      );
    },

    async listForUser(userId, opts) {
      return listOrdersForUser(prisma, await vendorId(), userId, opts);
    },

    async getForUser(orderNumber, userId) {
      return findOrderForUser(prisma, await vendorId(), orderNumber, userId);
    },

    async listForStaff(opts) {
      return listOrdersForStaff(prisma, await vendorId(), opts);
    },

    async countForStaff() {
      return countOrdersForStaff(prisma, await vendorId());
    },

    async getForStaff(orderNumber) {
      return findOrderForStaff(prisma, await vendorId(), orderNumber);
    },

    async advance(orderNumber, toStatus, actor) {
      return advanceOrderStatus(getPrismaWs(), await vendorId(), orderNumber, toStatus, actor);
    },

    async advanceBulk(items, actor) {
      return advanceOrderStatusBulk(getPrismaWs(), await vendorId(), items, actor);
    },

    async getFinancialsForStaff() {
      return getFinancialsForStaff(prisma, await vendorId());
    },
  };
}

/**
 * Webhook-facing factory: resolves its own client, so
 * `app/api/webhooks/stripe/route.ts` never imports `@/lib/db` itself (the
 * no-direct-Prisma guard covers `app/`, `features/` and `components/` — there is
 * no webhook-specific carve-out, unlike `/api/health`'s narrow infra-probe
 * exception).
 *
 * Takes no vendor: a payment-provider webhook arrives with an order number and
 * no host, so there is no vendor to scope by. `lib/repositories/orders.ts`
 * documents that exemption on `findOrderForWebhook` itself, and
 * `tests/repository-vendor-scoping.test.ts` records it as a deliberate one.
 *
 * Always the WEBSOCKET client — `confirmPayment` runs an interactive transaction.
 *
 * `confirm` and `fail` both take a `PaymentBinding` (P9.1, #429): the order
 * number arriving in the event authorizes nothing on its own, so the caller must
 * also pass what the event claims about the payment. This wrapper forwards it
 * unchanged and makes no decision about it — the whole point is that the
 * comparison happens in the repository's `where` clause, against Postgres.
 *
 * #454 adds refusal PERSISTENCE here, deliberately at this layer rather than
 * inside `confirmPayment`/`failPayment`: those two are the security-critical
 * functions #429 installed and this slice does not modify them. A refusal is an
 * event about them, not part of them.
 */
export function getWebhookOrderService() {
  const prisma = getPrismaWs();

  /**
   * Persists a LOUD refusal, mirroring `reportRefusal`'s rule in the route
   * exactly: `already-processed` is normal — Stripe retries aggressively and a
   * duplicate delivery is the system working — so it is never recorded.
   *
   * Never rethrows. A refusal is already the failure path; making the webhook's
   * own response depend on our ability to write a forensic row would turn a
   * recorded anomaly into an unrecorded one, and Stripe would retry an event
   * that will never succeed. The write failing is itself logged instead.
   */
  const persistRefusal = async (
    orderNumber: string,
    reason: PaymentTransitionRefusal,
    binding: PaymentBinding,
  ): Promise<void> => {
    if (reason === "already-processed") return;
    try {
      await recordPaymentBindingRefusal(prisma, {
        orderNumber,
        reason,
        provider: binding.provider,
        claimedProviderReference: binding.providerReference,
        claimedAmountPence: binding.amountPence,
        claimedCurrency: binding.currency,
      });
    } catch (error) {
      console.error(
        `failed to persist payment binding refusal: order=${orderNumber} reason=${reason}`,
        error,
      );
    }
  };

  return {
    findOrder: (orderNumber: string) => findOrderForWebhook(prisma, orderNumber),
    confirm: async (orderNumber: string, binding: PaymentBinding) => {
      const result = await confirmPayment(prisma, orderNumber, binding);
      if (!result.ok) await persistRefusal(orderNumber, result.reason, binding);
      return result;
    },
    fail: async (orderNumber: string, binding: PaymentBinding, reason: string) => {
      const result = await failPayment(prisma, orderNumber, binding, reason);
      if (!result.ok) await persistRefusal(orderNumber, result.reason, binding);
      return result;
    },
  };
}

/**
 * The staff recovery path for an order stranded by a refused binding (#454).
 *
 * Separate from `getWebhookOrderService()` for two reasons. It does NOT persist
 * a refusal on failure — a staff recovery attempt that legitimately fails
 * (because Stripe says the session really was not paid) is the control working,
 * not a new webhook anomaly, and recording one per click would bury the real
 * rows. And its caller has already proved vendor ownership by resolving the
 * refusal row through `getBindingRefusalService()`, which scopes by vendor; the
 * order number handed here comes off that row, never off a form field.
 *
 * `confirmPayment` is reached UNCHANGED and with a binding built from Stripe's
 * own response. That is the whole security argument for this feature: recovery
 * introduces no second path to CONFIRMED, because it has to satisfy the same
 * compare-and-set predicate #429 installed. A refusal that was correct cannot be
 * confirmed away by a staff click.
 */
export function getOrderRecoveryService() {
  const prisma = getPrismaWs();
  return {
    findOrder: (orderNumber: string) => findOrderForWebhook(prisma, orderNumber),
    confirm: (orderNumber: string, binding: PaymentBinding) =>
      confirmPayment(prisma, orderNumber, binding),
  };
}

/**
 * Guest order lookup (P7a fix, #123/#192) — resolves its own client and the
 * current vendor so `app/(storefront)/orders/lookup` never imports `@/lib/db`.
 *
 * Unlike the webhook service above this IS vendor-scoped: the lookup page is
 * public, and `findOrderForGuestLookup` verifies the order-number/email
 * credential pair at the query level within one vendor.
 */
/**
 * The shopper-facing "cancel my unpaid order" path (P9.1, #429).
 *
 * Vendor-scoped, and deliberately NOT `getWebhookOrderService().fail` — that now
 * requires a payment binding, which a shopper cancelling from their own browser
 * has no session id to supply. Authorization for this path is the capability
 * token, proved by the action before it calls here.
 */
export function getOrderCancelService() {
  return {
    cancelUnpaid: async (orderNumber: string, reason: string) =>
      cancelUnpaidOrder(getPrismaWs(), await getCurrentVendorId(), orderNumber, reason),
  };
}

export function getGuestOrderLookupService() {
  const prisma = getPrisma();
  return {
    find: async (orderNumber: string, email: string) =>
      findOrderForGuestLookup(prisma, await getCurrentVendorId(), orderNumber, email),
  };
}
