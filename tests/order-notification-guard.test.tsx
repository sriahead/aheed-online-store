import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OrderProgressTracker } from "@/components/orders/OrderProgressTracker";
import { buildCustomerEmail } from "@/lib/order-notifications/customer-email";
import { ORDER_EVENTS } from "@/lib/order-notifications/next-step";
import {
  buildOwnerDigestEmail,
  buildOwnerEmail,
  ownerDigestTelegramText,
  ownerTelegramText,
} from "@/lib/order-notifications/owner";
import { textOf, webhookOrder } from "./fixtures/webhook-order";

/**
 * #1435 R24 — order messages and the tracker are transactional, never marketing or pressure.
 *
 * PECR: a transactional email may not carry marketing without consent, so no cross-sell or
 * "reorder". DMCC Act 2024 / the CMA's online choice architecture guidance: no fake urgency,
 * scarcity or social proof. This walks every message the slice can produce — every event, both
 * fulfilment methods, with and without a discount and points — and every tracker state, and fails
 * if any of them grows one of these phrases.
 */

const FORBIDDEN = [
  "shop again",
  "reorder",
  "recommended",
  "you might also like",
  "% off",
  "sale",
  "hurry",
  "last chance",
  "limited time",
  "only a few",
  "don't miss",
  "people are",
];

function assertClean(label: string, text: string) {
  const lower = text.toLowerCase();
  for (const phrase of FORBIDDEN) {
    // `sale` as a word only: "wholesale" or a store called "Salem" are not marketing.
    const hit = phrase === "sale" ? /\bsales?\b/.test(lower) : lower.includes(phrase.toLowerCase());
    expect(hit, `${label} contains "${phrase}"`).toBe(false);
  }
}

describe("transactional-only guard (R24)", () => {
  it("has the twelve phrases R24 names", () => {
    expect(FORBIDDEN).toHaveLength(12);
  });

  const variants = [
    { discountPence: 0, pointsEarned: null },
    { discountPence: 500, pointsEarned: 40, discountCode: { code: "WELCOME", amountPence: 300 } },
  ];

  for (const event of ORDER_EVENTS) {
    for (const method of ["DELIVERY", "COLLECTION"] as const) {
      for (const [v, variant] of variants.entries()) {
        it(`${event} ${method} variant ${v}`, () => {
          const order = webhookOrder({ status: event, fulfilmentMethod: method, ...variant });
          const label = `${event}/${method}/${v}`;
          const c = buildCustomerEmail({
            order,
            event,
            storeName: "Corner Shop",
            baseUrl: "https://s.test",
          });
          assertClean(`customer subject ${label}`, c.subject);
          assertClean(`customer email ${label}`, textOf(c.html));
          const o = buildOwnerEmail({
            order,
            event,
            storeName: "Corner Shop",
            baseUrl: "https://s.test",
          });
          assertClean(`owner subject ${label}`, o.subject);
          assertClean(`owner email ${label}`, textOf(o.html));
          assertClean(
            `owner telegram ${label}`,
            ownerTelegramText({
              order,
              event,
              storeName: "Corner Shop",
              baseUrl: "https://s.test",
              environment: "staging",
            }),
          );
          assertClean(`digest ${label}`, ownerDigestTelegramText(event, ["A", "B"], "staging"));
          assertClean(
            `digest email ${label}`,
            textOf(buildOwnerDigestEmail(event, ["A"], "https://s.test").html),
          );
        });
      }
    }
  }

  it("every tracker state", () => {
    for (const method of ["DELIVERY", "COLLECTION"] as const) {
      for (const status of ["PENDING_PAYMENT", ...ORDER_EVENTS]) {
        const html = renderToStaticMarkup(
          <OrderProgressTracker
            orderNumber="SHO-1"
            status={status}
            fulfilmentMethod={method}
            timeline={[{ status, label: status, at: new Date("2026-11-05T10:00:00.000Z") }]}
            slotLabel="Friday 6 November, 10:00–12:00"
          />,
        );
        assertClean(`tracker ${method}/${status}`, textOf(html));
      }
    }
  });
});
