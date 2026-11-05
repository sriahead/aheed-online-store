import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker, {
  ALERT_PATH,
  RESOLVE_PATH,
  handleInboundEmail,
  parseFromDisplayName,
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

describe("order alert call (#1390 R9)", () => {
  /** A fetch that answers the resolve call with `resolution` and the alert call with `alertStatus`. */
  function sequence(resolution: unknown, alert: number | "reject", order: string[]) {
    const fetchSpy = vi.fn(async (url: URL | string) => {
      if (String(url).endsWith(RESOLVE_PATH)) {
        order.push("resolve");
        return new Response(JSON.stringify(resolution), { status: 200 });
      }
      order.push("alert");
      if (alert === "reject") throw new Error("down");
      return new Response("{}", { status: alert });
    });
    vi.stubGlobal("fetch", fetchSpy);
    return fetchSpy;
  }

  function namedMessage(order: string[]) {
    const m = message();
    m.headers.set("from", `"Jane Doe" <${SECRET_FROM}>`);
    m.forward.mockImplementation(async () => void order.push("forward"));
    return m;
  }

  it("order-related: forwards first, then posts to/subject/fromName with the token", async () => {
    const order: string[] = [];
    const fetchSpy = sequence(RESOLUTION, 200, order);
    await handleInboundEmail(namedMessage(order), env);

    expect(order).toEqual(["resolve", "forward", "alert"]);
    const [url, init] = fetchSpy.mock.calls[1] as unknown as [URL, RequestInit];
    expect(String(url)).toBe(`https://app.test${ALERT_PATH}`);
    expect((init.headers as Record<string, string>)["x-inbound-token"]).toBe("tok");
    const body = JSON.parse(String(init.body));
    expect(Object.keys(body).sort()).toEqual(["fromName", "subject", "to"]);
    expect(body).toEqual({ to: "orders@shop.test", subject: SECRET_SUBJECT, fromName: "Jane Doe" });
    expect(String(init.body)).not.toContain("@customer.test");
  });

  it("not order-related: no alert call", async () => {
    const order: string[] = [];
    sequence({ ...RESOLUTION, purpose: "SUPPORT", orderRelated: false }, 200, order);
    await handleInboundEmail(namedMessage(order), env);
    expect(order).toEqual(["resolve", "forward"]);
  });

  it("404 and fallback paths: no alert call", async () => {
    const f404 = respond(404, { error: "Unknown recipient" });
    await handleInboundEmail(message(), env);
    expect(f404).toHaveBeenCalledTimes(1);

    const fDown = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fDown);
    await handleInboundEmail(message(), env);
    expect(fDown).toHaveBeenCalledTimes(1);
  });

  it.each([500, "reject"] as const)(
    "a failed alert call (%s) is logged and swallowed",
    async (a) => {
      const order: string[] = [];
      sequence(RESOLUTION, a, order);
      const m = namedMessage(order);
      await expect(handleInboundEmail(m, env)).resolves.toBeUndefined();
      expect(m.forward).toHaveBeenCalledWith("owner@shop.test");
      expect(logs.some((l) => l.startsWith("inbound-email alert call failed"))).toBe(true);
      for (const line of logs) {
        expect(line).not.toContain(SECRET_SUBJECT);
        expect(line).not.toContain("Jane Doe");
      }
    },
  );
});

describe("parseFromDisplayName (#1390 R10)", () => {
  it.each([
    ['"Jane Doe" <j@x.com>', "Jane Doe"],
    ["Jane Doe <j@x.com>", "Jane Doe"],
    ["j@x.com", null],
    ["<j@x.com>", null],
    ["", null],
    ["=?UTF-8?B?Sm9zw6k=?= <j@x.com>", "José"],
    ["=?utf-8?q?Jos=C3=A9?= <j@x.com>", "José"],
    ["=?ISO-8859-1?Q?Jos=E9?= <j@x.com>", "=?ISO-8859-1?Q?Jos=E9?="],
    // An address used as the name (validation pass 1, F1) never comes back, encoded or not.
    ['"j@x.com" <j@x.com>', null],
    ["j@x.com <j@x.com>", null],
    ["=?UTF-8?B?akB4LmNvbQ==?= <j@x.com>", null],
  ])("%s gives %s", (header, expected) => {
    expect(parseFromDisplayName(header)).toBe(expected);
  });

  it("null gives null", () => {
    expect(parseFromDisplayName(null)).toBeNull();
  });
});
