import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * #1482 — `/staff/enquiries` reply and status rules (R9–R12), with the real repository
 * (`lib/repositories/enquiries.ts`) running over an in-memory client double, so vendor scoping is
 * exercised rather than mocked away. Spec: `specs/2026-11-10-pr1481-enquiries-team-access-retro/`.
 */

interface Row {
  id: string;
  vendorId: string;
  subject: string;
  message: string;
  senderEmail: string;
  toAddress: string | null;
  orderNumber: string | null;
  status: string;
}

let enquiries: Row[];
let replies: { id: string; enquiryId: string; body: string; sentBy: string; sentAt: Date }[];
const updates: unknown[] = [];

function matches(row: Row, where: Record<string, unknown>) {
  return Object.entries(where).every(
    ([k, v]) => (row as unknown as Record<string, unknown>)[k] === v,
  );
}

const db = {
  vendorEnquiry: {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return enquiries.find((r) => matches(r, where)) ?? null;
    }),
    update: vi.fn(
      async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        updates.push({ where, data });
        const row = enquiries.find((r) => matches(r, where));
        if (!row) throw new Error("Record to update not found.");
        Object.assign(row, data);
        return row;
      },
    ),
  },
  vendorEnquiryReply: {
    create: vi.fn(async ({ data }: { data: Omit<(typeof replies)[number], "id"> }) => {
      const row = { id: `reply-${replies.length + 1}`, ...data };
      replies.push(row);
      return row;
    }),
  },
};

vi.mock("@/lib/db", () => ({ getPrisma: () => db }));
vi.mock("@/lib/tenant", () => ({ getCurrentVendorId: vi.fn(async () => "vendor-1") }));

const requireVendorRole = vi.fn();
vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole }));

const send = vi.fn();
vi.mock("@/lib/email", () => ({ getEmailService: () => ({ send }) }));

const sender = vi.fn();
vi.mock("@/lib/vendor-service", () => ({
  getCurrentVendorProfile: vi.fn(async () => ({ name: "Test Store" })),
  getCurrentVendorSender: () => sender(),
}));

vi.mock("@/lib/config", () => ({
  getEmailEnv: () => ({ EMAIL_FROM: "platform@platform.test" }),
  readOptional: <T>(read: () => T) => read(),
}));
vi.mock("@/lib/inbound-email-service", () => ({ resolveInboundEmailWith: vi.fn() }));

const STAFF = {
  ok: true as const,
  user: { id: "u1", email: "staff@store.test", name: "Staff" },
  vendorId: "vendor-1",
  via: "STAFF" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  updates.length = 0;
  enquiries = [
    {
      id: "e1",
      vendorId: "vendor-1",
      subject: "Late order",
      message: "Where is it?",
      senderEmail: "customer@example.test",
      toAddress: "orders@store.test",
      orderNumber: null,
      status: "OPEN",
    },
    {
      id: "other",
      vendorId: "vendor-2",
      subject: "Other store",
      message: "Not yours",
      senderEmail: "x@example.test",
      toAddress: null,
      orderNumber: null,
      status: "OPEN",
    },
  ];
  replies = [];
  requireVendorRole.mockResolvedValue(STAFF);
  send.mockResolvedValue({ status: "sent" });
  sender.mockResolvedValue({ name: "Test Store", email: "no-reply@store.test" });
});

