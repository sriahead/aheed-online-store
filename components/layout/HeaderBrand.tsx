import { ImageWithFallback } from "@/components/ui/ImageWithFallback";

/**
 * The header's brand block — the contents of the home link (#1069, extracted from `Header.tsx`).
 *
 * Pure props, no request context, so all four cases are renderable in a unit test:
 *
 * | Vendor has      | Below 768px                         | From 768px                      |
 * |-----------------|-------------------------------------|---------------------------------|
 * | logo and mark   | the logo, 72×40                     | the logo, 128×64 (2:1)          |
 * | logo only       | the logo, 72×40                     | the logo, 128×64 (2:1)          |
 * | mark only       | wordmark, mark replacing the tile   | same                            |
 * | neither         | wordmark                            | same                            |
 *
 * #1077 — THE FIRST TWO ROWS ARE DELIBERATELY IDENTICAL, which reverses #1069's own decision one
 * day later. #1069 rendered the square mark below `md` and swapped the logo in from `md`, as one
 * `<picture>` with a media `<source>`. Owner testing (2026-10-13, triage item 1a) found the mark
 * too small to identify the store on a phone, and judged there to be room for the logo. So a
 * vendor WITH a logo now renders that logo at every width, which is what the logo-only case below
 * already did — the two branches are one branch, and `ImageWithFallback`'s `sources` prop no
 * longer has a caller here (kept as a primitive; #1072's light-on-dark footer logo is its next
 * likely user).
 *
 * The mark keeps every other job it has: `app/favicon.ico/route.ts`, `app/layout.tsx` and
 * `app/manifest.ts` each read `markStorageKey` independently of this component, and `markUrl`
 * below still replaces the initial tile for a LOGO-LESS vendor.
 *
 * Every box is sized in CSS before its image decodes, so nothing shifts (#329), and every image
 * renders through `ImageWithFallback` with a fallback of the same footprint (#655).
 */
export function HeaderBrand({
  name,
  localityName,
  logoUrl,
  markUrl,
}: {
  name: string;
  localityName: string;
  logoUrl: string | null;
  /** The mark's `192.png` — 40px at up to 4.8× device pixel ratio. */
  markUrl: string | null;
}) {
  const alt = `${name} — Your Local Store`;

  // #655 — a vendor HAS a logo, but its stored object failed to load. Not the logo-less wordmark
  // below: that is far wider than the 72×40 logo box, and swapping it in overflowed a 360px header
  // by 22px and squeezed the search field at 1024 (measured, build-notes.md). This keeps the logo's
  // exact footprint (`h-10 aspect-9/5`) and its text alternative, so nothing around it moves.
  const missingLogo = (
    <span
      role="img"
      aria-label={alt}
      className="flex h-10 aspect-9/5 md:h-16 md:aspect-2/1 items-center justify-center rounded-xl bg-primary text-xl font-extrabold text-white shadow-sm group-hover:opacity-90 transition-opacity"
    >
      {name.charAt(0)}
    </span>
  );

  // The initial-letter tile. #982 — `shrink-0`, because the initial must never be squashed; the
  // NAME block beside it is what gives way.
  const initialTile = (
    <div className="w-10 h-10 shrink-0 rounded-xl bg-primary flex items-center justify-center text-white font-extrabold text-xl shadow-md group-hover:bg-primary/90 transition-colors">
      {name.charAt(0)}
    </div>
  );

  // The logo-less vendor's wordmark: the tile (or, #1069, the vendor's mark in the tile's exact
  // 40×40 box) and the name.
  const wordmark = (
    <>
      {markUrl ? (
        <ImageWithFallback
          src={markUrl}
          alt={alt}
          className="size-10 shrink-0 rounded-xl object-contain group-hover:opacity-90 transition-opacity"
          fallback={initialTile}
        />
      ) : (
        initialTile
      )}
      {/* #982 — `min-w-0` lets this block shrink below its content width, which is what a flex
      item refuses to do by default. Without it a long name widened the whole page (measured: a
      36-character logo-less name rendered a requested 360px viewport at 477px) rather than
      clipping. Every text node below truncates rather than wrapping, so the header keeps its
      height. */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-1">
          <span className="truncate font-bold text-xl text-primary tracking-tight group-hover:text-primary-muted transition-colors">
            {name.split(" ")[0]}
          </span>
          <span className="truncate font-semibold text-xs text-accent uppercase tracking-wider">
            {name.split(" ").slice(1).join(" ")}
          </span>
        </div>
        {/* #239: was "{localityName} Groceries", which rendered
        "Reading Groceries" under SriMart's wordmark. Only shown
        in the logo fallback (a vendor with no logoStorageKey), so
        it was easy to miss — the locality alone names no trade. */}
        <p className="truncate text-[10px] text-black/60 font-medium tracking-wide uppercase">
          {localityName}
        </p>
      </div>
    </>
  );

  if (!logoUrl) return wordmark;

  // A vendor WITH a logo — whether or not they also have a mark (#1077).
  // Plain <img> by decision — see #46 / eslint.config.mjs. NOTE: this logo is
  // the storefront's dominant byte cost (1.9 MB, 83% of page weight, rendered
  // into a 40px box) and the whole of the ~12s LCP breach — tracked as #243.
  //
  // `aspect-9/5` (= 1.8) reserves the box BEFORE the bytes land. Without it, `w-auto`
  // gave the element zero width until the image decoded, and it then snapped to
  // ~72px and shoved the whole header row sideways — the visible "jerk on
  // refresh". That shift was invisible to the transition sweeps in #323/#324
  // because it is a layout shift, not an animation, and it is made far worse by
  // the 1.9 MB payload above: the bigger the file, the later the jolt.
  // Dimensions cannot come from the DB — VendorBranding stores only
  // logoStorageKey, no width/height — so the ratio is pinned in CSS instead.
  // 1.8 matches both seeded logos (298x160 and 1664x928); `object-contain` means
  // a vendor whose logo is a different shape is letterboxed inside the reserved
  // box rather than distorted, and still never shifts. If #243 later stores real
  // dimensions, replace this with width/height attributes.
  return (
    <ImageWithFallback
      src={logoUrl}
      alt={alt}
      // #982 — `shrink-0` moved here from the container, so the logo keeps its exact
      // reserved footprint now that the container is allowed to shrink.
      className="h-10 w-auto shrink-0 aspect-9/5 md:h-16 md:aspect-2/1 object-contain rounded-xl shadow-sm group-hover:opacity-90 transition-opacity"
      fallback={missingLogo}
    />
  );
}
