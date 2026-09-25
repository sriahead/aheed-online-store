import type { ParseResult } from "@/lib/catalogue-form";
import { parseOptionalPoundsToPence } from "@/lib/delivery-rules-form";

/**
 * Delivery-area field rules (P9.2 #612; lists, ranges and charges #613/#890) — pure, DB-free,
 * unit-tested.
 *
 * Same posture as `lib/catalogue-form.ts` and `lib/shopping-list.ts`: every decision about what a
 * submitted field MEANS lives where a test can reach it without a database, a session or a request.
 * The server actions in `features/admin/delivery-areas.ts` do the FormData reading and the
 * repository calls; nothing here knows either exists.
 *
 * ## What a stored prefix means
 *
 * A `VendorDeliveryArea.prefix` is a postcode AREA or a DISTRICT, and `lib/delivery.ts` matches it
 * by plain string comparison against the shopper's outward code:
 *
 * - an area (`MK`, one or two letters) covers every district in it — `MK9 2EA`, `MK17 8NL`;
 * - a district (`MK9`, `EC1A`) covers exactly that outward code — never `MK91` or `MK17`.
 *
 * ## Why this validation is still load-bearing
 *
 * These rows gate checkout: a shopper whose postcode no row covers cannot place a delivery order.
 * The accepted shape is an allow-list — `^[A-Z]{1,2}([0-9][A-Z0-9]?)?$` — so nothing but a
 * well-formed area or district is ever stored, and an admin's typo is a field error on the form
 * rather than a row that silently matches nobody.
 *
 * Errors are RETURNED, never thrown — a mistyped postcode area is an ordinary thing for a human to
 * type, and the form has to re-render with the field named.
 */

/** Matches the form control's `name`, so the UI can point at the right input. */
const PREFIX_FIELD = "prefix";

/** Money fields shared by the add form and each row's edit form (#890). */
export const AREA_FEE_FIELD = "deliveryFeePence";
export const AREA_MINIMUM_FIELD = "minimumOrderPence";
export const AREA_THRESHOLD_FIELD = "freeDeliveryThresholdPence";

/**
 * A UK postcode area or district: one or two letters optionally followed by one or two digits/letters.
 * Anchored at both ends, so nothing trailing survives.
 */
const POSTCODE_AREA = /^[A-Z]{1,2}([0-9][A-Z0-9]?)?$/;

/**
 * A range entry: `MK1-MK10`, hyphen or en dash, optional spaces. Both ends are captured loosely so
 * the parser can explain WHICH rule a malformed range broke rather than calling it merely invalid.
 */
const RANGE = /^(\S+?)\s*[-–]\s*(\S+)$/;
const RANGE_END = /^([A-Z]{1,2})([0-9]{1,2})$/;

/** The widest possible single range (`X0`–`X99`), so no legitimate range is refused. */
export const MAX_AREAS_PER_SUBMISSION = 100;

/** The `useActionState` shape for every delivery-area form. */
export interface DeliveryAreaFormState {
  error: string | null;
  field: string | null;
  saved: boolean;
  /** A bulk add's outcome (#613 R11). `null` for every other state. */
  message: string | null;
}

/**
 * Seed value for `useActionState`.
 *
 * Lives here, not in `features/admin/delivery-areas.ts`, because that file is `"use server"` — such
 * a module may export ONLY async functions, and a single value export makes every action in it 500
 * at runtime while `next build`, `tsc --noEmit` and the whole test suite stay green (#159).
 */
export const initialDeliveryAreaState: DeliveryAreaFormState = {
  error: null,
  field: null,
  saved: false,
  message: null,
};

/**
 * Normalise and validate ONE submitted postcode area or district.
 *
 * Accepts any case and surrounding whitespace, returning the trimmed upper-case form — `"mk"`,
 * `" Mk "` and `"MK"` all yield `"MK"`. Everything else is a field error. This is the per-entry rule
 * `parsePrefixListInput` applies to every non-range entry.
 */
export function parsePrefixInput(raw: string): ParseResult<string> {
  const normalised = raw.trim().toUpperCase();

  if (normalised === "") {
    return {
      ok: false,
      error: { field: PREFIX_FIELD, message: "Enter a postcode area." },
    };
  }

  if (!POSTCODE_AREA.test(normalised)) {
    return {
      ok: false,
      error: {
        field: PREFIX_FIELD,
        message:
          "A postcode area is 1-2 letters, optionally followed by numbers (e.g. MK or MK9) — no spaces or symbols.",
      },
    };
  }

  return { ok: true, value: normalised };
}

