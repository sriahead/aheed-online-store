/**
 * #1309 - money for the pricing registries. Pure.
 *
 * Integer minor units (pence, cents) with an explicit currency, as CLAUDE.md requires. Competitors
 * quote in their own currency and nothing here converts between them: the one exchange rate lives in
 * `lib/pricing/assumptions.ts` with its source and date, and only the analysis applies it.
 */

export type Currency = "GBP" | "USD";

export interface Money {
  minor: number;
  currency: Currency;
}

const SYMBOL: Record<Currency, string> = { GBP: "£", USD: "$" };

/** Round half up on a non-negative value, the one rounding rule the analysis uses. */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

/** `{ minor: 123456, currency: "GBP" }` -> `£1,234.56`. */
export function formatMoney(money: Money): string {
  const sign = money.minor < 0 ? "-" : "";
  const abs = Math.abs(money.minor);
  const whole = Math.floor(abs / 100).toLocaleString("en-GB");
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${SYMBOL[money.currency]}${whole}.${fraction}`;
}

export function gbp(minor: number): Money {
  return { minor, currency: "GBP" };
}

export function usd(minor: number): Money {
  return { minor, currency: "USD" };
}

/**
 * #1313 - `money` in pence. GBP passes through; USD converts at the dated rate (US cents per £1) and
 * rounds half up. `null` when a USD amount has no usable rate, so a missing rate is never read as 0.
 */
export function toPence(money: Money, usdCentsPerGbp: number | null): number | null {
  if (money.currency === "GBP") return money.minor;
  if (usdCentsPerGbp === null || usdCentsPerGbp <= 0) return null;
  return roundHalfUp((money.minor * 100) / usdCentsPerGbp);
}

/** Basis points as a percentage string: 150 -> `1.5%`, 3000 -> `30%`. */
export function formatBps(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}
