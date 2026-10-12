import { describe, expect, it } from "vitest";
import {
  COMPANY_NUMBER_FIELD,
  CONTACT_EMAIL_FIELD,
  CONTACT_PHONE_FIELD,
  OPENING_HOURS_NOTE_FIELD,
  REGISTERED_OFFICE_FIELD,
  VAT_NUMBER_FIELD,
  isDiallablePhone,
  isEmailAddress,
  parseFooterContact,
  telHref,
} from "@/lib/footer-contact-form";

const BLANK = {
  contactPhone: "",
  contactEmail: "",
  companyNumber: "",
  vatNumber: "",
  registeredOffice: "",
  openingHoursNote: "",
  showSecureCheckoutNote: null,
};

function errorField(overrides: Partial<typeof BLANK>) {
  const result = parseFooterContact({ ...BLANK, ...overrides });
  return result.ok ? null : result.error.field;
}

describe("parseFooterContact (#1055)", () => {
  it("parses every blank field to null, which hides it", () => {
    const result = parseFooterContact(BLANK);
    expect(result).toEqual({
      ok: true,
      value: {
        contactPhone: null,
        contactEmail: null,
        companyNumber: null,
        vatNumber: null,
        registeredOffice: null,
        openingHoursNote: null,
        showSecureCheckoutNote: false,
      },
    });
  });

  it("trims and keeps valid values", () => {
    const result = parseFooterContact({
      contactPhone: " 01908 239130 ",
      contactEmail: "shop@example.com",
      companyNumber: "12345678",
      vatNumber: "GB123456789",
      registeredOffice: "1 High St, Town",
      openingHoursNote: "Collect during opening hours.",
      showSecureCheckoutNote: "on",
    });
    expect(result.ok && result.value).toEqual({
      contactPhone: "01908 239130",
      contactEmail: "shop@example.com",
      companyNumber: "12345678",
      vatNumber: "GB123456789",
      registeredOffice: "1 High St, Town",
      openingHoursNote: "Collect during opening hours.",
      showSecureCheckoutNote: true,
    });
  });

  describe("phone", () => {
    it.each(["+44 1908 239130", "(01908) 239-130", "123456"])("accepts %s", (phone) => {
      expect(errorField({ contactPhone: phone })).toBeNull();
    });
    it("accepts a bracketed placeholder", () => {
      expect(errorField({ contactPhone: "[PHONE]" })).toBeNull();
    });
    it.each(["12345", "call 01908", "1".repeat(21), "javascript:alert(1)"])(
      "refuses %s",
      (phone) => {
        expect(errorField({ contactPhone: phone })).toBe(CONTACT_PHONE_FIELD);
      },
    );
  });

  describe("email", () => {
    it("accepts an address and the [YOUR EMAIL] placeholder", () => {
      expect(errorField({ contactEmail: "a@b.co" })).toBeNull();
      expect(errorField({ contactEmail: "[YOUR EMAIL]" })).toBeNull();
    });
    it.each(["bob@", "bob@example", "no at sign", "a b@c.com", `${"a".repeat(250)}@b.co`])(
      "refuses %s",
      (email) => {
        expect(errorField({ contactEmail: email })).toBe(CONTACT_EMAIL_FIELD);
      },
    );
  });

  it.each([
    [COMPANY_NUMBER_FIELD, "companyNumber", 20],
    [VAT_NUMBER_FIELD, "vatNumber", 20],
    [REGISTERED_OFFICE_FIELD, "registeredOffice", 200],
    [OPENING_HOURS_NOTE_FIELD, "openingHoursNote", 200],
  ] as const)("limits %s to %i characters", (field, key, max) => {
    expect(errorField({ [key]: "x".repeat(max) })).toBeNull();
    expect(errorField({ [key]: "x".repeat(max + 1) })).toBe(field);
  });

  it("reads the Stripe checkbox as on only for the value 'on'", () => {
    const off = parseFooterContact({ ...BLANK, showSecureCheckoutNote: "yes" });
    expect(off.ok && off.value.showSecureCheckoutNote).toBe(false);
  });
});

describe("href guards (#1055)", () => {
  it("never treats a placeholder as diallable or as an email address", () => {
    expect(isDiallablePhone("[PHONE]")).toBe(false);
    expect(isEmailAddress("[YOUR EMAIL]")).toBe(false);
  });

  it("builds a digits-only tel: href, keeping a leading +", () => {
    expect(telHref("01908 239130")).toBe("tel:01908239130");
    expect(telHref("+44 (1908) 239-130")).toBe("tel:+441908239130");
  });
});
