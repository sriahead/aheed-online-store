// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { PricingWhatIf, type WhatIfDefaults } from "@/components/staff/PricingWhatIf";
import { analyseV2, COMMITTED } from "@/lib/pricing/committed";
import { formatMoney, gbp } from "@/lib/pricing/money";
import { breakEvenShopsForPayTarget, evaluate } from "@/lib/pricing/volume-model";

/** #1313 R30: the What if panel recalculates in the browser with the same functions, and saves nothing. */

const analysis = analyseV2(COMMITTED, new Date("2026-10-28T12:00:00Z"));
const models = COMMITTED.models.map((m) => ({ id: m.id, name: m.name, pricing: m.pricing }));
const defaults: WhatIfDefaults = {
  ratePence: 2500,
  increaseBps: null,
  minutesPerShop: 120,
  onboardingMinutes: 900,
  payTargetPence: null,
  basketPence: 2500,
  ordersPerShop: 500,
  shops: 10,
};

function renderPanel() {
  return render(<PricingWhatIf inputs={analysis.inputs} models={models} defaults={defaults} />)
    .container;
}

function input(container: HTMLElement, id: string): HTMLInputElement {
  return container.querySelector(`[data-what-if-input="${id}"]`) as HTMLInputElement;
}

function cell(container: HTMLElement, model: string, which: string): string {
  return (
    container.querySelector(`[data-what-if-row="${model}"] [data-what-if-cell="${which}"]`)
      ?.textContent ?? ""
  );
}

afterEach(cleanup);

describe("PricingWhatIf", () => {
  it("starts from the committed defaults, with missing values empty", () => {
    const c = renderPanel();
    expect(input(c, "ratePence").value).toBe("25");
    expect(input(c, "basketPence").value).toBe("25");
    expect(input(c, "ordersPerShop").value).toBe("500");
    expect(input(c, "shops").value).toBe("10");
    expect(input(c, "increaseBps").value).toBe("");
    expect(input(c, "increaseBps").placeholder).toBe("Enter a value");
    expect(input(c, "payTargetPence").value).toBe("");
    expect(c.textContent).toContain("These figures are not saved");
    for (const label of [
      "Partner hourly rate (£)",
      "Yearly rate increase (%)",
      "Partner minutes per shop per month",
      "Onboarding minutes per new shop",
      "Partners' monthly pay target (£, both partners)",
      "Average basket (£)",
      "Orders per shop per month",
      "Number of shops",
    ]) {
      expect(c.textContent).toContain(label);
    }
  });

  it("shows outputs equal to evaluate, and asks for the missing values", () => {
    const c = renderPanel();
    for (const m of analysis.models) {
      expect(cell(c, m.modelId, "shop-pays")).toBe(
        formatMoney(gbp(m.reference.shopPays.totalPence)),
      );
      expect(cell(c, m.modelId, "margin")).toBe(formatMoney(gbp(m.reference.marginPence!)));
      expect(cell(c, m.modelId, "pay-target")).toBe("Enter a pay target");
    }
    const rates = c.querySelector("[data-what-if-rates]")!.textContent!;
    expect(rates).toContain("year 1: £25.00 an hour");
    expect(rates).toContain("year 2: Enter a yearly increase");
  });

  it("recalculates on change", () => {
    const c = renderPanel();
    fireEvent.change(input(c, "payTargetPence"), { target: { value: "1500" } });
    fireEvent.change(input(c, "increaseBps"), { target: { value: "10" } });
    fireEvent.change(input(c, "ordersPerShop"), { target: { value: "2000" } });
    const scenario = { shops: 10, ordersPerShop: 2000, basketPence: 2500 };
    for (const m of models) {
      const e = evaluate(scenario, m.pricing, analysis.inputs);
      expect(cell(c, m.id, "shop-pays")).toBe(formatMoney(gbp(e.shopPays.totalPence)));
      const shops = breakEvenShopsForPayTarget(
        m.pricing,
        { ordersPerShop: 2000, basketPence: 2500 },
        analysis.inputs,
        150000,
      );
      expect(cell(c, m.id, "pay-target")).toBe(
        shops === null ? "More than 1,000 shops" : String(shops),
      );
    }
    expect(c.querySelector("[data-what-if-rates]")!.textContent).toContain(
      "year 2: £27.50 an hour",
    );
  });

  it("flags an invalid entry and blanks the outputs until it is fixed", () => {
    const c = renderPanel();
    fireEvent.change(input(c, "basketPence"), { target: { value: "-3" } });
    expect(c.querySelector('[data-what-if-error="basketPence"]')?.textContent).toBe(
      "Enter a number of 0 or more",
    );
    expect(cell(c, "customer-fee", "shop-pays")).toBe("—");
    fireEvent.change(input(c, "basketPence"), { target: { value: "abc" } });
    expect(c.querySelector('[data-what-if-error="basketPence"]')).not.toBeNull();
    fireEvent.change(input(c, "basketPence"), { target: { value: "25" } });
    expect(c.querySelector('[data-what-if-error="basketPence"]')).toBeNull();
    expect(cell(c, "customer-fee", "shop-pays")).not.toBe("—");
  });

  it("makes no request and stores nothing", () => {
    const source = readFileSync("components/staff/PricingWhatIf.tsx", "utf8");
    expect(source).not.toMatch(
      /fetch\(|localStorage|sessionStorage|document\.cookie|useRouter|use server/,
    );
  });
});