describe("replyToVendorEnquiry (R9, R10, R12)", () => {
  it("R9: refuses another vendor's enquiry id and sends nothing", async () => {
    const { replyToVendorEnquiry } = await import("@/lib/enquiries-service");
    expect(await replyToVendorEnquiry("other", "hello")).toEqual({
      ok: false,
      error: "Enquiry not found.",
    });
    expect(send).not.toHaveBeenCalled();
    expect(replies).toHaveLength(0);
  });

  it("R9: refuses when the caller is not staff", async () => {
    requireVendorRole.mockResolvedValue({ ok: false, status: 403, reason: "forbidden" });
    const { replyToVendorEnquiry } = await import("@/lib/enquiries-service");
    expect(await replyToVendorEnquiry("e1", "hello")).toEqual({ ok: false, error: "Unauthorized" });
    expect(send).not.toHaveBeenCalled();
  });

  it("R9: escapes HTML, sends only to the enquiry's sender, Reply-To the store address written to", async () => {
    const { replyToVendorEnquiry } = await import("@/lib/enquiries-service");
    await replyToVendorEnquiry("e1", "<script>alert(1)</script>");
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("customer@example.test");
    expect(message.replyTo).toBe("orders@store.test");
    expect(message.subject).toBe("Re: Late order");
    expect(message.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(message.html).not.toContain("<script>");
  });

  it("R9: Reply-To falls back to the sender address when the enquiry has no store address", async () => {
    enquiries[0].toAddress = null;
    const { replyToVendorEnquiry } = await import("@/lib/enquiries-service");
    await replyToVendorEnquiry("e1", "hi");
    expect(send.mock.calls[0][0].replyTo).toBe("no-reply@store.test");
  });

  it.each([
    [{ status: "skipped", reason: "recipient not on the allow-list" }, "Email not sent"],
    [{ status: "failed", reason: "binding missing" }, "Failed to send email"],
  ])("R10: %o records nothing and returns the reason", async (result, prefix) => {
    send.mockResolvedValue(result);
    const { replyToVendorEnquiry } = await import("@/lib/enquiries-service");
    const out = await replyToVendorEnquiry("e1", "hi");
    expect(out.ok).toBe(false);
    expect(!out.ok && out.error).toContain(prefix);
    expect(!out.ok && out.error).toContain(result.reason);
    expect(replies).toHaveLength(0);
    expect(enquiries[0].status).toBe("OPEN");
  });

  it("R12: a second reply is appended and the first is unchanged; status becomes REPLIED", async () => {
    const { replyToVendorEnquiry } = await import("@/lib/enquiries-service");
    expect(await replyToVendorEnquiry("e1", "first")).toEqual({ ok: true });
    const first = { ...replies[0] };
    expect(await replyToVendorEnquiry("e1", "second")).toEqual({ ok: true });

    expect(replies).toHaveLength(2);
    expect(replies[0]).toEqual(first);
    expect(replies.map((r) => r.body)).toEqual(["first", "second"]);
    expect(replies.every((r) => r.enquiryId === "e1" && r.sentBy === "staff@store.test")).toBe(
      true,
    );
    expect(enquiries[0].status).toBe("REPLIED");
  });

  it("refuses an empty reply without sending", async () => {
    const { replyToVendorEnquiry } = await import("@/lib/enquiries-service");
    expect((await replyToVendorEnquiry("e1", "   ")).ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("changeVendorEnquiryStatus (R11)", () => {
  it("refuses a status outside OPEN/REPLIED/RESOLVED without a write", async () => {
    const { changeVendorEnquiryStatus } = await import("@/lib/enquiries-service");
    expect(await changeVendorEnquiryStatus("e1", "HACKED")).toEqual({
      ok: false,
      error: "Invalid status.",
    });
    expect(db.vendorEnquiry.update).not.toHaveBeenCalled();
  });

  it("refuses another vendor's enquiry without a write", async () => {
    const { changeVendorEnquiryStatus } = await import("@/lib/enquiries-service");
    expect((await changeVendorEnquiryStatus("other", "RESOLVED")).ok).toBe(false);
    expect(db.vendorEnquiry.update).not.toHaveBeenCalled();
    expect(enquiries[1].status).toBe("OPEN");
  });

  it("updates a valid status, scoped by vendorId", async () => {
    const { changeVendorEnquiryStatus } = await import("@/lib/enquiries-service");
    expect(await changeVendorEnquiryStatus("e1", "RESOLVED")).toEqual({ ok: true });
    expect(updates).toEqual([
      { where: { id: "e1", vendorId: "vendor-1" }, data: { status: "RESOLVED" } },
    ]);
  });
});

describe("getEnquirySenderLabel (R8)", () => {
  it("uses the vendor sender when there is one", async () => {
    const { getEnquirySenderLabel } = await import("@/lib/enquiries-service");
    expect(await getEnquirySenderLabel()).toBe("Test Store <no-reply@store.test>");
  });

  it("falls back to the vendor name and the configured EMAIL_FROM", async () => {
    sender.mockResolvedValue(undefined);
    const { getEnquirySenderLabel } = await import("@/lib/enquiries-service");
    expect(await getEnquirySenderLabel()).toBe("Test Store <platform@platform.test>");
  });
});
