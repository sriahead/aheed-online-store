import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireVendorRole } from "@/lib/auth-rbac";
import {
  getEmailSectionData,
  listClientSetupVendors,
  toClientSetupFacts,
} from "@/lib/client-setup-service";
import {
  CLIENT_SETUP_SECTIONS,
  EMAIL_LIMITS,
  EMAIL_LIMITS_SOURCE,
  type SectionStatus,
} from "@/lib/client-setup/sections";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";
import { Icon } from "@/components/icons/Icon";
import {
  AddInboundAddressForm,
  RemoveInboundAddressButton,
  SenderForm,
  TestEmailButton,
} from "@/components/staff/client-setup/EmailSetupForms";

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
  const email = await getEmailSectionData(vendorId);
  const facts = toClientSetupFacts(email);

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
                <SenderForm
                  vendorId={vendorId}
                  senderName={email.senderName}
                  senderEmail={email.senderEmail}
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
                </dl>
                {email.platform.configError && (
                  <p role="alert" className="mt-3 text-xs text-danger">
                    The email configuration for this environment is invalid; check EMAIL_FROM.
                  </p>
                )}
              </Card>

              <Card title="Receiving addresses">
                {email.addresses.length === 0 ? (
                  <p className="mb-3 text-sm text-primary-muted">No receiving addresses yet.</p>
                ) : (
                  <ul className="mb-4 divide-y divide-slate-100 text-sm" data-inbound-addresses>
                    {email.addresses.map((a) => (
                      <li
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2"
                      >
                        <span className="min-w-0">
                          <span className="font-semibold">{a.address}</span>
                          <span className="ml-2 text-xs text-primary-muted">
                            {a.purpose === "ORDERS" ? "Orders" : "Support"} → {a.forwardTo}
                          </span>
                        </span>
                        <RemoveInboundAddressButton vendorId={vendorId} id={a.id} />
                      </li>
                    ))}
                  </ul>
                )}
                <AddInboundAddressForm vendorId={vendorId} />
              </Card>

              <Card title="Test email">
                <TestEmailButton vendorId={vendorId} adminEmail={adminEmail} />
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
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
