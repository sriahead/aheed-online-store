import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CLIENT_SETUP_SECTIONS,
  type ClientSetupFacts,
  type EmailSetupFacts,
} from "@/lib/client-setup/sections";

/**
 * #1217 — the Client Setup dashboard: its section list (R27, R32) and its server actions
 * (R28, R29, R33). The actions are tested with the gate and the service mocked, so each case is
 * one branch of the action alone; the service's own guards are exercised where they live.
 */

const requireVendorRole = vi.fn();
vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const service = {
  listClientSetupVendors: vi.fn(),
  saveVendorSender: vi.fn(),
  addInboundAddress: vi.fn(),
  removeInboundAddress: vi.fn(),
  sendClientSetupTestEmail: vi.fn(),
};
vi.mock("@/lib/client-setup-service", () => service);

const actions = await import("@/app/(admin)/staff/platform/client-setup/actions");
const { initialClientSetupFormState } = await import("@/lib/client-setup/form-state");

const PLATFORM_ADMIN = {
  ok: true,
  user: { id: "u1", email: "admin@platform.test", name: "Admin" },
  vendorId: "v-current",
  via: "platform-admin",
};
const STORE_ADMIN = { ...PLATFORM_ADMIN, via: "ADMIN" };

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireVendorRole.mockResolvedValue(PLATFORM_ADMIN);
  service.listClientSetupVendors.mockResolvedValue([{ id: "v1", slug: "shop", name: "Shop" }]);
});

// ---------------------------------------------------------------------------------------------

const facts = (email: Partial<EmailSetupFacts> = {}): ClientSetupFacts => ({
  email: {
    senderName: "Shop",
    senderEmail: "orders@shop.test",
    senderDomainVerified: true,
    platformFromConfigured: true,
    inboundAddressCount: 1,
    ...email,
  },
});

describe("sections (R27)", () => {
  it("has exactly one section, email, in this slice", () => {
    expect(CLIENT_SETUP_SECTIONS.map((s) => s.id)).toEqual(["email"]);
  });

  it("every section has a unique id and at least one step", () => {
    const ids = CLIENT_SETUP_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of CLIENT_SETUP_SECTIONS) expect(s.steps.length).toBeGreaterThan(0);
  });
});

