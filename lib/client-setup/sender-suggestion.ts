import { emailDomain } from "@/lib/email/policy";

/**
 * #1403 — the sender Client Setup suggests for a store, and whether a saved sender's domain can
 * receive replies. Pure, so the Sender card and its tests call the same functions.
 *
 * Owner decision (2026-11-02): the store's own domain when it has one (`orders@<domain>`), else a
 * flat address on the platform domain (`orders-<slug>@<platform domain>`). The platform domain is
 * EMAIL_FROM's domain, so there is no new config. This only suggests; nothing is overwritten.
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

export function suggestSender(input: {
  vendorName: string;
  slug: string;
  hosts: readonly StoreHost[];
  platformDomain: string | undefined;
}): SuggestedSender | null {
  const platformDomain = normalisePlatformDomain(input.platformDomain);
  const custom = customHosts(input.hosts, platformDomain);
  if (custom.length > 0) {
    const byName = (a: StoreHost, b: StoreHost) => a.host.localeCompare(b.host);
    const canonical = custom.filter((h) => h.isCanonical).sort(byName);
    const chosen = canonical[0] ?? [...custom].sort(byName)[0];
    return { name: input.vendorName, email: `orders@${storeDomain(chosen.host)}` };
  }
  if (platformDomain) {
    return { name: input.vendorName, email: `orders-${input.slug}@${platformDomain}` };
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
