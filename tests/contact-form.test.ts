import { describe, it, expect, vi } from "vitest";
import {
  CONTACT_LIMITS,
  parseContactFields,
  readContactFields,
} from "@/features/contact/validate-contact";
import { resolveContactRecipient, type RecipientAddress } from "@/lib/contact/recipient";
import { contactHtml, contactSubject } from "@/lib/contact/message";
import { CONTACT_COPY, processContactSubmission, type ContactDeps } from "@/lib/contact/submit";
import type { EmailSendResult } from "@/lib/email";

/** #1409 — the storefront contact form: validation, recipient, message and submission flow. */

const VALID: Record<string, string> = {
  name: "Sam Shopper",
  email: "sam@example.com",
  phone: "",
  type: "COMPLAINT",
  subject: "Missing items",
  message: "Two items were missing from my delivery.",
  orderId: "",
  website: "",
};

const ADDRESSES: RecipientAddress[] = [
  { address: "orders@store.test", purpose: "ORDERS", forwardTo: "orders-team@inbox.test" },
  { address: "support@store.test", purpose: "SUPPORT", forwardTo: "help-team@inbox.test" },
];

function deps(overrides: Partial<ContactDeps> = {}) {
  const sent: unknown[] = [];
  const queued: unknown[] = [];
  const d: ContactDeps & { sent: unknown[]; queued: unknown[]; attempts: number } = {
    sent,
    queued,
    attempts: 0,
    vendorId: "vendor-1",
    storeName: "Corner Shop",
    userId: null,
    checkRateLimit: vi.fn(async () => {
      d.attempts += 1;
      return { allowed: true };
    }),
    findOwnOrder: vi.fn(async () => null),
    listAddresses: vi.fn(async () => ADDRESSES),
    defaultForward: { status: "unset" },
    send: vi.fn(async (email) => {
      sent.push(email);
      return { status: "sent" } as EmailSendResult;
    }),
    enqueue: vi.fn(async (row) => void queued.push(row)),
    markPending: vi.fn(async () => {}),
    logError: vi.fn(),
    alert: vi.fn(async () => {}),
    now: () => new Date("2026-11-03T12:00:00.000Z"),
    ...overrides,
  };
  return d;
}

