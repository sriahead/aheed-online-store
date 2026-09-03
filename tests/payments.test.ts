import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// lib/payments.ts reads lib/config (→ getCloudflareContext); mock it so the
// selection logic is testable without any Stripe or Worker environment.
const getEnvMock = vi.fn();
vi.mock("@/lib/config", () => ({
  getEnv: () => getEnvMock(),
  getPaymentEnv: () => getEnvMock(),
}));

const {
  createStripePaymentService,
  createStubPaymentService,
  getPaymentService,
  PaymentProviderError,
  STRIPE_PAYMENT_PROVIDER,
  STUB_PAYMENT_PROVIDER,
} = await import("@/lib/payments");

const INPUT = {
  orderNumber: "AHE-20260810-K4M2XQ",
  amountPence: 2346,
  currency: "GBP",
  vendorId: "v-aheed",
  returnOrigin: "https://staging.aheedfoodcentre.nocaped.com",
  confirmationToken: "6f1d1c2e-9b4a-4a7e-8f2b-0d3c5e7a9b11",
};

beforeEach(() => getEnvMock.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe("getPaymentService — adapter selection", () => {
  it("falls back to the stub when STRIPE_SECRET_KEY is unset", async () => {
    getEnvMock.mockReturnValue({});
    const result = await getPaymentService().createPayment(INPUT);
    expect(result.provider).toBe(STUB_PAYMENT_PROVIDER);
    expect(result.status).toBe("PENDING");
  });

  it("uses the Stripe adapter when a key is present", async () => {
    getEnvMock.mockReturnValue({ STRIPE_SECRET_KEY: "sk_test_123" });
    const fetchMock = vi.fn(async () =>
      Response.json({ id: "cs_test_1", url: "https://checkout.stripe.com/x" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getPaymentService().createPayment(INPUT);
    expect(result.provider).toBe(STRIPE_PAYMENT_PROVIDER);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("stub adapter", () => {
  it("never reports success — an order must not look paid when it wasn't", async () => {
    const result = await createStubPaymentService().createPayment(INPUT);
    expect(result).toEqual({
      provider: STUB_PAYMENT_PROVIDER,
      status: "PENDING",
      providerReference: null,
      redirectUrl: null,
    });
  });
});

describe("Stripe adapter — session payload", () => {
  function mockStripeOk() {
    const fetchMock = vi.fn(async () =>
      Response.json({ id: "cs_test_1", url: "https://checkout.stripe.com/pay/cs_test_1" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function bodyOf(fetchMock: ReturnType<typeof vi.fn>): URLSearchParams {
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    return new URLSearchParams(init.body as string);
  }

  it("returns the session id and url from Stripe's response", async () => {
    mockStripeOk();
    const result = await createStripePaymentService("sk_test_123").createPayment(INPUT);
    expect(result.providerReference).toBe("cs_test_1");
    expect(result.redirectUrl).toBe("https://checkout.stripe.com/pay/cs_test_1");
    expect(result.status).toBe("PENDING");
  });

  it("creates a one-off payment session for the order total", async () => {
    const fetchMock = mockStripeOk();
    await createStripePaymentService("sk_test_123").createPayment(INPUT);
    const body = bodyOf(fetchMock);
    expect(body.get("mode")).toBe("payment");
    expect(body.get("line_items[0][quantity]")).toBe("1");
    expect(body.get("line_items[0][price_data][unit_amount]")).toBe("2346");
  });

  it("takes the currency from the input rather than hardcoding one", async () => {
    const fetchMock = mockStripeOk();
    await createStripePaymentService("sk_test_123").createPayment({ ...INPUT, currency: "EUR" });
    expect(bodyOf(fetchMock).get("line_items[0][price_data][currency]")).toBe("eur");
  });

  it("carries the order number so the webhook and dashboard can find it", async () => {
    const fetchMock = mockStripeOk();
    await createStripePaymentService("sk_test_123").createPayment(INPUT);
    const body = bodyOf(fetchMock);
    expect(body.get("metadata[orderNumber]")).toBe(INPUT.orderNumber);
    expect(body.get("client_reference_id")).toBe(INPUT.orderNumber);
  });

  it("builds return URLs from the supplied origin, not a hardcoded host", async () => {
    const fetchMock = mockStripeOk();
    await createStripePaymentService("sk_test_123").createPayment({
      ...INPUT,
      returnOrigin: "https://srimart-staging.nocaped.com",
    });
    const body = bodyOf(fetchMock);
    expect(body.get("success_url")).toBe(
      `https://srimart-staging.nocaped.com/checkout/${INPUT.orderNumber}?t=${INPUT.confirmationToken}`,
    );
    expect(body.get("cancel_url")).toBe(
      `https://srimart-staging.nocaped.com/checkout/${INPUT.orderNumber}/cancel?t=${INPUT.confirmationToken}`,
    );
  });

  // P9.1 (#427/#428). The order number authorizes nothing on its own, so both
  // return URLs have to carry the capability token — a shopper returning from
  // Stripe without it is refused their own order.
  it("carries the confirmation token on both return URLs", async () => {
    const fetchMock = mockStripeOk();
    await createStripePaymentService("sk_test_123").createPayment(INPUT);
    const body = bodyOf(fetchMock);
    expect(body.get("success_url")).toContain(`t=${INPUT.confirmationToken}`);
    expect(body.get("cancel_url")).toContain(`t=${INPUT.confirmationToken}`);
  });

  // A GET that cancels is reachable by any prefetcher or scanner. The cancel URL
  // must land on the confirmation PAGE, whose write sits behind a POST action.
  it("points cancel_url at the /cancel page, not the removed API route", async () => {
    const fetchMock = mockStripeOk();
    await createStripePaymentService("sk_test_123").createPayment(INPUT);
    const cancelUrl = new URL(bodyOf(fetchMock).get("cancel_url") as string);
    expect(cancelUrl.pathname).toBe(`/checkout/${INPUT.orderNumber}/cancel`);
    expect(cancelUrl.pathname.startsWith("/api/")).toBe(false);
  });

  it("authenticates with the secret key and sends form encoding", async () => {
    const fetchMock = mockStripeOk();
    await createStripePaymentService("sk_test_123").createPayment(INPUT);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_123");
    expect((init.headers as Record<string, string>)["content-type"]).toBe(
      "application/x-www-form-urlencoded",
    );
  });

  it("throws on a non-OK Stripe response so the caller can compensate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("card_error", { status: 402 })),
    );
    await expect(createStripePaymentService("sk_test_123").createPayment(INPUT)).rejects.toThrow(
      PaymentProviderError,
    );
  });

  it("throws when Stripe returns 200 but omits id/url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );
    await expect(createStripePaymentService("sk_test_123").createPayment(INPUT)).rejects.toThrow(
      PaymentProviderError,
    );
  });
});

describe("Stripe adapter — retrieveSession (#454)", () => {
  function mockRetrieveOk(body: Record<string, unknown>) {
    const fetchMock = vi.fn(async () => Response.json(body));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("GETs the session by id with the secret key as a bearer token", async () => {
    const fetchMock = mockRetrieveOk({ id: "cs_test_1", payment_status: "paid" });
    await createStripePaymentService("sk_test_x").retrieveSession("cs_test_1");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith("/v1/checkout/sessions/cs_test_1")).toBe(true);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_x");
  });

  it("maps Stripe's snake_case session fields onto the port's shape", async () => {
    mockRetrieveOk({
      id: "cs_test_1",
      payment_status: "paid",
      status: "complete",
      amount_total: 2346,
      currency: "gbp",
    });
    const session = await createStripePaymentService("sk_test_x").retrieveSession("cs_test_1");
    expect(session).toEqual({
      id: "cs_test_1",
      paymentStatus: "paid",
      status: "complete",
      amountTotal: 2346,
      currency: "gbp",
    });
  });

  it("distinguishes a zero amount_total from an absent one", async () => {
    mockRetrieveOk({ id: "cs_test_1", amount_total: 0 });
    const session = await createStripePaymentService("sk_test_x").retrieveSession("cs_test_1");
    expect(session.amountTotal).toBe(0);
  });

  it("nulls the fields Stripe omitted rather than inventing them", async () => {
    mockRetrieveOk({ id: "cs_test_1" });
    const session = await createStripePaymentService("sk_test_x").retrieveSession("cs_test_1");
    expect(session.paymentStatus).toBeNull();
    expect(session.status).toBeNull();
    expect(session.amountTotal).toBeNull();
    expect(session.currency).toBeNull();
  });

  it("throws PaymentProviderError on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no such session", { status: 404 })),
    );
    await expect(
      createStripePaymentService("sk_test_x").retrieveSession("cs_missing"),
    ).rejects.toBeInstanceOf(PaymentProviderError);
  });
});

describe("stub adapter — retrieveSession (#454)", () => {
  it("never reports a session as paid", async () => {
    const session = await createStubPaymentService().retrieveSession("anything");
    expect(session.paymentStatus).not.toBe("paid");
  });
});
