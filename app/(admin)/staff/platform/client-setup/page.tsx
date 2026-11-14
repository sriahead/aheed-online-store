import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireVendorRole } from "@/lib/auth-rbac";
import {
  getEmailSectionData,
  getBrandingSectionData,
  listClientSetupVendors,
  toClientSetupFacts,
} from "@/lib/client-setup-service";
import {
  isTelegramBotTokenSet,
  listOrderAlertRecipientsForVendor,
} from "@/lib/order-alert-service";
import { ORDER_ALERT_CHANNEL_LABEL } from "@/lib/order-alert/channels";
import {
  CLIENT_SETUP_SECTIONS,
  EMAIL_LIMITS,
  EMAIL_LIMITS_SOURCE,
  type SectionStatus,
} from "@/lib/client-setup/sections";
import { groupAddressesByForwardTo } from "@/lib/client-setup/inbound-groups";
import {
  ALLOWLIST_FORWARD_NOTE,
  DESTINATIONS_UNAVAILABLE_SHORT,
} from "@/lib/client-setup/destination-copy";
import { TELEGRAM_QUICK_LINKS } from "@/lib/client-setup/telegram-links";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";
import { Icon } from "@/components/icons/Icon";
import {
  AddInboundAddressForm,
  RemoveInboundAddressButton,
  SenderForm,
  TestEmailButton,
} from "@/components/staff/client-setup/EmailSetupForms";
import {
  AddOrderAlertRecipientForm,
  RemoveOrderAlertRecipientButton,
  TestOrderAlertButton,
} from "@/components/staff/client-setup/OrderAlertForms";
import { PlatformBrandingForm } from "@/components/staff/client-setup/PlatformBrandingForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Client Setup" };

/**
 * #1217 — Client Setup: one onboarding dashboard per client store, for platform admins. Configure
 * the parameters a store needs, follow the links to the external consoles, work through each
 * section's guide, and come back later to change anything.
 *
 * Sections come from lib/client-setup/sections.ts; Email is the first. Later sections (domains,
 * payments, branding …) are an entry there plus their component here.
 */

const STATUS_LABEL: Record<SectionStatus, string> = {
  complete: "Complete",
  incomplete: "In progress",
  blocked: "Blocked",
};

const STATUS_CLASS: Record<SectionStatus, string> = {
  complete: "bg-action-tint text-primary",
  incomplete: "bg-accent-tint text-primary",
  blocked: "bg-danger-tint text-danger",
};

function StatusPill({ status }: { status: SectionStatus }) {
  return (
    <span
      data-section-status={status}
      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-bold text-primary">{title}</h3>
      {children}
    </section>
  );
}

