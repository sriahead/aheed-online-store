import { describe, it, expect } from "vitest";
import { buildCustomerEmail } from "@/lib/order-notifications/customer-email";
import {
  CANCELLED_NEXT_STEP,
  ORDER_EVENTS,
  nextStepText,
  slotSentence,
  type OrderEvent,
} from "@/lib/order-notifications/next-step";
import { slotLabel } from "@/lib/order-notifications/slot";
import { canonicalBaseUrl, customerOrderHref } from "@/lib/order-notifications/links";
import {
  buildOwnerDigestEmail,
  buildOwnerEmail,
  ownerDigestTelegramText,
  ownerTelegramText,
} from "@/lib/order-notifications/owner";
import { textOf, webhookOrder } from "./fixtures/webhook-order";

/** #1435 R11-R17 — the customer email, the shared next-step copy and the owner messages. */

const BASE = "https://shop.example.test";
const STORE = "Corner Shop";

function customer(event: OrderEvent, overrides = {}, baseUrl: string | null = BASE) {
  return buildCustomerEmail({
    order: webhookOrder({ status: event, ...overrides }),
    event,
    storeName: STORE,
    baseUrl,
  });
}

function anchors(html: string): string[] {
  return html.match(/<a\b[^>]*>.*?<\/a>/g) ?? [];
}

describe("slotLabel", () => {
  it("formats the stored UTC-midnight day and the slot window", () => {
    expect(
      slotLabel(new Date("2026-11-06T00:00:00.000Z"), { startTime: "10:00", endTime: "12:00" }),
    ).toBe("Friday 6 November, 10:00–12:00");
  });

  it("is null without a date or a slot", () => {
    expect(slotLabel(null, { startTime: "10:00", endTime: "12:00" })).toBeNull();
    expect(slotLabel(new Date(), null)).toBeNull();
  });
});

describe("customer email subject (R11, #1564 R7)", () => {
  it.each([
    ["CONFIRMED", "Order SHO-20261105-ABC123 is confirmed"],
    ["OUT_FOR_DELIVERY", "Your order SHO-20261105-ABC123 is on its way"],
    ["DELIVERED", "Order SHO-20261105-ABC123 has been delivered"],
    ["READY_FOR_COLLECTION", "Order SHO-20261105-ABC123 is ready to collect"],
    ["COLLECTED", "Thanks for collecting order SHO-20261105-ABC123"],
    ["CANCELLED", "Order SHO-20261105-ABC123 has been cancelled"],
    ["PAYMENT_FAILED", "Your payment for order SHO-20261105-ABC123 didn't go through"],
  ] as const)(
    "%s → %s, with no store-name suffix (the From name is the store)",
    (event, subject) => {
      expect(customer(event).subject).toBe(subject);
    },
  );

  it("every event has a preheader and a plain-text part naming the order", () => {
    for (const event of ORDER_EVENTS) {
      const email = customer(event);
      expect(email.preheader.length).toBeGreaterThan(10);
      expect(email.text).toContain("SHO-20261105-ABC123");
      expect(email.text).not.toMatch(/<[a-z]/i);
    }
  });
});

describe("what happens next (R12)", () => {
  const slot = "Friday 6 November, 10:00–12:00";

  it.each([
    [
      "CONFIRMED",
      "DELIVERY",
      "We'll pack your order and email you when it's out for delivery.",
      `Your delivery slot: ${slot}.`,
    ],
    [
      "CONFIRMED",
      "COLLECTION",
      "We'll pack your order and email you as soon as it's ready to collect.",
      `Your collection slot: ${slot}.`,
    ],
    [
      "OUT_FOR_DELIVERY",
      "DELIVERY",
      "Our driver has your order now. Please keep your phone nearby in case they need to reach you.",
      `Expected: ${slot}.`,
    ],
    [
      "READY_FOR_COLLECTION",
      "COLLECTION",
      "Your items are packed and waiting for you in store. Bring your order number: SHO-20261105-ABC123.",
      `Your collection slot: ${slot}.`,
    ],
    [
      "DELIVERED",
      "DELIVERY",
      "Nothing else to do. If anything isn't right, reply to this email and we'll put it right.",
      null,
    ],
    [
      "COLLECTED",
      "COLLECTION",
      "Nothing else to do. If anything isn't right, reply to this email and we'll put it right.",
      null,
    ],
  ] as const)("%s (%s)", (event, method, text, sentence) => {
    expect(nextStepText(event, method, "SHO-20261105-ABC123")).toBe(text);
    expect(slotSentence(event, method, slot)).toBe(sentence);
    expect(slotSentence(event, method, null)).toBeNull();

    const body = textOf(customer(event, { fulfilmentMethod: method }).html);
    expect(body).toContain(text);
    if (sentence) expect(body).toContain(sentence);
    const noSlot = textOf(customer(event, { fulfilmentMethod: method, fulfilmentSlot: null }).html);
    expect(noSlot).toContain(text);
    if (sentence) expect(noSlot).not.toContain(sentence);
  });

  it("CANCELLED keeps the money-careful copy and never mentions a refund", () => {
    expect(nextStepText("CANCELLED", "DELIVERY", "X")).toBe(CANCELLED_NEXT_STEP);
    const body = textOf(customer("CANCELLED").html);
    expect(body).toContain(CANCELLED_NEXT_STEP);
    expect(body).not.toMatch(/refund|refunded|repaid/i);
    expect(body).toMatch(/no payment has been returned/i);
  });

  it("PENDING_PAYMENT has no next step", () => {
    expect(nextStepText("PENDING_PAYMENT", "DELIVERY", "X")).toBeNull();
  });
});

