import Link from "next/link";
import type { ReactNode } from "react";
import { Clock, Lock, Mail, MapPin, Navigation, Phone } from "lucide-react";
import type { VendorProfile } from "@/lib/repositories/vendor";
import { footerPalette, footerStyle } from "@/lib/footer-palette";
import { isDiallablePhone, isEmailAddress, telHref } from "@/lib/footer-contact-form";
import { PAYMENT_BADGE_DETAILS } from "@/lib/payment-badges";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";

/**
 * The storefront footer (#1055) — three columns on desktop, stacked on mobile, then a bottom bar.
 *
 * Every value is vendor data from the profile `StorefrontChrome` already loaded (no extra query),
 * plus the platform name from config. **A null HIDES its element; nothing falls back to platform
 * copy (#239).** A column with nothing to show is not rendered — column 1 counts as empty when the
 * location, phone and email are all unset, because the vendor's name alone is not contact
 * information.
 *
 * Placeholders such as "[YOUR EMAIL]" are legal stored values and render as TEXT: a `tel:` or
 * `mailto:` href is built only from a value that passes the real format check, so a placeholder can
 * never become a link.
 *
 * Colours come from `footerPalette()`, derived from the vendor's primitives and clamped to AA
 * against the footer background. Every link and button is at least the 44px tap height below `md`.
 */

const LINK = "flex min-h-tap items-center md:min-h-0 md:py-1 hover:underline";
const HEADING = "mb-3 text-xs font-bold uppercase tracking-wider text-[var(--footer-heading)]";

function FacebookGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function directionsHref(name: string, location: NonNullable<VendorProfile["location"]>): string {
  const parts = [
    name,
    location.addressLine1,
    location.addressLine2,
    location.city,
    location.postcode,
  ].filter((p): p is string => Boolean(p && p.trim()));
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(", "))}`;
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section data-footer-column aria-label={title}>
      <h2 className={HEADING}>{title}</h2>
      {children}
    </section>
  );
}

export function StorefrontFooter({
  profile,
  platformName,
}: {
  profile: VendorProfile;
  platformName: string | undefined;
}) {
  const palette = footerPalette(profile.primitives);
  const { location, contactPhone, contactEmail, openingHours, openingHoursNote } = profile;
  const phoneHref = contactPhone && isDiallablePhone(contactPhone) ? telHref(contactPhone) : null;
  const emailHref = contactEmail && isEmailAddress(contactEmail) ? `mailto:${contactEmail}` : null;
  const directions = location ? directionsHref(profile.name, location) : null;

  const showContact = Boolean(location || contactPhone || contactEmail);
  const showHours = openingHours.length > 0 || Boolean(openingHoursNote);
  const legal = [
    profile.companyNumber ? `Company no. ${profile.companyNumber}` : null,
    profile.vatNumber ? `VAT ${profile.vatNumber}` : null,
    profile.registeredOffice ? `Registered office ${profile.registeredOffice}` : null,
  ].filter((part): part is string => part !== null);

  return (
    <footer
      style={footerStyle(palette)}
      className="bg-[var(--footer-bg)] text-sm text-[var(--footer-text)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-10">
        {(phoneHref || directions) && (
          <div className="mb-8 flex flex-col gap-3 md:hidden">
            {phoneHref && (
              <a
                href={phoneHref}
                className="flex min-h-tap items-center justify-center gap-2 rounded-xl bg-[var(--footer-heading)] px-4 font-bold text-[var(--footer-bg)]"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                Call {contactPhone}
              </a>
            )}
            {directions && (
              <a
                href={directions}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-tap items-center justify-center gap-2 rounded-xl border border-[var(--footer-text)] px-4 font-bold"
              >
                <Navigation className="h-4 w-4" aria-hidden="true" />
                Get directions
              </a>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {showContact && (
            <Column title="Visit & contact us">
              <address className="space-y-2 not-italic">
                {location && (
                  <div className="flex gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">{profile.name}</p>
                      <p>
                        {[
                          location.addressLine1,
                          location.addressLine2,
                          location.city,
                          location.postcode,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                      {directions && (
                        <a
                          href={directions}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${LINK} font-semibold`}
                        >
                          Get directions →
                        </a>
                      )}
                    </div>
                  </div>
                )}
                {contactPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {phoneHref ? (
                      <a href={phoneHref} className={`${LINK} text-base font-bold`}>
                        {contactPhone}
                      </a>
                    ) : (
                      <span className="text-base font-bold">{contactPhone}</span>
                    )}
                  </div>
                )}
                {contactEmail && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {emailHref ? (
                      <a href={emailHref} className={`${LINK} break-all`}>
                        {contactEmail}
                      </a>
                    ) : (
                      <span className="break-all">{contactEmail}</span>
                    )}
                  </div>
                )}
              </address>
            </Column>
          )}

          {showHours && (
            <Column title="Shop opening hours">
              {openingHours.length > 0 && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
                  {openingHours.map((row, index) => (
                    <div key={index} className="contents">
                      <dt>{row.label}</dt>
                      <dd>{row.hours}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {openingHoursNote && (
                <p className="mt-4 flex gap-2 text-xs text-[var(--footer-muted)]">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {openingHoursNote}
                </p>
              )}
            </Column>
          )}

          <Column title="Shop with us">
            <ul className="space-y-0.5">
              <li>
                <Link href="/help" className={LINK}>
                  Help guide
                </Link>
              </li>
              <li>
                <Link href="/help#delivery" className={LINK}>
                  Delivery areas &amp; slots
                </Link>
              </li>
              <li>
                <Link href="/terms#refunds" className={LINK}>
                  Returns &amp; refunds
                </Link>
              </li>
              {profile.loyaltyEnabled && (
                <li>
                  <Link href="/account/loyalty" className={LINK}>
                    Rewards
                  </Link>
                </li>
              )}
              <li>
                <Link href="/feedback" className={LINK}>
                  Leave a review
                </Link>
              </li>
            </ul>
            {profile.facebookUrl && (
              <a
                href={profile.facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="mt-4 flex size-tap items-center justify-center rounded-full border border-[var(--footer-text)]"
              >
                <FacebookGlyph />
              </a>
            )}
          </Column>
        </div>

        <div className="mt-10 flex flex-col gap-6 border-t border-white/15 pt-6 text-xs md:flex-row md:items-start md:justify-between">
          <div className="space-y-1 text-[var(--footer-muted)]">
            <p>
              © {new Date().getFullYear()} {profile.name}
              {legal.map((part) => (
                <span key={part}> · {part}</span>
              ))}
            </p>
            {platformName && <p>Powered by {platformName}</p>}
          </div>

          <nav aria-label="Legal" className="flex flex-wrap gap-x-5">
            <Link href="/terms" className={LINK}>
              Terms
            </Link>
            <Link href="/privacy" className={LINK}>
              Privacy
            </Link>
            <Link href="/privacy#cookies" className={LINK}>
              Cookies
            </Link>
          </nav>

          {(profile.showSecureCheckoutNote || profile.paymentBadges.length > 0) && (
            <div className="space-y-2">
              {profile.showSecureCheckoutNote && (
                <p className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  Secure checkout powered by Stripe
                </p>
              )}
              {profile.paymentBadges.length > 0 && (
                <ul aria-label="Accepted payment methods" className="flex flex-wrap gap-2">
                  {profile.paymentBadges.map((method) => {
                    const badge = PAYMENT_BADGE_DETAILS[method];
                    return (
                      <li key={method}>
                        {/* Static platform assets the owner replaces in place. Through the one
                            image boundary (#655), so a missing file degrades to its name. */}
                        <ImageWithFallback
                          src={badge.src}
                          alt={badge.label}
                          width={48}
                          height={30}
                          className="h-[30px] w-12 rounded bg-white"
                          fallback={
                            <span className="flex h-[30px] items-center rounded border border-[var(--footer-muted)] px-2 text-[10px] font-bold">
                              {badge.label}
                            </span>
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