export default async function ClientSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string }>;
}) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Platform admin only"
        message="This area is restricted to platform administrators."
      />
    );
  }
  if (auth.via !== "platform-admin") {
    return (
      <PanelRefusal
        title="Platform admin only"
        message="This area is restricted to platform administrators."
      />
    );
  }

  const { vendor: requestedSlug } = await searchParams;
  const vendors = await listClientSetupVendors();
  const selected = requestedSlug ? vendors.find((v) => v.slug === requestedSlug) : vendors[0];

  return (
    <PageContainer width="wide">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">
            Platform Admin
          </span>
          <h1 className="text-2xl font-bold text-primary">Client Setup</h1>
        </div>
        <p className="mt-1 text-sm text-primary-muted">
          Configure everything a client store needs, follow the step-by-step guide, and come back to
          update it at any time.
        </p>
      </div>

      <nav aria-label="Client stores" className="mb-6 flex flex-wrap gap-2" data-client-picker>
        {vendors.map((v) => (
          <Link
            key={v.id}
            href={`/staff/platform/client-setup?vendor=${encodeURIComponent(v.slug)}`}
            aria-current={selected?.id === v.id ? "page" : undefined}
            className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition ${
              selected?.id === v.id
                ? "border-primary bg-primary text-white"
                : "border-black/10 bg-white text-primary hover:bg-slate-50"
            }`}
          >
            {v.name}
          </Link>
        ))}
      </nav>

      {!selected ? (
        <p role="status" className="rounded-2xl border border-black/10 bg-white p-6 text-sm">
          {vendors.length === 0
            ? "No client stores exist yet."
            : "That store was not found. Pick one of the stores above."}
        </p>
      ) : (
        <ClientSetupSections vendorId={selected.id} adminEmail={auth.user.email} />
      )}
    </PageContainer>
  );
}

async function ClientSetupSections({
  vendorId,
  adminEmail,
}: {
  vendorId: string;
  adminEmail: string;
}) {
  const [email, alertRecipients, branding] = await Promise.all([
    getEmailSectionData(vendorId),
    listOrderAlertRecipientsForVendor(vendorId),
    getBrandingSectionData(vendorId),
  ]);
  const facts = toClientSetupFacts(email);
  const botTokenSet = isTelegramBotTokenSet();

  return (
    <div className="space-y-8">
      {CLIENT_SETUP_SECTIONS.map((section) => (
        <section key={section.id} data-client-setup-section={section.id} className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-primary">{section.title}</h2>
            <StatusPill status={section.status(facts)} />
          </div>
          <p className="text-sm text-primary-muted">{section.description}</p>

          <Card title="Step-by-step guide">
            <ol className="space-y-3">
              {section.steps.map((step, i) => {
                const done = step.done(facts);
                return (
                  <li key={step.id} className="flex gap-3" data-guide-step={step.id}>
                    <span className="mt-0.5 shrink-0">
                      {done === true ? (
                        <Icon name="circle-check" className="h-5 w-5 text-primary" />
                      ) : done === false ? (
                        <Icon name="circle-alert" className="h-5 w-5 text-danger" />
                      ) : (
                        <Icon name="clock" className="h-5 w-5 text-primary-muted" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-primary">
                        {i + 1}. {step.title}
                        <span className="ml-2 text-xs font-medium text-primary-muted">
                          {done === true
                            ? "Done"
                            : done === false
                              ? "Not done"
                              : step.href
                                ? "Check in Cloudflare"
                                : "Action on this page"}
                        </span>
                      </p>
                      <p className="text-xs text-primary-muted">{step.detail}</p>
                      {step.href && (
                        <a
                          href={step.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-action underline"
                        >
                          Open <Icon name="external-link" className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

          {section.id === "email" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Sender">
                {email.senderEmail.trim() !== "" && !email.senderRoutable && (
                  <p
                    role="alert"
                    className="mb-3 rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
                    data-sender-unroutable
                  >
                    Replies to {email.senderDomain || email.senderEmail} may not arrive: it is not
                    the platform domain or one of this store&apos;s domains.
                  </p>
                )}
                <SenderForm
                  vendorId={vendorId}
                  senderName={email.senderName}
                  senderEmail={email.senderEmail}
                  suggestion={email.suggestedSender}
                />
              </Card>

              <Card title="Sending status (this environment)">
                <dl
                  className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm"
                  data-email-status
                >
                  <dt className="text-primary-muted">Provider</dt>
                  <dd className="font-semibold">{email.platform.provider}</dd>
                  <dt className="text-primary-muted">Platform sender</dt>
                  <dd className="font-semibold">{email.platform.platformFrom ?? "Not set"}</dd>
                  <dt className="text-primary-muted">Recipients</dt>
                  <dd className="font-semibold">
                    {email.platform.recipientMode === "open"
                      ? "Anyone (production)"
                      : "Allowlist only"}
                  </dd>
                  <dt className="text-primary-muted">Store domain</dt>
                  <dd className="font-semibold">
                    {email.senderDomain || "None"}{" "}
                    {email.senderDomainVerified ? "(verified)" : "(not verified)"}
                  </dd>
                  <dt className="text-primary-muted">Mail goes out as</dt>
                  <dd className="font-semibold" data-effective-from>
                    {email.effectiveFrom.name} &lt;{email.effectiveFrom.email || "no sender"}&gt;
                    {email.effectiveReplyTo && (
                      <span className="block text-xs font-medium text-primary-muted">
                        Replies go to {email.effectiveReplyTo}
                      </span>
                    )}
                  </dd>
                  <dt className="text-primary-muted">Default forward-to</dt>
                  <dd className="font-semibold" data-default-forward>
                    {email.platform.defaultForward.status === "set" ? (
                      email.platform.defaultForward.address
                    ) : email.platform.defaultForward.status === "invalid" ? (
                      <span role="alert" className="text-danger">
                        Invalid: check INBOUND_DEFAULT_FORWARD
                      </span>
                    ) : (
                      "Not set"
                    )}
                  </dd>
                  <dt className="text-primary-muted">Verified mailboxes</dt>
                  <dd className="font-semibold" data-verified-mailboxes>
                    {email.destinations.status === "ok"
                      ? `${email.destinations.addresses.filter((d) => d.verified).length} verified, ${
                          email.destinations.addresses.filter((d) => !d.verified).length
                        } pending`
                      : `Unavailable: ${DESTINATIONS_UNAVAILABLE_SHORT[email.destinations.reason]}`}
                  </dd>
                </dl>
                {email.platform.configError && (
                  <p role="alert" className="mt-3 text-xs text-danger">
                    The email configuration for this environment is invalid; check EMAIL_FROM.
                  </p>
                )}
              </Card>

              <Card title="Receiving addresses">
                {email.platform.recipientMode === "allowlist" && (
                  <p className="mb-3 text-xs text-primary-muted" data-allowlist-forward-note>
                    {ALLOWLIST_FORWARD_NOTE}
                  </p>
                )}
                {email.addresses.length === 0 ? (
                  <p className="mb-3 text-sm text-primary-muted">No receiving addresses yet.</p>
                ) : (
                  <ul className="mb-4 space-y-3 text-sm" data-inbound-addresses>
                    {groupAddressesByForwardTo(
                      email.addresses,
                      email.platform.defaultForward.status === "set"
                        ? email.platform.defaultForward.address
                        : null,
                    ).map((group) => (
                      <li key={group.forwardTo} data-forward-group={group.forwardTo}>
                        <p className="text-xs font-semibold text-primary-muted">
                          Forwards to <span className="text-primary">{group.forwardTo}</span>
                          {group.isDefault && (
                            <span className="ml-2 rounded-full bg-accent-tint px-2 py-0.5 text-xs font-bold text-primary">
                              Platform default
                            </span>
                          )}
                        </p>
                        <ul className="divide-y divide-slate-100">
                          {group.addresses.map((a) => (
                            <li
                              key={a.id}
                              className="flex flex-wrap items-center justify-between gap-2 py-2"
                            >
                              <span className="min-w-0">
                                <span className="font-semibold">{a.address}</span>
                                <span className="ml-2 text-xs text-primary-muted">
                                  {a.purpose === "ORDERS" ? "Orders" : "Support"}
                                </span>
                              </span>
                              <RemoveInboundAddressButton vendorId={vendorId} id={a.id} />
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
                <AddInboundAddressForm
                  vendorId={vendorId}
                  defaultForward={email.platform.defaultForward}
                  destinations={email.destinations}
                />
              </Card>

              <Card title="Test email">
                <TestEmailButton vendorId={vendorId} adminEmail={adminEmail} />
              </Card>

              {/* #1390 — who hears about an order-related email or contact-form message. */}
              <Card title="Order alerts">
                <p className="mb-3 text-xs text-primary-muted">
                  A short message (order number, sender name and subject) whenever an order-related
                  email or contact-form message reaches this store.
                </p>
                {botTokenSet ? (
                  <p className="mb-3 text-xs font-semibold" data-telegram-token="set">
                    Telegram bot token: Set
                  </p>
                ) : (
                  <p
                    role="alert"
                    className="mb-3 text-xs font-semibold text-danger"
                    data-telegram-token="unset"
                  >
                    Telegram bot token: Not set
                  </p>
                )}
                {alertRecipients.length === 0 ? (
                  <p className="mb-3 text-sm text-primary-muted">No alert recipients yet.</p>
                ) : (
                  <ul className="mb-4 divide-y divide-slate-100 text-sm" data-alert-recipients>
                    {alertRecipients.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2"
                        data-alert-recipient={r.destination}
                      >
                        <span className="min-w-0">
                          <span className="text-xs text-primary-muted">
                            {ORDER_ALERT_CHANNEL_LABEL[r.channel]}
                          </span>
                          <span className="ml-2 font-semibold">{r.destination}</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-1">
                          <TestOrderAlertButton vendorId={vendorId} id={r.id} />
                          <RemoveOrderAlertRecipientButton vendorId={vendorId} id={r.id} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <AddOrderAlertRecipientForm vendorId={vendorId} />

                {/* Quick links for setting up Telegram alerts; "Shareable" ones can go to the client. */}
                <div className="mt-5 border-t border-slate-100 pt-4" data-telegram-quick-links>
                  <p className="mb-2 text-xs font-semibold uppercase text-primary-muted">
                    Telegram quick links
                  </p>
                  <ul className="space-y-2 text-sm">
                    {TELEGRAM_QUICK_LINKS.map((link) => {
                      const external = link.href.startsWith("https://");
                      return (
                        <li key={link.href}>
                          <a
                            href={link.href}
                            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                            className="inline-flex items-center gap-1 font-semibold text-action underline"
                          >
                            {link.label}
                            {external ? <Icon name="external-link" className="h-3 w-3" /> : null}
                          </a>
                          {link.shareable ? (
                            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary-muted">
                              Shareable
                            </span>
                          ) : null}
                          <span className="block text-xs text-primary-muted">{link.hint}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-3 text-xs text-primary-muted">
                    Never share the bot token or a getUpdates address: it contains the token, and
                    anyone holding it can post as the bot.
                  </p>
                </div>
              </Card>

              <div className="lg:col-span-2">
                <Card title="Cloudflare limits">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase text-primary-muted">
                        <tr>
                          <th className="py-1 pr-4"></th>
                          <th className="py-1 pr-4">Outgoing</th>
                          <th className="py-1">Incoming</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {EMAIL_LIMITS.map((row) => (
                          <tr key={row.label}>
                            <td className="py-1.5 pr-4 font-semibold">{row.label}</td>
                            <td className="py-1.5 pr-4">{row.outgoing}</td>
                            <td className="py-1.5">{row.incoming}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <a
                    href={EMAIL_LIMITS_SOURCE}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-action underline"
                  >
                    Cloudflare&apos;s limits page <Icon name="external-link" className="h-3 w-3" />
                  </a>
                </Card>
              </div>

              <div className="lg:col-span-2">
                <Card title="Platform Branding & Ecosystem Identity">
                  <PlatformBrandingForm
                    vendorId={vendorId}
                    currentTerminology={branding.platformBrandingTerminology}
                    customTerminology={branding.customTerminology}
                    defaultTerminology={branding.defaultTerminology}
                  />
                </Card>
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
