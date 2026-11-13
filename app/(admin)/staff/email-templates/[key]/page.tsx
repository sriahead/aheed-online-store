import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getEmailTemplateEditor } from "@/lib/email-templates-service";
import { COPY_FIELD_LIMITS } from "@/lib/email/templates/copy";
import { fieldLabel, isTemplateKey } from "@/lib/email/templates/validate";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";
import { TemplateEditor } from "../TemplateEditor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit email template" };

/** #1564 R11 — one template's wording, a live preview, a test send and reset to default. */
export default async function EmailTemplateEditPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal title="Admins only" message="Email templates are restricted to store admins." />
    );
  }
  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  if (!isTemplateKey(key)) notFound();

  const editor = await getEmailTemplateEditor(auth.vendorId, key);
  const { definition } = editor;

  return (
    <PageContainer width="wide">
      <p className="mb-2 text-sm">
        <Link href="/staff/email-templates" className="text-action underline">
          Email templates
        </Link>
      </p>
      <h1 className="text-2xl font-semibold text-primary">{definition.label}</h1>
      <p className="mt-1 mb-6 max-w-3xl text-sm text-primary-muted">
        {definition.description} Leave a field blank to use the default shown in grey.
      </p>

      <TemplateEditor
        templateKey={key}
        fields={definition.editable.map((field) => ({
          field,
          label: fieldLabel(field),
          limit: COPY_FIELD_LIMITS[field],
          defaultText: definition.defaults[field],
          multiline: !["subject", "preheader", "heading", "ctaLabel"].includes(field),
        }))}
        placeholders={definition.placeholders.map((p) => `{{${p}}}`)}
        saved={editor.saved}
        initialPreview={{
          subject: editor.preview.subject,
          preheader: editor.preview.preheader,
          html: editor.preview.html,
        }}
        adminEmail={auth.user.email}
      />
    </PageContainer>
  );
}
