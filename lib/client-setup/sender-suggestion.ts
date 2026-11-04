import { emailDomain } from "@/lib/email/policy";

/**
 * #1403 — the sender Client Setup suggests for a store, and whether a saved sender's domain can
 * receive replies. Pure, so the Sender card and its tests call the same functions.
 *
 * Owner decision (2026-11-04, #1419, replacing #1403's rule): `info@<own domain>` when
 * the store has one, else `info-<subdomain>@<platform domain>` from a one-level subdomain such as
 * `aheed.merqify.com`, else `info-<slug>@<platform domain>`. The platform domain is EMAIL_FROM's
 * domain, so there is no new config. This only suggests; nothing is overwritten.
 */

export interface StoreHost {
  host: string;
  isCanonical: boolean;
}

export interface SuggestedSender {
  name: string;
  email: string;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Dev databases hold hosts like `localhost:8787`; those never name a mail domain. */
function isEligibleHost(host: string): boolean {
  return (
    !host.includes(":") && host !== "localhost" && !host.endsWith(".localhost") && !IPV4.test(host)
  );
}

function isPlatformHost(host: string, platformDomain: string | undefined): boolean {
  if (!platformDomain) return false;
  return host === platformDomain || host.endsWith(`.${platformDomain}`);
}

function storeDomain(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

function normalisePlatformDomain(platformDomain: string | undefined): string | undefined {
  const value = (platformDomain ?? "").trim().toLowerCase();
  return value === "" ? undefined : value;
}

/** Eligible hosts that are not the platform domain or under it, lower-cased. */
function customHosts(hosts: readonly StoreHost[], platformDomain: string | undefined) {
  return hosts
    .map((h) => ({ host: h.host.trim().toLowerCase(), isCanonical: h.isCanonical }))
    .filter((h) => isEligibleHost(h.host) && !isPlatformHost(h.host, platformDomain));
}

/**
 * The label of a one-level platform subdomain (`aheed` from `aheed.merqify.com`), or null for the
 * platform domain itself, a multi-level host or any other host. Expects lower-cased input.
 */
function platformSubdomainLabel(host: string, platformDomain: string): string | null {
  const suffix = `.${platformDomain}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  return label === "" || label.includes(".") ? null : label;
}

/** The canonical host first, then alphabetical, among the ones given. */
function pickHost<T extends StoreHost>(hosts: readonly T[]): T | undefined {
  const byName = (a: T, b: T) => a.host.localeCompare(b.host);
  const canonical = hosts.filter((h) => h.isCanonical).sort(byName);
  return canonical[0] ?? [...hosts].sort(byName)[0];
}

export function suggestSender(input: {
  vendorName: string;
  slug: string;
  hosts: readonly StoreHost[];
  platformDomain: string | undefined;
}): SuggestedSender | null {
  const platformDomain = normalisePlatformDomain(input.platformDomain);
  const custom = pickHost(customHosts(input.hosts, platformDomain));
  if (custom) {
    return { name: input.vendorName, email: `info@${storeDomain(custom.host)}` };
  }
  if (platformDomain) {
    const subdomains = input.hosts
      .map((h) => ({ host: h.host.trim().toLowerCase(), isCanonical: h.isCanonical }))
      .filter(
        (h) => isEligibleHost(h.host) && platformSubdomainLabel(h.host, platformDomain) !== null,
      );
    const chosen = pickHost(subdomains);
    const label = chosen ? platformSubdomainLabel(chosen.host, platformDomain) : null;
    return { name: input.vendorName, email: `info-${label ?? input.slug}@${platformDomain}` };
  }
  return null;
}

/**
 * True when the sender's domain can receive replies: the platform domain, one of this store's own
 * domains, or a domain listed in EMAIL_VERIFIED_DOMAINS.
 */
export function isRoutableSenderDomain(input: {
  senderEmail: string;
  hosts: readonly StoreHost[];
  platformDomain: string | undefined;
  verifiedDomains: readonly string[];
}): boolean {
  const domain = emailDomain(input.senderEmail);
  if (domain === "") return false;
  const platformDomain = normalisePlatformDomain(input.platformDomain);
  if (domain === platformDomain) return true;
  if (customHosts(input.hosts, platformDomain).some((h) => storeDomain(h.host) === domain)) {
    return true;
  }
  return input.verifiedDomains.some((d) => d.trim().toLowerCase() === domain);
}

/**
 * #1409 — true when a storefront is being served on the store's own domain rather than the shared
 * platform. The same eligibility and platform test as `customHosts`, applied to one request host,
 * so the footer and the sender suggestion agree on what "own domain" means.
 */
export function isOwnDomainHost(host: string, platformDomain: string | undefined): boolean {
  return (
    customHosts([{ host, isCanonical: true }], normalisePlatformDomain(platformDomain)).length > 0
  );
}
