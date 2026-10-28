import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireVendorRole } from "@/lib/auth-rbac";
import { fetchPlatformOverviewMetrics } from "@/lib/platform-admin-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";
import { PLATFORM_NAV_ITEMS } from "@/components/staff/platform-nav-items";
import { Icon } from "@/components/icons/Icon";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Platform overview" };

const PLATFORM_HOME = "/staff/platform";

/**
 * The platform admin's home (#1319): where `/signed-in` lands a platform admin. Gated exactly like
 * its sibling platform pages — a store admin passes `requireVendorRole("ADMIN")` too, so the
 * `via !== "platform-admin"` refusal is what keeps this page platform-only.
 */
export default async function PlatformHomePage() {
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

  const metrics = await fetchPlatformOverviewMetrics();
  const figures: { label: string; value: number }[] = [
    { label: "Stores", value: metrics.totalVendors },
    { label: "Active stores", value: metrics.activeVendors },
    { label: "Domains", value: metrics.totalDomains },
    { label: "Users", value: metrics.totalUsers },
    { label: "Products", value: metrics.totalProducts },
    { label: "Active products", value: metrics.totalActiveProducts },
    { label: "Recent errors", value: metrics.recentErrorsCount },
  ];
  const links = PLATFORM_NAV_ITEMS.filter((item) => item.href !== PLATFORM_HOME);

  return (
    <PageContainer width="wide">
      <div data-platform-home="">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">
              Platform Admin
            </span>
            <h1 className="text-2xl font-bold text-slate-900">Platform overview</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Every store on the platform, and the operator controls that span them.
          </p>
        </div>

        <dl className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {figures.map((figure) => (
            <div
              key={figure.label}
              data-platform-metric=""
              className="rounded-xl border border-black/10 bg-white p-4 shadow-sm"
            >
              <dt className="text-xs text-slate-500">{figure.label}</dt>
              <dd className="mt-1 text-xl font-bold text-slate-900">
                {figure.value.toLocaleString("en-GB")}
              </dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-platform-link=""
              className="rounded-xl border border-purple-200/80 bg-white p-5 shadow-sm transition hover:border-purple-600 hover:shadow"
            >
              <Icon name={item.icon} className="mb-3 h-6 w-6 text-purple-700" />
              <p className="font-bold text-slate-900">{item.label}</p>
              <p className="mt-1 text-xs leading-normal text-slate-600">{item.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
