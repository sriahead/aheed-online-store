import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireVendorRole } from "@/lib/auth-rbac";
import { fetchPlatformVendors } from "@/lib/platform-admin-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Platform Vendors" };

export default async function PlatformVendorsPage() {
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

  const vendors = await fetchPlatformVendors();

  return (
    <PageContainer width="wide">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">
              Platform Admin
            </span>
            <h1 className="text-2xl font-bold text-slate-900">Vendors & Storefronts</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Multi-tenant directory of all registered stores across the platform ({vendors.length}{" "}
            total).
          </p>
        </div>

        <Link
          href="/staff/platform/domains"
          className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition"
        >
          View Domain Registry →
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50/80 text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-100">
            <tr>
              <th className="px-5 py-3.5">Store / Tenant</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5">Primary Domain</th>
              <th className="px-5 py-3.5">Catalogue</th>
              <th className="px-5 py-3.5">Delivery Areas</th>
              <th className="px-5 py-3.5">Team</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {vendors.map((vendor) => (
              <tr key={vendor.id} className="hover:bg-slate-50/50 transition">
                <td className="px-5 py-4">
                  <div className="font-bold text-slate-900">{vendor.name}</div>
                  <div className="text-xs text-slate-400 font-mono">{vendor.slug}</div>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      vendor.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {vendor.status}
                  </span>
                </td>
                <td className="px-5 py-4 font-mono text-xs">
                  {vendor.canonicalHost ? (
                    <a
                      href={`https://${vendor.canonicalHost}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-700 hover:underline"
                    >
                      {vendor.canonicalHost} ↗
                    </a>
                  ) : (
                    <span className="text-slate-400 italic">No domain</span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <div className="text-xs">
                    <span className="font-semibold text-slate-900">{vendor.activeProducts}</span>{" "}
                    active / {vendor.totalProducts} items
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {vendor.totalCategories} categories
                  </div>
                </td>
                <td className="px-5 py-4 text-xs font-medium">
                  {vendor.totalDeliveryAreas} postcode prefix(es)
                </td>
                <td className="px-5 py-4 text-xs font-medium">
                  {vendor.totalTeamMembers} staff member(s)
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/staff/onboarding`}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
                  >
                    Onboarding Readiness →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageContainer>
  );
}
