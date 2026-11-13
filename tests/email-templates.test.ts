import { describe, expect, it } from "vitest";
import { buildRecoveryEmail } from "@/lib/abandoned-checkout/email";
import { acknowledgementEmail } from "@/lib/contact/message";
import { fallbackBrand } from "@/lib/email/layout/fallback";
import { resetPasswordMessage, verifyEmailMessage } from "@/lib/email/templates/account";
import { templateCopy } from "@/lib/email/templates/compose";
import {
  COPY_FIELDS,
  COPY_FIELD_LIMITS,
  interpolate,
  placeholdersIn,
} from "@/lib/email/templates/copy";
import { enquiryReplyEmail } from "@/lib/email/templates/enquiry";
import {
  allTemplateDefinitions,
  ORDER_TEMPLATE,
  TEMPLATE_KEYS,
  templateDefinition,
} from "@/lib/email/templates/registry";
import { existingAccountEmail } from "@/lib/notifications/existing-account";
import { buildCustomerEmail } from "@/lib/order-notifications/customer-email";
import { ORDER_EVENTS } from "@/lib/order-notifications/next-step";
import { webhookOrder } from "./fixtures/webhook-order";

/** #1564 R5–R7 — the template registry, the wording rules, and every template's output. */

const STORE = "Corner Shop";
const BASE = "https://shop.example";
const brand = fallbackBrand(STORE, BASE);

function everyEmail() {
  return [
    ...ORDER_EVENTS.map((event) => ({
      key: ORDER_TEMPLATE[event],
      email: buildCustomerEmail({
        order: webhookOrder({ status: event }),
        event,
        storeName: STORE,
        baseUrl: BASE,
        brand,
      }),
    })),
    { key: "auth.verify_email", email: verifyEmailMessage({ brand, url: `${BASE}/v?token=t` }) },
    { key: "auth.reset_password", email: resetPasswordMessage({ brand, url: `${BASE}/r/t` }) },
    {
      key: "auth.existing_account",
      email: existingAccountEmail({
        storeName: STORE,
        baseUrl: BASE,
        providers: ["credential"],
        brand,
      }),
    },
    {
      key: "contact.acknowledgement",
      email: acknowledgementEmail({ storeName: STORE, type: "ENQUIRY", orderNumber: null, brand }),
    },
    {
      key: "contact.complaint_acknowledgement",
      email: acknowledgementEmail({
        storeName: STORE,
        type: "COMPLAINT",
        orderNumber: "A-1",
        brand,
      }),
    },
    {
      key: "enquiry.reply",
      email: enquiryReplyEmail({
        brand,
        storeName: STORE,
        originalSubject: "Help",
        replyText: "Here is our answer.",
        originalMessage: "My question",
        orderNumber: null,
      }),
    },
    {
      key: "marketing.abandoned_checkout",
      email: buildRecoveryEmail({
        storeName: STORE,
        firstName: "Sam",
        items: [{ productName: "Thing", quantity: 1, lineTotalPence: 100 }],
        totalPence: 100,
        orderHref: `${BASE}/account/orders/A-1`,
        preferencesHref: `${BASE}/account/data`,
        code: null,
        brand,
      }),
    },
  ];
}

describe("registry (R5, R6)", () => {
  it("registers the 14 customer templates once each", () => {
    expect(TEMPLATE_KEYS).toHaveLength(14);
    expect(new Set(allTemplateDefinitions().map((d) => d.key))).toEqual(new Set(TEMPLATE_KEYS));
  });

  it("every default uses only its declared placeholders and fits the field limits", () => {
    for (const def of allTemplateDefinitions()) {
      for (const field of COPY_FIELDS) {
        const text = def.defaults[field];
        for (const name of placeholdersIn(text)) {
          expect(def.placeholders, `${def.key}.${field} uses {{${name}}}`).toContain(name);
        }
        expect(text.length, `${def.key}.${field}`).toBeLessThanOrEqual(COPY_FIELD_LIMITS[field]);
      }
      for (const name of placeholdersIn(def.reason)) expect(def.placeholders).toContain(name);
    }
  });

  it("the staff reply only lets admins edit its reassurance and sign-off", () => {
    expect(templateDefinition("enquiry.reply").editable).toEqual(["reassurance", "signOff"]);
  });
});

