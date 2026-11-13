import { describe, expect, it, vi } from "vitest";
import {
  isOfferableCode,
  reminderBlock,
  REMINDER_BLOCK_COPY,
  REMINDER_WINDOW_DAYS,
} from "@/lib/abandoned-checkout/eligibility";
import { buildRecoveryEmail, codeBenefit, type RecoveryCode } from "@/lib/abandoned-checkout/email";
import {
  REMIND_COPY,
  sendAbandonedCheckoutReminder,
  type RemindDeps,
  type StoreCode,
} from "@/lib/abandoned-checkout/remind";
import type { NotificationMessage } from "@/lib/notifications/dispatch";
import type { AbandonedCheckoutRow } from "@/lib/repositories/abandoned-checkouts";

/** #1554 — abandoned checkouts: eligibility, the recovery email and the "Send reminder" action. */

const NOW = new Date("2026-11-13T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

const eligible = {
  abandonedAt: new Date(NOW.getTime() - DAY),
  userId: "user-1",
  email: "sam@example.com",
  hasConsent: true,
  reminderSentAt: null,
};

describe("reminderBlock (R2)", () => {
  it("an opted-in member within the window may be reminded", () => {
    expect(reminderBlock(eligible, NOW)).toBeNull();
  });

  it.each([
    ["already sent", { reminderSentAt: NOW }, "already-sent"],
    ["a guest", { userId: null }, "guest"],
    ["no email", { email: null }, "no-email"],
    ["no consent", { hasConsent: false }, "no-consent"],
    [
      "too old",
      { abandonedAt: new Date(NOW.getTime() - (REMINDER_WINDOW_DAYS + 1) * DAY) },
      "too-old",
    ],
  ] as const)("%s is blocked", (_label, change, reason) => {
    expect(reminderBlock({ ...eligible, ...change }, NOW)).toBe(reason);
    expect(REMINDER_BLOCK_COPY[reason]).toBeTruthy();
  });

  it("already-sent wins over every other reason", () => {
    expect(reminderBlock({ ...eligible, userId: null, reminderSentAt: NOW }, NOW)).toBe(
      "already-sent",
    );
  });
});

describe("isOfferableCode (R3)", () => {
  const base = { isActive: true, startsAt: new Date(0), endsAt: null, remainingRedemptions: null };
  it.each([
    ["active and open", {}, true],
    ["inactive", { isActive: false }, false],
    ["not started", { startsAt: new Date(NOW.getTime() + DAY) }, false],
    ["ended", { endsAt: new Date(NOW.getTime() - 1) }, false],
    ["used up", { remainingRedemptions: 0 }, false],
    ["uses left", { remainingRedemptions: 3 }, true],
  ] as const)("%s → %s", (_label, change, expected) => {
    expect(isOfferableCode({ ...base, ...change }, NOW)).toBe(expected);
  });
});

const items = [
  { productName: "Basmati <Rice>", quantity: 2, lineTotalPence: 1198 },
  { productName: "Chana Dal", quantity: 1, lineTotalPence: 249 },
];

describe("buildRecoveryEmail (R4)", () => {
  const input = {
    storeName: "Corner Shop",
    firstName: "Sam",
    items,
    totalPence: 1447,
    orderHref: "https://s.test/account/orders/SHO-1",
    preferencesHref: "https://s.test/account/data",
    code: null,
  };

  it("lists the customer's own items, the real total, one button and the opt-out", () => {
    const { subject, html } = buildRecoveryEmail(input);
    expect(subject).toBe("Your basket is waiting — Corner Shop");
    expect(html).toContain("Hi Sam,");
    expect(html).toContain("Basmati &lt;Rice&gt;");
    expect(html).toContain("£14.47");
    expect(html.match(/Return to your basket/g)).toHaveLength(1);
    expect(html).toContain('href="https://s.test/account/data"');
    expect(html).toContain("Stop marketing emails");
  });

  it("uses no false urgency or scarcity (CPRs, DMCC Act 2024)", () => {
    const text = buildRecoveryEmail(input).html.toLowerCase();
    for (const banned of [
      "hurry",
      "last chance",
      "only ",
      "left in stock",
      "expires in",
      "act now",
      "people are",
    ]) {
      expect(text).not.toContain(banned);
    }
  });

  it.each([
    [{ kind: "PERCENTAGE", value: 1000 }, "10% off"],
    [{ kind: "PERCENTAGE", value: 1250 }, "12.5% off"],
    [{ kind: "FIXED_AMOUNT", value: 500 }, "£5.00 off"],
  ] as const)("code %o reads %s", (change, benefit) => {
    expect(codeBenefit({ code: "X", minSubtotalPence: 0, endsAt: null, ...change })).toBe(benefit);
  });

  it("a code adds its real benefit, conditions and end date, escaped", () => {
    const code: RecoveryCode = {
      code: "BACK<10>",
      kind: "PERCENTAGE",
      value: 1000,
      minSubtotalPence: 2000,
      endsAt: new Date("2026-11-20T12:00:00.000Z"),
    };
    const { subject, html } = buildRecoveryEmail({ ...input, code });
    expect(subject).toBe("Your basket is waiting, with 10% off — Corner Shop");
    expect(html).toContain("BACK&lt;10&gt;");
    expect(html).toContain("on orders over £20.00, until 20 November");
  });

  it("without a canonical host there is no button and the opt-out says reply", () => {
    const { html } = buildRecoveryEmail({ ...input, orderHref: null, preferencesHref: null });
    expect(html).not.toContain("Return to your basket");
    expect(html).toContain("Reply to this email to stop marketing emails.");
  });
});

function row(overrides: Partial<AbandonedCheckoutRow> = {}): AbandonedCheckoutRow {
  return {
    orderId: "order-1",
    orderNumber: "SHO-1",
    userId: "user-1",
    confirmationToken: null,
    email: "sam@example.com",
    customerName: "Sam Shopper",
    totalPence: 1447,
    items,
    abandonedAt: new Date(NOW.getTime() - DAY),
    reminder: null,
    ...overrides,
  };
}

const CODE: StoreCode = {
  id: "code-1",
  code: "BACK10",
  kind: "PERCENTAGE",
  value: 1000,
  minSubtotalPence: 0,
  endsAt: null,
  startsAt: new Date(0),
  isActive: true,
  remainingRedemptions: null,
};

function deps(overrides: Partial<RemindDeps> = {}) {
  const sent: NotificationMessage[] = [];
  const order: string[] = [];
  const d: RemindDeps & { sent: NotificationMessage[]; order: string[] } = {
    sent,
    order,
    find: vi.fn(async () => row()),
    hasConsent: vi.fn(async () => true),
    listCodes: vi.fn(async () => [CODE, { ...CODE, id: "code-2", isActive: false }]),
    claim: vi.fn(async () => {
      order.push("claim");
      return "claimed" as const;
    }),
    loadStore: vi.fn(async () => ({
      sender: { name: "Corner Shop", email: "shop@s.test" },
      baseUrl: "https://s.test",
    })),
    send: vi.fn(async (m) => {
      order.push("send");
      sent.push(...m);
    }),
    now: () => NOW,
    ...overrides,
  };
  return d;
}

const input = { orderNumber: "SHO-1", staffUserId: "staff-1", discountCodeId: null };

describe("sendAbandonedCheckoutReminder (R2, R3, R5)", () => {
  it("claims, then sends one marketing email from the store to the customer", async () => {
    const d = deps();
    expect(await sendAbandonedCheckoutReminder(input, d)).toEqual({ ok: true });
    expect(d.order).toEqual(["claim", "send"]);
    expect(d.claim).toHaveBeenCalledWith({
      orderId: "order-1",
      sentByUserId: "staff-1",
      discountCode: null,
    });
    expect(d.sent).toHaveLength(1);
    expect(d.sent[0]).toMatchObject({
      channel: "EMAIL",
      destination: "sam@example.com",
      sender: { name: "Corner Shop", email: "shop@s.test" },
      log: { audience: "CUSTOMER", event: "ABANDONED_CHECKOUT_REMINDER" },
    });
    expect(d.sent[0].body).toContain('href="https://s.test/account/orders/SHO-1"');
  });

  it("an offerable code is recorded on the claim and appears in the email", async () => {
    const d = deps();
    await sendAbandonedCheckoutReminder({ ...input, discountCodeId: "code-1" }, d);
    expect(d.claim).toHaveBeenCalledWith(expect.objectContaining({ discountCode: "BACK10" }));
    expect(d.sent[0].subject).toContain("10% off");
  });

  it.each(["code-2", "missing"])("code %s that cannot be offered sends nothing", async (id) => {
    const d = deps();
    expect(await sendAbandonedCheckoutReminder({ ...input, discountCodeId: id }, d)).toEqual({
      ok: false,
      error: REMIND_COPY.badCode,
    });
    expect(d.claim).not.toHaveBeenCalled();
    expect(d.sent).toEqual([]);
  });

  it("another store's or a non-abandoned order is not found", async () => {
    const d = deps({ find: vi.fn(async () => null) });
    expect(await sendAbandonedCheckoutReminder(input, d)).toEqual({
      ok: false,
      error: REMIND_COPY.notFound,
    });
  });

  it.each([
    ["a guest", { userId: null }, "guest"],
    [
      "already reminded",
      { reminder: { sentAt: NOW, discountCode: null, sentByName: null } },
      "already-sent",
    ],
    ["too old", { abandonedAt: new Date(NOW.getTime() - 8 * DAY) }, "too-old"],
  ] as const)("%s is refused server-side, before any claim", async (_l, change, reason) => {
    const d = deps({ find: vi.fn(async () => row(change as Partial<AbandonedCheckoutRow>)) });
    expect(await sendAbandonedCheckoutReminder(input, d)).toEqual({
      ok: false,
      error: REMINDER_BLOCK_COPY[reason],
    });
    expect(d.claim).not.toHaveBeenCalled();
    expect(d.sent).toEqual([]);
  });

  it("consent withdrawn since the page loaded is refused", async () => {
    const d = deps({ hasConsent: vi.fn(async () => false) });
    expect(await sendAbandonedCheckoutReminder(input, d)).toEqual({
      ok: false,
      error: REMINDER_BLOCK_COPY["no-consent"],
    });
    expect(d.sent).toEqual([]);
  });

  it("losing the claim race (double click, second admin) sends nothing", async () => {
    const d = deps({ claim: vi.fn(async () => "already-sent" as const) });
    expect(await sendAbandonedCheckoutReminder(input, d)).toEqual({
      ok: false,
      error: REMINDER_BLOCK_COPY["already-sent"],
    });
    expect(d.sent).toEqual([]);
  });
});