describe("order details, savings, points and the link (R13)", () => {
  it("the confirmation keeps its money block and adds a savings line only for a real discount", () => {
    const none = textOf(customer("CONFIRMED").html);
    expect(none).toContain("Subtotal");
    expect(none).toContain("Delivery");
    expect(none).not.toContain("You saved");

    const saved = textOf(customer("CONFIRMED", { discountPence: 500, totalPence: 3750 }).html);
    expect(saved).toContain("You saved £5.00 on this order.");
    expect(saved).toContain("Loyalty points");

    expect(textOf(customer("DELIVERED", { discountPence: 500 }).html)).not.toContain("You saved");
  });

  it("names points earned on the confirmation and the final emails only", () => {
    for (const event of ["CONFIRMED", "DELIVERED", "COLLECTED"] as const) {
      expect(textOf(customer(event, { pointsEarned: 42 }).html)).toContain(
        "You earned 42 loyalty points on this order.",
      );
      expect(textOf(customer(event, { pointsEarned: 0 }).html)).not.toContain("loyalty points on");
      expect(textOf(customer(event, { pointsEarned: null }).html)).not.toContain(
        "loyalty points on",
      );
    }
    expect(textOf(customer("OUT_FOR_DELIVERY", { pointsEarned: 42 }).html)).not.toContain(
      "You earned",
    );
  });

  it.each([
    ["a member", { userId: "u-1" }, `${BASE}/account/orders/SHO-20261105-ABC123`],
    [
      "a guest with a token",
      { userId: null, confirmationToken: "tok-1" },
      `${BASE}/checkout/SHO-20261105-ABC123?t=tok-1`,
    ],
    [
      "a guest without a token",
      { userId: null, confirmationToken: null },
      `${BASE}/orders/lookup?orderNumber=SHO-20261105-ABC123`,
    ],
  ])("one 'View your order' link for %s, and no other order link", (_label, overrides, href) => {
    for (const event of ORDER_EVENTS) {
      const links = anchors(customer(event, overrides).html);
      const cta = links.filter((a) => textOf(a) === "View your order");
      expect(cta).toHaveLength(1);
      expect(cta[0]).toContain(`href="${href}"`);
      // #1564: the only other links are the store's site (header, footer) and Powered by.
      for (const other of links.filter((a) => textOf(a) !== "View your order")) {
        expect(other).toMatch(new RegExp(`href="(${BASE}|https://merqify\.com)"`));
      }
    }
    expect(customerOrderHref(BASE, webhookOrder(overrides))).toBe(href);
  });

  it("no canonical host means no order link and no store-site link", () => {
    for (const event of ORDER_EVENTS) {
      const links = anchors(customer(event, {}, null).html);
      expect(links).toHaveLength(1);
      expect(links[0]).toContain('href="https://merqify.com"');
    }
  });

  it("canonicalBaseUrl takes the lowest canonical host, or none", () => {
    expect(
      canonicalBaseUrl([
        { host: "z.example.test", isCanonical: true },
        { host: "a.example.test", isCanonical: false },
        { host: "m.example.test", isCanonical: true },
      ]),
    ).toBe("https://m.example.test");
    expect(canonicalBaseUrl([{ host: "a.example.test", isCanonical: false }])).toBeNull();
    expect(canonicalBaseUrl([])).toBeNull();
  });
});

