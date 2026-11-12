import { getPrisma } from "@/lib/db";
import {
  getAiEnv,
  getEmailEnv,
  getInboundDefaultForward,
  readOptional,
  type InboundDefaultForward,
} from "@/lib/config";
import {
  getEmailBinding,
  getEmailService,
  getPlatformSenderName,
  selectEmailProvider,
  type EmailProviderName,
  type EmailSendResult,
} from "@/lib/email";
import { emailDomain, parseEmailList, resolveSender } from "@/lib/email/policy";
import { readDestinationAddresses, type DestinationsResult } from "@/lib/email/destinations";
import { fetchPlatformVendors } from "@/lib/platform-admin-service";
import {
  createInboundAddress,
  deleteInboundAddress,
  findInboundAddress,
  listInboundAddresses,
  normaliseAddress,
  type InboundAddressPurposeValue,
  type InboundAddressRow,
} from "@/lib/repositories/inbound-address";
import { fetchVendorProfile, listVendorHosts, updateVendorSender } from "@/lib/repositories/vendor";
import type { ClientSetupFacts } from "@/lib/client-setup/sections";
import { forwardTargetsVerified } from "@/lib/client-setup/inbound-groups";
import {
  isRoutableSenderDomain,
  suggestSender,
  type SuggestedSender,
} from "@/lib/client-setup/sender-suggestion";

/**
 * Request-scoped facade for /staff/platform/client-setup (#1217). The page and its server actions
 * call these; the repositories underneath take the client and vendor id explicitly. Platform-admin
 * gating is the CALLER's job (the page and every action check it themselves) — this module never
 * reads a session.
 */

export interface ClientSetupVendor {
  id: string;
  slug: string;
  name: string;
}

/** Read-only email status for the dashboard. Never carries a secret value. */
export interface EmailPlatformStatus {
  provider: EmailProviderName;
  platformFrom: string | null;
  recipientMode: "open" | "allowlist";
  verifiedDomains: string[];
  configError: boolean;
  /** #1399 — INBOUND_DEFAULT_FORWARD, prefilled as a new receiving address's forward-to. */
  defaultForward: InboundDefaultForward;
}

export interface EmailSectionData {
  senderName: string;
  senderEmail: string;
  senderDomain: string;
  senderDomainVerified: boolean;
  /** The From address this vendor's mail actually goes out with — R5's function, not a copy. */
  effectiveFrom: { name: string; email: string };
  effectiveReplyTo: string | null;
  addresses: InboundAddressRow[];
  platform: EmailPlatformStatus;
  /**
   * #1392 — the account's Email Routing destination addresses, or why they could not be read. Only
   * this result reaches the page; the Cloudflare token never does.
   */
  destinations: DestinationsResult;
  /** #1403 — the sender Client Setup suggests for this store, or null when none can be derived. */
  suggestedSender: SuggestedSender | null;
  /** #1403 — the saved sender's domain can receive replies (platform, store or verified domain). */
  senderRoutable: boolean;
}

export async function listClientSetupVendors(): Promise<ClientSetupVendor[]> {
  const vendors = await fetchPlatformVendors();
  return vendors.map((v) => ({ id: v.id, slug: v.slug, name: v.name }));
}

export function getEmailPlatformStatus(): EmailPlatformStatus {
  const env = readOptional(getEmailEnv);
  const mode =
    (env?.EMAIL_RECIPIENT_MODE ?? "").trim().toLowerCase() === "open" ? "open" : "allowlist";
  return {
    provider: selectEmailProvider(env?.EMAIL_PROVIDER, Boolean(getEmailBinding())),
    platformFrom: env?.EMAIL_FROM ?? null,
    recipientMode: mode,
    verifiedDomains: parseEmailList(env?.EMAIL_VERIFIED_DOMAINS),
    configError: env === undefined,
    defaultForward: getInboundDefaultForward(),
  };
}

