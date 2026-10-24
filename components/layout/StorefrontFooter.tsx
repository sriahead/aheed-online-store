import Link from "next/link";
import type { ReactNode } from "react";
import type { VendorProfile } from "@/lib/repositories/vendor";
import { footerPalette, footerStyle } from "@/lib/footer-palette";
import { isDiallablePhone, isEmailAddress, telHref } from "@/lib/footer-contact-form";
import { PAYMENT_BADGE_DETAILS } from "@/lib/payment-badges";
import { ImageWithFallback } from "@/components/ui/ImageWithFallback";
import { CookieSettingsButton } from "@/components/consent/CookieSettingsButton";
import { buildOpeningHoursView } from "@/lib/footer-hours";
import { contactChannels } from "@/lib/contact-channels";
import { FooterContactChannels } from "@/components/layout/FooterContactChannels";
import { Icon } from "@/components/icons/Icon";

/**
 * The storefront footer (#1055) — three columns on desktop, stacked on mobile, then a bottom bar.
 *
 * Every value is vendor data from the profile `StorefrontChrome` already loaded (no extra query),
 * plus the platform name from config. **A null HIDES its element; nothing falls back to platform
 * copy (#239).** A column with nothing to show is not rendered — column 1 counts as empty when the
 * location, phone and email are all unset and there are no contact-channel buttons (#1169 moved
 * those here), because the vendor's name alone is not contact information.
 *
 * Placeholders such as "[YOUR EMAIL]" are legal stored values and render as TEXT: a `tel:` or
 * `mailto:` href is built only from a value that passes the real format check, so a placeholder can
 * never become a link.
 *
 * Colours come from `footerPalette()`, derived from the vendor's primitives and clamped to AA
 * against the footer background. Every link and button is at least the 44px tap height below `md`.
 */