describe("escaping (R14)", () => {
  const nasty = webhookOrder({
    items: [
      {
        productName: "<script>x</script>",
        unitPricePence: 100,
        quantity: 1,
        lineTotalPence: 100,
        customNote: "<script>n</script>",
      },
    ],
    discountCode: { code: "<script>c</script>", amountPence: 100 },
    discountPence: 100,
  });

  it.each([...ORDER_EVENTS])("%s customer and owner emails carry no raw <script>", (event) => {
    const c = buildCustomerEmail({
      order: nasty,
      event,
      storeName: "<script>s</script>",
      baseUrl: BASE,
    });
    expect(c.html).not.toContain("<script>");
    const o = buildOwnerEmail({
      order: nasty,
      event,
      storeName: "<script>s</script>",
      baseUrl: BASE,
    });
    expect(o.html).not.toContain("<script>");
  });
});

describe("owner Telegram text (R16)", () => {
  const planted = webhookOrder({
    buyerEmail: "secret-buyer@customer.test",
    items: [
      {
        productName: "SecretProduct",
        unitPricePence: 100,
        quantity: 2,
        lineTotalPence: 200,
        customNote: "SecretNote",
      },
    ],
    totalPence: 450,
  });

  it("five lines for a delivery order, tagged on staging", () => {
    expect(
      ownerTelegramText({
        order: planted,
        event: "CONFIRMED",
        storeName: STORE,
        baseUrl: BASE,
        environment: "staging",
      }),
    ).toBe(
      [
        "[STAGING] New order: Corner Shop",
        "Order: SHO-20261105-ABC123",
        "Total: £4.50 (2 items)",
        "Delivery: Friday 6 November, 10:00–12:00",
        `${BASE}/staff/orders/SHO-20261105-ABC123`,
      ].join("\n"),
    );
  });

  it("collection, Express, no slot, no host, untagged in production", () => {
    const text = ownerTelegramText({
      order: webhookOrder({
        fulfilmentMethod: "COLLECTION",
        isExpress: true,
        fulfilmentSlot: null,
      }),
      event: "READY_FOR_COLLECTION",
      storeName: STORE,
      baseUrl: null,
      environment: "production",
    });
    expect(text.split("\n")).toEqual([
      "Ready for collection: Corner Shop",
      "Order: SHO-20261105-ABC123",
      "Total: £42.50 (4 items)",
      "Collection: no slot · Express",
    ]);
  });

  it.each([
    ["CONFIRMED", "New order"],
    ["OUT_FOR_DELIVERY", "Out for delivery"],
    ["DELIVERED", "Delivered"],
    ["READY_FOR_COLLECTION", "Ready for collection"],
    ["COLLECTED", "Collected"],
    ["CANCELLED", "Cancelled"],
  ] as const)("%s is titled %s and carries no customer data", (event, title) => {
    const text = ownerTelegramText({
      order: planted,
      event,
      storeName: STORE,
      baseUrl: BASE,
      environment: "production",
    });
    expect(text.split("\n")[0]).toBe(`${title}: ${STORE}`);
    for (const secret of ["secret-buyer", "@customer.test", "SecretProduct", "SecretNote"]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe("owner email (R17)", () => {
  it("subject, one staff link, and the items", () => {
    const { subject, html } = buildOwnerEmail({
      order: webhookOrder(),
      event: "CANCELLED",
      storeName: STORE,
      baseUrl: BASE,
    });
    expect(subject).toBe("Cancelled: order SHO-20261105-ABC123 — £42.50");
    const links = anchors(html);
    expect(links).toHaveLength(1);
    expect(textOf(links[0])).toBe("Open in staff panel");
    expect(links[0]).toContain(`href="${BASE}/staff/orders/SHO-20261105-ABC123"`);
    expect(textOf(html)).toContain("Item A");
    expect(
      anchors(
        buildOwnerEmail({
          order: webhookOrder(),
          event: "CANCELLED",
          storeName: STORE,
          baseUrl: null,
        }).html,
      ),
    ).toHaveLength(0);
  });
});

describe("owner digest (R18)", () => {
  const numbers = Array.from({ length: 25 }, (_, i) => `SHO-${String(i + 1).padStart(3, "0")}`);

  it("lists 20 order numbers and +5 more", () => {
    const lines = ownerDigestTelegramText("OUT_FOR_DELIVERY", numbers, "staging").split("\n");
    expect(lines[0]).toBe("[STAGING] Out for delivery: 25 orders");
    expect(lines.slice(1, 21)).toEqual(numbers.slice(0, 20));
    expect(lines[21]).toBe("+5 more");
    expect(lines).toHaveLength(22);
  });

  it("the digest email's subject is its first line, untagged", () => {
    const { subject, html } = buildOwnerDigestEmail("OUT_FOR_DELIVERY", numbers, null);
    expect(subject).toBe("Out for delivery: 25 orders");
    expect(textOf(html)).toContain("+5 more");
  });
});
