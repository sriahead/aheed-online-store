import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ErrorRateSummary } from "@/lib/error-rate";
import type { NotificationMessage } from "@/lib/notifications/dispatch";
import { webhookOrder } from "./fixtures/webhook-order";

/**
 * #1552 — the notification gaps: payment failed copy (R1), the registration alert (R5), the
 * platform alert chat (R6) and the error-rate Telegram alert (R7). The Cloudflare boundary is
 * replaced so config reads `process.env` and the KV namespace is a test double.
 */

const kv = new Map<string, string>();
let kvBound = true;
let kvThrows = false;
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    if (!kvBound) throw new Error("not in a Worker request context");
    return {
      env: {
        JOB_SIGNALS: {
          get: async (k: string) => {
            if (kvThrows) throw new Error("kv down");
            return kv.get(k) ?? null;
          },
          put: async (k: string, v: string) => void kv.set(k, v),
          delete: async (k: string) => void kv.delete(k),
        },
      },
    };
  },
}));

const { getPlatformAlertChatId } = await import("@/lib/config");
const { claimErrorRateAlert } = await import("@/lib/job-signals");
const { buildCustomerEmail } = await import("@/lib/order-notifications/customer-email");
const { ownerTelegramText } = await import("@/lib/order-notifications/owner");
const { alertNewRegistration, registrationAlertText, signUpMethod } =
  await import("@/lib/notifications/registration");
const { errorRateAlertText, sendErrorRateAlert } =
  await import("@/lib/notifications/error-rate-alert");

