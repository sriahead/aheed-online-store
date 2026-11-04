import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ContactOutboxRow } from "@/lib/repositories/contact";
import type { EmailSendResult } from "@/lib/email";

/** #1409 R20 (the job route's guard) and R21 (the outbox runner). */

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    throw new Error("not in a Worker");
  },
}));

const run = vi.fn(async () => ({ sent: 1, failed: 0, expired: 0, remaining: 0 }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));

const NOW = new Date("2026-11-10T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);

function row(id: string, createdAt: Date, attempts = 0): ContactOutboxRow {
  return {
    id,
    vendorId: "vendor-1",
    toAddress: "orders-team@inbox.test",
    subject: "Complaint · Corner Shop · Missing items",
    html: "<p>hi</p>",
    replyTo: "sam@example.com",
    attempts,
    lastError: "earlier failure",
    createdAt,
  };
}

async function runner(rows: ContactOutboxRow[], result: EmailSendResult, remainingAfter = 0) {
  const { runContactOutbox } = await import("@/lib/contact-service");
  const deps = {
    listVendorIds: vi.fn(async () => ["vendor-1"]),
    list: vi.fn(async (_vendorId: string, take: number) => rows.slice(0, take)),
    remove: vi.fn(async () => {}),
    recordFailure: vi.fn(async () => {}),
    count: vi.fn(async () => remainingAfter),
    email: { send: vi.fn(async () => result) },
    mark: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    now: () => NOW,
  };
  const summary = await runContactOutbox(deps);
  return { summary, deps };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe("runContactOutbox (R21)", () => {
  it("expires a row older than 7 days unsent, logging id and vendor only", async () => {
    const { summary, deps } = await runner([row("old", daysAgo(8))], { status: "sent" });
    expect(summary.expired).toBe(1);
    expect(deps.email.send).not.toHaveBeenCalled();
    expect(deps.remove).toHaveBeenCalledWith("vendor-1", "old");
    const line = String(errorSpy.mock.calls[0][0]);
    expect(line).toContain("old");
    expect(line).toContain("vendor-1");
    expect(line).not.toContain("@");
  });

  it.each(["sent", "skipped"] as const)("deletes a row whose resend is %s", async (status) => {
    const { summary, deps } = await runner([row("r1", daysAgo(1))], {
      status,
      reason: "x",
    } as EmailSendResult);
    expect(summary.sent).toBe(1);
    expect(deps.remove).toHaveBeenCalledWith("vendor-1", "r1");
    expect(deps.email.send).toHaveBeenCalledWith({
      to: "orders-team@inbox.test",
      subject: "Complaint · Corner Shop · Missing items",
      html: "<p>hi</p>",
      replyTo: "sam@example.com",
    });
  });

  it("records a failed resend with attempts + 1 and the reason", async () => {
    const { summary, deps } = await runner(
      [row("r1", daysAgo(1), 2)],
      {
        status: "failed",
        reason: "still not onboarded",
      },
      1,
    );
    expect(summary.failed).toBe(1);
    expect(deps.recordFailure).toHaveBeenCalledWith("vendor-1", "r1", 3, "still not onboarded");
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it("processes at most 50 rows per run", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => row(`r${i}`, daysAgo(1)));
    const { summary, deps } = await runner(rows, { status: "sent" }, 10);
    expect(summary.sent).toBe(50);
    expect(deps.list).toHaveBeenCalledWith("vendor-1", 50);
  });

  it("clears the marker when empty and marks it when rows remain", async () => {
    const empty = await runner([], { status: "sent" }, 0);
    expect(empty.deps.clear).toHaveBeenCalled();
    expect(empty.deps.mark).not.toHaveBeenCalled();
    const left = await runner([row("r1", daysAgo(1))], { status: "failed", reason: "x" }, 1);
    expect(left.summary.remaining).toBe(1);
    expect(left.deps.mark).toHaveBeenCalled();
    expect(left.deps.clear).not.toHaveBeenCalled();
  });
});

describe("retry-contact-outbox route (R20)", () => {
  const original = process.env.JOB_INVOCATION_TOKEN;

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/contact-service", () => ({ getContactOutboxService: () => ({ run }) }));
  });
  afterEach(() => {
    if (original === undefined) delete process.env.JOB_INVOCATION_TOKEN;
    else process.env.JOB_INVOCATION_TOKEN = original;
    vi.doUnmock("@/lib/contact-service");
  });

  const post = (token?: string) =>
    new Request("https://store.test/api/jobs/retry-contact-outbox", {
      method: "POST",
      headers: token ? { "x-job-token": token } : {},
    });

  it("503 with no token configured", async () => {
    delete process.env.JOB_INVOCATION_TOKEN;
    const { POST } = await import("@/app/api/jobs/retry-contact-outbox/route");
    expect((await POST(post("anything"))).status).toBe(503);
  });

  it("401 with a missing or wrong token", async () => {
    process.env.JOB_INVOCATION_TOKEN = "tok_secret";
    const { POST } = await import("@/app/api/jobs/retry-contact-outbox/route");
    expect((await POST(post())).status).toBe(401);
    expect((await POST(post("wrong"))).status).toBe(401);
  });

  it("405 on GET", async () => {
    const { GET } = await import("@/app/api/jobs/retry-contact-outbox/route");
    expect(GET().status).toBe(405);
  });

  it("200 with the four-key summary when authorised", async () => {
    process.env.JOB_INVOCATION_TOKEN = "tok_secret";
    const { POST } = await import("@/app/api/jobs/retry-contact-outbox/route");
    const response = await POST(post("tok_secret"));
    expect(response.status).toBe(200);
    expect(Object.keys(await response.json()).sort()).toEqual([
      "expired",
      "failed",
      "remaining",
      "sent",
    ]);
  });
});