describe("email section guide (R32)", () => {
  const email = CLIENT_SETUP_SECTIONS.find((s) => s.id === "email")!;
  const step = (id: string) => email.steps.find((s) => s.id === id)!;

  it("has the seven steps in order", () => {
    expect(email.steps.map((s) => s.id)).toEqual([
      "sending-domain",
      "verified-domains",
      "sender",
      "destination",
      "inbound-addresses",
      "routing-rule",
      "test-email",
    ]);
  });

  it("links only to Cloudflare's dashboard or docs", () => {
    for (const s of email.steps) {
      if (s.href) expect(s.href).toMatch(/^https:\/\/(dash|developers)\.cloudflare\.com\//);
    }
  });

  it("steps 2, 3 and 5 are computed from data", () => {
    expect(step("verified-domains").done(facts())).toBe(true);
    expect(step("verified-domains").done(facts({ senderDomainVerified: false }))).toBe(false);
    expect(step("sender").done(facts())).toBe(true);
    expect(step("sender").done(facts({ senderEmail: "not-an-email" }))).toBe(false);
    expect(step("inbound-addresses").done(facts())).toBe(true);
    expect(step("inbound-addresses").done(facts({ inboundAddressCount: 0 }))).toBe(false);
  });

  it("steps only Cloudflare knows are never shown as done", () => {
    for (const id of ["sending-domain", "destination", "routing-rule"]) {
      expect(step(id).done(facts())).toBeNull();
      expect(step(id).href).toBeTruthy();
    }
  });

  it("status: blocked without a platform sender, complete when the data steps are done", () => {
    expect(email.status(facts({ platformFromConfigured: false }))).toBe("blocked");
    expect(email.status(facts())).toBe("complete");
    expect(email.status(facts({ inboundAddressCount: 0 }))).toBe("incomplete");
  });
});

// ---------------------------------------------------------------------------------------------

describe("actions are platform-admin only (R28)", () => {
  it.each([
    ["saveSenderAction", { vendorId: "v1", senderName: "S", senderEmail: "a@b.test" }],
    [
      "addInboundAddressAction",
      { vendorId: "v1", address: "o@b.test", purpose: "ORDERS", forwardTo: "x@y.test" },
    ],
    ["removeInboundAddressAction", { vendorId: "v1", id: "a1" }],
    ["sendTestEmailAction", { vendorId: "v1" }],
  ] as const)("%s refuses a store admin and writes nothing", async (name, fields) => {
    requireVendorRole.mockResolvedValue(STORE_ADMIN);
    const result = await actions[name](initialClientSetupFormState, form(fields));
    expect(result).toEqual({ ok: false, message: "Platform admin only." });
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("saveSenderAction", () => {
  it("saves a valid sender, lower-casing the email", async () => {
    service.saveVendorSender.mockResolvedValue(true);
    const result = await actions.saveSenderAction(
      initialClientSetupFormState,
      form({ vendorId: "v1", senderName: " Shop ", senderEmail: "Orders@Shop.TEST" }),
    );
    expect(result.ok).toBe(true);
    expect(service.saveVendorSender).toHaveBeenCalledWith("v1", {
      senderName: "Shop",
      senderEmail: "orders@shop.test",
    });
  });

  it("rejects an invalid email without saving", async () => {
    const result = await actions.saveSenderAction(
      initialClientSetupFormState,
      form({ vendorId: "v1", senderName: "Shop", senderEmail: "nope" }),
    );
    expect(result.ok).toBe(false);
    expect(service.saveVendorSender).not.toHaveBeenCalled();
  });

  it("refuses an unknown vendor id", async () => {
    const result = await actions.saveSenderAction(
      initialClientSetupFormState,
      form({ vendorId: "v-gone", senderName: "Shop", senderEmail: "a@b.test" }),
    );
    expect(result.ok).toBe(false);
    expect(service.saveVendorSender).not.toHaveBeenCalled();
  });
});

describe("addInboundAddressAction refusals (R29)", () => {
  const fields = {
    vendorId: "v1",
    address: "orders@shop.test",
    purpose: "ORDERS",
    forwardTo: "o@m.test",
  };

  it("explains a forwarding loop", async () => {
    service.addInboundAddress.mockResolvedValue({ ok: false, reason: "loop" });
    const result = await actions.addInboundAddressAction(initialClientSetupFormState, form(fields));
    expect(result).toMatchObject({ ok: false });
    expect(result.message).toMatch(/loop/);
  });

  it("explains an address already registered", async () => {
    service.addInboundAddress.mockResolvedValue({ ok: false, reason: "duplicate" });
    const result = await actions.addInboundAddressAction(initialClientSetupFormState, form(fields));
    expect(result).toMatchObject({ ok: false });
    expect(result.message).toMatch(/already registered/);
  });

  it("adds a valid address", async () => {
    service.addInboundAddress.mockResolvedValue({ ok: true });
    const result = await actions.addInboundAddressAction(initialClientSetupFormState, form(fields));
    expect(result.ok).toBe(true);
    expect(service.addInboundAddress).toHaveBeenCalledWith("v1", {
      vendorId: "v1",
      address: "orders@shop.test",
      purpose: "ORDERS",
      forwardTo: "o@m.test",
    });
  });
});

describe("sendTestEmailAction (R33)", () => {
  it("sends to the signed-in admin's own address whatever the form posts", async () => {
    service.sendClientSetupTestEmail.mockResolvedValue({ status: "sent" });
    const result = await actions.sendTestEmailAction(
      initialClientSetupFormState,
      form({ vendorId: "v1", to: "someone-else@evil.test" }),
    );
    expect(service.sendClientSetupTestEmail).toHaveBeenCalledWith("v1", "admin@platform.test");
    expect(result).toMatchObject({ ok: true });
    expect(result.message).toMatch(/^Sent/);
  });

  it("reports a recipient-policy skip", async () => {
    service.sendClientSetupTestEmail.mockResolvedValue({
      status: "skipped",
      reason: "recipient is not on EMAIL_ALLOWED_RECIPIENTS",
    });
    const result = await actions.sendTestEmailAction(
      initialClientSetupFormState,
      form({ vendorId: "v1" }),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/^Skipped by recipient policy/);
  });

  it("reports a failure with its reason", async () => {
    service.sendClientSetupTestEmail.mockResolvedValue({ status: "failed", reason: "boom" });
    const result = await actions.sendTestEmailAction(
      initialClientSetupFormState,
      form({ vendorId: "v1" }),
    );
    expect(result).toEqual({ ok: false, message: "Failed: boom." });
  });
});
