import Link from "next/link";
import { X } from "lucide-react";
import { activeFilterChips, clearAllHref, type FilterChipParams } from "./filter-chips";

/**
 * Applied filters, shown above the results and individually removable (#568). Shared by both
 * browse pages.
 *
 * No client JavaScript: each chip is an anchor to the same URL minus one parameter, because the
 * URL already IS the filter state. Nothing here needs to know what is currently rendered.
 *
 * Renders nothing at all when no filter is active — including no "Clear all", which would otherwise
 * be a control that visibly does nothing.
 */
export function FilterChips({
  basePath,
  params,
  categoryLabel,
  brandLabel,
}: {
  basePath: string;
  params: FilterChipParams;
  /** Resolved category NAME, so the chip reads "Rice and Grains" rather than "rice-and-grains". */
  categoryLabel?: string;
  /** Resolved brand NAME (#569), so the chip reads "Shan" rather than "shan". */
  brandLabel?: string;
}) {
  const chips = activeFilterChips(basePath, params, categoryLabel, brandLabel);
  if (chips.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <h2 className="sr-only">Applied filters</h2>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          // The visible text is the filter's name, so the accessible name has to say what the
          // control DOES — otherwise every chip announces as its own label with no hint that
          // following it removes the filter.
          aria-label={`Remove filter: ${chip.label}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-surface-muted px-3 py-1 text-sm text-primary transition-colors hover:bg-black/5"
        >
          {chip.label}
          <X className="h-3.5 w-3.5 text-primary/60" aria-hidden />
        </Link>
      ))}
      <Link
        href={clearAllHref(basePath, params)}
        className="rounded-full px-3 py-1 text-sm font-semibold text-action underline underline-offset-2 hover:text-action-hover"
      >
        Clear all
      </Link>
    </div>
  );
}
