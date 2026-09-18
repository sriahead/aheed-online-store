import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WebhookOrder } from "@/lib/repositories/orders";

// send-status-email.ts reaches lib/vendor-service (→ lib/db →
// @prisma/client/wasm, unresolvable under vitest) and lib/email. Mock the vendor
// lookup so the module loads and so the sender identity is a value this test
// controls; leave lib/email REAL, so what is asserted below is the actual
// outbound Resend request rather than a stub of our own making.
//
// The target moved from lib/repositories/vendor to lib/vendor-service in #411:
// the repository now takes its Prisma client as a parameter and imports lib/db
// for types only, so the service is what pulls in the WASM client.
const senderName = vi.fn(() => "Aheed Food Centre");
vi.mock("@/lib/vendor-service", () => ({
  fetchVendorProfile: async () => ({ senderName: senderName() }),
}));

const { sendOrderStatusEmail } = await import("@/features/orders/send-status-email");

const originalEnv = { ...process.env };

const order = (overrides: Partial<WebhookOrder> = {}): WebhookOrder => ({
  id: "o-1",
  vendorId: "v-aheed",
  orderNumber: "AHD-ABC123",
  status: "OUT_FOR_DELIVERY",
  isExpress: false,
  // P7.5b (#150/#138): the status email renders no money provenance, so these
  // stay null here — present only because WebhookOrder requires them.
  discountCode: null,
  pointsEarned: null,
  totalPence: 1250,
  subtotalPence: 1000,
  discountPence: 0,
  deliveryFeePence: 250,
  buyerEmail: "shopper@example.com",
  userId: "u-1",
  items: [{ productName: "Basmati rice", unitPricePence: 500, quantity: 2, lineTotalPence: 1000 }],
  ...overrides,
});

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "no-reply@example.com";
  fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
  vi.stubGlobal("fetch", fetchSpy);
  senderName.mockReturnValue("Aheed Food Centre");
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

const sentBody = () => JSON.parse(fetchSpy.mock.calls[0][1].body);

describe("sendOrderStatusEmail", () => {
  it("sends exactly one email, to the buyer, for each staff transition", async () => {
    for (const status of ["OUT_FOR_DELIVERY", "DELIVERED"]) {
      fetchSpy.mockClear();
      await sendOrderStatusEmail(order(), status);

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(sentBody().to).toBe("shopper@example.com");
      expect(sentBody().subject).toContain("AHD-ABC123");
    }
  });

  it("takes the sender name from the vendor, never a hardcoded store name", async () => {
    await sendOrderStatusEmail(order(), "DELIVERED");
    expect(sentBody().subject).toContain("Aheed Food Centre");

    // Same code, different vendor → different subject. A hardcoded name would
    // survive this change; a data-driven one cannot.
    fetchSpy.mockClear();
    senderName.mockReturnValue("SriMart");
    await sendOrderStatusEmail(order({ vendorId: "v-srimart" }), "DELIVERED");
    expect(sentBody().subject).toContain("SriMart");
    expect(sentBody().subject).not.toContain("Aheed");
  });

  it("sends NOTHING for a status no slice owns", async () => {
    // CONFIRMED especially: P3c already emails on payment confirmation, and a
    // branch here would mean two mails for one event.
    //
    // CANCELLED was in this list until #696 and has deliberately left it. There
    // was no staff cancel path then, so the only way to reach CANCELLED was an
    // abandoned or failed checkout — an order the shopper had already walked
    // away from, where a mail would have been noise. A staff cancellation of an
    // order someone PAID for is the opposite: they are expecting it to arrive.
    // See the CANCELLED describe block below.
    for (const status of ["CONFIRMED", "PENDING_PAYMENT", "BANANA"]) {
      await sendOrderStatusEmail(order(), status);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("distinguishes the two transitions in the customer copy", async () => {
    await sendOrderStatusEmail(order(), "OUT_FOR_DELIVERY");
    const outForDelivery = sentBody();
    fetchSpy.mockClear();
    await sendOrderStatusEmail(order(), "DELIVERED");
    const delivered = sentBody();

    expect(outForDelivery.subject).not.toBe(delivered.subject);
    expect(outForDelivery.html).not.toBe(delivered.html);
  });

  it("never throws when the email provider fails — the transition already committed", async () => {
    fetchSpy.mockRejectedValue(new Error("resend is down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sendOrderStatusEmail(order(), "DELIVERED")).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("never throws when the order has no buyer email", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      sendOrderStatusEmail(order({ buyerEmail: null }), "DELIVERED"),
    ).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  /**
   * P9.2 (#696) — the cancellation email, and the one thing it must never say.
   *
   * Cancelling does not refund: no code path in this codebase writes
   * PaymentStatus.REFUNDED, and #606 owns money movement. An email implying the
   * customer has been paid back is the single most expensive thing this template
   * could get wrong, so the absence is asserted rather than left to review.
   */
  describe("CANCELLED (#696)", () => {
    it("sends, unlike CONFIRMED which is deliberately silent", async () => {
      await sendOrderStatusEmail(order({ status: "CANCELLED" }), "CANCELLED");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("never implies a refund was issued", async () => {
      await sendOrderStatusEmail(order({ status: "CANCELLED" }), "CANCELLED");
      const html = sentBody().html as string;

      expect(html).not.toMatch(/refund|refunded|repaid/i);
      expect(html).toMatch(/no payment has been returned/i);
    });

    it("tells the customer their points and code came back", async () => {
      await sendOrderStatusEmail(order({ status: "CANCELLED" }), "CANCELLED");
      const html = sentBody().html as string;

      expect(html).toMatch(/points/i);
      expect(html).toMatch(/discount code/i);
    });
  });
});
