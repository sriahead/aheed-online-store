import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * #1390 R11 — POST /api/inbound-email/alert and the logic behind it.
 *
 * The route is tested with the service mocked, so each status is one branch of the route alone.
 * The service is tested through its client-injected `alertForInboundEmailWith` against an in-memory
 * client double that records every method called (proving the route path writes nothing), with the
 * alert sender injected so the brief it receives is asserted directly.
 */

const alertForInboundEmail = vi.fn();
vi.mock("@/lib/inbound-email-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/inbound-email-service")>()),
  alertForInboundEmail,
}));

const { POST, GET } = await import("@/app/api/inbound-email/alert/route");
const { alertForInboundEmailWith } = await import("@/lib/inbound-email-service");

const originalEnv = { ...process.env };
const TOKEN = "inbound-test-token";

function request(body: unknown, token: string | null = TOKEN): Request {
  return new Request("https://app.test/api/inbound-email/alert", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === null ? {} : { "x-inbound-token": token }),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const GOOD = { to: "orders@shop.test", subject: "Where is my order", fromName: "Jane" };

beforeEach(() => {
  process.env = { ...originalEnv, INBOUND_EMAIL_TOKEN: TOKEN };
  alertForInboundEmail.mockReset();
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("POST /api/inbound-email/alert (R11)", () => {
  it("503 when INBOUND_EMAIL_TOKEN is unset", async () => {
    delete process.env.INBOUND_EMAIL_TOKEN;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request(GOOD))).status).toBe(503);
    expect(alertForInboundEmail).not.toHaveBeenCalled();
  });

  it("401 when the token header is missing or wrong", async () => {
    expect((await POST(request(GOOD, null))).status).toBe(401);
    expect((await POST(request(GOOD, "wrong-token-value"))).status).toBe(401);
    expect(alertForInboundEmail).not.toHaveBeenCalled();
  });

  it.each([
    ["not JSON", "{nope"],
    ["missing to", { subject: "x" }],
    ["blank to", { to: "  ", subject: "x" }],
    ["missing subject", { to: "a@b.test" }],
    ["numeric fromName", { to: "a@b.test", subject: "x", fromName: 5 }],
    ["null body", "null"],
  ])("400 for %s", async (_label, body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(alertForInboundEmail).not.toHaveBeenCalled();
  });

  it("accepts a null or absent fromName", async () => {
    alertForInboundEmail.mockResolvedValue({ alerted: false });
    expect((await POST(request({ ...GOOD, fromName: null }))).status).toBe(200);
    expect((await POST(request({ to: GOOD.to, subject: GOOD.subject }))).status).toBe(200);
    expect(alertForInboundEmail).toHaveBeenLastCalledWith({
      to: GOOD.to,
      subject: GOOD.subject,
      fromName: null,
    });
  });

  it("404 when no store owns the address", async () => {
    alertForInboundEmail.mockResolvedValue(null);
    expect((await POST(request(GOOD))).status).toBe(404);
  });

  it("200 alerted:false when not order-related", async () => {
    alertForInboundEmail.mockResolvedValue({ alerted: false });
    const response = await POST(request(GOOD));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ alerted: false });
  });

  it("200 with the summary when alerted", async () => {
    alertForInboundEmail.mockResolvedValue({ alerted: true, sent: 1, skipped: 0, failed: 0 });
    const response = await POST(request(GOOD));
    expect(await response.json()).toEqual({ alerted: true, sent: 1, skipped: 0, failed: 0 });
  });

  it("GET is 405", () => {
    expect(GET().status).toBe(405);
  });
});

function fakeClient(
  rows: { address: string; vendorId: string; purpose: "ORDERS" | "SUPPORT" }[],
  orders: { vendorId: string; orderNumber: string }[],
) {
  const calls: string[] = [];
  const client = {
    vendorInboundAddress: {
      findUnique: async ({ where }: { where: { address: string } }) => {
        calls.push("vendorInboundAddress.findUnique");
        const r = rows.find((x) => x.address === where.address);
        return r ? { id: "a1", forwardTo: "owner@shop.test", createdAt: new Date(), ...r } : null;
      },
    },
    order: {
      findFirst: async ({ where }: { where: { vendorId: string; orderNumber: string } }) => {
        calls.push("order.findFirst");
        const o = orders.find(
          (x) => x.vendorId === where.vendorId && x.orderNumber === where.orderNumber,
        );
        return o ? { orderNumber: o.orderNumber } : null;
      },
    },
  };
  return { client, calls };
}

describe("alertForInboundEmailWith (R11)", () => {
  const ROWS = [
    { address: "orders@shop.test", vendorId: "v1", purpose: "ORDERS" as const },
    { address: "help@shop.test", vendorId: "v1", purpose: "SUPPORT" as const },
  ];

  function deps() {
    return {
      storeName: vi.fn(async () => "Corner Shop"),
      send: vi.fn(async () => ({ sent: 1, skipped: 0, failed: 0 })),
    };
  }

  it("null for an unknown address, with no alert", async () => {
    const { client } = fakeClient(ROWS, []);
    const d = deps();
    const outcome = await alertForInboundEmailWith(
      client as never,
      { to: "nobody@x.test", subject: "", fromName: null },
      d,
    );
    expect(outcome).toBeNull();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("alerted:false for a support message with no order number", async () => {
    const { client } = fakeClient(ROWS, []);
    const d = deps();
    const outcome = await alertForInboundEmailWith(
      client as never,
      { to: "help@shop.test", subject: "Opening hours?", fromName: "Jane" },
      d,
    );
    expect(outcome).toEqual({ alerted: false });
    expect(d.send).not.toHaveBeenCalled();
  });

  it("alerts once with the email brief, and only reads", async () => {
    const { client, calls } = fakeClient(ROWS, [
      { vendorId: "v1", orderNumber: "SHO-20261101-K4M2XQ" },
    ]);
    const d = deps();
    const outcome = await alertForInboundEmailWith(
      client as never,
      { to: "help@shop.test", subject: "Re: SHO-20261101-K4M2XQ late", fromName: "Jane" },
      d,
    );
    expect(outcome).toEqual({ alerted: true, sent: 1, skipped: 0, failed: 0 });
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.send).toHaveBeenCalledWith("v1", {
      source: "email",
      storeName: "Corner Shop",
      orderNumber: "SHO-20261101-K4M2XQ",
      senderName: "Jane",
      subject: "Re: SHO-20261101-K4M2XQ late",
    });
    expect(calls.every((c) => c.endsWith("findUnique") || c.endsWith("findFirst"))).toBe(true);
  });
});