describe("wording (R5)", () => {
  it("interpolates known placeholders and leaves unknown ones as written", () => {
    expect(interpolate("Hi {{ storeName }} {{nope}}", { storeName: "S" })).toBe("Hi S {{nope}}");
  });

  it("an override replaces only editable, non-blank fields", () => {
    const { copy } = templateCopy(
      "enquiry.reply",
      { storeName: STORE },
      { heading: "Changed", signOff: "Cheers, {{storeName}}", reassurance: "  " },
    );
    expect(copy.heading).toBe("A reply from Corner Shop");
    expect(copy.signOff).toBe("Cheers, Corner Shop");
    expect(copy.reassurance).toBe("You can reply to this email to continue the conversation.");
  });

  it("an override's HTML is escaped, never rendered", () => {
    const email = buildCustomerEmail({
      order: webhookOrder(),
      event: "CONFIRMED",
      storeName: STORE,
      baseUrl: BASE,
      brand,
      overrides: { intro: '<a href="https://evil.test">click</a>' },
    });
    expect(email.html).not.toContain('href="https://evil.test"');
    expect(email.html).toContain("&lt;a href=");
  });
});

describe("every template's output (R6, R7)", () => {
  const emails = everyEmail();

  it("covers every registered template", () => {
    expect(new Set(emails.map((e) => e.key))).toEqual(new Set(TEMPLATE_KEYS));
  });

  it.each(emails.map((e) => [e.key, e.email] as const))(
    "%s has a subject without the store suffix, a preheader, HTML and plain text",
    (_key, email) => {
      expect(email.subject.length).toBeGreaterThan(5);
      expect(email.subject).not.toMatch(/ — Corner Shop$/);
      expect(email.preheader.length).toBeGreaterThan(5);
      expect(email.html).toContain("Powered by");
      expect(email.text.length).toBeGreaterThan(40);
      expect(email.text).not.toMatch(/\{\{|<[a-z]/i);
      expect(email.html).not.toContain("{{");
    },
  );

  it("every button link is absolute", () => {
    for (const { key, email } of emails) {
      for (const [, href] of email.html.matchAll(/href="([^"]+)"/g)) {
        expect(href, key).toMatch(/^https:\/\//);
      }
    }
  });

  it("transactional templates carry no marketing or pressure words", () => {
    for (const { key, email } of emails) {
      if (key.startsWith("marketing.")) continue;
      expect(email.text.toLowerCase(), key).not.toMatch(
        /% off|hurry|last chance|limited time|don't miss|you might also like|reorder/,
      );
    }
  });

  it("the account emails carry Better Auth's URL in the button and as a fallback", () => {
    const verify = verifyEmailMessage({ brand, url: `${BASE}/v?token=t&x=1` });
    expect(verify.html.match(/href="https:\/\/shop\.example\/v\?token=t&amp;x=1"/g)).toHaveLength(
      2,
    );
    expect(verify.text).toContain(`${BASE}/v?token=t&x=1`);
  });

  it("the staff reply keeps Re: threading and the staff text verbatim", () => {
    const reply = enquiryReplyEmail({
      brand,
      storeName: STORE,
      originalSubject: "Re: Help",
      replyText: "Line one\n<b>Line two</b>",
      originalMessage: "Original",
      orderNumber: "A-1",
    });
    expect(reply.subject).toBe("Re: Help");
    expect(reply.html).toContain("Line one\n&lt;b&gt;Line two&lt;/b&gt;");
    expect(reply.text).toContain("> Original");
  });
});