const LINK = "flex min-h-tap items-center md:min-h-0 md:py-1 hover:underline";
/** #1060 — today's weekly row: bold, in the AA-clamped heading colour. `contents` keeps the dl grid. */
const TODAY = "contents font-bold text-[var(--footer-heading)]";
/** #1060 — the decorative dot between the legal links, the same tap height as the links beside it. */
const SEPARATOR = "flex min-h-tap items-center px-2 md:min-h-0 md:py-1";
const HEADING = "mb-3 text-xs font-bold uppercase tracking-wider text-[var(--footer-heading)]";

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
  assistantAvailable,
}: {
  profile: VendorProfile;
  platformName: string | undefined;
  /** #1015 — the same value `StorefrontChrome` gives `FloatingContact`, so both list one set. */
  assistantAvailable: boolean;
}) {
  const palette = footerPalette(profile.primitives);
  const { location, contactPhone, contactEmail, openingHoursNote } = profile;
  const phoneHref = contactPhone && isDiallablePhone(contactPhone) ? telHref(contactPhone) : null;
  const emailHref = contactEmail && isEmailAddress(contactEmail) ? `mailto:${contactEmail}` : null;
  const directions = location ? directionsHref(profile.name, location) : null;
  const hasAddressDetails = Boolean(location || contactPhone || contactEmail);

  // #1060 — "today" is read here, per request (storefront HTML is not cached), in the store's zone.
  const hours = buildOpeningHoursView(profile.weeklyHours, profile.hoursOverrides, new Date());
  const showHours =
    hours.weekly.length > 0 || hours.holidays.length > 0 || Boolean(openingHoursNote);
  const channels = contactChannels({
    vendorName: profile.name,
    facebookUrl: profile.facebookUrl,
    instagramUrl: profile.instagramUrl,
    whatsappNumber: profile.whatsappNumber,
    whatsappCommunityUrl: profile.whatsappCommunityUrl,
    assistantAvailable,
  });
  // #1169 — the contact-channel buttons live in this column now, so it shows for them too: a store
  // with only a Facebook page still has a way to be reached, and it must not vanish.
  const showContact = hasAddressDetails || channels.length > 0;
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
      {/*
        #1060 — the bottom padding clears the floating buttons (Rewards bottom-left; cart and the
        contact trigger stacked bottom-right, the trigger's top edge at 144px, or 160px from `sm`),
        so scrolled to the end of the page they never cover footer content.
      */}
      <div className="mx-auto max-w-6xl px-4 pb-40 pt-10 sm:pb-44">
        {(phoneHref || directions) && (
          <div className="mb-8 flex flex-col gap-3 md:hidden">
            {phoneHref && (
              <a
                href={phoneHref}
                className="flex min-h-tap items-center justify-center gap-2 rounded-xl bg-[var(--footer-heading)] px-4 font-bold text-[var(--footer-bg)]"
              >
                <Icon name="phone" className="h-4 w-4" />
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
                <Icon name="navigation" className="h-4 w-4" />
                Get directions
              </a>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {showContact && (
            <Column title="Visit & contact us">
              {hasAddressDetails && (
                <address className="space-y-2 not-italic">
                  {location && (
                    <div className="flex gap-2">
                      <Icon name="map-pin" className="mt-0.5 h-4 w-4 shrink-0" />
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
                      <Icon name="phone" className="h-4 w-4 shrink-0" />
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
                      <Icon name="mail" className="h-4 w-4 shrink-0" />
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
              )}
              {/* #1060 — the same channels as the floating contact button, from one source.
                  #1169 — under "Visit & contact us", where the owner looks for them. */}
              <FooterContactChannels channels={channels} />
            </Column>
          )}

          {showHours && (
            <Column title="Shop opening hours">
              {hours.weekly.length > 0 && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
                  {hours.weekly.map((row) => (
                    <div
                      key={row.day}
                      aria-current={row.isToday ? "date" : undefined}
                      className={row.isToday ? TODAY : "contents"}
                    >
                      <dt>{row.day}</dt>
                      <dd>{row.text}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {hours.holidays.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[var(--footer-heading)]">
                    Holiday hours
                  </h3>
                  <ul className="space-y-1.5">
                    {hours.holidays.map((row) => (
                      <li
                        key={row.text}
                        aria-current={row.isToday ? "date" : undefined}
                        className={
                          row.isToday ? "font-bold text-[var(--footer-heading)]" : undefined
                        }
                      >
                        {row.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {openingHoursNote && (
                <p className="mt-4 flex gap-2 text-xs text-[var(--footer-muted)]">
                  <Icon name="clock" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
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
                  {/* #1134 — slots are named only where the store offers them. */}
                  {profile.offerDeliverySlots ? "Delivery areas & slots" : "Delivery areas"}
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
          </Column>
        </div>

        {/*
          #1060 — one grid, 2fr / 1fr / 1fr from `lg` (an exact 50 / 25 / 25: the gaps sit between
          tracks, not inside them). Below `lg` it stacks payment, legal, company — reordered with
          `order-*`, so the DOM order stays the desktop reading order. `lg`, not `md`: at 768px a
          quarter column is too narrow to hold the Stripe line and five badges on one line each.
        */}
        <div className="mt-10 grid grid-cols-1 gap-6 border-t border-white/15 pt-6 text-xs lg:grid-cols-[2fr_1fr_1fr]">
          <div className="order-3 space-y-1 text-[var(--footer-muted)] lg:order-1">
            <p>
              © {new Date().getFullYear()} {profile.name}
              {legal.map((part) => (
                <span key={part}> · {part}</span>
              ))}
            </p>
            {platformName && <p>Powered by {platformName}</p>}
          </div>

          <nav
            aria-label="Legal"
            className="order-2 flex flex-wrap items-center gap-y-1 lg:order-2 lg:flex-nowrap lg:whitespace-nowrap"
          >
            <Link href="/terms" className={LINK}>
              Terms
            </Link>
            <span aria-hidden="true" className={SEPARATOR}>
              ·
            </span>
            <Link href="/privacy" className={LINK}>
              Privacy
            </Link>
            <span aria-hidden="true" className={SEPARATOR}>
              ·
            </span>
            <Link href="/privacy#cookies" className={LINK}>
              Cookies
            </Link>
            <span aria-hidden="true" className={SEPARATOR}>
              ·
            </span>
            {/* #1107 — reopens the consent banner, so an answer can be changed. */}
            <CookieSettingsButton className={LINK} />
          </nav>

          <div className="order-1 space-y-2 lg:order-3">
            {profile.showSecureCheckoutNote && (
              <p className="flex items-center gap-1.5 whitespace-nowrap">
                <Icon name="lock" className="h-3.5 w-3.5 shrink-0" />
                Secure checkout powered by Stripe
              </p>
            )}
            {profile.paymentBadges.length > 0 && (
              <ul aria-label="Accepted payment methods" className="flex flex-nowrap gap-1.5">
                {profile.paymentBadges.map((method) => {
                  const badge = PAYMENT_BADGE_DETAILS[method];
                  return (
                    <li key={method}>
                      {/* Static platform assets the owner replaces in place. Through the one
                          image boundary (#655), so a missing file degrades to its name. */}
                      <ImageWithFallback
                        src={badge.src}
                        alt={badge.label}
                        width={40}
                        height={24}
                        className="h-6 w-10 rounded bg-white"
                        fallback={
                          <span className="flex h-6 items-center rounded border border-[var(--footer-muted)] px-1.5 text-[10px] font-bold">
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
        </div>
      </div>
    </footer>
  );
}
