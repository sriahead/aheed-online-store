import { getPrisma, getPrismaWs } from "@/lib/db";
import { getCurrentVendorId } from "@/lib/tenant";
import {
  advanceOrderStatus,
  advanceOrderStatusBulk,
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
} from "@/lib/repositories/orders";

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
 */
export function getWebhookOrderService() {
  const prisma = getPrismaWs();
  return {
    findOrder: (orderNumber: string) => findOrderForWebhook(prisma, orderNumber),
    confirm: (orderNumber: string) => confirmPayment(prisma, orderNumber),
    fail: (orderNumber: string, reason: string) => failPayment(prisma, orderNumber, reason),
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
export function getGuestOrderLookupService() {
  const prisma = getPrisma();
  return {
    find: async (orderNumber: string, email: string) =>
      findOrderForGuestLookup(prisma, await getCurrentVendorId(), orderNumber, email),
  };
}
