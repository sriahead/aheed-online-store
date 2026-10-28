import type { ConnectOption } from "@/lib/pricing/connect";
import type { CostDriver, UsagePart } from "@/lib/pricing/cost-drivers";
import { roundHalfUp, toPence, type Money } from "@/lib/pricing/money";

/**
 * #1313 - the volume model: what a shop pays and what we earn and spend, at a given number of shops,
 * orders per shop and basket. Pure, and small enough to run in the browser for the What if panel.
 *
 * ASSUMPTIONS IT MAKES, all stated on the page:
 *  - Stripe Connect: the shop is the seller and pays its own card fees and disputes (a planning
 *    assumption; ADR-005 and #1310 hold the real decision).
 *  - UK card rate for every order. The EEA rate is recorded but not in the totals.
 *  - Our own prices are never a percentage of sales: only pence per month or per order.
 *
 * ROUNDING. Each money figure rounds half up to whole pence (a negative figure is negated, rounded and
 * negated back). Every shop count is a whole number found by searching upward, so it rounds UP.
 * A USD figure with no exchange rate is `null`, and so is every sum containing it.
 */

export type PricingModelParams =
  | {
      kind: "order-bands";
      bands: { upToOrders: number; monthlyFeePence: number; label: string }[];
      abovePerOrderPence: number;
    }
  | {
      kind: "allowance-per-order";
      monthlyFeePence: number;
      includedOrders: number;
      perOrderPence: number;
    }
  | { kind: "capped-per-order"; monthlyFeePence: number; perOrderPence: number; capPence: number }
  | { kind: "customer-fee"; monthlyFeePence: number; customerFeePerOrderPence: number };

export interface Scenario {
  shops: number;
  ordersPerShop: number;
  basketPence: number;
}

export interface ModelInputs {
  usdCentsPerGbp: number | null;
  cardFeeBps: number;
  cardFeeFixedPence: number;
  disputeRateBps: number;
  disputeFeePence: number;
  /** `null` when unknown: partner time, and every total containing it, is then `null`. */
  partnerHourlyRatePence: number | null;
  partnerMinutesPerShopMonth: number;
  onboardingMinutesPerShop: number;
  onboardingAmortisationMonths: number;
  payoutsPerShopMonth: number;
  /** The costs registry's `withPlanned` monthly total (what we pay now). */
  currentFixed: Money;
  drivers: readonly CostDriver[];
  /** The modelled Connect option's platform fee, or `null` for none. */
  connectFee: ConnectOption["platformFee"];
}

export interface Evaluation {
  shopPays: {
    platformFeePence: number;
    cardFeesPence: number;
    disputeFeesPence: number;
    totalPence: number;
    customerPaysPerOrderPence: number;
  };
  revenuePence: number;
  cost: {
    currentFixedPence: number | null;
    driversPence: number | null;
    connectPence: number;
    partnerTimePence: number | null;
    totalPence: number | null;
  };
  marginPence: number | null;
  marginPerShopPence: number | null;
  marginBps: number | null;
}

/** Round half up, symmetric for negatives. */
export function roundSigned(x: number): number {
  return x >= 0 ? roundHalfUp(x) : -roundHalfUp(-x);
}

function sumOrNull(values: readonly (number | null)[]): number | null {
  let total = 0;
  for (const v of values) {
    if (v === null) return null;
    total += v;
  }
  return total;
}

/** The shop's monthly platform fee under `model` at `orders` orders. */
export function platformFee(model: PricingModelParams, orders: number): number {
  switch (model.kind) {
    case "order-bands": {
      const band = model.bands.find((b) => b.upToOrders >= orders);
      if (band) return band.monthlyFeePence;
      const last = model.bands[model.bands.length - 1];
      return last.monthlyFeePence + (orders - last.upToOrders) * model.abovePerOrderPence;
    }
    case "allowance-per-order":
      return (
        model.monthlyFeePence + Math.max(0, orders - model.includedOrders) * model.perOrderPence
      );
    case "capped-per-order":
      return model.monthlyFeePence + Math.min(orders * model.perOrderPence, model.capPence);
    case "customer-fee":
      return model.monthlyFeePence;
  }
}

