import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireVendorRole } from "@/lib/auth-rbac";
import { fetchPlatformDomains } from "@/lib/platform-admin-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Platform Domain Registry" };

export default async function PlatformDomainsPage() {
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

  const domains = await fetchPlatformDomains();

  return (
    <PageContainer width="wide">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">
              Platform Admin
            </span>
            <h1 className="text-2xl font-bold text-slate-900">Domain & Route Registry</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Host routing mapping incoming HTTP requests to tenant stores ({domains.length} mapped
            hostnames).
          </p>
        </div>

        <Link
          href="/staff/platform/vendors"
          className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition"
        >
          View Vendors Directory →
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50/80 text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-100">
            <tr>
              <th className="px-5 py-3.5">Host Name</th>
              <th className="px-5 py-3.5">Target Store</th>
              <th className="px-5 py-3.5">Domain Type</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5">Mapped Since</th>
              <th className="px-5 py-3.5 text-right">Destination</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {domains.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50/50 transition">
                <td className="px-5 py-4 font-mono text-xs font-bold text-slate-900">{d.host}</td>
                <td className="px-5 py-4">
                  <div className="font-semibold text-slate-900">{d.vendor.name}</div>
                  <div className="text-xs text-slate-400 font-mono">{d.vendor.slug}</div>
                </td>
                <td className="px-5 py-4">
                  {d.isCanonical ? (
                    <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800">
                      ★ Canonical Host
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      Alias / Preview
                    </span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      d.vendor.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {d.vendor.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-xs text-slate-500">
                  {new Date(d.createdAt).toLocaleDateString()}
                </td>
                <td className="px-5 py-4 text-right">
                  <a
                    href={`https://${d.host}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-purple-700 hover:bg-slate-200 transition"
                  >
                    Open Host ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageContainer>
  );
}
