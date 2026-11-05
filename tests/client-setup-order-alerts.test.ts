import { describe, it, expect } from "vitest";
import {
  CHAT_ID_MESSAGE,
  firstIssue,
  orderAlertRecipientIdSchema,
  orderAlertRecipientSchema,
} from "@/lib/client-setup/form-state";

/** #1390 R14 — the Client Setup order-alert recipient input. */

describe("orderAlertRecipientSchema (R14)", () => {
  const base = { vendorId: "v1", channel: "TELEGRAM" };

  it.each(["-1001234567890", "123", " 42 ", "1".repeat(20), `-${"9".repeat(20)}`])(
    "accepts %j",
    (destination) => {
      const parsed = orderAlertRecipientSchema.safeParse({ ...base, destination });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.destination).toBe(destination.trim());
    },
  );

  it.each(["abc", "-", "@group", "1".repeat(21), "", "12 34"])("refuses %j", (destination) => {
    const parsed = orderAlertRecipientSchema.safeParse({ ...base, destination });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(firstIssue(parsed.error)).toBe(CHAT_ID_MESSAGE);
  });

  it("states the R14 message", () => {
    expect(CHAT_ID_MESSAGE).toBe("Enter the numeric Telegram chat ID (group IDs start with -).");
  });

  it("allows only the TELEGRAM channel", () => {
    expect(
      orderAlertRecipientSchema.safeParse({ ...base, channel: "WHATSAPP", destination: "1" })
        .success,
    ).toBe(false);
  });

  it("needs a vendor and an id to remove or test", () => {
    expect(orderAlertRecipientIdSchema.safeParse({ vendorId: "v1", id: "r1" }).success).toBe(true);
    expect(orderAlertRecipientIdSchema.safeParse({ vendorId: "v1", id: "" }).success).toBe(false);
  });
});
