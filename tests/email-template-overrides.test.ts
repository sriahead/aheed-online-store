import { describe, expect, it } from "vitest";
import { fallbackBrand } from "@/lib/email/layout/fallback";
import { TEMPLATE_KEYS } from "@/lib/email/templates/registry";
import { renderSample } from "@/lib/email/templates/samples";
import { isTemplateKey, validateOverride } from "@/lib/email/templates/validate";
import { customerMessage, type StoreContext } from "@/lib/order-notifications/build";
import { webhookOrder } from "./fixtures/webhook-order";

/** #1564 part 2 — R10–R13: what an admin may save, and that every sender honours it. */

describe("validateOverride (R12)", () => {
  it("accepts allowed placeholders and stores blanks as null (the default)", () => {
    const result = validateOverride("order.confirmed", {
      subject: "  Thanks! Order {{orderNumber}} is in  ",
      heading: "",
      intro: "Hi from {{ storeName }}",
    });
    expect(result).toEqual({
      ok: true,
      fields: {
        subject: "Thanks! Order {{orderNumber}} is in",
        preheader: null,
        heading: null,
        intro: "Hi from {{ storeName }}",
        ctaLabel: null,
        reassurance: null,
        signOff: null,
      },
    });
  });

  it("refuses a placeholder the template does not provide, naming the allowed ones", () => {
    const result = validateOverride("auth.verify_email", { subject: "Hi {{orderNumber}}" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.subject).toContain("{{orderNumber}} isn't available here");
      expect(result.errors.subject).toContain("{{storeName}}");
    }
  });

  it.each([
    ["an unmatched {{", { intro: "Hello {{storeName" }, "intro", "matching }}"],
    ["a malformed placeholder", { intro: "Hello {{ 1 }}" }, "intro", "isn't recognised"],
    ["a line break in the subject", { subject: "a\nb" }, "subject", "one line"],
    ["an over-long button", { ctaLabel: "x".repeat(41) }, "ctaLabel", "at most 40"],
  ] as const)("refuses %s", (_label, raw, field, message) => {
    const result = validateOverride("order.confirmed", raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[field]).toContain(message);
  });

  it("ignores fields the template does not let admins edit", () => {
    const result = validateOverride("enquiry.reply", { subject: "Changed", signOff: "Bye" });
    expect(result).toMatchObject({ ok: true, fields: { subject: null, signOff: "Bye" } });
  });

  it("knows the template keys", () => {
    expect(isTemplateKey("order.confirmed")).toBe(true);
    expect(isTemplateKey("order.unknown")).toBe(false);
  });
});

describe("samples (R9, R11)", () => {
  it.each([...TEMPLATE_KEYS])("%s renders a sample with and without edits", (key) => {
    const brand = fallbackBrand("Corner Shop", "https://shop.example");
    const plain = renderSample(key, brand);
    expect(plain.html).toContain("Powered by");
    const edited = renderSample(key, brand, { signOff: "Edited sign-off {{storeName}}" });
    expect(edited.html).toContain("Edited sign-off Corner Shop");
  });
});

describe("senders honour saved wording (R13)", () => {
  const store: StoreContext = {
    vendorId: "v-1",
    sender: { name: "Corner Shop", email: "shop@example.com" },
    baseUrl: "https://shop.example",
    ownerEmail: null,
    telegramChatIds: [],
    environment: "production",
    overrides: { "order.confirmed": { subject: "Got it! {{orderNumber}}", heading: "Yay" } },
  };

  it("the order email uses the store's override for that event only", () => {
    const confirmed = customerMessage(webhookOrder(), "CONFIRMED", store);
    expect(confirmed?.subject).toBe("Got it! SHO-20261105-ABC123");
    expect(confirmed?.body).toContain(">Yay</h1>");
    expect(confirmed?.text).toContain("Yay");
    const delivered = customerMessage(webhookOrder({ status: "DELIVERED" }), "DELIVERED", store);
    expect(delivered?.subject).toBe("Order SHO-20261105-ABC123 has been delivered");
  });

  it("no overrides means the defaults", () => {
    const message = customerMessage(webhookOrder(), "CONFIRMED", {
      ...store,
      overrides: undefined,
    });
    expect(message?.subject).toBe("Order SHO-20261105-ABC123 is confirmed");
  });
});