describe("PAYMENT_FAILED copy (R1)", () => {
  it("tells the shopper no money was taken and they can order again", () => {
    const { subject, html } = buildCustomerEmail({
      order: webhookOrder({ status: "CANCELLED" }),
      event: "PAYMENT_FAILED",
      storeName: "Corner Shop",
      baseUrl: "https://s.test",
    });
    expect(subject).toMatch(/^Your payment for order \S+ didn't go through$/);
    expect(html).toContain("Your payment didn&#39;t go through");
    expect(html).toContain("No money has been taken");
  });

  it("titles the owner's Telegram 'Payment failed'", () => {
    const text = ownerTelegramText({
      order: webhookOrder({}),
      event: "PAYMENT_FAILED",
      storeName: "Corner Shop",
      baseUrl: null,
      environment: "production",
    });
    expect(text.split("\n")[0]).toBe("Payment failed: Corner Shop");
  });
});

describe("registration alert (R5)", () => {
  const at = new Date("2026-11-13T10:05:00.000Z");

  it.each([
    ["/sign-up/email", "Email"],
    ["/callback/google", "Google"],
    [undefined, "Other"],
  ] as const)("path %s is method %s", (path, method) => {
    expect(signUpMethod(path)).toBe(method);
  });

  it("names the store, method, UK time and staff link, and nothing personal", () => {
    expect(
      registrationAlertText({
        storeName: "Corner Shop",
        method: "Email",
        at,
        baseUrl: "https://s.test",
        environment: "staging",
      }),
    ).toBe(
      "[STAGING] New account: Corner Shop\nMethod: Email\nTime: 2026-11-13 10:05 UK time\nhttps://s.test/staff/customers",
    );
  });

  function deps(overrides: Record<string, unknown> = {}) {
    const sent: NotificationMessage[] = [];
    const logs: string[] = [];
    return {
      sent,
      logs,
      resolveVendorId: async () => "vendor-1",
      loadStore: async () => ({
        sender: { name: "Corner Shop" },
        baseUrl: null,
        telegramChatIds: ["-1001", "-1002"],
        environment: "production" as const,
      }),
      send: async (_v: string, m: readonly NotificationMessage[]) => void sent.push(...m),
      now: () => at,
      log: (line: string) => void logs.push(line),
      ...overrides,
    };
  }

  it("sends one Telegram message per recipient, audience OWNER, event REGISTRATION", async () => {
    const d = deps();
    await alertNewRegistration("/sign-up/email", d);
    expect(d.sent.map((m) => [m.channel, m.destination, m.log.event])).toEqual([
      ["TELEGRAM", "-1001", "REGISTRATION"],
      ["TELEGRAM", "-1002", "REGISTRATION"],
    ]);
  });

  it("sends nothing on a platform host or a store with no recipients", async () => {
    const noVendor = deps({ resolveVendorId: async () => null });
    await alertNewRegistration("/sign-up/email", noVendor);
    expect(noVendor.sent).toEqual([]);
    const noChats = deps({
      loadStore: async () => ({
        sender: { name: "S" },
        baseUrl: null,
        telegramChatIds: [],
        environment: "production" as const,
      }),
    });
    await alertNewRegistration("/sign-up/email", noChats);
    expect(noChats.sent).toEqual([]);
  });

  it("a failure never rejects and logs only the error name", async () => {
    const d = deps({ loadStore: async () => Promise.reject(new TypeError("db down x@y.z")) });
    await expect(alertNewRegistration("/sign-up/email", d)).resolves.toBeUndefined();
    expect(d.logs).toEqual(["registration alert failed: TypeError"]);
  });
});

describe("getPlatformAlertChatId (R6)", () => {
  beforeEach(() => {
    kvBound = false;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    kvBound = true;
  });

  it.each(["", "   "])("blank (%j) is unset", (value) => {
    vi.stubEnv("PLATFORM_ALERT_TELEGRAM_CHAT_ID", value);
    expect(getPlatformAlertChatId()).toEqual({ status: "unset" });
  });

  it("missing is unset; a set value is trimmed", () => {
    vi.stubEnv("PLATFORM_ALERT_TELEGRAM_CHAT_ID", undefined as unknown as string);
    expect(getPlatformAlertChatId()).toEqual({ status: "unset" });
    vi.stubEnv("PLATFORM_ALERT_TELEGRAM_CHAT_ID", " -1003925079524 ");
    expect(getPlatformAlertChatId()).toEqual({ status: "set", chatId: "-1003925079524" });
  });
});

describe("error-rate Telegram alert (R7)", () => {
  const breached: ErrorRateSummary = {
    count: 14,
    windowMs: 15 * 60 * 1000,
    threshold: 10,
    since: "2026-11-13T09:50:00.000Z",
    breached: true,
  };
  const now = new Date("2026-11-13T10:05:00.000Z");

  beforeEach(() => {
    kv.clear();
    kvBound = true;
    kvThrows = false;
  });

  function deps(overrides: Record<string, unknown> = {}) {
    const sends: [string, string][] = [];
    const logs: string[] = [];
    return {
      sends,
      logs,
      chat: { status: "set" as const, chatId: "-100999" },
      environment: "production" as const,
      claim: claimErrorRateAlert,
      send: async (chatId: string, text: string) => {
        sends.push([chatId, text]);
        return { status: "sent" as const };
      },
      now: () => now,
      log: (line: string) => void logs.push(line),
      ...overrides,
    };
  }

  it("the text carries counts and the staff link only", () => {
    expect(errorRateAlertText(breached, "https://s.test", "staging")).toBe(
      "[STAGING] Error rate alert\n14 errors in the last 15 minutes (threshold 10)\nSince: 2026-11-13T09:50:00.000Z\nhttps://s.test/staff/errors",
    );
  });

  it("a breach sends once, then the hour's cooldown suppresses the next tick", async () => {
    const d = deps();
    await sendErrorRateAlert(breached, "https://s.test", d);
    await sendErrorRateAlert(breached, "https://s.test", d);
    expect(d.sends).toHaveLength(1);
    expect(d.sends[0][0]).toBe("-100999");
    expect(d.logs).toEqual([
      "error-rate telegram: sent",
      "error-rate telegram: skipped (cooldown)",
    ]);
  });

  it("sends again once the cooldown has passed", async () => {
    kv.set("error-rate:last-alert-at", "2026-11-13T09:04:00.000Z");
    const d = deps();
    await sendErrorRateAlert(breached, "https://s.test", d);
    expect(d.sends).toHaveLength(1);
  });

  it("without KV, or with KV failing, it still sends", async () => {
    kvBound = false;
    expect(await claimErrorRateAlert(now)).toBe(true);
    kvBound = true;
    kvThrows = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await claimErrorRateAlert(now)).toBe(true);
  });

  it("no breach, or no chat configured, sends nothing", async () => {
    const d = deps();
    await sendErrorRateAlert({ ...breached, breached: false }, "https://s.test", d);
    const unset = deps({ chat: { status: "unset" } });
    await sendErrorRateAlert(breached, "https://s.test", unset);
    expect([...d.sends, ...unset.sends]).toEqual([]);
  });

  it("a failed or throwing send is logged and never rejects", async () => {
    const failed = deps({
      send: async () => ({ status: "failed" as const, reason: "chat not found" }),
    });
    await sendErrorRateAlert(breached, "https://s.test", failed);
    expect(failed.logs).toEqual(["error-rate telegram: failed (chat not found)"]);
    kv.clear();
    const throws = deps({ send: async () => Promise.reject(new TypeError("network")) });
    await expect(sendErrorRateAlert(breached, "https://s.test", throws)).resolves.toBeUndefined();
    expect(throws.logs).toEqual(["error-rate telegram: failed (TypeError)"]);
  });
});
