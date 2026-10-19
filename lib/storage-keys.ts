/**
 * Every browser cookie and local-storage name the storefront owns (#1080).
 *
 * The names are vendor-neutral because every vendor sets them, and since #1064 the privacy page
 * lists each one by name: an `aheed_`-prefixed cart cookie meant SriMart's privacy page told its
 * shoppers their basket was stored under another vendor's name. `delivery-postcode` and
 * `fulfilment-method` were already neutral and keep their own modules.
 *
 * Client-safe on purpose: `CookieBanner`, `RewardsLauncher` and `CheckoutForm` import it, so
 * nothing here may import `next/headers` or anything server-only.
 *
 * COMPATIBILITY WINDOW. The `LEGACY_*` names below are the pre-#1080 names. For 30 days each reader
 * tries the new name and then the legacy one, and each writer moves the value across and deletes
 * the legacy copy, so no basket or consent choice is lost to the rename. Thirty days is the guest
 * cart cookie's own `maxAge`, which `issueGuestToken` never refreshes, so after that no unexpired
 * legacy cart cookie can exist. The legacy names occur as literals ONLY in this file (#1080 R4),
 * which makes removing the window a one-file change followed by the compile errors. That removal is
 * #1106, due 30 days after the production promotion that carries #1080.
 */

export const CART_COOKIE = "store_cart";
export const CONSENT_COOKIE = "store_cookie_consent";
export const REFERRAL_COOKIE = "store_referral_code";
export const CHECKOUT_DETAILS_KEY = "store_checkout_details";
/**
 * #1173 — `sessionStorage`, not a cookie or `localStorage`: whether the shopper hid the browse
 * sidebar on desktop, remembered until the tab closes. Session-only interface customisation the
 * shopper asked for, so it needs no consent; `/privacy` still lists it.
 */
export const FILTERS_COLLAPSED_KEY = "store_filters_collapsed";

export const LEGACY_CART_COOKIE = "aheed_cart";
export const LEGACY_CONSENT_COOKIE = "aheed_cookie_consent";
export const LEGACY_REFERRAL_COOKIE = "aheed_referral_code";
export const LEGACY_CHECKOUT_DETAILS_KEY = "aheed_checkout_details";

/**
 * Dispatched on `window` by the consent banner when the shopper answers it, with
 * `detail.value` set to the choice (#1065). `RewardsLauncher` holds a `?ref=` code in memory
 * until this reports `accepted`.
 */
export const CONSENT_CHANGE_EVENT = "store-consent-change";

/**
 * Dispatched on `window` by `CookieSettingsButton` (#1107). The consent banner always listens and
 * reopens on it, so a shopper can change an answer they already gave.
 */
export const CONSENT_SETTINGS_OPEN_EVENT = "store-consent-open";

export type ConsentValue = "accepted" | "essential";

export function isConsentValue(value: string | null | undefined): value is ConsentValue {
  return value === "accepted" || value === "essential";
}

/** The shape both `next/headers`' cookie store and a test double satisfy. */
export interface CookieJarReader {
  get(name: string): { value: string } | undefined;
}

/** The value under `name`, else under `legacyName`, else `null`. The new name always wins. */
export function readCookieWithFallback(
  jar: CookieJarReader,
  name: string,
  legacyName: string,
): string | null {
  return jar.get(name)?.value ?? jar.get(legacyName)?.value ?? null;
}

/**
 * `document.cookie` as a `CookieJarReader`, for client components. Read fresh on every call:
 * cookies change under a mounted component.
 */
export function browserCookieJar(): CookieJarReader {
  return {
    get(name) {
      const prefix = `${name}=`;
      const row = document.cookie.split("; ").find((r) => r.startsWith(prefix));
      return row === undefined
        ? undefined
        : { value: decodeURIComponent(row.slice(prefix.length)) };
    },
  };
}

/** Expires a browser cookie written with `path=/`. */
export function expireBrowserCookie(name: string): void {
  document.cookie = `${name}=; max-age=0; path=/`;
}

/** The shopper's stored consent choice, new name first. Anything unrecognised is no answer. */
export function readBrowserConsent(): ConsentValue | null {
  const value = readCookieWithFallback(browserCookieJar(), CONSENT_COOKIE, LEGACY_CONSENT_COOKIE);
  return isConsentValue(value) ? value : null;
}
