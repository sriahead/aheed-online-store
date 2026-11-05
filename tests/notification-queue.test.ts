import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EmailSendResult } from "@/lib/email";
import type { AlertSendResult } from "@/lib/order-alert/channels";
import {
  dispatchNotifications,
  notificationLogLine,
  safeReason,
  type DispatchDeps,
  type NotificationMessage,
} from "@/lib/notifications/dispatch";
import {
  NOTIFICATION_OUTBOX_BATCH,
  runNotificationOutbox,
  type NotificationOutboxDeps,
} from "@/lib/notifications/outbox";
import type { NotificationOutboxRow } from "@/lib/repositories/notification-outbox";

/** #1435 R3 (dispatch), R4 (the job route), R5 (the retry run), R7 (no personal data in logs). */

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    throw new Error("not in a Worker");
  },
}));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));

const SECRET_TO = "secret-buyer@customer.test";
const SECRET_SUBJECT = "SUBJ-SECRET-XYZ";
const SECRET_BODY = "<p>BODY-SECRET Item SecretProduct for Jane Secretname</p>";
const SECRET_CHAT = "-100777888";

function email(overrides: Partial<NotificationMessage> = {}): NotificationMessage {
  return {
    channel: "EMAIL",
    destination: SECRET_TO,
    subject: SECRET_SUBJECT,
    body: SECRET_BODY,
    replyTo: "reply@customer.test",
    sender: { name: "Corner Shop", email: "orders@shop.test" },
    log: { audience: "CUSTOMER", event: "CONFIRMED" },
    ...overrides,
  };
}

function telegram(overrides: Partial<NotificationMessage> = {}): NotificationMessage {
  return {
    channel: "TELEGRAM",
    destination: SECRET_CHAT,
    body: "New order: SecretProduct",
    log: { audience: "OWNER", event: "CONFIRMED" },
    ...overrides,
  };
}

function deps(
  emailResult: EmailSendResult | Error = { status: "sent" },
  telegramResult: AlertSendResult | Error = { status: "sent" },
) {
  const lines: string[] = [];
  const d = {
    email: {
      send: vi.fn(async () => {
        if (emailResult instanceof Error) throw emailResult;
        return emailResult;
      }),
    },
    telegram: {
      send: vi.fn(async (_destination: string, _text: string): Promise<AlertSendResult> => {
        if (telegramResult instanceof Error) throw telegramResult;
        return telegramResult;
      }),
    },
    enqueue: vi.fn(async () => {}),
    markPending: vi.fn(async () => {}),
    log: vi.fn((line: string) => void lines.push(line)),
  } satisfies DispatchDeps;
  return { d, lines };
}

