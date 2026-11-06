import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolveOwnerEmail, type StoreContext } from "@/lib/order-notifications/build";
import { createOrderNotifier } from "@/lib/order-notifications/notify";
import { ORDER_EVENTS } from "@/lib/order-notifications/next-step";
import type { NotificationMessage } from "@/lib/notifications/dispatch";
import { webhookOrder } from "./fixtures/webhook-order";

/** #1435 R8 (one entry point), R10 (unpaid and resend), R11 (no buyer email), R15, R18. */

const STORE: StoreContext = {
  vendorId: "v-1",
  sender: { name: "Corner Shop", email: "orders@shop.test" },
  baseUrl: "https://shop.example.test",
  ownerEmail: "owner@shop.test",
  telegramChatIds: ["-1001", "-1002"],
  environment: "production",
};

function setup(store: Partial<StoreContext> = {}) {
  const sent: NotificationMessage[] = [];
  const logs: string[] = [];
  const notifier = createOrderNotifier({
    loadStore: vi.fn(async () => ({ ...STORE, ...store })),
    dispatch: {
      email: {
        send: vi.fn(async (m) => {
          sent.push({
            channel: "EMAIL",
            destination: m.to,
            subject: m.subject,
            body: m.html,
            replyTo: m.replyTo,
            log: { audience: "CUSTOMER", event: "" },
          });
          return { status: "sent" as const };
        }),
      },
      telegram: {
        send: vi.fn(async (destination: string, body: string) => {
          sent.push({
            channel: "TELEGRAM",
            destination,
            body,
            log: { audience: "OWNER", event: "" },
          });
          return { status: "sent" as const };
        }),
      },
      enqueue: vi.fn(async () => {}),
      markPending: vi.fn(async () => {}),
      log: (l) => void logs.push(l),
    },
    log: (l) => void logs.push(l),
  });
  return { notifier, sent, logs };
}

describe("notifyOrderEvent (R8)", () => {
  it.each([...ORDER_EVENTS])(
    "%s: the customer email, the owner email and every Telegram recipient",
    async (event) => {
      const { notifier, sent } = setup();
      await notifier.notifyOrderEvent(webhookOrder({ status: event }), event);
      expect(
        sent
          .filter((m) => m.channel === "EMAIL")
          .map((m) => m.destination)
          .sort(),
      ).toEqual(["buyer@customer.test", "owner@shop.test"]);
      expect(sent.filter((m) => m.channel === "TELEGRAM").map((m) => m.destination)).toEqual([
        "-1001",
        "-1002",
      ]);
      const owner = sent.find((m) => m.destination === "owner@shop.test");
      expect(owner?.replyTo).toBe("buyer@customer.test");
    },
  );

  it.each(["PENDING_PAYMENT", "SOMETHING_ELSE"])("%s sends nothing", async (status) => {
    const { notifier, sent } = setup();
    await notifier.notifyOrderEvent(webhookOrder(), status);
    expect(sent).toEqual([]);
  });

  it("never rejects, even when the store cannot be loaded", async () => {
    const notifier = createOrderNotifier({
      loadStore: async () => {
        throw new Error("db down");
      },
      dispatch: {
        email: { send: vi.fn() },
        telegram: { send: vi.fn() },
        enqueue: vi.fn(),
        markPending: vi.fn(),
        log: vi.fn(),
      },
      log: vi.fn(),
    });
    await expect(notifier.notifyOrderEvent(webhookOrder(), "CONFIRMED")).resolves.toBeUndefined();
    await expect(notifier.notifyCustomerConfirmation(webhookOrder())).resolves.toBeUndefined();
    await expect(
      notifier.notifyBulkStatusChange([{ order: webhookOrder(), toStatus: "DELIVERED" }]),
    ).resolves.toBeUndefined();
  });

  it("R11: no buyer email means no customer message and a skipped line", async () => {
    const { notifier, sent, logs } = setup();
    await notifier.notifyOrderEvent(webhookOrder({ buyerEmail: null }), "CONFIRMED");
    expect(sent.some((m) => m.destination === "buyer@customer.test")).toBe(false);
    expect(sent.some((m) => m.destination === "owner@shop.test")).toBe(true);
    expect(logs).toContain(
      "notification vendorId=v-1 channel=EMAIL audience=CUSTOMER event=CONFIRMED status=skipped reason=no buyer email",
    );
  });
});

