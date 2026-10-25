import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireVendorRole } from "@/lib/auth-rbac";
import { fetchPlatformHealthSummary } from "@/lib/platform-admin-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Platform System Health" };

export default async function PlatformHealthPage() {
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

  const health = await fetchPlatformHealthSummary();

  return (
    <PageContainer width="wide">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">
              Platform Admin
            </span>
            <h1 className="text-2xl font-bold text-slate-900">System Health & Diagnostics</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Real-time diagnostics across database connectivity, latency, and platform error events.
          </p>
        </div>

        <Link
          href="/staff/errors"
          className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-4 py-2 text-xs font-bold text-rose-700 shadow-sm hover:bg-rose-50 transition"
        >
          View Error Events Log →
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-8">
        {/* Database Ping */}
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Database Ping
            </span>
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                health.dbConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
              }`}
            />
          </div>
          <div className="mt-3 text-3xl font-extrabold text-slate-900">{health.dbPingMs} ms</div>
          <p className="mt-1 text-xs text-slate-500">
            Neon Serverless PostgreSQL connection latency
          </p>
        </div>

        {/* Health Check Pulse */}
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Database Status
            </span>
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              {health.dbConnected ? "Connected" : "Degraded"}
            </span>
          </div>
          <div className="mt-3 text-sm font-semibold text-slate-800">
            {health.lastCheckedAt
              ? `Last record: ${new Date(health.lastCheckedAt).toLocaleTimeString()}`
              : "Active connection verified"}
          </div>
          <p className="mt-1 text-xs text-slate-500">Prisma pooled connection verified</p>
        </div>

        {/* Error Events Count */}
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Logged Exceptions
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
              ErrorEvent Table
            </span>
          </div>
          <div className="mt-3 text-3xl font-extrabold text-slate-900">
            {health.recentErrorCount}
          </div>
          <p className="mt-1 text-xs text-slate-500">Server-side caught events in DB log</p>
        </div>
      </div>

      {/* Observability Guidance */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Platform Observability Rules</h2>
        <div className="mt-3 space-y-2 text-xs text-slate-600 leading-relaxed">
          <p>
            • <strong>Error Logging:</strong> Application errors caught server-side are recorded
            directly into the{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">ErrorEvent</code>{" "}
            table independently of Cloudflare Workers logs.
          </p>
          <p>
            • <strong>Multi-Tenant Security:</strong> Stack traces and exception digests are
            strictly isolated to platform administrators and never surfaced on store-level admin
            panels.
          </p>
          <p>
            • <strong>Health Endpoint:</strong> The public automated health probe is available at{" "}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">/api/health</code>,
            returning JSON status without exposing internal error details.
          </p>
        </div>
      </div>
    </PageContainer>
  );
}
