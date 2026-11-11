import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * #1482 R27 — POST /api/inbound-email/record. The service is mocked, so each status is one branch
 * of the route alone (same shape as tests/inbound-email-route.test.ts for /resolve).
 */

const recordInboundEmailEnquiry = vi.fn();
vi.mock("@/lib/enquiries-service", () => ({ recordInboundEmailEnquiry }));

const { POST, GET } = await import("@/app/api/inbound-email/record/route");

const originalEnv = { ...process.env };
const TOKEN = "inbound-test-token";

const VALID = {
  to: "orders@shop.test",
  fromEmail: "customer@example.test",
  fromName: "A Customer",
  subject: "Where is my order?",
  message: "It has not arrived.",
};

function request(body: unknown, token: string | null = TOKEN): Request {
  return new Request("https://app.test/api/inbound-email/record", {
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
  recordInboundEmailEnquiry.mockReset();
  recordInboundEmailEnquiry.mockResolvedValue({ recorded: true });
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("POST /api/inbound-email/record (R27)", () => {
  it("503 when INBOUND_EMAIL_TOKEN is unset", async () => {
    delete process.env.INBOUND_EMAIL_TOKEN;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request(VALID))).status).toBe(503);
    expect(recordInboundEmailEnquiry).not.toHaveBeenCalled();
  });

  it("401 when the token header is missing", async () => {
    expect((await POST(request(VALID, null))).status).toBe(401);
    expect(recordInboundEmailEnquiry).not.toHaveBeenCalled();
  });

  it("401 when the token is wrong", async () => {
    expect((await POST(request(VALID, "wrong-token-value"))).status).toBe(401);
    expect(recordInboundEmailEnquiry).not.toHaveBeenCalled();
  });

  it("400 for a body that is not JSON", async () => {
    expect((await POST(request("not json"))).status).toBe(400);
  });

  it.each(["to", "fromEmail", "subject", "message"])("400 when `%s` is missing", async (field) => {
    const body: Record<string, unknown> = { ...VALID };
    delete body[field];
    expect((await POST(request(body))).status).toBe(400);
    expect(recordInboundEmailEnquiry).not.toHaveBeenCalled();
  });

  it.each([
    ["to", 321],
    ["fromEmail", 321],
    ["fromName", 201],
    ["subject", 999],
    ["message", 4001],
  ])("400 when `%s` is over its cap (%i characters)", async (field, length) => {
    const res = await POST(request({ ...VALID, [field]: "x".repeat(length) }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain(field);
    expect(recordInboundEmailEnquiry).not.toHaveBeenCalled();
  });

  it("accepts every field at exactly its cap", async () => {
    const res = await POST(
      request({
        to: "x".repeat(320),
        fromEmail: "x".repeat(320),
        fromName: "x".repeat(200),
        subject: "x".repeat(998),
        message: "x".repeat(4000),
      }),
    );
    expect(res.status).toBe(200);
  });

  it("404 when no vendor owns the recipient", async () => {
    recordInboundEmailEnquiry.mockResolvedValue({ recorded: false });
    expect((await POST(request(VALID))).status).toBe(404);
  });

  it("200 { recorded: true } and passes the fields through", async () => {
    const res = await POST(request(VALID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recorded: true });
    expect(recordInboundEmailEnquiry).toHaveBeenCalledWith(VALID);
  });

  it("405 for GET", async () => {
    expect(GET().status).toBe(405);
  });
});
