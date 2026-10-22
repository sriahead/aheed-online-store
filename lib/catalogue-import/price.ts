/**
 * #1216 R11 — a source price cell to integer pence. No floating point anywhere: the whole part and
 * the (at most two) fractional digits are read as integers, so `£4.10` is 410 and can never be
 * 409.99999. Money is integer pence everywhere in this codebase (CLAUDE.md, Schema rules).
 */

export type PriceResult =
  { ok: true; pence: number } | { ok: false; code: "BAD_PRICE" | "NEGATIVE_PRICE"; reason: string };

/** Longest whole-pounds part accepted — keeps `pence` far below Number.MAX_SAFE_INTEGER. */
const MAX_WHOLE_DIGITS = 9;

const PLAIN = /^(\d+)(?:\.(\d{1,2}))?$/;
const THOUSANDS = /^(\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/;

export function parsePricePence(raw: string): PriceResult {
  let text = raw.trim();
  let negative = false;
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1).trim();
  }
  if (text.startsWith("£")) text = text.slice(1).trim();
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1).trim();
  }

  const match = PLAIN.exec(text) ?? THOUSANDS.exec(text);
  if (!match) return { ok: false, code: "BAD_PRICE", reason: `"${raw.trim()}" is not a price` };

  const whole = match[1].replace(/,/g, "");
  if (whole.length > MAX_WHOLE_DIGITS) {
    return { ok: false, code: "BAD_PRICE", reason: `"${raw.trim()}" is too large to be a price` };
  }
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const pence = parseInt(whole, 10) * 100 + parseInt(fraction, 10);

  if (negative && pence !== 0) {
    return { ok: false, code: "NEGATIVE_PRICE", reason: `"${raw.trim()}" is negative` };
  }
  return { ok: true, pence };
}
