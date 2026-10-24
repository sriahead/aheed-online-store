import { Icon } from "@/components/icons/Icon";
import { WhatsappGlyph } from "@/components/layout/contact-channel-icons";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";

export interface WhatsappCommunityBannerProps {
  vendorName: string;
  whatsappCommunityUrl: string | null;
  qrImageUrl: string | null;
  headingAs?: "h1" | "h2";
}

/**
 * Per-vendor WhatsApp community promotions banner (#1233).
 *
 * Rendered on `/categories` (when the shopper clicks "Shop") and `/whatsapp-offers`.
 * Follows the #239 null-hides rule: when `whatsappCommunityUrl` is null, nothing renders.
 */
export function WhatsappCommunityBanner({
  vendorName,
  whatsappCommunityUrl,
  qrImageUrl,
  headingAs = "h2",
}: WhatsappCommunityBannerProps) {
  if (!whatsappCommunityUrl) return null;

  const HeadingTag = headingAs;

  return (
    <section
      aria-labelledby="whatsapp-promo-heading"
      className="overflow-hidden rounded-3xl border border-emerald-900/15 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 p-6 text-white shadow-lg sm:p-8"
    >
      <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
        <div className="max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-emerald-100">
            <Icon name="sparkles" className="h-3.5 w-3.5 text-amber-300" />
            <span>WhatsApp Community</span>
          </div>

          <HeadingTag
            id="whatsapp-promo-heading"
            className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl lg:text-4xl"
          >
            Stay Updated with Our Latest Offers!
          </HeadingTag>

          <p className="text-sm leading-relaxed text-emerald-50/90 sm:text-base">
            Join the {vendorName} WhatsApp group to discover special promotions, exclusive deals,
            fresh arrivals, and exciting savings on your favourite products.
          </p>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:gap-4">
            <a
              href={whatsappCommunityUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-tap items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] px-6 py-3.5 text-base font-extrabold text-emerald-950 shadow-md transition hover:bg-[#20bd5a]"
            >
              <WhatsappGlyph className="h-5 w-5" />
              <span>Join Our WhatsApp Group</span>
              <Icon name="external-link" className="h-4 w-4 opacity-80" />
            </a>

            <p className="text-xs font-medium text-emerald-100/90">Free to join. Leave anytime.</p>
          </div>
        </div>

        {qrImageUrl && (
          <div className="flex shrink-0 flex-col items-center rounded-2xl bg-white p-4 text-center text-primary shadow-md">
            <ImageWithFallback
              src={qrImageUrl}
              alt={`Scan to join the ${vendorName} WhatsApp group`}
              width={176}
              height={176}
              className="h-40 w-40 rounded-lg object-contain sm:h-44 sm:w-44"
              fallback={null}
            />
            <span className="mt-2 text-xs font-bold text-primary">Scan with your phone camera</span>
            <span className="text-[11px] text-primary-muted">Instant WhatsApp group invite</span>
          </div>
        )}
      </div>
    </section>
  );
}
