import { getPrisma } from "@/lib/db";
import { getEmailEnv, readOptional } from "@/lib/config";
import {
  getEmailBinding,
  getEmailService,
  getPlatformSenderName,
  selectEmailProvider,
  type EmailProviderName,
  type EmailSendResult,
} from "@/lib/email";
import { emailDomain, parseEmailList, resolveSender } from "@/lib/email/policy";
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
import { fetchVendorProfile, updateVendorSender } from "@/lib/repositories/vendor";
import type { ClientSetupFacts } from "@/lib/client-setup/sections";

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
  };
}

export async function getEmailSectionData(vendorId: string): Promise<EmailSectionData> {
  const prisma = getPrisma();
  const [profile, addresses] = await Promise.all([
    fetchVendorProfile(prisma, vendorId),
    listInboundAddresses(prisma, vendorId),
  ]);
  const platform = getEmailPlatformStatus();
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
  });
}
