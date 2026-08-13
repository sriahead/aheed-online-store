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

const DEFAULT_PORT: Record<string, string> = {
  http: "80",
  https: "443",
};

/**
 * Splits a Host header into its hostname and optional port (#176).
 * Handles IPv6 literal hostnames (e.g. `[::1]:8787`).
 */
export function splitHostPort(host: string): { hostname: string; port?: string } {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const closingBracket = trimmed.indexOf("]");
    if (closingBracket !== -1) {
      const hostname = trimmed.slice(0, closingBracket + 1);
      const remainder = trimmed.slice(closingBracket + 1);
      const port = remainder.startsWith(":") ? remainder.slice(1) : undefined;
      return { hostname, port };
    }
  }
  const parts = trimmed.split(":");
  return { hostname: parts[0], port: parts[1] };
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Infer protocol for request (#176).
 * `wrangler dev` sets `x-forwarded-proto: https` even when serving local preview over plain `http`.
 */
export function inferProto(host: string, forwardedProto?: string | null): string {
  if (LOOPBACK_HOSTNAMES.has(splitHostPort(host).hostname)) return "http";
  const forwarded = (forwardedProto ?? "").split(",")[0].trim();
  return forwarded || "https";
}

/**
 * True when `host` is the family apex itself or a subdomain of it (dot boundary).
 */
function isUnderFamily(host: string, familyDomain: string): boolean {
  const suffix = familyDomain.replace(/^\./, "");
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function buildAuthOrigin(input: BuildAuthOriginInput): AuthOrigin {
  const { host, proto, familyDomain } = input;

  const { hostname, port } = splitHostPort(host);
  const authority = port && port !== DEFAULT_PORT[proto] ? `${hostname}:${port}` : hostname;
  const currentOrigin = `${proto}://${authority}`;
  const trusted = new Set<string>([currentOrigin]);

  const family = familyDomain && familyDomain.trim().length > 0 ? familyDomain : undefined;
  if (family && isUnderFamily(hostname, family)) {
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
  const host = (h.get("host") ?? "").toLowerCase();
  const proto = inferProto(host, h.get("x-forwarded-proto"));

  return buildAuthOrigin({ host, proto, familyDomain: getEnv().AUTH_COOKIE_FAMILY_DOMAIN });
}
