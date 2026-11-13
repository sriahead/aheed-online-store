import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getEmailTemplateList, type TemplateListItem } from "@/lib/email-templates-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Email templates" };

const GROUP_ORDER: TemplateListItem["group"][] = ["Orders", "Account", "Contact", "Marketing"];

function edited(item: TemplateListItem): string {
  if (!item.updatedAt) return "Edited";
  const when = item.updatedAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  });
  return `Edited ${when}${item.updatedByEmail ? ` by ${item.updatedByEmail}` : ""}`;
}

/**
 * #1564 R11 — the store's customer emails, each with its wording either the platform default or
 * this store's edit. Admin tier, like Abandoned checkouts: the wording speaks for the store.
 */
export default async function EmailTemplatesPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal title="Admins only" message="Email templates are restricted to store admins." />
    );
  }

  const items = await getEmailTemplateList(auth.vendorId);
  const editedCount = items.filter((i) => i.edited).length;

  return (
    <PageContainer width="standard">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-primary">Email templates</h1>
        <p className="mt-1 text-sm text-primary-muted">
          The emails your customers receive. Each one already has polished wording in your
          store&apos;s branded design. You can change the subject, preview line, heading,
          introduction, button label, reassurance line and sign-off. The layout, your logo and
          colours, order details and every link stay as they are, so an edit can&apos;t break an
          email. {editedCount > 0 ? `${editedCount} edited.` : "None edited yet."}
        </p>
      </div>

      {GROUP_ORDER.map((group) => {
        const rows = items.filter((i) => i.group === group);
        if (rows.length === 0) return null;
        return (
          <section key={group} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary-muted">
              {group}
            </h2>
            <ul className="divide-y divide-black/10 overflow-hidden rounded-2xl border border-black/10 bg-white">
              {rows.map((item) => (
                <li key={item.key}>
                  <Link
                    href={`/staff/email-templates/${item.key}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
                  >
                    <span>
                      <span className="block font-semibold text-primary">{item.label}</span>
                      <span className="block text-xs text-primary-muted">{item.description}</span>
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        item.edited
                          ? "bg-action/10 text-action"
                          : "bg-surface-muted text-primary-muted"
                      }`}
                    >
                      {item.edited ? edited(item) : "Default"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </PageContainer>
  );
}
