/**
 * Client Setup sections (#1217) — the data behind /staff/platform/client-setup.
 *
 * The owner's vision: during client onboarding, one dashboard per client where a platform admin
 * configures every required parameter, follows links to the right external consoles, works through
 * a step-by-step guide, and comes back to update anything later. Each concern is one SECTION here;
 * the page renders this list, so adding a section is one entry plus its component — no page rewrite.
 *
 * Pure: every evaluator reads only the facts passed in, so the guide is unit-testable and the page
 * never decides "done" by itself.
 */

export type SectionStatus = "complete" | "incomplete" | "blocked";

/** What the Email section knows about one vendor. Gathered by lib/client-setup-service.ts. */
export interface EmailSetupFacts {
  senderName: string;
  senderEmail: string;
  /** The sender's domain is listed in EMAIL_VERIFIED_DOMAINS. */
  senderDomainVerified: boolean;
  /** EMAIL_FROM is set, so the platform can send at all. */
  platformFromConfigured: boolean;
  inboundAddressCount: number;
}

export interface ClientSetupFacts {
  email: EmailSetupFacts;
}

export interface GuideStep {
  id: string;
  title: string;
  detail: string;
  /** The external page this step is done on (Cloudflare dashboard or docs). */
  href?: string;
  /**
   * `true`/`false` when our own data can tell. `null` when only an external system knows (shown as
   * "check in Cloudflare", never as done) or when the step is an action on this page.
   */
  done: (facts: ClientSetupFacts) => boolean | null;
}

export interface ClientSetupSection {
  id: string;
  title: string;
  description: string;
  steps: readonly GuideStep[];
  status: (facts: ClientSetupFacts) => SectionStatus;
}

const CF_DASHBOARD = "https://dash.cloudflare.com/";
const CF_EMAIL_SERVICE_DOCS = "https://developers.cloudflare.com/email-service/";
const CF_EMAIL_ROUTING_DOCS = "https://developers.cloudflare.com/email-routing/";
const CF_EMAIL_WORKERS_DOCS = "https://developers.cloudflare.com/email-routing/email-workers/";

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function senderConfigured(email: EmailSetupFacts): boolean {
  return email.senderName.trim().length > 0 && SIMPLE_EMAIL.test(email.senderEmail.trim());
}

const EMAIL_SECTION: ClientSetupSection = {
  id: "email",
  title: "Email",
  description:
    "Outgoing email from the store's own address, and the store's receiving addresses forwarded to its real mailbox.",
  steps: [
    {
      id: "sending-domain",
      title: "Set up the sending domain",
      detail:
        "In the Cloudflare dashboard, open Email Sending and onboard the domain of the store's sender address. Cloudflare adds the SPF and DKIM records.",
      href: CF_DASHBOARD,
      done: () => null,
    },
    {
      id: "verified-domains",
      title: "Mark the domain as verified for this environment",
      detail:
        "Add the domain to EMAIL_VERIFIED_DOMAINS (a Worker secret). Until then the store's mail goes out from the platform address, with replies going to the store.",
      href: CF_EMAIL_SERVICE_DOCS,
      done: (f) => f.email.senderDomainVerified,
    },
    {
      id: "sender",
      title: "Set the sender name and email",
      detail: "The name customers see, and the address the store's email comes from.",
      done: (f) => senderConfigured(f.email),
    },
    {
      id: "destination",
      title: "Verify the forward-to mailbox",
      detail:
        "In Email Routing, add the store's real mailbox as a destination address and confirm the email Cloudflare sends to it.",
      href: CF_EMAIL_ROUTING_DOCS,
      done: () => null,
    },
    {
      id: "inbound-addresses",
      title: "Register the receiving addresses",
      detail:
        "Add the store's orders and support addresses below, each with the mailbox it forwards to.",
      done: (f) => f.email.inboundAddressCount > 0,
    },
    {
      id: "routing-rule",
      title: "Route each address to the inbound Worker",
      detail:
        'In Email Routing, create a routing rule per address with the action "Send to a Worker" and pick the inbound-email Worker for this environment.',
      href: CF_EMAIL_WORKERS_DOCS,
      done: () => null,
    },
    {
      id: "test-email",
      title: "Send a test email",
      detail:
        "Use the button below. It goes to your own address through the real sending path, recipient policy included.",
      done: () => null,
    },
  ],
  status: (f) => {
    if (!f.email.platformFromConfigured) return "blocked";
    return f.email.senderDomainVerified &&
      senderConfigured(f.email) &&
      f.email.inboundAddressCount > 0
      ? "complete"
      : "incomplete";
  },
};

export const CLIENT_SETUP_SECTIONS: readonly ClientSetupSection[] = [EMAIL_SECTION];

/** Cloudflare's published Email Service limits, read 2026-11-01 (plan.md). Shown on the page. */
export const EMAIL_LIMITS: readonly { label: string; outgoing: string; incoming: string }[] = [
  { label: "Plan", outgoing: "Workers Paid only", incoming: "Free and Paid" },
  {
    label: "Volume",
    outgoing: "3,000 a month included per account, then $0.35 per 1,000",
    incoming: "Unlimited, free",
  },
  {
    label: "Daily",
    outgoing:
      "Starts low on a new account and grows with sending reputation; read the real number in the dashboard",
    incoming: "No cap",
  },
  { label: "Per message", outgoing: "50 recipients, 25 MiB", incoming: "25 MiB" },
];

export const EMAIL_LIMITS_SOURCE =
  "https://developers.cloudflare.com/email-service/platform/limits/";
