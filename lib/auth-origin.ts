import { headers } from "next/headers";
import { getEnv } from "./config";

/**
 * Per-request auth origin/cookie config for Better Auth (ADR-004 slice 3c, #74;
 * corrected #83). trustedOrigins is SAME-VENDOR-ONLY by design: trusting every
 * vendor's origin on every other vendor's auth endpoints would reopen a
 * cross-tenant CSRF-adjacent surface that isolated-by-default exists to close —
 * confirmed live on staging and corrected with the human (#83). The
 * config-gated family suffix is the one deliberate exception, for the future
 * case where related subdomains are meant to interoperate.
 *
 * `buildAuthOrigin` is PURE — no I/O — so it's unit-testable (same split as
 * lib/auth.ts's buildSocialProviders()). `resolveAuthOrigin()` is the thin
 * async wrapper reading the request host + config. No DB access needed: unlike
 * the original design, nothing here depends on VendorDomain.
 */

export type AuthOrigin = {
  baseURL: string;
  trustedOrigins: string[];
  /** Present only when the host is under a configured family domain — enables the
   * parent-domain (SSO) cookie. Absent → Better Auth's default host-only cookie. */
  crossSubDomainCookies?: { enabled: true; domain: string };
};

export type BuildAuthOriginInput = {
  host: string;
  proto: string;
  /** Optional platform family suffix; when set, a host under it gets an SSO cookie. */
  familyDomain?: string;
};

/**
 * True when `host` is the family apex itself or a subdomain of it (dot boundary),
 * so a look-alike suffix substring (e.g. `evilaheedfoodcentre.nocaped.com` vs
 * `aheedfoodcentre.nocaped.com`) can never hijack the family cookie.
 */
function isUnderFamily(host: string, familyDomain: string): boolean {
  const suffix = familyDomain.replace(/^\./, "");
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function buildAuthOrigin(input: BuildAuthOriginInput): AuthOrigin {
  const { host, proto, familyDomain } = input;
  const currentOrigin = `${proto}://${host}`;
  const trusted = new Set<string>([currentOrigin]);

  const family = familyDomain && familyDomain.trim().length > 0 ? familyDomain : undefined;
  if (family && isUnderFamily(host, family)) {
    trusted.add(`https://*.${family.replace(/^\./, "")}`);
    return {
      baseURL: currentOrigin,
      trustedOrigins: [...trusted],
      crossSubDomainCookies: { enabled: true, domain: family },
    };
  }

  return { baseURL: currentOrigin, trustedOrigins: [...trusted] };
}

export async function resolveAuthOrigin(): Promise<AuthOrigin> {
  const h = await headers();
  const host = (h.get("host") ?? "").toLowerCase().split(":")[0];
  const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim() || "https";

  return buildAuthOrigin({ host, proto, familyDomain: getEnv().AUTH_COOKIE_FAMILY_DOMAIN });
}