describe("owner recipients (R15)", () => {
  const a = (address: string, purpose: "ORDERS" | "SUPPORT", forwardTo: string) => ({
    address,
    purpose,
    forwardTo,
  });

  it("ORDERS first (lowest address), then SUPPORT, never the platform default", () => {
    expect(
      resolveOwnerEmail([
        a("support@s.test", "SUPPORT", "support-box@s.test"),
        a("z-orders@s.test", "ORDERS", "z-box@s.test"),
        a("a-orders@s.test", "ORDERS", "a-box@s.test"),
      ]),
    ).toBe("a-box@s.test");
    expect(resolveOwnerEmail([a("support@s.test", "SUPPORT", "support-box@s.test")])).toBe(
      "support-box@s.test",
    );
    expect(resolveOwnerEmail([])).toBeNull();
  });

  it("no recipients: only the customer email, and no error", async () => {
    const { notifier, sent } = setup({ ownerEmail: null, telegramChatIds: [] });
    await notifier.notifyOrderEvent(webhookOrder(), "CONFIRMED");
    expect(sent.map((m) => m.destination)).toEqual(["buyer@customer.test"]);
  });
});

describe("R10 — resend and unpaid orders", () => {
  it("resend reaches only the customer", async () => {
    const { notifier, sent } = setup();
    await notifier.notifyCustomerConfirmation(webhookOrder());
    expect(sent.map((m) => m.destination)).toEqual(["buyer@customer.test"]);
    expect(sent[0].subject).toContain("is confirmed");
  });

  it("the unpaid-order cancel paths call no notifier", () => {
    expect(readFileSync("features/checkout/cancel-order.ts", "utf8")).not.toMatch(/notify\w*\(/);
    // The sweep notifies only on the confirm branch, with CONFIRMED; its expiry of a
    // PENDING_PAYMENT order is not an order event.
    const sweep = readFileSync("lib/payment-sweep-service.ts", "utf8");
    expect(sweep.match(/notify\w*\(/g)).toEqual(["notifyOrderEvent("]);
    expect(sweep).toContain('notifyOrderEvent(order, "CONFIRMED")');
  });
});

describe("bulk status change (R18)", () => {
  it("25 orders: 25 customer emails, one digest per owner recipient per channel", async () => {
    const { notifier, sent } = setup();
    const moved = Array.from({ length: 25 }, (_, i) => ({
      order: webhookOrder({ orderNumber: `SHO-${i + 1}`, buyerEmail: `b${i}@customer.test` }),
      toStatus: "OUT_FOR_DELIVERY",
    }));
    await notifier.notifyBulkStatusChange(moved);

    const customers = sent.filter((m) => m.destination.endsWith("@customer.test"));
    expect(customers).toHaveLength(25);
    const ownerEmails = sent.filter((m) => m.destination === "owner@shop.test");
    expect(ownerEmails).toHaveLength(1);
    expect(ownerEmails[0].subject).toBe("Out for delivery: 25 orders");
    const tg = sent.filter((m) => m.channel === "TELEGRAM");
    expect(tg.map((m) => m.destination)).toEqual(["-1001", "-1002"]);
    expect(tg[0].body.split("\n")).toHaveLength(22);
    expect(tg[0].body).toContain("+5 more");
  });

  it("one digest per target status", async () => {
    const { notifier, sent } = setup({ telegramChatIds: [] });
    await notifier.notifyBulkStatusChange([
      { order: webhookOrder({ orderNumber: "A" }), toStatus: "OUT_FOR_DELIVERY" },
      {
        order: webhookOrder({ orderNumber: "B", fulfilmentMethod: "COLLECTION" }),
        toStatus: "READY_FOR_COLLECTION",
      },
    ]);
    expect(
      sent
        .filter((m) => m.destination === "owner@shop.test")
        .map((m) => m.subject)
        .sort(),
    ).toEqual(["Out for delivery: 1 order", "Ready for collection: 1 order"]);
  });
});
