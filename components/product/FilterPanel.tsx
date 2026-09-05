import { SlidersHorizontal } from "lucide-react";
import { ProductFilterForm } from "./ProductFilterForm";

type FilterPanelProps = React.ComponentProps<typeof ProductFilterForm> & {
  /** Sidebar heading, which differs between the two browse pages. */
  heading: string;
};

/**
 * The filter surface for both browse pages (#568): a native `details` disclosure below `md`, the
 * existing static sidebar at `md` and above.
 *
 * WHY A DISCLOSURE AND NOT A DRAWER — this was specified as a copy of `CartDrawerShell`'s modal
 * contract and deliberately changed at `/spec`. Filters currently stack above the results on a
 * narrow viewport, so a shopper with JavaScript disabled has them today. Putting them behind a
 * client-rendered button would have taken that away — a regression on the axis this storefront has
 * protected since P2.5b2, not a new feature. The cart drawer is legitimately a dialog because
 * `/cart` exists as a real page behind it; filters have no second door.
 *
 * What that buys, beyond the no-JS guarantee:
 *   - ZERO client JavaScript. No `"use client"`, so this stays a Server Component.
 *   - No close-on-navigate effect. Every interaction here is a real navigation (a GET submit or a
 *     link), so the next page simply arrives with the disclosure closed — which is also why there
 *     is no exposure to the `useEffect` dependency trap CLAUDE.md records for the cart drawer.
 *   - No `aria-modal`, no focus trap, no Escape handler. This reveals content in place rather than
 *     blocking the page behind it; adding dialog semantics would be the same category error as
 *     trapping focus in the cookie banner. See `specs/design-system.md`, "Disclosure surfaces".
 *
 * The form is rendered TWICE because CSS cannot move one node between two containers. Exactly one
 * is ever visible. Two GET forms in one document is safe here specifically because
 * `ProductFilterForm` uses no `id` attributes and labels by wrapping its inputs, so nothing is
 * duplicated that the accessibility tree or a `form=` reference could confuse.
 */
export function FilterPanel({ heading, ...formProps }: FilterPanelProps) {
  return (
    <>
      {/* Below md: a disclosure. `open` is deliberately never set — see the docstring. */}
      <details className="md:hidden rounded-xl border border-black/10 bg-white">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-primary">
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          {heading}
        </summary>
        <div className="border-t border-black/10 px-4 py-4">
          <ProductFilterForm {...formProps} />
        </div>
      </details>

      {/* md and above: the static sidebar, unchanged from before this slice. */}
      <aside className="hidden md:block shrink-0 md:w-60">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary/60">
          {heading}
        </h2>
        <ProductFilterForm {...formProps} />
      </aside>
    </>
  );
}