export async function getEmailSectionData(vendorId: string): Promise<EmailSectionData> {
  const prisma = getPrisma();
  const ai = readOptional(getAiEnv);
  const [profile, addresses, hosts, destinations] = await Promise.all([
    fetchVendorProfile(prisma, vendorId),
    listInboundAddresses(prisma, vendorId),
    listVendorHosts(prisma, vendorId),
    readDestinationAddresses(
      { accountId: ai?.CLOUDFLARE_ACCOUNT_ID, token: ai?.CLOUDFLARE_API_TOKEN },
      // Wrapped rather than passed bare: workerd can reject a detached fetch ("Illegal invocation").
      (input, init) => fetch(input, init),
    ),
  ]);
  const platform = getEmailPlatformStatus();
  const platformDomain = emailDomain(platform.platformFrom ?? "") || undefined;
  const senderDomain = emailDomain(profile.senderEmail);
  const resolved = resolveSender({
    sender: { name: profile.senderName, email: profile.senderEmail },
    verifiedDomains: platform.verifiedDomains.join(","),
    platformFrom: platform.platformFrom ?? "",
    platformName: getPlatformSenderName(),
  });
  return {
    senderName: profile.senderName,
    senderEmail: profile.senderEmail,
    senderDomain,
    senderDomainVerified: senderDomain !== "" && platform.verifiedDomains.includes(senderDomain),
    effectiveFrom: resolved.from,
    effectiveReplyTo: resolved.replyTo ?? null,
    addresses,
    platform,
    destinations,
    suggestedSender: suggestSender({
      vendorName: profile.name,
      slug: profile.slug,
      hosts,
      platformDomain,
    }),
    senderRoutable: isRoutableSenderDomain({
      senderEmail: profile.senderEmail,
      hosts,
      platformDomain,
      verifiedDomains: platform.verifiedDomains,
    }),
  };
}

export function toClientSetupFacts(email: EmailSectionData): ClientSetupFacts {
  return {
    email: {
      senderName: email.senderName,
      senderEmail: email.senderEmail,
      senderDomainVerified: email.senderDomainVerified,
      platformFromConfigured: Boolean(email.platform.platformFrom),
      inboundAddressCount: email.addresses.length,
      forwardTargetsVerified: forwardTargetsVerified(email.addresses, email.destinations),
    },
  };
}

export async function saveVendorSender(
  vendorId: string,
  data: { senderName: string; senderEmail: string },
): Promise<boolean> {
  return updateVendorSender(getPrisma(), vendorId, data);
}

export type AddInboundAddressOutcome = { ok: true } | { ok: false; reason: "duplicate" | "loop" };

/**
 * Adds a receiving address. Refuses a forward-to that is itself a registered receiving address (or
 * the address being added): forwarding there would bounce the message round Email Routing forever.
 */
export async function addInboundAddress(
  vendorId: string,
  input: { address: string; purpose: InboundAddressPurposeValue; forwardTo: string },
): Promise<AddInboundAddressOutcome> {
  const prisma = getPrisma();
  const address = normaliseAddress(input.address);
  const forwardTo = normaliseAddress(input.forwardTo);
  if (forwardTo === address || (await findInboundAddress(prisma, forwardTo))) {
    return { ok: false, reason: "loop" };
  }
  const created = await createInboundAddress(prisma, vendorId, {
    address,
    purpose: input.purpose,
    forwardTo,
  });
  return created.ok ? { ok: true } : { ok: false, reason: created.reason };
}

export async function removeInboundAddress(vendorId: string, id: string): Promise<boolean> {
  return (await deleteInboundAddress(getPrisma(), vendorId, id)) > 0;
}

/** R33 — sends as the vendor, to the given address only (the action passes the admin's own). */
export async function sendClientSetupTestEmail(
  vendorId: string,
  to: string,
): Promise<EmailSendResult> {
  const profile = await fetchVendorProfile(getPrisma(), vendorId);
  return getEmailService().send({
    to,
    sender: { name: profile.senderName, email: profile.senderEmail },
    subject: `${profile.senderName} — test email from Client Setup`,
    html: `<p>This is a test email sent from the Client Setup dashboard.</p><p>If it arrived, ${profile.senderName}'s outgoing email works in this environment.</p>`,
    // #1546 — sendTestEmailAction passes the signed-in platform admin's own address.
    recipientIsSignedInAdmin: true,
  });
}
