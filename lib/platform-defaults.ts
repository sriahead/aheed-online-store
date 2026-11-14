/**
 * The platform's own identity when nothing overrides it. The platform is Merqify (the operator, not
 * a vendor). Kept apart from `lib/config` so pure code (the email layout's fallback brand, #1564)
 * can use the defaults without reading, or being coupled to, validated config.
 */
export const DEFAULT_PLATFORM_NAME = "Merqify";
export const DEFAULT_PLATFORM_TAGLINE = "Your Merchandise, Digitised Quickly";
/** #1564 R3 — where the "Powered by" footer link in every email points. */
export const DEFAULT_PLATFORM_URL = "https://merqify.com";
/** #1585 — the platform's ecosystem branding terminology across Stripe Checkout, footer, and emails. */
export const DEFAULT_PLATFORM_BRANDING_TERMINOLOGY = "Levelled Up by Merqify";
