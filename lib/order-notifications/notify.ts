import {
  dispatchNotifications,
  notificationLogLine,
  type DispatchDeps,
  type NotificationMessage,
} from "@/lib/notifications/dispatch";
import type { WebhookOrder } from "@/lib/repositories/orders";
import { customerMessage, ownerDigestMessages, ownerMessages, type StoreContext } from "./build";
import { isOrderEvent, type OrderEvent } from "./next-step";

/**
 * #1435 R8/R10/R18 — the orchestration: load the store once, build the messages, dispatch them.
 * Injectable so every rule is provable without a database, a provider or a request
 * (`lib/order-notifications-service.ts` binds the real dependencies).
 *
 * No method ever rejects. Each is called after an order change has committed — a confirmed payment,
 * a delivery that happened — and that must not be undone or reported as failed because a store's
 * settings could not be read or a provider was down.
 */

export interface NotifierDeps {
  loadStore(vendorId: string): Promise<StoreContext>;
  dispatch: DispatchDeps;
  log(line: string): void;
}

export interface OrderNotifier {
  /** R8 — the customer and owner messages for one event; any other status sends nothing. */
  notifyOrderEvent(order: WebhookOrder, status: string): Promise<void>;
  /** R10 — staff "Resend confirmation email": the customer's confirmation only, never the owner. */
  notifyCustomerConfirmation(order: WebhookOrder): Promise<void>;
  /** R18 — a bulk change: one customer email per order, one owner digest per status per recipient. */
  notifyBulkStatusChange(
    moved: readonly { order: WebhookOrder; toStatus: string }[],
  ): Promise<void>;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

export function createOrderNotifier(deps: NotifierDeps): OrderNotifier {
  function customerOrSkip(
    order: WebhookOrder,
    event: OrderEvent,
    store: StoreContext,
  ): NotificationMessage | null {
    const message = customerMessage(order, event, store);
    if (!message) {
      deps.log(
        notificationLogLine(
          order.vendorId,
          { channel: "EMAIL", log: { audience: "CUSTOMER", event } },
          "skipped",
          "no buyer email",
        ),
      );
    }
    return message;
  }

  async function guarded(label: string, vendorId: string, work: () => Promise<void>) {
    try {
      await work();
    } catch (error) {
      deps.log(`notification vendorId=${vendorId} ${label} failed: ${errorName(error)}`);
    }
  }

  return {
    async notifyOrderEvent(order, status) {
      if (!isOrderEvent(status)) return;
      await guarded(`event ${status}`, order.vendorId, async () => {
        const store = await deps.loadStore(order.vendorId);
        const customer = customerOrSkip(order, status, store);
        const messages = [...(customer ? [customer] : []), ...ownerMessages(order, status, store)];
        await dispatchNotifications(deps.dispatch, order.vendorId, messages);
      });
    },

    async notifyCustomerConfirmation(order) {
      await guarded("resend CONFIRMED", order.vendorId, async () => {
        const store = await deps.loadStore(order.vendorId);
        const customer = customerOrSkip(order, "CONFIRMED", store);
        if (customer) await dispatchNotifications(deps.dispatch, order.vendorId, [customer]);
      });
    },

    async notifyBulkStatusChange(moved) {
      const byVendor = new Map<string, { order: WebhookOrder; event: OrderEvent }[]>();
      for (const { order, toStatus } of moved) {
        if (!isOrderEvent(toStatus)) continue;
        const list = byVendor.get(order.vendorId) ?? [];
        list.push({ order, event: toStatus });
        byVendor.set(order.vendorId, list);
      }

      for (const [vendorId, entries] of byVendor) {
        await guarded("bulk", vendorId, async () => {
          const store = await deps.loadStore(vendorId);
          // One at a time, as the per-order emails always went: a large batch must not open dozens
          // of provider requests at once.
          for (const { order, event } of entries) {
            const customer = customerOrSkip(order, event, store);
            if (customer) await dispatchNotifications(deps.dispatch, vendorId, [customer]);
          }
          const byEvent = new Map<OrderEvent, string[]>();
          for (const { order, event } of entries) {
            byEvent.set(event, [...(byEvent.get(event) ?? []), order.orderNumber]);
          }
          const digests = [...byEvent].flatMap(([event, numbers]) =>
            ownerDigestMessages(event, numbers, store),
          );
          await dispatchNotifications(deps.dispatch, vendorId, digests);
        });
      }
    },
  };
}
