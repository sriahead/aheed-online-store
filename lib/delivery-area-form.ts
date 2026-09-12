import type { ParseResult } from "@/lib/catalogue-form";

/**
 * Delivery-area field rules (P9.2, #612) — pure, DB-free, unit-tested.
 *
 * Same posture as `lib/catalogue-form.ts` and `lib/shopping-list.ts`: every decision about what a
 * submitted field MEANS lives where a test can reach it without a database, a session or a request.
 * The server actions in `features/admin/delivery-areas.ts` do the FormData reading and the
 * repository calls; nothing here knows either exists.
 *
 * ## Why this validation is load-bearing rather than cosmetic
 *
 * `lib/delivery.ts` builds its matcher by interpolating the STORED prefix straight into a regular
 * expression:
 *
 *     new RegExp(`^${p}[0-9]`).test(normalized)
 *
 * That is safe only while the sole writer is `prisma/seed.ts`, a hand-authored file holding two
 * known-good values. `#612` makes prefixes admin-writable, and from that moment a stored value
 * containing a regex metacharacter — `[`, `(`, `\` and the rest — throws a `SyntaxError` ON THE
 * CHECKOUT PATH, for every shopper of that vendor. A settings screen would be able to break
 * checkout for everyone.
 *
 * So the accepted shape is deliberately an allow-list, not a metacharacter deny-list: a UK postcode
 * AREA is one or two letters, and `^[A-Z]{1,2}$` admits exactly that and nothing else. An allow-list
 * cannot be outflanked by a metacharacter nobody thought to enumerate, which a deny-list can.
 *
 * Errors are RETURNED, never thrown — a mistyped postcode area is an ordinary thing for a human to
 * type, and the form has to re-render with the field named.
 */

/** Matches the form control's `name`, so the UI can point at the right input. */
const PREFIX_FIELD = "prefix";

/**
 * A UK postcode area or district: one or two letters optionally followed by one or two digits/letters.
 * Anchored at both ends, so nothing trailing survives.
 */
const POSTCODE_AREA = /^[A-Z]{1,2}([0-9][A-Z0-9]?)?$/;

/** The `useActionState` shape for both delivery-area forms. */
export interface DeliveryAreaFormState {
  error: string | null;
  field: string | null;
  saved: boolean;
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
};

/**
 * Normalise and validate a submitted postcode area.
 *
 * Accepts any case and surrounding whitespace, returning the trimmed upper-case form — `"mk"`,
 * `" Mk "` and `"MK"` all yield `"MK"`. Everything else is a field error.
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
