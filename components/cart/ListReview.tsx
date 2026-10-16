"use client";

import { useState } from "react";
import { CircleAlert, CircleHelp, ListChecks, PackageX } from "lucide-react";
import { formatPrice } from "@/components/product/format-price";
import { addListToCart } from "@/features/cart/add-list-to-cart";
import type { ResolvedLine } from "@/lib/shopping-list";

/**
 * The mandatory review step, shared by both surfaces that produce resolved lines (P3d #114, and
 * P10 #116's saved lists).
 *
 * Extracted from `ShopYourList.tsx` when saved lists arrived, rather than copied: the
 * ambiguous-line select, the out-of-stock rendering and the honest "Add N items" count are
 * exactly the logic that must not be allowed to drift between a pasted list and a saved one. The
 * form it renders submits the same positional `productId`/`quantity` fields
 * `features/cart/add-list-to-cart.ts` has always read, which is why that action is untouched by
 * this slice.
 *
 * #1090 — every line now emits all four positional fields (`productId`, `quantity`, `lineLabel`,
 * `lineStatus`), including the out-of-stock and unmatched rows that used to emit none. Those two
 * send an empty productId, so they can never be added; `lineStatus` tells the action which notice
 * wording fits. Keep the four inputs together in every branch below — a branch that drops one
 * misaligns every line after it.
 *
 * The only client state is which product an ambiguous line resolved to — needed to keep the count
 * honest as the shopper chooses. Matching itself writes nothing, so leaving mid-review leaves no
 * cart.
 */

function lineIsAddable(line: ResolvedLine): boolean {
  return line.resolution.kind === "matched" && line.resolution.product.stock > 0;
}

export function ListReview({ lines }: { lines: ResolvedLine[] }) {
  const [choices, setChoices] = useState<Record<number, string>>({});

  const readyCount = lines.filter(
    (line, index) => lineIsAddable(line) || (choices[index] ?? "") !== "",
  ).length;

  // #1088 — how many ambiguous lines are still unresolved. `readyCount` above already keeps the
  // button honest about what WILL go in; this names what will not, before the submit rather than
  // after it. Out-of-stock and unmatched lines are excluded on purpose: each is already labelled
  // in place on its own row below, so counting them here would double-report them.
  const skippedCount = lines.filter(
    (line, index) => line.resolution.kind === "ambiguous" && (choices[index] ?? "") === "",
  ).length;

  return (
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
              <span className="truncate text-xs font-semibold text-primary-muted">
                {line.original}
              </span>
              <span className="shrink-0 text-[11px] font-bold text-primary">×{line.quantity}</span>
            </div>

            {line.resolution.kind === "matched" && (
              <div className="mt-1.5">
                {line.resolution.product.stock > 0 ? (
                  <>
                    <p className="text-sm font-bold text-primary">{line.resolution.product.name}</p>
                    <p className="text-[11px] text-primary-muted">
                      {formatPrice(line.resolution.product.basePrice)} ·{" "}
                      {line.resolution.product.unitLabel}
                    </p>
                    <input type="hidden" name="productId" value={line.resolution.product.id} />
                    <input type="hidden" name="quantity" value={line.quantity} />
                    <input type="hidden" name="lineLabel" value={line.original} />
                    <input type="hidden" name="lineStatus" value="ready" />
                  </>
                ) : (
                  <>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-danger">
                      <PackageX className="h-4 w-4" aria-hidden />
                      {line.resolution.product.name} — unavailable, not added
                    </p>
                    {/* Named by the matched product, the name this row shows, not the typed text. */}
                    <input type="hidden" name="productId" value="" />
                    <input type="hidden" name="quantity" value={line.quantity} />
                    <input type="hidden" name="lineLabel" value={line.resolution.product.name} />
                    <input type="hidden" name="lineStatus" value="unavailable" />
                  </>
                )}
              </div>
            )}

            {line.resolution.kind === "ambiguous" && (
              <div className="mt-1.5">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-accent">
                  {/*
                    P2.6 slice 4 (#567). A line asking for a pack size this shop doesn't stock is a
                    different question from an ambiguous name, and asking the generic one would read
                    as though we hadn't understood. We did — we just can't fill it exactly, and
                    picking a size on the shopper's behalf is the one thing this step exists to
                    prevent.
                  */}
                  <CircleHelp className="h-4 w-4" aria-hidden />
                  {line.measure
                    ? `We don't stock a ${line.measure} pack — choose a size`
                    : "Which one did you mean?"}
                </p>
                <select
                  name="productId"
                  aria-label={
                    line.measure
                      ? `Choose a pack size for "${line.original}"`
                      : `Choose a product for "${line.original}"`
                  }
                  value={choices[index] ?? ""}
                  onChange={(event) =>
                    setChoices((prev) => ({ ...prev, [index]: event.target.value }))
                  }
                  className="w-full rounded-xl border border-black/10 bg-surface-muted p-2 text-xs font-semibold text-primary"
                >
                  {/* #1077 — "Skip this line" alone never said a choice was wanted (triage item
                      20). The empty value is UNCHANGED and load-bearing: it IS the skip, read
                      positionally by features/cart/add-list-to-cart.ts, so the wording has to name
                      both the choice and what happens if none is made. */}
                  <option value="">Please choose an item — or skip this line</option>
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
                <input type="hidden" name="lineLabel" value={line.original} />
                <input type="hidden" name="lineStatus" value="choose" />
              </div>
            )}

            {line.resolution.kind === "unmatched" && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-primary-muted">
                <CircleAlert className="h-4 w-4" aria-hidden />
                No match in this shop — check the spelling or search for it
              </p>
            )}

            {line.resolution.kind === "unmatched" && (
              <>
                <input type="hidden" name="productId" value="" />
                <input type="hidden" name="quantity" value={line.quantity} />
                <input type="hidden" name="lineLabel" value={line.original} />
                <input type="hidden" name="lineStatus" value="unmatched" />
              </>
            )}
          </li>
        ))}
      </ul>

      {skippedCount > 0 && (
        <p className="text-xs font-semibold text-accent">
          {skippedCount === 1
            ? "1 line will be skipped unless you choose an item"
            : `${skippedCount} lines will be skipped unless you choose an item`}
        </p>
      )}

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
  );
}
