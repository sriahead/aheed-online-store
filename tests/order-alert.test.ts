import { describe, it, expect, vi } from "vitest";
import { formatOrderAlert, type OrderAlertBrief } from "@/lib/order-alert/brief";
import {
  buildOrderAlertRegistry,
  telegramAdapter,
  type OrderAlertRegistry,
} from "@/lib/order-alert/channels";
import { sendOrderAlert, type SendOrderAlertDeps } from "@/lib/order-alert/send";

/** #1390 R5-R7 — the order-alert text, the Telegram adapter and the fan-out to recipients. */

const BRIEF: OrderAlertBrief = {
  source: "email",
  storeName: "Corner Shop",
  orderNumber: "AHD-20261104-ABC123",
  senderName: "Jane Doe",
  subject: "Where is my order?",
};

describe("formatOrderAlert (R5)", () => {
  it("is five untagged lines in production", () => {
    expect(formatOrderAlert(BRIEF, "production")).toBe(
      [
        "Order inquiry: Corner Shop",
        "Order: AHD-20261104-ABC123",
        "From: Jane Doe",
        "Subject: Where is my order?",
        "Via: email",
      ].join("\n"),
    );
  });

  it("tags staging and names the contact form", () => {
    const text = formatOrderAlert({ ...BRIEF, source: "contact-form" }, "staging");
    expect(text.split("\n")[0]).toBe("[STAGING] Order inquiry: Corner Shop");
    expect(text.split("\n")[4]).toBe("Via: contact form");
  });

  it("tags development", () => {
    expect(formatOrderAlert(BRIEF, "development").startsWith("[DEV] Order inquiry: ")).toBe(true);
  });

  it("fills in a missing order number and sender", () => {
    const lines = formatOrderAlert(
      { ...BRIEF, orderNumber: null, senderName: null },
      "production",
    ).split("\n");
    expect(lines[1]).toBe("Order: not given");
    expect(lines[2]).toBe("From: unknown");
    const blank = formatOrderAlert({ ...BRIEF, senderName: "   " }, "production").split("\n");
    expect(blank[2]).toBe("From: unknown");
  });

  it("never prints a sender name that contains @ (an address used as a name)", () => {
    for (const senderName of ["jane@customer.test", "  Jane jane@customer.test "]) {
      const text = formatOrderAlert({ ...BRIEF, senderName }, "production");
      expect(text.split("\n")[2]).toBe("From: unknown");
      expect(text).not.toContain("@");
    }
  });

  it("marks a blank subject", () => {
    expect(formatOrderAlert({ ...BRIEF, subject: "  " }, "production").split("\n")[3]).toBe(
      "Subject: (no subject)",
    );
  });

  it("cuts a long subject to 200 characters plus an ellipsis, and a long name to 100", () => {
    const lines = formatOrderAlert(
      { ...BRIEF, subject: "s".repeat(250), senderName: "n".repeat(150) },
      "production",
    ).split("\n");
    expect(lines[3]).toBe(`Subject: ${"s".repeat(200)}…`);
    expect(lines[2]).toBe(`From: ${"n".repeat(100)}`);
  });

  it("has exactly five lines", () => {
    expect(formatOrderAlert(BRIEF, "production").split("\n")).toHaveLength(5);
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("telegramAdapter (R6)", () => {
  const SET = { status: "set", token: "123:SECRET" } as const;

  it("(a) skips without a request when the token is unset", async () => {
    const fetchImpl = vi.fn();
    const result = await telegramAdapter({ status: "unset" }, fetchImpl).send("-100", "hi");
    expect(result).toEqual({ status: "skipped", reason: "TELEGRAM_BOT_TOKEN unset" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("(b, c) posts chat_id and text only, with a timeout signal, and reports sent", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: true, result: {} }));
    const result = await telegramAdapter(SET, fetchImpl as unknown as typeof fetch).send(
      "-1001234",
      "hello",
    );
    expect(result).toEqual({ status: "sent" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bot123:SECRET/sendMessage");
    expect(init.method).toBe("POST");
    expect(Object.keys(JSON.parse(String(init.body))).sort()).toEqual(["chat_id", "text"]);
    expect(JSON.parse(String(init.body))).toEqual({ chat_id: "-1001234", text: "hello" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("(d) reports Telegram's description on an error status", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(400, { ok: false, description: "Bad Request: chat not found" }),
    );
    const result = await telegramAdapter(SET, fetchImpl as unknown as typeof fetch).send("1", "x");
    expect(result).toEqual({
      status: "failed",
      reason: "telegram 400: Bad Request: chat not found",
    });
  });

  it("(d) a 200 without ok:true is a failure", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: false }));
    const result = await telegramAdapter(SET, fetchImpl as unknown as typeof fetch).send("1", "x");
    expect(result.status).toBe("failed");
  });

  it("(e) a thrown request reports only the error name, never the token", async () => {
    const error = new TypeError("boom https://api.telegram.org/bot123:SECRET/sendMessage");
    const fetchImpl = vi.fn(async () => Promise.reject(error));
    const result = await telegramAdapter(SET, fetchImpl as unknown as typeof fetch).send("1", "x");
    expect(result).toEqual({ status: "failed", reason: "telegram request error: TypeError" });
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("(f) an unreadable body does not throw", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>", { status: 502 }));
    const result = await telegramAdapter(SET, fetchImpl as unknown as typeof fetch).send("1", "x");
    expect(result).toEqual({ status: "failed", reason: "telegram 502: no description" });
  });

  it("the registry has a TELEGRAM adapter", () => {
    expect(typeof buildOrderAlertRegistry({ status: "unset" }).TELEGRAM.send).toBe("function");
  });
});

describe("sendOrderAlert (R7)", () => {
  const PERSONAL = {
    ...BRIEF,
    subject: "SUBJ-XYZ",
    senderName: "NAME-XYZ",
  };

  function setup(
    overrides: Partial<SendOrderAlertDeps> = {},
    send = vi.fn(async () => ({ status: "sent" as const })),
  ) {
    const log = vi.fn();
    const registry: OrderAlertRegistry = { TELEGRAM: { send } };
    const deps: SendOrderAlertDeps = {
      listRecipients: vi.fn(async () => [
        { channel: "TELEGRAM" as const, destination: "-100999" },
        { channel: "TELEGRAM" as const, destination: "-100888" },
      ]),
      registry,
      environment: "production",
      log,
      ...overrides,
    };
    return { deps, log, send };
  }

  function loggedText(log: ReturnType<typeof vi.fn>): string {
    return log.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
  }

  it("(a) sends the alert text to every recipient", async () => {
    const { deps, send } = setup();
    const summary = await sendOrderAlert(deps, "v1", BRIEF);
    expect(summary).toEqual({ sent: 2, skipped: 0, failed: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith("-100999", formatOrderAlert(BRIEF, "production"));
    expect(send).toHaveBeenCalledWith("-100888", formatOrderAlert(BRIEF, "production"));
  });

  it("(b) does nothing without recipients", async () => {
    const { deps, send } = setup({ listRecipients: vi.fn(async () => []) });
    expect(await sendOrderAlert(deps, "v1", BRIEF)).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("(c) a rejecting recipient lister does not throw", async () => {
    const { deps, send } = setup({
      listRecipients: vi.fn(async () => Promise.reject(new Error("db down"))),
    });
    const summary = await sendOrderAlert(deps, "v1", BRIEF);
    expect(summary.failed).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("(c) a rejecting adapter is counted as failed and the others still send", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ status: "sent" });
    const { deps } = setup({}, send);
    expect(await sendOrderAlert(deps, "v1", BRIEF)).toEqual({ sent: 1, skipped: 0, failed: 1 });
  });

  it("(d) logs one line per attempt, with the reason when not sent", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ status: "sent" })
      .mockResolvedValueOnce({ status: "skipped", reason: "TELEGRAM_BOT_TOKEN unset" });
    const { deps, log } = setup({}, send);
    await sendOrderAlert(deps, "v1", BRIEF);
    expect(log.mock.calls.map((c) => c[0])).toEqual([
      "order alert vendorId=v1 channel=TELEGRAM status=sent",
      "order alert vendorId=v1 channel=TELEGRAM status=skipped reason=TELEGRAM_BOT_TOKEN unset",
    ]);
  });

  it("(e) never logs the subject, the sender name or the destination", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ status: "failed", reason: "telegram 400: Bad Request" })
      .mockRejectedValueOnce(new Error("x"));
    const { deps, log } = setup({}, send);
    await sendOrderAlert(deps, "v1", PERSONAL);
    const text = loggedText(log);
    for (const secret of ["SUBJ-XYZ", "NAME-XYZ", "-100999", "-100888"]) {
      expect(text).not.toContain(secret);
    }
  });
});