describe("parseContactFields (R13)", () => {
  it("accepts a valid submission, trimmed", () => {
    const fields = readContactFields((k) => ({ ...VALID, name: "  Sam  " })[k]);
    const parsed = parseContactFields(fields);
    expect(parsed.ok && parsed.value.name).toBe("Sam");
  });

  it.each([
    ["name", CONTACT_LIMITS.name],
    ["phone", CONTACT_LIMITS.phone],
    ["subject", CONTACT_LIMITS.subject],
  ])("%s is accepted at its limit and refused one over", (field, limit) => {
    expect(parseContactFields({ ...VALID, [field]: "a".repeat(limit) }).ok).toBe(true);
    const over = parseContactFields({ ...VALID, [field]: "a".repeat(limit + 1) });
    expect(!over.ok && over.fieldErrors[field as "name"]).toBeTruthy();
  });

  it("email is accepted at 254 characters and refused at 255", () => {
    const at = (n: number) => `${"a".repeat(n - "@example.com".length)}@example.com`;
    expect(parseContactFields({ ...VALID, email: at(254) }).ok).toBe(true);
    expect(parseContactFields({ ...VALID, email: at(255) }).ok).toBe(false);
  });

  it("message needs 10 to 5000 characters", () => {
    expect(parseContactFields({ ...VALID, message: "a".repeat(9) }).ok).toBe(false);
    expect(parseContactFields({ ...VALID, message: "a".repeat(10) }).ok).toBe(true);
    expect(parseContactFields({ ...VALID, message: "a".repeat(5000) }).ok).toBe(true);
    expect(parseContactFields({ ...VALID, message: "a".repeat(5001) }).ok).toBe(false);
  });

  it("refuses a bad email, a bad type and missing required fields", () => {
    const parsed = parseContactFields({
      ...VALID,
      email: "nope",
      type: "PRAISE",
      name: "",
      subject: "",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(Object.keys(parsed.fieldErrors).sort()).toEqual(["email", "name", "subject", "type"]);
    }
  });
});

describe("resolveContactRecipient (R16)", () => {
  const base = { addresses: ADDRESSES, defaultForward: { status: "unset" } as const };

  it("a complaint goes to ORDERS, an enquiry to SUPPORT, an enquiry with an order to ORDERS", () => {
    expect(resolveContactRecipient({ ...base, type: "COMPLAINT", hasOrder: false })).toBe(
      "orders-team@inbox.test",
    );
    expect(resolveContactRecipient({ ...base, type: "ENQUIRY", hasOrder: false })).toBe(
      "help-team@inbox.test",
    );
    expect(resolveContactRecipient({ ...base, type: "ENQUIRY", hasOrder: true })).toBe(
      "orders-team@inbox.test",
    );
  });

  it("falls back to the other purpose", () => {
    expect(
      resolveContactRecipient({
        ...base,
        addresses: [ADDRESSES[1]],
        type: "COMPLAINT",
        hasOrder: false,
      }),
    ).toBe("help-team@inbox.test");
  });

  it("picks the alphabetically first address of the wanted purpose", () => {
    const addresses: RecipientAddress[] = [
      { address: "zz@store.test", purpose: "ORDERS", forwardTo: "z@inbox.test" },
      { address: "aa@store.test", purpose: "ORDERS", forwardTo: "a@inbox.test" },
    ];
    expect(
      resolveContactRecipient({ ...base, addresses, type: "COMPLAINT", hasOrder: false }),
    ).toBe("a@inbox.test");
  });

  it("uses the default inbox only when set, else null", () => {
    const none = { addresses: [], type: "ENQUIRY" as const, hasOrder: false };
    expect(
      resolveContactRecipient({
        ...none,
        defaultForward: { status: "set", address: "hub@inbox.test" },
      }),
    ).toBe("hub@inbox.test");
    expect(resolveContactRecipient({ ...none, defaultForward: { status: "unset" } })).toBeNull();
    expect(resolveContactRecipient({ ...none, defaultForward: { status: "invalid" } })).toBeNull();
  });
});

describe("contact message (R17)", () => {
  const input = {
    storeName: "Corner Shop",
    type: "COMPLAINT" as const,
    name: "Sam",
    email: "sam@example.com",
    phone: "",
    orderNumber: "AH-1042",
    subject: "Missing items",
    message: "Hello <script>alert(1)</script>\nthanks",
    submittedAt: new Date("2026-11-03T12:00:00.000Z"),
  };

  it("names type, store, order and subject; drops the order segment without one", () => {
    expect(contactSubject(input)).toBe("Complaint · Corner Shop · Order AH-1042 · Missing items");
    expect(contactSubject({ ...input, type: "ENQUIRY", orderNumber: null })).toBe(
      "Enquiry · Corner Shop · Missing items",
    );
  });

  it("escapes shopper input and lists every field", () => {
    const html = contactHtml(input);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    for (const text of [
      "Corner Shop",
      "Complaint",
      "Sam",
      "sam@example.com",
      "Not given",
      "AH-1042",
      "2026-11-03T12:00:00.000Z",
    ]) {
      expect(html).toContain(text);
    }
    expect(contactHtml({ ...input, orderNumber: null })).toContain("None");
  });
});

describe("processContactSubmission (R13-R18)", () => {
  it("R14: a filled honeypot succeeds silently: no attempt, send or row", async () => {
    const d = deps();
    const state = await processContactSubmission({ ...VALID, website: "spam.example" }, d);
    expect(state.status).toBe("success");
    expect(d.attempts).toBe(0);
    expect(d.sent).toHaveLength(0);
    expect(d.queued).toHaveLength(0);
  });

  it("R13: invalid input returns field errors and counts no attempt", async () => {
    const d = deps();
    const state = await processContactSubmission({ ...VALID, message: "short" }, d);
    expect(state.status).toBe("error");
    expect(state.fieldErrors.message).toBeTruthy();
    expect(d.attempts).toBe(0);
    expect(d.sent).toHaveLength(0);
  });

  it("R14: a refused rate limit sends nothing", async () => {
    const d = deps({ checkRateLimit: vi.fn(async () => ({ allowed: false })) });
    const state = await processContactSubmission(VALID, d);
    expect(state.error).toBe(CONTACT_COPY.rateLimited);
    expect(d.sent).toHaveLength(0);
  });

  it("R15: a guest naming an order is refused", async () => {
    const d = deps();
    const state = await processContactSubmission({ ...VALID, orderId: "AH-1042" }, d);
    expect(state.error).toBe(CONTACT_COPY.orderNotFound);
    expect(d.findOwnOrder).not.toHaveBeenCalled();
    expect(d.sent).toHaveLength(0);
  });

  it("R15: an order that is not the shopper's at this store is refused", async () => {
    const d = deps({ userId: "user-1", findOwnOrder: vi.fn(async () => null) });
    const state = await processContactSubmission({ ...VALID, orderId: "SOMEONE-ELSES" }, d);
    expect(state.error).toBe(CONTACT_COPY.orderNotFound);
    expect(d.findOwnOrder).toHaveBeenCalledWith("SOMEONE-ELSES", "user-1");
    expect(d.sent).toHaveLength(0);
  });

  it("R15/R17: the shopper's own order is named by its order number", async () => {
    const d = deps({ userId: "user-1", findOwnOrder: vi.fn(async () => "AH-1042") });
    await processContactSubmission({ ...VALID, type: "ENQUIRY", orderId: "AH-1042" }, d);
    expect(d.sent[0]).toMatchObject({
      to: "orders-team@inbox.test",
      subject: "Enquiry · Corner Shop · Order AH-1042 · Missing items",
    });
  });

  it("R16: no recipient is an error, logged by vendor only, with nothing stored", async () => {
    const d = deps({ listAddresses: vi.fn(async () => []) });
    const state = await processContactSubmission(VALID, d);
    expect(state.error).toBe(CONTACT_COPY.noRecipient);
    expect(d.queued).toHaveLength(0);
    const logged = String((d.logError as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(logged).toContain("vendor-1");
    expect(logged).not.toContain("@");
  });

  it("R17: sends from the platform with Reply-To the shopper", async () => {
    const d = deps();
    await processContactSubmission(VALID, d);
    expect(d.sent[0]).toMatchObject({
      to: "orders-team@inbox.test",
      replyTo: "sam@example.com",
      subject: "Complaint · Corner Shop · Missing items",
    });
    expect((d.sent[0] as { sender?: unknown }).sender).toBeUndefined();
  });

  it.each(["sent", "skipped"] as const)("R18: a %s result stores nothing", async (status) => {
    const d = deps({ send: vi.fn(async () => ({ status, reason: "x" }) as EmailSendResult) });
    const state = await processContactSubmission(VALID, d);
    expect(state).toMatchObject({ status: "success", replyTo: "sam@example.com" });
    expect(d.queued).toHaveLength(0);
    expect(d.markPending).not.toHaveBeenCalled();
  });

  it("R18: a failed send queues one row, marks the outbox and still reports success", async () => {
    const d = deps({
      send: vi.fn(
        async () => ({ status: "failed", reason: "domain not onboarded" }) as EmailSendResult,
      ),
    });
    const state = await processContactSubmission(VALID, d);
    expect(state.status).toBe("success");
    expect(d.queued).toEqual([
      {
        toAddress: "orders-team@inbox.test",
        subject: "Complaint · Corner Shop · Missing items",
        html: expect.stringContaining("Missing items"),
        replyTo: "sam@example.com",
        lastError: "domain not onboarded",
      },
    ]);
    expect(d.markPending).toHaveBeenCalledTimes(1);
  });
});

describe("processContactSubmission order alert (#1390 R12, #1548)", () => {
  const alertMock = (d: ContactDeps) => d.alert as ReturnType<typeof vi.fn>;

  it("a complaint with no order alerts once, with only the brief's fields", async () => {
    const d = deps();
    await processContactSubmission(VALID, d);
    expect(alertMock(d)).toHaveBeenCalledTimes(1);
    expect(alertMock(d).mock.calls[0][0]).toEqual({
      source: "contact-form",
      storeName: "Corner Shop",
      orderNumber: null,
      senderName: "Sam Shopper",
      subject: "Missing items",
      contactType: "COMPLAINT",
    });
  });

  it("an enquiry about the shopper's own order alerts with its order number", async () => {
    const d = deps({ userId: "user-1", findOwnOrder: vi.fn(async () => "AH-1042") });
    await processContactSubmission({ ...VALID, type: "ENQUIRY", orderId: "AH-1042" }, d);
    expect(alertMock(d)).toHaveBeenCalledTimes(1);
    expect(alertMock(d).mock.calls[0][0]).toMatchObject({ orderNumber: "AH-1042" });
  });

  it("a complaint whose send failed alerts once, after the outbox enqueue", async () => {
    const order: string[] = [];
    const d = deps({
      send: vi.fn(async () => ({ status: "failed", reason: "down" }) as EmailSendResult),
      enqueue: vi.fn(async () => void order.push("enqueue")),
      alert: vi.fn(async () => void order.push("alert")),
    });
    await processContactSubmission(VALID, d);
    expect(order).toEqual(["enqueue", "alert"]);
  });

  it("an enquiry with no order alerts once, typed ENQUIRY (#1548 R1, R3)", async () => {
    const d = deps();
    await processContactSubmission({ ...VALID, type: "ENQUIRY" }, d);
    expect(alertMock(d)).toHaveBeenCalledTimes(1);
    expect(alertMock(d).mock.calls[0][0]).toEqual({
      source: "contact-form",
      storeName: "Corner Shop",
      orderNumber: null,
      senderName: "Sam Shopper",
      subject: "Missing items",
      contactType: "ENQUIRY",
    });
  });

  it.each([
    ["honeypot", { ...VALID, website: "spam.example" }, {}],
    ["invalid input", { ...VALID, message: "short" }, {}],
    ["rate limited", VALID, { checkRateLimit: vi.fn(async () => ({ allowed: false })) }],
    ["order not found", { ...VALID, orderId: "AH-1042" }, {}],
    ["no recipient", VALID, { listAddresses: vi.fn(async () => []) }],
  ] as const)("%s: no alert", async (_label, fields, overrides) => {
    const d = deps(overrides as Partial<ContactDeps>);
    await processContactSubmission({ ...fields }, d);
    expect(alertMock(d)).not.toHaveBeenCalled();
  });

  it("a rejecting alert still succeeds and logs nothing personal", async () => {
    const d = deps({ alert: vi.fn(async () => Promise.reject(new Error("telegram down"))) });
    const state = await processContactSubmission(VALID, d);
    expect(state.status).toBe("success");
    const logged = (d.logError as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(logged).toHaveLength(1);
    expect(logged[0]).not.toContain("Missing items");
    expect(logged[0]).not.toContain("Sam Shopper");
  });
});
