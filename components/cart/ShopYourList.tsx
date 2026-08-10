"use client";

import { useActionState, useState } from "react";
import { CircleAlert, CircleHelp, ListChecks, PackageX } from "lucide-react";
import { formatPrice } from "@/components/product/format-price";
import { addListToCart } from "@/features/cart/add-list-to-cart";
import { matchList } from "@/features/cart/match-list";
import { EMPTY_MATCH_STATE, MAX_LIST_LINES, type ResolvedLine } from "@/lib/shopping-list";

/**
 * "Shop your list" (P3d, #114). Two sibling forms, not one: the first matches
 * the pasted list, the second adds the reviewed lines. Both are server actions,
 * so both still submit without client JS.
 *
 * The only client state is which product an ambiguous line resolved to — needed
 * to keep the "Add N items" count honest as the shopper chooses. Matching
 * itself writes nothing, so leaving this page mid-review leaves no cart.
 */

const PLACEHOLDER = `2x chicken breast
5kg basmati rice
milk
apples x 3`;

function lineIsAddable(line: ResolvedLine): boolean {
  return line.resolution.kind === "matched" && line.resolution.product.stock > 0;
}

export function ShopYourList() {
  const [state, formAction, pending] = useActionState(matchList, EMPTY_MATCH_STATE);
  const [choices, setChoices] = useState<Record<number, string>>({});

  const lines = state.lines;
  const readyCount = lines
    ? lines.filter((line, index) => lineIsAddable(line) || (choices[index] ?? "") !== "").length
    : 0;

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-3">
        <label htmlFor="list" className="block text-sm font-semibold text-primary">
          One item per line
        </label>
        <textarea
          id="list"
          name="list"
          rows={8}
          placeholder={PLACEHOLDER}
          className="w-full rounded-2xl border border-black/10 bg-white p-3 text-sm text-primary placeholder:text-primary/30 focus:border-primary focus:outline-none"
        />
        <p className="text-xs text-primary/60">
          Quantities are understood — <span className="font-semibold">2x apples</span>,{" "}
          <span className="font-semibold">3 apples</span> or{" "}
          <span className="font-semibold">apples x3</span>. Up to {MAX_LIST_LINES} lines.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {pending ? "Matching…" : "Match my list"}
        </button>
        {state.error && <p className="text-xs font-semibold text-danger">{state.error}</p>}
      </form>

      {lines && (
        <form action={addListToCart} className="space-y-3">
          <div className="flex items-center gap-2 border-t border-black/10 pt-5">
            <ListChecks className="h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-sm font-bold text-primary">
              Check your matches before adding anything
            </h2>
          </div>

          <ul className="space-y-2">
            {lines.map((line, index) => (
              <li
                key={`${index}-${line.original}`}
                className="rounded-2xl border border-black/10 bg-white p-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-xs font-semibold text-primary/70">
                    {line.original}
                  </span>
                  <span className="shrink-0 text-[11px] font-bold text-primary">
                    ×{line.quantity}
                  </span>
                </div>

                {line.resolution.kind === "matched" && (
                  <div className="mt-1.5">
                    {line.resolution.product.stock > 0 ? (
                      <>
                        <p className="text-sm font-bold text-primary">
                          {line.resolution.product.name}
                        </p>
                        <p className="text-[11px] text-primary/60">
                          {formatPrice(line.resolution.product.basePrice)} ·{" "}
                          {line.resolution.product.unitLabel}
                        </p>
                        <input type="hidden" name="productId" value={line.resolution.product.id} />
                        <input type="hidden" name="quantity" value={line.quantity} />
                      </>
                    ) : (
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-danger">
                        <PackageX className="h-4 w-4" aria-hidden />
                        {line.resolution.product.name} — unavailable, not added
                      </p>
                    )}
                  </div>
                )}

                {line.resolution.kind === "ambiguous" && (
                  <div className="mt-1.5">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-accent">
                      <CircleHelp className="h-4 w-4" aria-hidden />
                      Which one did you mean?
                    </p>
                    <select
                      name="productId"
                      aria-label={`Choose a product for "${line.original}"`}
                      value={choices[index] ?? ""}
                      onChange={(event) =>
                        setChoices((prev) => ({ ...prev, [index]: event.target.value }))
                      }
                      className="w-full rounded-xl border border-black/10 bg-surface-muted p-2 text-xs font-semibold text-primary"
                    >
                      <option value="">Skip this line</option>
                      {line.resolution.candidates.map((candidate) => (
                        <option
                          key={candidate.id}
                          value={candidate.stock > 0 ? candidate.id : ""}
                          disabled={candidate.stock === 0}
                        >
                          {candidate.name} · {formatPrice(candidate.basePrice)}
                          {candidate.stock === 0 ? " (out of stock)" : ""}
                        </option>
                      ))}
                    </select>
                    <input type="hidden" name="quantity" value={line.quantity} />
                  </div>
                )}

                {line.resolution.kind === "unmatched" && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-primary/50">
                    <CircleAlert className="h-4 w-4" aria-hidden />
                    No match in this shop — check the spelling or search for it
                  </p>
                )}
              </li>
            ))}
          </ul>

          <button
            type="submit"
            disabled={readyCount === 0}
            className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            {readyCount === 0
              ? "Nothing to add yet"
              : `Add ${readyCount} item${readyCount === 1 ? "" : "s"} to cart`}
          </button>
        </form>
      )}
    </div>
  );
}