function entryError(message: string): ParseResult<string[]> {
  return { ok: false, error: { field: PREFIX_FIELD, message } };
}

/** Expand `MK1-MK10` into `MK1`…`MK10`, or explain which range rule the entry broke. */
function expandRange(entry: string, start: string, end: string): ParseResult<string[]> {
  const from = RANGE_END.exec(start);
  const to = RANGE_END.exec(end);
  if (!from || !to) {
    return entryError(
      `"${entry}" is not a range we can expand. Write both ends in full with 1-2 digit districts, like MK1-MK10.`,
    );
  }
  if (from[1] !== to[1]) {
    return entryError(
      `"${entry}" spans two postcode areas. Both ends need the same letters, like MK1-MK10.`,
    );
  }
  const first = Number(from[2]);
  const last = Number(to[2]);
  if (first > last) {
    return entryError(`"${entry}" runs backwards. Put the lower district first, like MK1-MK10.`);
  }
  const districts: string[] = [];
  for (let n = first; n <= last; n += 1) districts.push(`${from[1]}${n}`);
  return { ok: true, value: districts };
}

/**
 * Parse the add form's text into the list of areas/districts to store (#613).
 *
 * Comma-separated entries; each is either a single area/district (validated by `parsePrefixInput`)
 * or a range (`MK1-MK10`) expanded into its districts. Empty entries are ignored. The result is
 * de-duplicated in first-seen order. One bad entry fails the whole submission, naming that entry —
 * a partially applied list would leave the admin guessing which half landed.
 */
export function parsePrefixListInput(raw: string): ParseResult<string[]> {
  const entries = raw
    .toUpperCase()
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");

  if (entries.length === 0) return entryError("Enter a postcode area.");

  const seen = new Set<string>();
  const values: string[] = [];
  const add = (value: string) => {
    if (!seen.has(value)) {
      seen.add(value);
      values.push(value);
    }
  };

  for (const entry of entries) {
    const range = RANGE.exec(entry);
    if (range) {
      const expanded = expandRange(entry, range[1], range[2]);
      if (!expanded.ok) return expanded;
      expanded.value.forEach(add);
      continue;
    }

    const single = parsePrefixInput(entry);
    if (!single.ok) {
      return entryError(
        `"${entry}" is not a postcode area or district. Use 1-2 letters, optionally followed by numbers (e.g. MK or MK9), or a range like MK1-MK10.`,
      );
    }
    add(single.value);
  }

  if (values.length > MAX_AREAS_PER_SUBMISSION) {
    return entryError(
      `That adds ${values.length} delivery areas. Add at most ${MAX_AREAS_PER_SUBMISSION} at a time.`,
    );
  }

  return { ok: true, value: values };
}

/** Per-area money overrides (#890). `null` = use the store default. */
export interface AreaChargesInput {
  deliveryFeePence: number | null;
  minimumOrderPence: number | null;
  freeDeliveryThresholdPence: number | null;
}

/**
 * Parse the three optional money fields. Blank means "use the store default"; `0` keeps its
 * `VendorConfig` meaning (free delivery / no minimum / free delivery not offered here). The first
 * invalid field is returned, and nothing is written.
 */
export function parseAreaChargesInput(raw: {
  deliveryFee: string;
  minimumOrder: string;
  freeDeliveryThreshold: string;
}): ParseResult<AreaChargesInput> {
  const fee = parseOptionalPoundsToPence(raw.deliveryFee, AREA_FEE_FIELD, "Delivery charge");
  if (!fee.ok) return fee;
  const minimum = parseOptionalPoundsToPence(raw.minimumOrder, AREA_MINIMUM_FIELD, "Minimum order");
  if (!minimum.ok) return minimum;
  const threshold = parseOptionalPoundsToPence(
    raw.freeDeliveryThreshold,
    AREA_THRESHOLD_FIELD,
    "Free delivery threshold",
  );
  if (!threshold.ok) return threshold;

  return {
    ok: true,
    value: {
      deliveryFeePence: fee.value,
      minimumOrderPence: minimum.value,
      freeDeliveryThresholdPence: threshold.value,
    },
  };
}

/** The bulk add's success text (#613 R11). A bulk add always carries at least two values. */
export function bulkAddMessage(added: number, alreadyListed: number): string {
  if (added === 0) return `All ${alreadyListed} already listed — nothing changed.`;
  const noun = added === 1 ? "delivery area" : "delivery areas";
  if (alreadyListed === 0) return `Added ${added} ${noun}.`;
  return `Added ${added} ${noun}; ${alreadyListed} already listed (their charges were not changed).`;
}
