/**
 * #1135 — the two rules behind a shopper's note on a basket line. Import-free, so the cart, the
 * product page, the server actions and `placeOrder` all reach the same implementation and cannot
 * disagree about whether a note is taken or what it says.
 */

/** The longest note kept, in characters, after normalisation. Mirrored as the inputs' `maxlength`. */
export const CUSTOM_NOTE_MAX_LENGTH = 200;

/** The shape `productAcceptsNote` reads — a product with its category and that category's parent. */
export interface NoteAcceptanceInput {
  allowsCustomNote: boolean;
  category: {
    allowsCustomNote: boolean;
    parent: { allowsCustomNote: boolean } | null;
  } | null;
}

/** Prisma `select` fragment that loads exactly what `productAcceptsNote` needs. */
export const NOTE_ACCEPTANCE_SELECT = {
  allowsCustomNote: true,
  category: {
    select: {
      allowsCustomNote: true,
      parent: { select: { allowsCustomNote: true } },
    },
  },
} as const;

/**
 * A product takes a note when it, its category, or that category's parent is ticked. The tree is
 * structurally two levels deep (lib/repositories/categories.ts), so the parent is the whole walk.
 * There is no per-product opt-out inside a ticked category — an owner ruling at Propose.
 */
export function productAcceptsNote(product: NoteAcceptanceInput): boolean {
  return (
    product.allowsCustomNote ||
    product.category?.allowsCustomNote === true ||
    product.category?.parent?.allowsCustomNote === true
  );
}

/**
 * Trim, fold every run of whitespace (newlines included) into one space, drop control characters,
 * and cap at `CUSTOM_NOTE_MAX_LENGTH`. An empty result means "no note" and returns `null`.
 */
export function normaliseCustomNote(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const folded = input
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .trim();
  if (folded === "") return null;
  // Array.from counts code points, so the cap never splits a surrogate pair.
  const capped = Array.from(folded).slice(0, CUSTOM_NOTE_MAX_LENGTH).join("").trim();
  return capped === "" ? null : capped;
}
