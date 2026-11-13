import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * #1482 R6/R15 — a successful storefront contact-form submission is also recorded as a
 * `CONTACT_FORM` enquiry for `/staff/enquiries`, and recording can never change what the shopper
 * sees. `processContactSubmission` (#1409, tested in tests/contact-form.test.ts) is mocked here:
 * this file is only about what happens after it returns.
 */

const processContactSubmission = vi.fn();
vi.mock("@/lib/contact/submit", () => ({ processContactSubmission }));

const createVendorEnquiry = vi.fn();
vi.mock("@/lib/repositories/enquiries", () => ({ createVendorEnquiry }));

vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/config", () => ({ getInboundDefaultForward: () => null }));
vi.mock("@/lib/email", () => ({ getEmailService: () => ({ send: vi.fn() }) }));
vi.mock("@/lib/job-signals", () => ({
  clearContactOutboxPending: vi.fn(),
  markContactOutboxPending: vi.fn(),
}));
vi.mock("@/lib/repositories/contact", () => ({}));
vi.mock("@/lib/repositories/inbound-address", () => ({ listInboundAddresses: vi.fn() }));
vi.mock("@/lib/repositories/vendor", () => ({ listAllVendorIds: vi.fn() }));
vi.mock("@/lib/repositories/orders", () => ({}));
vi.mock("@/lib/vendor-service", () => ({
  fetchVendorProfile: vi.fn(async () => ({ name: "Test Store" })),
}));
vi.mock("@/lib/order-alert-service", () => ({ sendOrderAlertForVendor: vi.fn() }));
vi.mock("@/lib/order-notifications-service", () => ({ sendVendorNotifications: vi.fn() }));

const FIELDS = {
  name: "Ada Shopper",
  email: "ada@example.test",
  phone: "",
  type: "ENQUIRY",
  subject: "Opening hours",
  message: "Are you open on Sunday afternoons?",
  orderId: "",
  website: "",
};

const SUCCESS = { status: "success" as const };

async function submit(fields: Record<string, string>) {
  const { submitContactForVendor } = await import("@/lib/contact-service");
  return submitContactForVendor({ vendorId: "vendor-1", userId: null, ip: "1.2.3.4", fields });
}

beforeEach(() => {
  vi.clearAllMocks();
  processContactSubmission.mockResolvedValue(SUCCESS);
  createVendorEnquiry.mockResolvedValue({ id: "e1" });
});

describe("submitContactForVendor records an enquiry (R6)", () => {
  it("a successful submission records exactly one CONTACT_FORM enquiry for that vendor", async () => {
    expect(await submit(FIELDS)).toEqual(SUCCESS);
    expect(createVendorEnquiry).toHaveBeenCalledTimes(1);
    expect(createVendorEnquiry).toHaveBeenCalledWith(expect.anything(), "vendor-1", {
      source: "CONTACT_FORM",
      type: "ENQUIRY",
      senderName: "Ada Shopper",
      senderEmail: "ada@example.test",
      senderPhone: null,
      orderNumber: null,
      subject: "Opening hours",
      message: "Are you open on Sunday afternoons?",
    });
  });

  it("a honeypot submission records nothing and returns the submission state unchanged", async () => {
    expect(await submit({ ...FIELDS, website: "http://spam.test" })).toEqual(SUCCESS);
    expect(createVendorEnquiry).not.toHaveBeenCalled();
  });

  it("a failed submission records nothing and returns its state unchanged", async () => {
    const failed = { status: "error" as const, message: "Try again later." };
    processContactSubmission.mockResolvedValue(failed);
    expect(await submit(FIELDS)).toEqual(failed);
    expect(createVendorEnquiry).not.toHaveBeenCalled();
  });

  it("a throwing createVendorEnquiry is logged and the shopper still sees success", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a) => errors.push(a.map(String).join(" ")));
    createVendorEnquiry.mockRejectedValue(new Error("db down"));
    expect(await submit(FIELDS)).toEqual(SUCCESS);
    expect(errors.some((l) => l.includes("failed to record enquiry for vendor vendor-1"))).toBe(
      true,
    );
  });
});
