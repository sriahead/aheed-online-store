import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { RunbookClient } from "@/components/staff/RunbookClient";
import { docsForViewer } from "@/lib/runbook-audiences";
import { DOC_ARTICLES as INTERNAL_DOCS } from "./docs";

/** The generated bundle is `any[]`; this is the shape both the filter and the reader rely on. */
type DocArticle = {
  id: string;
  title: string;
  audience: string[];
  visibility?: "internal" | "public";
  category: string;
  summary: string;
  lastUpdated: string;
  content: string;
};

export const metadata: Metadata = { title: "Internal Operational Runbook" };

export default async function RunbookPage() {
  // Available to both STAFF and ADMIN
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PanelRefusal title="Staff only" message="This area is restricted to store staff." />;
  }

  // The ONLY place runbook documents are narrowed by audience (#633). `RunbookClient` renders
  // whatever it is handed and derives its tabs from that — a second filter there, against a
  // different vocabulary, is what made this page serve 1 of its 152 articles (#625).
  //
  // Developer material (`audience: [dev]`, 144 of the 152) and the `admin` audience stay out: in
  // this repository `admin` tags developer-and-reviewer artifacts — gap registers and SDD
  // plan/requirements/validation files — not store admins, so admitting it would put specs in a
  // shop manager's runbook.
  //
  // Platform-admin material is admitted only for a platform admin, matching the /staff/errors
  // reasoning (#508): a per-vendor store admin also satisfies requireVendorRole("ADMIN"), but
  // platform-level material is not theirs to read.
  const filteredDocs = docsForViewer(INTERNAL_DOCS as DocArticle[], auth.via === "platform-admin");

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <RunbookClient docs={filteredDocs} />
    </main>
  );
}