describe("dispatchNotifications (R3)", () => {
  it("sent: nothing stored, no marker", async () => {
    const { d, lines } = deps();
    await dispatchNotifications(d, "v-1", [email(), telegram()]);
    expect(d.enqueue).not.toHaveBeenCalled();
    expect(d.markPending).not.toHaveBeenCalled();
    expect(d.email.send).toHaveBeenCalledWith({
      to: SECRET_TO,
      subject: SECRET_SUBJECT,
      html: SECRET_BODY,
      sender: { name: "Corner Shop", email: "orders@shop.test" },
      replyTo: "reply@customer.test",
    });
    expect(d.telegram.send).toHaveBeenCalledWith(SECRET_CHAT, "New order: SecretProduct");
    expect(lines).toHaveLength(2);
  });

  it("skipped: nothing stored", async () => {
    const { d, lines } = deps({ status: "skipped", reason: "recipient not allowed" });
    await dispatchNotifications(d, "v-1", [email()]);
    expect(d.enqueue).not.toHaveBeenCalled();
    expect(lines[0]).toContain("status=skipped reason=recipient not allowed");
  });

  it("failed: one row with attempts 1 and the reason, and the marker once", async () => {
    const { d } = deps({ status: "failed", reason: "provider down" });
    await dispatchNotifications(d, "v-1", [email(), email()]);
    expect(d.enqueue).toHaveBeenCalledTimes(2);
    expect(d.enqueue).toHaveBeenCalledWith("v-1", {
      channel: "EMAIL",
      destination: SECRET_TO,
      subject: SECRET_SUBJECT,
      body: SECRET_BODY,
      replyTo: "reply@customer.test",
      attempts: 1,
      lastError: "provider down",
    });
    expect(d.markPending).toHaveBeenCalledTimes(1);
  });

  it("a thrown send queues, recording only the error's name", async () => {
    const { d } = deps({ status: "sent" }, new TypeError("https://api.telegram.org/botSECRET"));
    await dispatchNotifications(d, "v-1", [telegram()]);
    expect(d.enqueue).toHaveBeenCalledWith(
      "v-1",
      expect.objectContaining({
        channel: "TELEGRAM",
        subject: null,
        lastError: "send threw: TypeError",
      }),
    );
  });

  it("an insert that rejects still resolves, and is logged", async () => {
    const { d, lines } = deps({ status: "failed", reason: "down" });
    d.enqueue.mockRejectedValueOnce(new Error("db down"));
    await expect(dispatchNotifications(d, "v-1", [email()])).resolves.toBeUndefined();
    expect(d.markPending).not.toHaveBeenCalled();
    expect(lines.some((l) => l.includes("status=lost"))).toBe(true);
  });

  it("a rejecting marker still resolves", async () => {
    const { d } = deps({ status: "failed", reason: "down" });
    d.markPending.mockRejectedValueOnce(new Error("kv down"));
    await expect(dispatchNotifications(d, "v-1", [email()])).resolves.toBeUndefined();
  });

  it("a mixed batch queues only the failed messages", async () => {
    const { d } = deps(
      { status: "sent" },
      { status: "failed", reason: "telegram 429: Too Many Requests" },
    );
    await dispatchNotifications(d, "v-1", [
      email(),
      telegram(),
      telegram({ destination: "-1002" }),
    ]);
    expect(d.enqueue).toHaveBeenCalledTimes(2);
    for (const call of d.enqueue.mock.calls as unknown as [string, { channel: string }][]) {
      expect(call[1].channel).toBe("TELEGRAM");
    }
  });

  it("sends concurrently: both sends start before either finishes", async () => {
    vi.useFakeTimers();
    try {
      const started: string[] = [];
      const finished: string[] = [];
      const { d } = deps();
      d.telegram.send.mockImplementation(async (chat: string) => {
        started.push(chat);
        await new Promise((r) => setTimeout(r, 100));
        finished.push(chat);
        return { status: "sent" } as const;
      });
      const done = dispatchNotifications(d, "v-1", [
        telegram({ destination: "a" }),
        telegram({ destination: "b" }),
      ]);
      await vi.advanceTimersByTimeAsync(0);
      expect(started).toEqual(["a", "b"]);
      expect(finished).toEqual([]);
      await vi.advanceTimersByTimeAsync(100);
      await done;
      expect(finished).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("log lines (R7)", () => {
  it("have the required shape", () => {
    expect(notificationLogLine("v-1", email(), "sent")).toBe(
      "notification vendorId=v-1 channel=EMAIL audience=CUSTOMER event=CONFIRMED status=sent",
    );
    expect(notificationLogLine("v-1", telegram(), "queued", "telegram 429: x")).toBe(
      "notification vendorId=v-1 channel=TELEGRAM audience=OWNER event=CONFIRMED status=queued reason=telegram 429: x",
    );
  });

  it("mask an address a provider echoes in its reason, and cap the length", () => {
    expect(safeReason(`destination ${SECRET_TO} not verified`)).toBe(
      "destination <address> not verified",
    );
    expect(safeReason("x".repeat(300))).toHaveLength(201);
  });

  it("never carry a destination, subject, body, product or name, on any path", async () => {
    const all: string[] = [];
    const results: (EmailSendResult | Error)[] = [
      { status: "sent" },
      { status: "skipped", reason: `not allowed: ${SECRET_TO}` },
      { status: "failed", reason: `rejected ${SECRET_TO}` },
      new Error(SECRET_TO),
    ];
    for (const r of results) {
      const { d, lines } = deps(r, r instanceof Error ? r : { status: "failed", reason: "x" });
      await dispatchNotifications(d, "v-1", [email(), telegram()]);
      all.push(...lines);
    }
    expect(all.length).toBeGreaterThan(0);
    for (const line of all) {
      expect(line).toMatch(
        /^notification vendorId=v-1 channel=(EMAIL|TELEGRAM) audience=(CUSTOMER|OWNER) event=CONFIRMED status=(sent|skipped|queued)( reason=.*)?$/,
      );
      for (const secret of [
        SECRET_TO,
        "@customer.test",
        SECRET_SUBJECT,
        "BODY-SECRET",
        "SecretProduct",
        "Secretname",
        SECRET_CHAT,
      ]) {
        expect(line).not.toContain(secret);
      }
    }
  });
});

const NOW = new Date("2026-11-05T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

function row(
  id: string,
  createdAt: Date,
  channel: "EMAIL" | "TELEGRAM" = "EMAIL",
): NotificationOutboxRow {
  return {
    id,
    vendorId: "v-1",
    channel,
    destination: channel === "EMAIL" ? SECRET_TO : SECRET_CHAT,
    subject: channel === "EMAIL" ? SECRET_SUBJECT : null,
    body: SECRET_BODY,
    replyTo: null,
    attempts: 1,
    lastError: "earlier",
    createdAt,
  };
}

function outboxDeps(
  rows: NotificationOutboxRow[],
  result: EmailSendResult = { status: "sent" },
  remainingAfter = 0,
) {
  const lines: string[] = [];
  const d = {
    listVendorIds: vi.fn(async () => ["v-1"]),
    list: vi.fn(async (_v: string, take: number) => rows.slice(0, take)),
    remove: vi.fn(async () => {}),
    recordFailure: vi.fn(async () => {}),
    count: vi.fn(async () => remainingAfter),
    senderFor: vi.fn(async () => ({ name: "Corner Shop", email: "orders@shop.test" })),
    email: { send: vi.fn(async () => result) },
    telegram: { send: vi.fn(async () => result as AlertSendResult) },
    mark: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    now: () => NOW,
    log: vi.fn((l: string) => void lines.push(l)),
  } satisfies NotificationOutboxDeps;
  return { d, lines };
}

describe("runNotificationOutbox (R5)", () => {
  it("resends, deletes on sent, and clears the marker when empty", async () => {
    const { d } = outboxDeps([row("r1", hoursAgo(1)), row("r2", hoursAgo(2), "TELEGRAM")]);
    expect(await runNotificationOutbox(d)).toEqual({
      sent: 2,
      failed: 0,
      expired: 0,
      remaining: 0,
    });
    expect(d.email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: SECRET_TO,
        sender: { name: "Corner Shop", email: "orders@shop.test" },
      }),
    );
    expect(d.telegram.send).toHaveBeenCalledWith(SECRET_CHAT, SECRET_BODY);
    expect(d.remove).toHaveBeenCalledTimes(2);
    expect(d.clear).toHaveBeenCalledOnce();
    expect(d.mark).not.toHaveBeenCalled();
  });

  it("skipped counts as done", async () => {
    const { d } = outboxDeps([row("r1", hoursAgo(1))], { status: "skipped", reason: "x" });
    await runNotificationOutbox(d);
    expect(d.remove).toHaveBeenCalledWith("v-1", "r1");
  });

  it("failed increments attempts and keeps the marker", async () => {
    const { d, lines } = outboxDeps(
      [row("r1", hoursAgo(1))],
      { status: "failed", reason: `bad ${SECRET_TO}` },
      1,
    );
    expect(await runNotificationOutbox(d)).toEqual({
      sent: 0,
      failed: 1,
      expired: 0,
      remaining: 1,
    });
    expect(d.recordFailure).toHaveBeenCalledWith("v-1", "r1", 2, `bad ${SECRET_TO}`);
    expect(d.mark).toHaveBeenCalledOnce();
    for (const line of lines) expect(line).not.toContain(SECRET_TO);
  });

  it("deletes a row older than 24 hours unsent, logging only its id and store", async () => {
    const { d, lines } = outboxDeps([row("old", hoursAgo(25)), row("new", hoursAgo(23))]);
    expect(await runNotificationOutbox(d)).toEqual({
      sent: 1,
      failed: 0,
      expired: 1,
      remaining: 0,
    });
    expect(d.email.send).toHaveBeenCalledTimes(1);
    expect(lines).toEqual([
      "notification outbox: expired unsent after 24 hours (id old, vendor v-1)",
    ]);
  });

  it(`handles at most ${NOTIFICATION_OUTBOX_BATCH} rows per run`, async () => {
    const many = Array.from({ length: 60 }, (_, i) => row(`r${i}`, hoursAgo(1)));
    const { d } = outboxDeps(many, { status: "sent" }, 10);
    const summary = await runNotificationOutbox(d);
    expect(summary.sent).toBe(50);
    expect(d.list).toHaveBeenCalledWith("v-1", 50);
    expect(d.mark).toHaveBeenCalledOnce();
  });
});

describe("retry-notification-outbox route (R4)", () => {
  const original = { ...process.env };
  const run = vi.fn(async () => ({ sent: 1, failed: 0, expired: 0, remaining: 0 }));

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/order-notifications-service", () => ({
      getNotificationOutboxService: () => ({ run }),
    }));
  });
  afterEach(() => {
    process.env = { ...original };
    vi.doUnmock("@/lib/order-notifications-service");
  });

  async function route() {
    return import("@/app/api/jobs/retry-notification-outbox/route");
  }

  it("GET is 405", async () => {
    expect((await route()).GET().status).toBe(405);
  });

  it("503 without a configured token", async () => {
    delete process.env.JOB_INVOCATION_TOKEN;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await (await route()).POST(new Request("https://x.test", { method: "POST" }));
    expect(res.status).toBe(503);
  });

  it("401 on a missing or wrong token, 200 with the summary on the right one", async () => {
    process.env.JOB_INVOCATION_TOKEN = "tok-right";
    const { POST } = await route();
    expect((await POST(new Request("https://x.test", { method: "POST" }))).status).toBe(401);
    expect(
      (
        await POST(
          new Request("https://x.test", { method: "POST", headers: { "x-job-token": "nope" } }),
        )
      ).status,
    ).toBe(401);
    const ok = await POST(
      new Request("https://x.test", { method: "POST", headers: { "x-job-token": "tok-right" } }),
    );
    expect(ok.status).toBe(200);
    expect(Object.keys(await ok.json()).sort()).toEqual(["expired", "failed", "remaining", "sent"]);
  });
});
