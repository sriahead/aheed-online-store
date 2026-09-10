/**
 * Per-vendor social links for the storefront footer (P9.2, #407).
 *
 * Each link renders only when that vendor has stored a URL. A `null` HIDES the link rather than
 * falling back to a platform account — a social link is a claim made on a vendor's behalf, which
 * is exactly what #239 fixed when Aheed's marketing copy was rendering on SriMart.
 *
 * ## Why the glyphs are inline SVG rather than icons from `lucide-react`
 *
 * `#407` asks for "icons from the existing icon set rather than a new dependency", and the intent
 * is the dependency, not the package. `lucide-react@1.30.0` ships 6056 icons and **no brand marks
 * at all** — `Facebook` and `Instagram` are both absent, removed upstream. These two paths are
 * lucide's own stroke geometry, so they sit visually alongside the rest of the icon set, and
 * nothing was added to `package.json`.
 *
 * The URLs are validated https-only on write (`lib/social-contact-form.ts`) and rendered here with
 * no further processing, so a value stored before that validation existed still cannot introduce a
 * `javascript:` href — the write path is the guard, and it refuses every scheme but one.
 */

function FacebookGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function InstagramGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export function SocialLinks({
  vendorName,
  facebookUrl,
  instagramUrl,
}: {
  vendorName: string;
  facebookUrl: string | null;
  instagramUrl: string | null;
}) {
  if (!facebookUrl && !instagramUrl) return null;

  return (
    <div className="flex items-center gap-3">
      {facebookUrl && (
        <a
          href={facebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${vendorName} on Facebook`}
          className="rounded-full p-1.5 text-primary transition-colors hover:bg-surface-muted hover:text-action"
        >
          <FacebookGlyph />
        </a>
      )}
      {instagramUrl && (
        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${vendorName} on Instagram`}
          className="rounded-full p-1.5 text-primary transition-colors hover:bg-surface-muted hover:text-action"
        >
          <InstagramGlyph />
        </a>
      )}
    </div>
  );
}
