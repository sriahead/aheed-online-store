import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker, {
  RESOLVE_PATH,
  handleInboundEmail,
  type Env,
  type InboundMessage,
} from "../workers/inbound-email/src/index";

/**
 * #1217 — the inbound-email Worker (R21, R22). Imported by relative path, like
 * tests/scheduler.test.ts, because it is a separately deployed Worker, not part of the Next app.
 */

const env: Env = {
  APP_BASE_URL: "https://app.test",
  INBOUND_EMAIL_TOKEN: "tok",
  INBOUND_FALLBACK_FORWARD: "fallback@platform.test",
};

const SECRET_FROM = "very-private-sender@customer.test";
const SECRET_SUBJECT = "My confidential complaint QX7";

function message() {
  return {
    to: "orders@shop.test",
    headers: new Headers({ subject: SECRET_SUBJECT, from: SECRET_FROM }),
    forward: vi.fn<(rcptTo: string) => Promise<unknown>>().mockResolvedValue(undefined),
    setReject: vi.fn<(reason: string) => void>(),
  } satisfies InboundMessage;
}

let logs: string[];

beforeEach(() => {
  logs = [];
  const capture = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  vi.spyOn(console, "log").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
  vi.spyOn(console, "warn").mockImplementation(capture);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function respond(status: number, body: unknown = {}) {
  const fetchSpy = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

const RESOLUTION = {
  forwardTo: "owner@shop.test",
  vendorId: "v1",
  purpose: "ORDERS",
  orderRelated: true,
  orderNumber: "SHO-20261101-K4M2XQ",
};

describe("inbound-email handler (R21)", () => {
  it("200: asks the app with the token, forwards once, logs the four fields", async () => {
    const fetchSpy = respond(200, RESOLUTION);
    const m = message();
    await worker.email(m, env, {} as ExecutionContext);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe(`https://app.test${RESOLVE_PATH}`);
    expect(init.headers["x-inbound-token"]).toBe("tok");
    expect(JSON.parse(init.body)).toEqual({ to: "orders@shop.test", subject: SECRET_SUBJECT });

    expect(m.forward).toHaveBeenCalledOnce();
    expect(m.forward).toHaveBeenCalledWith("owner@shop.test");
    const line = logs.find((l) => l.startsWith("inbound-email vendorId="));
    expect(line).toBe(
      "inbound-email vendorId=v1 purpose=ORDERS orderRelated=true orderNumber=SHO-20261101-K4M2XQ",
    );
  });

  it("404: rejects and does not forward", async () => {
    respond(404, { error: "Unknown recipient" });
    const m = message();
    await handleInboundEmail(m, env);
    expect(m.setReject).toHaveBeenCalledOnce();
    expect(m.forward).not.toHaveBeenCalled();
  });

  it("network error: forwards to the fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const m = message();
    await handleInboundEmail(m, env);
    expect(m.forward).toHaveBeenCalledWith("fallback@platform.test");
    expect(logs.some((l) => l.includes("network error"))).toBe(true);
  });

  it("500: forwards to the fallback and logs the status", async () => {
    respond(500);
    const m = message();
    await handleInboundEmail(m, env);
    expect(m.forward).toHaveBeenCalledWith("fallback@platform.test");
    expect(logs.some((l) => l.includes("status 500"))).toBe(true);
  });

  it("401: forwards to the fallback and logs the status", async () => {
    respond(401);
    const m = message();
    await handleInboundEmail(m, env);
    expect(m.forward).toHaveBeenCalledWith("fallback@platform.test");
    expect(logs.some((l) => l.includes("status 401"))).toBe(true);
  });
});

describe("no personal data in logs (R22)", () => {
  it("never logs the sender or the subject, on any path", async () => {
    for (const status of [200, 404, 500, 401]) {
      respond(status, status === 200 ? RESOLUTION : {});
      await handleInboundEmail(message(), env);
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await handleInboundEmail(message(), env);

    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toContain(SECRET_FROM);
      expect(line).not.toContain(SECRET_SUBJECT);
      expect(line).not.toContain("QX7");
    }
  });
});
