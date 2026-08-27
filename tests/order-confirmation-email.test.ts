import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WebhookOrder } from "@/lib/repositories/orders";

/**
 * Order confirmation email money block (P5a R61, #135).
 *
 * The reason this test exists: send-confirmation.ts renders Subtotal / Delivery
 * / Total, and the moment P5a let an order carry a discount those three lines
 * stopped adding up — the customer would receive an email whose arithmetic is
 * visibly wrong. What is asserted here is the RECONCILIATION, parsed back out of
 * the rendered HTML, not merely that some discount string appears.
 *
 * Same mocking posture as tests/order-status-email.test.ts: stub the vendor
 * lookup so the module loads without @prisma/client/wasm, leave lib/email real
 * so the assertion is against the actual outbound Resend request.
 *
 * The mock target moved to `@/lib/vendor-service` in #411. That is where the
 * Prisma client is now resolved — `lib/repositories/vendor.ts` takes one as a
 * parameter and imports `@/lib/db` for types only, so mocking the repository no
 * longer intercepts anything that loads the WASM client.
 */
vi.mock("@/lib/vendor-service", () => ({
  fetchVendorProfile: async () => ({ senderName: "Aheed Food Centre" }),
}));

const { sendOrderConfirmationEmail } = await import("@/features/checkout/send-confirmation");

const originalEnv = { ...process.env };

const order = (overrides: Partial<WebhookOrder> = {}): WebhookOrder => ({
  id: "o-1",
  vendorId: "v-aheed",
  orderNumber: "AHD-ABC123",
  status: "CONFIRMED",
  // P7.5b (#150/#138) defaults: no code, no points awarded. Cases that exercise
  // provenance override them explicitly, so every other case here keeps
  // asserting the pre-P7.5b money block unchanged.
  discountCode: null,
  pointsEarned: null,
  subtotalPence: 2000,
  discountPence: 0,
  deliveryFeePence: 349,
  totalPence: 2349,
  buyerEmail: "shopper@example.com",
  userId: "u-1",
  items: [{ productName: "Basmati rice", unitPricePence: 1000, quantity: 2, lineTotalPence: 2000 }],
  ...overrides,
});

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "no-reply@example.com";
  fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

const sentHtml = (): string => JSON.parse(fetchSpy.mock.calls[0][1].body).html;

/** Pull "£12.34" back out of the row whose first cell is `label`, as pence. */
function moneyRow(html: string, label: string): number | null {
  const match = html.match(
    new RegExp(
      `<td>(?:<strong>)?${label}(?:</strong>)?</td><td align="right">(?:<strong>)?(−?)£([0-9,]+\\.[0-9]{2})`,
    ),
  );
  if (!match) return null;
  const pence = Math.round(Number(match[2].replace(/,/g, "")) * 100);
  return match[1] === "−" ? -pence : pence;
}

describe("order confirmation email — money block (R61)", () => {
  it("renders a discount line and reconciles when the order carries one", async () => {
    await sendOrderConfirmationEmail(order({ discountPence: 500, totalPence: 1849 }));
    const html = sentHtml();

    const subtotal = moneyRow(html, "Subtotal");
    // P7.5b (#150): this row was labelled a generic "Discount" until the sources
    // became attributable. An order with no code is a loyalty redemption, so the
    // row is now named — the amount and the reconciliation below are unchanged.
    const discount = moneyRow(html, "Loyalty points");
    const delivery = moneyRow(html, "Delivery");
    const total = moneyRow(html, "Total");

    expect(subtotal).toBe(2000);
    expect(discount).toBe(-500);
    expect(delivery).toBe(349);
    expect(total).toBe(1849);
    // The property that actually matters: the customer can add it up.
    expect(subtotal! + discount! + delivery!).toBe(total);
  });

  it("renders no discount line when there is no discount", async () => {
    await sendOrderConfirmationEmail(order());
    const html = sentHtml();

    expect(moneyRow(html, "Discount")).toBeNull();
    expect(moneyRow(html, "Loyalty points")).toBeNull();
    expect(moneyRow(html, "Subtotal")! + moneyRow(html, "Delivery")!).toBe(moneyRow(html, "Total"));
  });

  it("still sends exactly one email per confirmation", async () => {
    await sendOrderConfirmationEmail(order({ discountPence: 500, totalPence: 1849 }));
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});

describe("order confirmation email — money provenance (P7.5b, #150/#138)", () => {
  it("splits a combined discount into the code's share and loyalty's, and still reconciles", async () => {
    await sendOrderConfirmationEmail(
      order({
        discountPence: 700,
        totalPence: 1649,
        discountCode: { code: "WELCOME10", amountPence: 500 },
      }),
    );
    const html = sentHtml();

    const subtotal = moneyRow(html, "Subtotal");
    const code = moneyRow(html, "Code WELCOME10");
    const loyalty = moneyRow(html, "Loyalty points");
    const delivery = moneyRow(html, "Delivery");
    const total = moneyRow(html, "Total");

    expect(code).toBe(-500);
    expect(loyalty).toBe(-200);
    // No row claims the combined figure, and the email still adds up.
    expect(moneyRow(html, "Discount")).toBeNull();
    expect(subtotal! + code! + loyalty! + delivery!).toBe(total);
  });

  it("names the code alone when it accounts for the whole discount", async () => {
    await sendOrderConfirmationEmail(
      order({
        discountPence: 500,
        totalPence: 1849,
        discountCode: { code: "SAVE5", amountPence: 500 },
      }),
    );
    const html = sentHtml();

    expect(moneyRow(html, "Code SAVE5")).toBe(-500);
    expect(moneyRow(html, "Loyalty points")).toBeNull();
  });

  it("states the points earned when the order awarded some", async () => {
    await sendOrderConfirmationEmail(order({ pointsEarned: 34 }));
    expect(sentHtml()).toContain("<strong>34</strong> loyalty points");
  });

  it("says nothing about points for a guest order", async () => {
    // A guest has no loyalty account, so pointsEarned is null and the email must
    // not imply an award that will never arrive.
    await sendOrderConfirmationEmail(order({ userId: null, pointsEarned: null }));
    expect(sentHtml()).not.toContain("loyalty points");
  });

  it("says nothing about points when the award was zero", async () => {
    // Distinct from the guest case: an account exists, the order simply did not
    // clear the earn threshold. "You earned 0 points" is worse than silence.
    await sendOrderConfirmationEmail(order({ pointsEarned: 0 }));
    expect(sentHtml()).not.toContain("loyalty points");
  });
});
