// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OrderItemsCard } from "@/components/orders/OrderItemsCard";
import { OrderPointsNote } from "@/components/orders/OrderPointsNote";

/**
 * P7.5b (#150, #138) — what an order page is allowed to SAY about its own money.
 *
 * `vitest.config.mts` sets `environment: "node"` globally, so the docblock above
 * is what gives these two components a DOM (same opt-in as tests/a11y/*.tsx).
 *
 * The point of these cases is not the markup but the claims: a discount row may
 * only name a source that actually contributed that amount, and a points figure
 * may only appear once it has actually been awarded.
 */

afterEach(cleanup);

const items = [
  { productName: "Basmati rice", unitPricePence: 1000, quantity: 2, lineTotalPence: 2000 },
];

/** The money block's rows as `label → value` pairs, read back out of the DOM. */
function moneyRows(container: HTMLElement): Record<string, string> {
  const rows: Record<string, string> = {};
  container.querySelectorAll("dl > div").forEach((row) => {
    const label = row.querySelector("dt")?.textContent?.trim();
    const value = row.querySelector("dd")?.textContent?.trim();
    if (label) rows[label] = value ?? "";
  });
  return rows;
}

describe("OrderItemsCard — discount attribution (R10, R11, R12)", () => {
  it("names the code and its own share, with loyalty as a separate row (R10)", () => {
    const { container } = render(
      <OrderItemsCard
        items={items}
        subtotalPence={4200}
        discountPence={700}
        discountCode={{ code: "WELCOME10", amountPence: 500 }}
        deliveryFeePence={0}
        totalPence={3500}
      />,
    );

    const rows = moneyRows(container);
    expect(rows["Code WELCOME10"]).toBe("−£5.00");
    expect(rows["Loyalty points"]).toBe("−£2.00");
    // The whole reason for splitting: no row claims the combined figure.
    expect(Object.keys(rows)).not.toContain("Discount");
    expect(rows["Total"]).toBe("£35.00");
  });

  it("renders no discount row at all when the order carried no discount (R11)", () => {
    const { container } = render(
      <OrderItemsCard
        items={items}
        subtotalPence={2000}
        discountPence={0}
        deliveryFeePence={349}
        totalPence={2349}
      />,
    );

    const labels = Object.keys(moneyRows(container));
    expect(labels).toEqual(["Subtotal", "Delivery", "Total"]);
  });

  it("attributes a no-code discount to loyalty in one row (R12)", () => {
    const { container } = render(
      <OrderItemsCard
        items={items}
        subtotalPence={2000}
        discountPence={700}
        deliveryFeePence={0}
        totalPence={1300}
      />,
    );

    const rows = moneyRows(container);
    expect(rows["Loyalty points"]).toBe("−£7.00");
    expect(Object.keys(rows).filter((l) => l.startsWith("Code "))).toEqual([]);
  });

  it("omits the loyalty row when the code accounts for the whole discount", () => {
    const { container } = render(
      <OrderItemsCard
        items={items}
        subtotalPence={2000}
        discountPence={500}
        discountCode={{ code: "SAVE5", amountPence: 500 }}
        deliveryFeePence={0}
        totalPence={1500}
      />,
    );

    const rows = moneyRows(container);
    expect(rows["Code SAVE5"]).toBe("−£5.00");
    expect(Object.keys(rows)).not.toContain("Loyalty points");
  });
});

describe("OrderPointsNote — only settled claims (R13, R14, R15)", () => {
  it("states the earned figure once an EARN row exists (R13)", () => {
    render(<OrderPointsNote status="CONFIRMED" pointsEarned={34} hasAccount />);
    expect(screen.getByText(/You earned/).textContent).toContain("You earned 34 points");
  });

  it("carries no number at all while payment is still pending (R13)", () => {
    const { container } = render(
      <OrderPointsNote status="PENDING_PAYMENT" pointsEarned={null} hasAccount />,
    );
    // The whole point of the pending copy: it promises nothing quantified,
    // because the tier multiplier that decides the award is resolved at
    // confirmation and can differ from anything predicted here.
    expect(container.textContent ?? "").toMatch(/^[^0-9]*$/);
    expect(container.textContent).toContain("once payment clears");
  });

  it("renders nothing when there is neither an award nor a pending payment (R13)", () => {
    const { container } = render(
      <OrderPointsNote status="DELIVERED" pointsEarned={null} hasAccount />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("promises a guest nothing, in either state (R14)", () => {
    const pending = render(
      <OrderPointsNote status="PENDING_PAYMENT" pointsEarned={null} hasAccount={false} />,
    );
    expect(pending.container.innerHTML).toBe("");
    cleanup();

    const confirmed = render(
      <OrderPointsNote status="CONFIRMED" pointsEarned={null} hasAccount={false} />,
    );
    expect(confirmed.container.innerHTML).toBe("");
  });

  it("renders nothing for a cancelled order even if a figure is supplied (R15)", () => {
    // Guarding on status rather than on the data being absent: a cancelled order
    // must stay silent regardless of how a points row came to exist.
    const { container } = render(
      <OrderPointsNote status="CANCELLED" pointsEarned={34} hasAccount />,
    );
    expect(container.innerHTML).toBe("");
  });
});
