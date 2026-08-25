import { MapPin, Check, X } from "lucide-react";
import { setDeliveryPostcode } from "@/features/storefront/delivery";

/**
 * Header delivery-postcode checker (P8.5f) — moved out of the homepage hero.
 *
 * A Server Component with **no client JS**: a plain `<form action={serverAction}>`
 * that works with JavaScript disabled, matching the progressive-enhancement
 * posture `Header` has had since P2a. The verdict is recomputed server-side on
 * every render from the cookie plus the current vendor's prefixes, so it is never
 * a stale cached answer.
 *
 * Two variants because the header has very different space on the two surfaces:
 * - `full` — on the landing page, where P8.5f removed the search box and Shop
 *   List link to make room. The whole input + button + verdict.
 * - `badge` — everywhere else, where the search box occupies that space. Just the
 *   standing answer, with no way to change it from here; the shopper edits it on
 *   the landing page. A compact read-only summary keeps the promise visible
 *   without competing with search for the row.
 */
export function PostcodeChecker({
  postcode,
  deliverable,
  localityName,
  prefixes,
  variant,
}: {
  postcode: string | null;
  /** null = nothing stored yet, so no verdict to show. */
  deliverable: boolean | null;
  localityName: string;
  prefixes: string[];
  variant: "full" | "badge";
}) {
  if (variant === "badge") {
    if (postcode === null || deliverable === null) return null;

    return (
      <span
        className={`hidden lg:inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold ${
          deliverable
            ? "border-action/30 bg-action-tint text-primary"
            : "border-danger/30 bg-danger-tint text-danger"
        }`}
        title={
          deliverable
            ? `We deliver to ${postcode}`
            : `Sorry — ${localityName} ${prefixes.join("/")} only`
        }
      >
        {deliverable ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <X className="h-3.5 w-3.5" aria-hidden />
        )}
        <span>{postcode}</span>
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={setDeliveryPostcode} className="flex items-center">
        <div className="relative flex items-center">
          <MapPin
            className="pointer-events-none absolute left-3 h-4 w-4 text-black/40"
            aria-hidden
          />
          <input
            type="text"
            name="postcode"
            defaultValue={postcode ?? ""}
            aria-label="Delivery postcode"
            placeholder={prefixes.length ? `e.g. ${prefixes[0]}1 1AA` : "Enter postcode"}
            className="w-40 rounded-l-xl border border-r-0 border-black/10 bg-surface-muted py-2 pl-9 pr-3 text-sm font-semibold text-black transition focus:border-primary focus:bg-white focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-r-xl bg-accent px-4 py-2 text-xs font-bold text-white transition-colors hover:opacity-90"
        >
          Check
        </button>
      </form>

      {deliverable !== null && postcode !== null && (
        <p
          role="status"
          className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
            deliverable ? "bg-action text-white" : "bg-danger text-white"
          }`}
        >
          {deliverable
            ? `✓ We deliver to ${postcode}`
            : `✗ Sorry, ${localityName} ${prefixes.join("/")} only`}
        </p>
      )}
    </div>
  );
}
