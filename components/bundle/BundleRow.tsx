import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BundleCard } from "./BundleCard";
import { HorizontalScroller } from "@/components/layout/HorizontalScroller";
import { hasAvailableItems } from "@/lib/bundle-pricing";
import type { BundleWithItems } from "@/lib/repositories/bundles";

interface BundleRowProps {
  title: string;
  bundles: BundleWithItems[];
  cdnBaseUrl: string;
  /**
   * #501 — the row had no way to offer a "View all" at all, so Value Bundles was
   * the one section on the shop page with no route to the rest. Optional, and
   * rendered with the same element and classes `ProductRow` uses, so the three
   * rows' links are indistinguishable.
   */
  viewAllLink?: string;
}

/**
 * The curated-bundles section on `/categories` (P8.5c, #347).
 *
 * Mirrors `ProductRow`'s shape deliberately — same section chrome, same
 * "render nothing when empty" posture — so the shop page reads as one page
 * rather than as two designs meeting.
 *
 * A bundle whose every constituent is unavailable renders nowhere rather than as
 * an empty card with a £0.00 total; `hasAvailableItems` is the single pure rule
 * deciding that, shared with the pricing math so the two cannot disagree.
 */
export function BundleRow({ title, bundles, cdnBaseUrl, viewAllLink }: BundleRowProps) {
  const renderable = bundles.filter((bundle) => hasAvailableItems(bundle.items));
  if (renderable.length === 0) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-primary">{title}</h2>
          <p className="mt-0.5 text-sm text-primary/70">
            Curated sets, added to your basket in a single tap.
          </p>
        </div>
        {viewAllLink && (
          <Link
            href={viewAllLink}
            className="flex items-center gap-1 text-sm font-semibold text-accent hover:text-accent-hover transition-colors"
          >
            View all
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      {/*
        #511 — `as="ul"` because `BundleCard` renders an `<li>`: the scroll
        container and the items' parent must be the same element, so this cannot
        be a `<ul>` nested inside a scrolling `<div>`.
      */}
      <HorizontalScroller
        // The row's own title, matching ProductRow — see its note on why a
        // generic label is not enough on a page holding several scrollers.
        itemLabel={title.toLowerCase()}
        as="ul"
        itemWidthClassName="[&>*]:w-72 [&>*]:shrink-0 sm:[&>*]:w-80"
      >
        {renderable.map((bundle) => (
          <BundleCard
            key={bundle.id}
            id={bundle.id}
            name={bundle.name}
            tagline={bundle.tagline}
            imageKey={bundle.imageKey}
            altText={bundle.altText}
            items={bundle.items}
            cdnBaseUrl={cdnBaseUrl}
          />
        ))}
      </HorizontalScroller>
    </section>
  );
}
