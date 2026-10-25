import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireVendorRole } from "@/lib/auth-rbac";
import { fetchPlatformVendors } from "@/lib/platform-admin-service";
import { evaluateVendorReadiness } from "@/lib/vendor-readiness-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Platform Onboarding Roll-up" };

export default async function PlatformOnboardingPage() {
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
  const reports = await Promise.all(vendors.map((v) => evaluateVendorReadiness(v.id)));

  return (
    <PageContainer width="wide">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">
              Platform Admin
            </span>
            <h1 className="text-2xl font-bold text-slate-900">Multi-Vendor Onboarding Roll-up</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Cross-tenant launch readiness tracking benchmarked against canonical reference
            (https://aheedfoodcentre.nocaped.com/).
          </p>
        </div>

        <Link
          href="/staff/onboarding"
          className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition"
        >
          Active Store Dashboard →
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50/80 text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-100">
            <tr>
              <th className="px-5 py-3.5">Storefront</th>
              <th className="px-5 py-3.5">Readiness Status</th>
              <th className="px-5 py-3.5">Overall Score</th>
              <th className="px-5 py-3.5">Store Operator</th>
              <th className="px-5 py-3.5">Platform Admin</th>
              <th className="px-5 py-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {reports.map((report) => {
              const vendorPct =
                report.vendorRequiredCount > 0
                  ? Math.round((report.vendorConfiguredCount / report.vendorRequiredCount) * 100)
                  : 100;
              const platformPct =
                report.platformRequiredCount > 0
                  ? Math.round(
                      (report.platformConfiguredCount / report.platformRequiredCount) * 100,
                    )
                  : 100;

              return (
                <tr key={report.vendorId} className="hover:bg-slate-50/50 transition">
                  <td className="px-5 py-4">
                    <div className="font-bold text-slate-900">{report.vendorName}</div>
                    <div className="text-xs text-slate-400 font-mono">
                      {report.canonicalHost || report.vendorSlug}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {report.readinessStatus === "LAUNCH_READY" ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        ✓ Launch Ready
                      </span>
                    ) : report.readinessStatus === "NEEDS_ATTENTION" ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                        ⚠ Needs Attention
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                        ● In Progress
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900">
                        {report.overallCompletion}%
                      </span>
                      <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full ${
                            report.overallCompletion === 100
                              ? "bg-emerald-500"
                              : report.overallCompletion >= 60
                                ? "bg-amber-400"
                                : "bg-rose-500"
                          }`}
                          style={{ width: `${report.overallCompletion}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {report.configuredRequiredSettings}/{report.totalRequiredSettings} required
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="text-xs font-semibold text-blue-700">{vendorPct}%</div>
                    <div className="text-[11px] text-slate-400">
                      {report.vendorConfiguredCount}/{report.vendorRequiredCount} configured
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="text-xs font-semibold text-purple-700">{platformPct}%</div>
                    <div className="text-[11px] text-slate-400">
                      {report.platformConfiguredCount}/{report.platformRequiredCount} configured
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href="/staff/onboarding"
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition"
                    >
                      Audit Details →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PageContainer>
  );
}
