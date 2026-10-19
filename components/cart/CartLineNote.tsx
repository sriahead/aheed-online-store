import { useId } from "react";
import { CUSTOM_NOTE_MAX_LENGTH } from "@/lib/custom-note";
import type { CartLine } from "@/lib/repositories/cart";
import { setCartItemNote } from "@/features/cart/set-note";

/**
 * #1135 — a basket line's shopper note, rendered by `CartContents` in both the drawer and /cart.
 *
 * Plain `<form>` posts to a server action, like the line's quantity and remove controls, so it
 * works without client JS. Three states:
 *
 * - the product takes notes: an input holding the current note, with Save (and Clear when a note
 *   exists);
 * - the product no longer takes notes but the line still carries one (the owner unticked its
 *   category): the note, a sentence saying it will not be sent with the order — checkout drops it
 *   (`placeOrder`) — and Clear;
 * - neither: nothing at all.
 *
 * Copy is neutral (CLAUDE.md): no vendor name, no product example.
 */
export function CartLineNote({ line }: { line: CartLine }) {
  // #1162 — unique per rendered instance, not per product: `CartContents` mounts in both /cart and
  // the header drawer, so opening the drawer on /cart renders this line twice, and a product-derived
  // id would point the second label at the first input. Called before the early return (hook rule).
  const inputId = `cart-note-${useId()}`;
  if (!line.acceptsNote && !line.customNote) return null;
  const clear = async () => {
    "use server";
    await setCartItemNote(line.productId, "");
  };

  if (!line.acceptsNote) {
    return (
      <div data-cart-note="dropped" className="mt-2 space-y-1">
        <p className="break-words text-[11px] text-primary-muted">Note: {line.customNote}</p>
        <p className="text-[11px] font-semibold text-danger">
          This item no longer takes notes, so your note will not be sent with the order.
        </p>
        <form action={clear}>
          <button
            type="submit"
            className="min-h-tap text-[11px] font-semibold text-action underline lg:min-h-0"
          >
            Remove note
          </button>
        </form>
      </div>
    );
  }

  return (
    <form
      data-cart-note="editable"
      className="mt-2 space-y-1"
      action={async (formData: FormData) => {
        "use server";
        await setCartItemNote(line.productId, String(formData.get("note") ?? ""));
      }}
    >
      <label htmlFor={inputId} className="block text-[11px] font-semibold text-primary">
        Note for this item <span className="font-normal text-primary-muted">(optional)</span>
      </label>
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          type="text"
          name="note"
          defaultValue={line.customNote ?? ""}
          maxLength={CUSTOM_NOTE_MAX_LENGTH}
          className="min-h-tap min-w-0 flex-1 rounded-lg border border-black/15 bg-white px-2 text-xs text-primary focus:border-action focus:outline-none lg:min-h-0 lg:py-1.5"
        />
        <button
          type="submit"
          className="min-h-tap shrink-0 rounded-lg bg-primary px-3 text-[11px] font-bold text-white lg:min-h-0 lg:py-1.5"
        >
          Save note
        </button>
        {line.customNote && (
          <button
            type="submit"
            formAction={clear}
            className="min-h-tap shrink-0 text-[11px] font-semibold text-action underline lg:min-h-0"
          >
            Clear
          </button>
        )}
      </div>
    </form>
  );
}
