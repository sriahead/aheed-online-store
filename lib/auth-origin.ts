import { headers } from "next/headers";
import { getPrisma } from "./db";
import { getEnv } from "./config";

/**
 * Per-request auth origin/cookie config for Better Auth (ADR-004 slice 3c, #74).
 *
 * `buildAuthOrigin` is PURE — no I/O — so it's unit-testable without a DB (same
 * split as lib/auth.ts's buildSocialProviders()). `resolveAuthOrigin()` is the
 * thin async wrapper that reads the request host + VendorDomain hosts + config
 * and feeds the builder. Constructed fresh per request; never cached across
 * requests (Workers I/O rule, see lib/db.ts).
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
  /** Every known vendor host (from VendorDomain) — trusted as sign-in origins. */
  vendorHosts: string[];
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
  const { host, proto, vendorHosts, familyDomain } = input;

  const trusted = new Set<string>([`${proto}://${host}`]);
  for (const h of vendorHosts) trusted.add(`https://${h}`);

  const family = familyDomain && familyDomain.trim().length > 0 ? familyDomain : undefined;
  if (family && isUnderFamily(host, family)) {
    trusted.add(`https://*.${family.replace(/^\./, "")}`);
    return {
      baseURL: `${proto}://${host}`,
      trustedOrigins: [...trusted],
      crossSubDomainCookies: { enabled: true, domain: family },
    };
  }

  return { baseURL: `${proto}://${host}`, trustedOrigins: [...trusted] };
}

export async function resolveAuthOrigin(): Promise<AuthOrigin> {
  const h = await headers();
  const host = (h.get("host") ?? "").toLowerCase().split(":")[0];
  const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim() || "https";

  const prisma = getPrisma();
  const domains = await prisma.vendorDomain.findMany({ select: { host: true } });

  return buildAuthOrigin({
    host,
    proto,
    vendorHosts: domains.map((d) => d.host),
    familyDomain: getEnv().AUTH_COOKIE_FAMILY_DOMAIN,
  });
}
