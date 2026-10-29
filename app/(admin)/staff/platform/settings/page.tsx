import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getEnv } from "@/lib/config";
import { fetchPlatformOverviewMetrics } from "@/lib/platform-admin-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Platform Settings & Infrastructure" };

export default async function PlatformSettingsPage() {
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
  let envConfig: ReturnType<typeof getEnv> | null = null;
  try {
    envConfig = getEnv();
  } catch {
    envConfig = null;
  }

  return (
    <PageContainer width="wide">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">
              Platform Admin
            </span>
            <h1 className="text-2xl font-bold text-slate-900">Platform Settings & Architecture</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Global multi-vendor infrastructure, runtime settings, and external integrations.
          </p>
        </div>

        <Link
          href="/staff/platform/health"
          className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition"
        >
          System Health Monitor →
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Runtime & Hosting */}
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">Runtime & Edge Hosting</h2>
          <p className="mt-1 text-xs text-slate-500">
            Deployment target and isolate compatibility constraints.
          </p>

          <dl className="mt-4 divide-y divide-slate-100 text-sm">
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Engine / Host</dt>
              <dd className="font-semibold text-slate-900">
                Cloudflare Workers (@opennextjs/cloudflare)
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Runtime Target</dt>
              <dd className="font-semibold text-slate-900">Node.js (nodejs_compat)</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Middleware Policy</dt>
              <dd className="font-semibold text-emerald-700">Zero-Middleware (Layout injection)</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Local Dev Origin</dt>
              <dd className="font-mono text-xs font-semibold text-purple-700">
                srimart.localhost:8787
              </dd>
            </div>
          </dl>
        </div>

        {/* Database & Tenancy Architecture */}
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">Database & Tenancy (ADR-004)</h2>
          <p className="mt-1 text-xs text-slate-500">
            Shared Neon Postgres storage with centralized row-level isolation.
          </p>

          <dl className="mt-4 divide-y divide-slate-100 text-sm">
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Database Engine</dt>
              <dd className="font-semibold text-slate-900">Neon Serverless PostgreSQL</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Client Strategy</dt>
              <dd className="font-semibold text-slate-900">
                Hybrid (HTTP PrismaNeonHttp + WS Neon)
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Tenant Isolation</dt>
              <dd className="font-semibold text-emerald-700">Row-level vendorId in repositories</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Total Registered Tenants</dt>
              <dd className="font-bold text-slate-900">{metrics.totalVendors} vendors</dd>
            </div>
          </dl>
        </div>

        {/* Identity & SSO */}
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">Identity & Access Management</h2>
          <p className="mt-1 text-xs text-slate-500">
            Better Auth (ADR-002) with global user identity and per-vendor memberships.
          </p>

          <dl className="mt-4 divide-y divide-slate-100 text-sm">
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Auth Framework</dt>
              <dd className="font-semibold text-slate-900">Better Auth (Prisma Adapter)</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Role Tiers</dt>
              <dd className="font-semibold text-slate-900">
                Global Role (User) + VendorRole (Membership)
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Session Cookie</dt>
              <dd className="font-semibold text-slate-900">
                Host-only (one session per store host)
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Registered Users Pool</dt>
              <dd className="font-bold text-slate-900">{metrics.totalUsers} users</dd>
            </div>
          </dl>
        </div>

        {/* External Service Gates & Roadmap */}
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">Platform Integrations & Roadblocks</h2>
          <p className="mt-1 text-xs text-slate-500">
            External upstream service integrations and owner-gated release dependencies.
          </p>

          <dl className="mt-4 divide-y divide-slate-100 text-sm">
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Stripe Payments (#113)</dt>
              <dd className="font-semibold text-amber-700">Untraded (Blocked on live keys)</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Email Routing (#1217)</dt>
              <dd className="font-semibold text-slate-600">Shared Platform Sender / Fallback</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Workers AI Model</dt>
              <dd className="font-semibold text-purple-700">@cf/meta/llama-3.1-8b-instruct</dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-500">Reference Location DB</dt>
              <dd className="font-semibold text-emerald-700">uk-location-reference (Isolated)</dd>
            </div>
          </dl>
        </div>
      </div>
    </PageContainer>
  );
}
