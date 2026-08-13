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
 *
 * Port and scheme normalisation corrected in #176: the origin now keeps a
 * non-default port and only assumes https where the host is not loopback.
 * Both halves live in pure, unit-tested helpers rather than in the async
 * wrapper — the untested wrapper is exactly where the defect hid, invisible on
 * Cloudflare (default port, x-forwarded-proto always set) and fatal against
 * `npm run preview` on :8787.
 */

export type AuthOrigin = {
  baseURL: string;
  trustedOrigins: string[];
  /** Present only when the host is under a configured family domain — enables the
   * parent-domain (SSO) cookie. Absent → Better Auth's default host-only cookie. */
  crossSubDomainCookies?: { enabled: true; domain: string };
};

export type BuildAuthOriginInput = {
  /** Request `Host`, which MAY carry a port (`localhost:8787`). See splitHostPort. */
  host: string;
  proto: string;
  /** Optional platform family suffix; when set, a host under it gets an SSO cookie. */
  familyDomain?: string;
};

/** Port a browser omits from an Origin header for the given scheme. */
const DEFAULT_PORT: Record<string, string> = { http: "80", https: "443" };

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Splits a `Host` value into hostname + optional port, handling bracketed IPv6
 * literals (`[::1]:8787`) where a naive split on the first colon would not.
 */
export function splitHostPort(host: string): { hostname: string; port?: string } {
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    if (end === -1) return { hostname: host };
    const hostname = host.slice(0, end + 1);
    const rest = host.slice(end + 1);
    return rest.startsWith(":") ? { hostname, port: rest.slice(1) } : { hostname };
  }
  const i = host.indexOf(":");
  return i === -1 ? { hostname: host } : { hostname: host.slice(0, i), port: host.slice(i + 1) };
}

/**
 * The scheme to compare origins under (#176).
 *
 * **A loopback host is always http, even when `x-forwarded-proto` says https.**
 * That header is not absent under `npm run preview` — `wrangler dev` sets it to
 * `https` on a connection it is serving over plain HTTP, so trusting it built
 * `https://localhost:8787` while the browser sent `http://localhost:8787`, and
 * every sign-in was refused. Verified by reading the header the Worker actually
 * receives, not inferred. Nothing reaches this branch off a developer machine:
 * a loopback host cannot be routed to on Cloudflare.
 *
 * For every other host the forwarded header wins and `https` is the fallback —
 * an unproxied public host is not a case where guessing `http` is ever safer.
 * A spoofed `Host` already determines the trusted origin by design (the whole
 * origin is host-derived, ADR-004 slice 3c), so this adds no new exposure.
 */
export function inferProto(host: string, forwardedProto?: string | null): string {
  if (LOOPBACK_HOSTNAMES.has(splitHostPort(host).hostname)) return "http";
  const forwarded = (forwardedProto ?? "").split(",")[0].trim();
  return forwarded || "https";
}

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

  // #176 — the origin must carry a non-default port, because that is what the
  // browser puts in its Origin header and what Better Auth compares against.
  // A default port is stripped for the same reason: browsers omit it, so
  // keeping `:443` would mismatch every proxied request that supplies one.
  // Family matching deliberately uses the PORTLESS hostname — a port says
  // nothing about which domain family a host belongs to.
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
  // The port is kept (#176) — buildAuthOrigin decides whether it belongs in the
  // origin, and strips it when it is the scheme's default.
  const host = (h.get("host") ?? "").toLowerCase();
  const proto = inferProto(host, h.get("x-forwarded-proto"));

  return buildAuthOrigin({ host, proto, familyDomain: getEnv().AUTH_COOKIE_FAMILY_DOMAIN });
}