function customerFee(model: PricingModelParams): number {
  return model.kind === "customer-fee" ? model.customerFeePerOrderPence : 0;
}

/** Card fees on `orders` payments of `chargePence`: 20p each plus the percentage. */
export function cardFees(
  orders: number,
  chargePence: number,
  cardFeeBps: number,
  cardFeeFixedPence: number,
): number {
  return orders * cardFeeFixedPence + roundHalfUp((orders * chargePence * cardFeeBps) / 10000);
}

export function partUnits(part: UsagePart, shops: number, ordersPerShop: number): number {
  return part.baseUnits + shops * part.perShopUnits + shops * ordersPerShop * part.perOrderUnits;
}

/** One driver's monthly cost in pence, or `null` for a USD driver with no exchange rate. */
export function driverMonthlyPence(
  driver: CostDriver,
  shops: number,
  ordersPerShop: number,
  usdCentsPerGbp: number | null,
): number | null {
  let minor = 0;
  if (driver.fixed) {
    minor +=
      driver.fixed.period === "month"
        ? driver.fixed.amount.minor
        : roundHalfUp(driver.fixed.amount.minor / 12);
  }
  for (const part of driver.usage ?? []) {
    const billable = Math.max(0, partUnits(part, shops, ordersPerShop) - part.freeUnits);
    minor += roundHalfUp((billable * part.price.minor) / part.price.perUnits);
  }
  return toPence({ minor, currency: driverCurrency(driver) }, usdCentsPerGbp);
}

function driverCurrency(driver: CostDriver): Money["currency"] {
  return driver.fixed?.amount.currency ?? driver.usage?.[0]?.price.currency ?? "GBP";
}

/** Sum of every one-off cost, in pence. */
export function startupCosts(
  drivers: readonly CostDriver[],
  usdCentsPerGbp: number | null,
): number | null {
  return sumOrNull(drivers.flatMap((d) => (d.oneOff ? [toPence(d.oneOff, usdCentsPerGbp)] : [])));
}

export function connectPence(scenario: Scenario, inputs: ModelInputs): number {
  const fee = inputs.connectFee;
  if (fee === null) return 0;
  const perShop =
    fee.activeAccountPence +
    inputs.payoutsPerShopMonth * fee.payoutFixedPence +
    roundHalfUp((scenario.ordersPerShop * scenario.basketPence * fee.payoutBps) / 10000);
  return scenario.shops * perShop;
}

export function partnerTimePence(shops: number, inputs: ModelInputs): number | null {
  if (inputs.partnerHourlyRatePence === null) return null;
  const minutesPerShop =
    inputs.partnerMinutesPerShopMonth +
    inputs.onboardingMinutesPerShop / inputs.onboardingAmortisationMonths;
  return roundHalfUp((shops * minutesPerShop * inputs.partnerHourlyRatePence) / 60);
}

/** Non-people costs: current fixed + production drivers + Connect. */
function nonPeopleCost(scenario: Scenario, inputs: ModelInputs): number | null {
  const currentFixedPence = toPence(inputs.currentFixed, inputs.usdCentsPerGbp);
  const driversPence = sumOrNull(
    inputs.drivers.map((d) =>
      driverMonthlyPence(d, scenario.shops, scenario.ordersPerShop, inputs.usdCentsPerGbp),
    ),
  );
  return sumOrNull([currentFixedPence, driversPence, connectPence(scenario, inputs)]);
}

