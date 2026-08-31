import { BundleCard } from "./BundleCard";
import { hasAvailableItems } from "@/lib/bundle-pricing";
import type { BundleWithItems } from "@/lib/repositories/bundles";

interface BundleRowProps {
  title: string;
  bundles: BundleWithItems[];
  cdnBaseUrl: string;
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
export function BundleRow({ title, bundles, cdnBaseUrl }: BundleRowProps) {
  const renderable = bundles.filter((bundle) => hasAvailableItems(bundle.items));
  if (renderable.length === 0) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-xl font-bold text-primary">{title}</h2>
        <p className="mt-0.5 text-sm text-primary/70">
          Curated sets, added to your basket in a single tap.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      </ul>
    </section>
  );
}
