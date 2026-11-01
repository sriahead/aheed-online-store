import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * #1217 — POST /api/inbound-email/resolve (R17) and the resolve logic behind it (R18, R19).
 *
 * The route is tested with the service mocked, so each status is one branch of the route alone.
 * The service is tested through its client-injected `resolveInboundEmailWith` against an
 * in-memory client double that records every method called on it — which is also how R19 ("the
 * route writes nothing") is asserted rather than assumed.
 */

const resolveInboundEmail = vi.fn();
vi.mock("@/lib/inbound-email-service", () => ({ resolveInboundEmail }));

const { POST, GET } = await import("@/app/api/inbound-email/resolve/route");

const originalEnv = { ...process.env };
const TOKEN = "inbound-test-token";

function request(body: unknown, token: string | null = TOKEN): Request {
  return new Request("https://app.test/api/inbound-email/resolve", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === null ? {} : { "x-inbound-token": token }),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env = { ...originalEnv, INBOUND_EMAIL_TOKEN: TOKEN };
  resolveInboundEmail.mockReset();
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("POST /api/inbound-email/resolve (R17)", () => {
  it("503 when INBOUND_EMAIL_TOKEN is unset", async () => {
    delete process.env.INBOUND_EMAIL_TOKEN;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request({ to: "a@b.test", subject: "x" }))).status).toBe(503);
    expect(resolveInboundEmail).not.toHaveBeenCalled();
  });

  it("401 when the token header is missing", async () => {
    expect((await POST(request({ to: "a@b.test", subject: "x" }, null))).status).toBe(401);
  });

  it("401 when the token is wrong", async () => {
    expect(
      (await POST(request({ to: "a@b.test", subject: "x" }, "wrong-token-value"))).status,
    ).toBe(401);
    expect(resolveInboundEmail).not.toHaveBeenCalled();
  });

  it("400 for a body without string to and subject", async () => {
    expect((await POST(request({ to: "a@b.test" }))).status).toBe(400);
    expect((await POST(request("not json"))).status).toBe(400);
  });

  it("404 for an address no store owns", async () => {
    resolveInboundEmail.mockResolvedValue(null);
    expect((await POST(request({ to: "nobody@b.test", subject: "x" }))).status).toBe(404);
  });

  it("200 with the resolution", async () => {
    const resolution = {
      forwardTo: "owner@shop.test",
      vendorId: "v1",
      purpose: "ORDERS",
      orderRelated: true,
      orderNumber: null,
    };
    resolveInboundEmail.mockResolvedValue(resolution);
    const res = await POST(request({ to: "orders@shop.test", subject: "Where is my order?" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(resolution);
  });

  it("GET is 405", () => {
    expect(GET().status).toBe(405);
  });
});

// ---------------------------------------------------------------------------------------------

type Row = {
  id: string;
  vendorId: string;
  address: string;
  purpose: "ORDERS" | "SUPPORT";
  forwardTo: string;
  createdAt: Date;
};

function fakeClient(rows: Row[], orders: { vendorId: string; orderNumber: string }[]) {
  const calls: string[] = [];
  const client = {
    vendorInboundAddress: {
      findUnique: async ({ where }: { where: { address: string } }) => {
        calls.push("vendorInboundAddress.findUnique");
        return rows.find((r) => r.address === where.address) ?? null;
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

describe("resolve logic (R18, R19)", async () => {
  const { resolveInboundEmailWith, extractOrderNumberCandidates } = await vi.importActual<
    typeof import("@/lib/inbound-email-service")
  >("@/lib/inbound-email-service");

  const rows: Row[] = [
    {
      id: "a1",
      vendorId: "v1",
      address: "orders@shop.test",
      purpose: "ORDERS",
      forwardTo: "owner@shop.test",
      createdAt: new Date(),
    },
    {
      id: "a2",
      vendorId: "v1",
      address: "support@shop.test",
      purpose: "SUPPORT",
      forwardTo: "owner@shop.test",
      createdAt: new Date(),
    },
  ];
  const orders = [
    { vendorId: "v1", orderNumber: "SHO-20261101-K4M2XQ" },
    { vendorId: "v2", orderNumber: "OTH-20261101-ABCDEF" },
  ];

  async function resolve(to: string, subject: string) {
    const { client, calls } = fakeClient(rows, orders);
    const result = await resolveInboundEmailWith(client as never, { to, subject });
    return { result, calls };
  }

  it("an ORDERS address with no order number is order-related", async () => {
    const { result } = await resolve("Orders@Shop.test", "Question");
    expect(result).toEqual({
      forwardTo: "owner@shop.test",
      vendorId: "v1",
      purpose: "ORDERS",
      orderRelated: true,
      orderNumber: null,
    });
  });

  it("a SUPPORT address carrying the vendor's own order number is order-related", async () => {
    const { result } = await resolve(
      "support@shop.test",
      "Re: order sho-20261101-k4m2xq missing item",
    );
    expect(result).toMatchObject({ orderRelated: true, orderNumber: "SHO-20261101-K4M2XQ" });
  });

  it("another vendor's order number does not count", async () => {
    const { result } = await resolve("support@shop.test", "About OTH-20261101-ABCDEF");
    expect(result).toMatchObject({ orderRelated: false, orderNumber: null });
  });

  it("a SUPPORT address with no order number is not order-related", async () => {
    const { result } = await resolve("support@shop.test", "Opening hours?");
    expect(result).toMatchObject({ orderRelated: false, orderNumber: null });
  });

  it("an unknown address resolves to null", async () => {
    expect((await resolve("nobody@shop.test", "x")).result).toBeNull();
  });

  it("calls only read methods on the client (R19)", async () => {
    const { calls } = await resolve(
      "support@shop.test",
      "SHO-20261101-K4M2XQ and OTH-20261101-ABCDEF",
    );
    expect(calls.every((c) => c.endsWith("findUnique") || c.endsWith("findFirst"))).toBe(true);
  });

  it("extracts each distinct candidate, upper-cased", () => {
    expect(extractOrderNumberCandidates("a abc-20260101-zzzzzz b ABC-20260101-ZZZZZZ")).toEqual([
      "ABC-20260101-ZZZZZZ",
    ]);
  });
});