export function evaluate(
  scenario: Scenario,
  model: PricingModelParams,
  inputs: ModelInputs,
): Evaluation {
  const { shops, ordersPerShop, basketPence } = scenario;
  const fee = platformFee(model, ordersPerShop);
  const perOrderCustomerFee = customerFee(model);
  const card = cardFees(
    ordersPerShop,
    basketPence + perOrderCustomerFee,
    inputs.cardFeeBps,
    inputs.cardFeeFixedPence,
  );
  const disputes = roundHalfUp(
    (ordersPerShop * inputs.disputeRateBps * inputs.disputeFeePence) / 10000,
  );

  const revenuePence = shops * fee + shops * ordersPerShop * perOrderCustomerFee;

  const currentFixedPence = toPence(inputs.currentFixed, inputs.usdCentsPerGbp);
  const driversPence = sumOrNull(
    inputs.drivers.map((d) => driverMonthlyPence(d, shops, ordersPerShop, inputs.usdCentsPerGbp)),
  );
  const connect = connectPence(scenario, inputs);
  const partner = partnerTimePence(shops, inputs);
  const totalPence = sumOrNull([currentFixedPence, driversPence, connect, partner]);

  const marginPence = totalPence === null ? null : revenuePence - totalPence;
  return {
    shopPays: {
      platformFeePence: fee,
      cardFeesPence: card,
      disputeFeesPence: disputes,
      totalPence: fee + card + disputes,
      customerPaysPerOrderPence: perOrderCustomerFee,
    },
    revenuePence,
    cost: {
      currentFixedPence,
      driversPence,
      connectPence: connect,
      partnerTimePence: partner,
      totalPence,
    },
    marginPence,
    marginPerShopPence: marginPence === null ? null : roundSigned(marginPence / shops),
    marginBps:
      marginPence === null || revenuePence <= 0
        ? null
        : roundSigned((marginPence * 10000) / revenuePence),
  };
}

/** Years 1-3 of the partner rate. Years 2-3 are `null` while the increase is unknown. */
export function partnerRateByYear(
  ratePence: number | null,
  increaseBps: number | null,
): (number | null)[] {
  return [1, 2, 3].map((year) => {
    if (ratePence === null) return null;
    if (year === 1) return ratePence;
    if (increaseBps === null) return null;
    return roundHalfUp(ratePence * Math.pow(1 + increaseBps / 10000, year - 1));
  });
}

export const MAX_SEARCH_SHOPS = 1000;

function searchShops(qualifies: (shops: number) => boolean): number | null {
  for (let shops = 1; shops <= MAX_SEARCH_SHOPS; shops++) {
    if (qualifies(shops)) return shops;
  }
  return null;
}

/**
 * For one order volume: the driver whose free allowance runs out first, and at how many shops.
 * Only drivers with a usage part that has a free allowance count. Ties go to the lower driver id.
 */
export function firstFreeTierLimit(
  drivers: readonly CostDriver[],
  ordersPerShop: number,
): { driverId: string; unit: string; shops: number } | null {
  let best: { driverId: string; unit: string; shops: number } | null = null;
  for (const driver of drivers) {
    for (const part of driver.usage ?? []) {
      if (part.freeUnits <= 0) continue;
      const shops = searchShops((s) => partUnits(part, s, ordersPerShop) > part.freeUnits);
      if (shops === null) continue;
      if (
        best === null ||
        shops < best.shops ||
        (shops === best.shops && driver.id < best.driverId)
      ) {
        best = { driverId: driver.id, unit: part.unit, shops };
      }
    }
  }
  return best;
}

type Volume = Omit<Scenario, "shops">;

/** Fewest shops whose revenue minus non-people costs covers the partners' monthly pay target. */
export function breakEvenShopsForPayTarget(
  model: PricingModelParams,
  volume: Volume,
  inputs: ModelInputs,
  payTargetPence: number | null,
): number | null {
  if (payTargetPence === null) return null;
  return searchShops((shops) => {
    const scenario = { ...volume, shops };
    const cost = nonPeopleCost(scenario, inputs);
    if (cost === null) return false;
    return evaluate(scenario, model, inputs).revenuePence - cost >= payTargetPence;
  });
}

/** Fewest shops at which the margin, partner time included, is 0 or more. */
export function breakEvenShopsIncludingTime(
  model: PricingModelParams,
  volume: Volume,
  inputs: ModelInputs,
): number | null {
  return searchShops((shops) => {
    const margin = evaluate({ ...volume, shops }, model, inputs).marginPence;
    return margin !== null && margin >= 0;
  });
}

/** £90,000: the VAT registration threshold (gov.uk), in pence. */
export const VAT_THRESHOLD_PENCE = 9_000_000;

/** Fewest shops at which our annual fee revenue goes over the VAT registration threshold. */
export function vatThresholdShops(
  model: PricingModelParams,
  volume: Volume,
  inputs: ModelInputs,
): number | null {
  return searchShops(
    (shops) =>
      12 * evaluate({ ...volume, shops }, model, inputs).revenuePence > VAT_THRESHOLD_PENCE,
  );
}
