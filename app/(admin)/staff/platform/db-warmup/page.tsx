import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireVendorRole } from "@/lib/auth-rbac";
import { computeWarmupPlan } from "@/lib/db-warmup-service";
import { readWarmupStatus } from "@/lib/job-signals";
import { estimateWarmupCost } from "@/lib/db-warmup/estimate";
import { scheduleSpan } from "@/lib/db-warmup/schedule";
import { NEON_SUSPEND_AFTER_MS } from "@/lib/job-signal-keys";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";
import { DbWarmupForm } from "./DbWarmupForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Database warm-up" };

const LONDON = "Europe/London";

function londonTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", { timeZone: LONDON, hour: "2-digit", minute: "2-digit" });
}

function londonDateTime(date: Date | null): string {
  if (!date) return "Never";
  return date.toLocaleString("en-GB", {
    timeZone: LONDON,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function londonDay(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    timeZone: LONDON,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default async function DbWarmupPage() {
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

  const now = new Date();
  const [plan, status] = await Promise.all([computeWarmupPlan(now), readWarmupStatus()]);
  const { config, windows, noOpeningHours } = plan;
  const { days } = scheduleSpan(now);
  const weekStart =
    windows.length > 0 ? new Date(Math.min(now.getTime(), windows[0].start.getTime())) : now;
  const estimate = estimateWarmupCost(windows, config, weekStart);

  // Seven London days, each with its windows (a window can start the evening before, so match on
  // the London calendar day of the window's start).
  const dayRows = days.slice(0, 7).map((day) => {
    const label = londonDay(new Date(`${day}T12:00:00Z`));
    const own = windows.filter(
      (w) => w.start.toLocaleDateString("en-CA", { timeZone: LONDON }) === day,
    );
    return { day, label, own };
  });

  const lastSeen = [status.lastPing, status.lastActivity]
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const coldAt = lastSeen ? new Date(lastSeen.getTime() + NEON_SUSPEND_AFTER_MS) : null;

  return (
    <PageContainer width="standard">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">
            Platform Admin
          </span>
          <h1 className="text-2xl font-bold text-slate-900">Database warm-up</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Keeps this cell&apos;s database awake so shoppers don&apos;t wait for it to start. Neon
          suspends the database after 5 minutes with no query; while warm-up is on, the scheduler
          sends one tiny query every 4 minutes during the windows below, and after signed-in
          activity if that option is on. This setting applies to every store in this cell.
        </p>
      </div>

      {config.enabled && config.mode === "OPENING_HOURS" && noOpeningHours && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          No opening hours are set for any store in this cell, so no pings will run. Set them under{" "}
          <Link href="/staff/storefront" className="font-semibold underline">
            Storefront
          </Link>
          .
        </div>
      )}

      <section className="mb-8 rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Settings</h2>
        <DbWarmupForm
          initial={{
            enabled: config.enabled,
            mode: config.mode,
            activityEnabled: config.activityEnabled,
            activityMinutes: config.activityMinutes,
            leadMinutes: config.leadMinutes,
            customStart: config.customStart ?? "",
            customEnd: config.customEnd ?? "",
            computeUnits: (config.computeMilliUnits / 1000).toString(),
            pricePerCuHour: (config.priceMicroUsdPerCuHour / 1_000_000).toString(),
          }}
        />
        {config.updatedBy && config.updatedAt && (
          <p className="mt-4 text-xs text-slate-500">
            Last changed by {config.updatedBy}, {londonDateTime(config.updatedAt)}.
          </p>
        )}
      </section>

      <section className="mb-8 rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Status</h2>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Warm-up</dt>
            <dd className="font-semibold text-slate-900" data-warmup-state>
              {config.enabled ? "On" : "Off"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Last ping</dt>
            <dd className="font-semibold text-slate-900" data-last-ping>
              {londonDateTime(status.lastPing)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Last signed-in activity</dt>
            <dd className="font-semibold text-slate-900" data-last-activity>
              {londonDateTime(status.lastActivity)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Database expected to go cold at (approximate)</dt>
            <dd className="font-semibold text-slate-900" data-cold-at>
              {coldAt ? londonDateTime(coldAt) : "Unknown"}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          &ldquo;Go cold&rdquo; is the later of the last ping and the last signed-in request, plus
          Neon&apos;s 5 minutes. It is approximate: requests from shoppers who are not signed in are
          not recorded.
        </p>
      </section>

      <section className="mb-8 rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Next 7 days (London time)</h2>
        <table className="w-full text-sm" data-warmup-windows>
          <tbody>
            {dayRows.map((row) => (
              <tr key={row.day} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-4 font-medium text-slate-900">{row.label}</td>
                <td className="py-2 text-slate-700">
                  {row.own.length === 0
                    ? "None"
                    : row.own.map((w) => `${londonTime(w.start)}–${londonTime(w.end)}`).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {config.mode === "ALWAYS" && config.enabled && (
          <p className="mt-3 text-xs text-slate-500">Always on: pings run around the clock.</p>
        )}
      </section>

      <section
        className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm"
        data-warmup-estimate
      >
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Estimated cost (per month)</h2>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Scheduled windows</dt>
            <dd className="font-semibold text-slate-900">
              {estimate.cuHoursPerMonth.toFixed(1)} CU-hours, ${estimate.usdPerMonth.toFixed(2)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">For comparison: always on</dt>
            <dd className="font-semibold text-slate-900">
              {estimate.alwaysOnCuHoursPerMonth.toFixed(1)} CU-hours, $
              {estimate.alwaysOnUsdPerMonth.toFixed(2)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          An estimate, not a bill: window hours this week × 30.4/7 × the compute size above × the
          price above, plus Neon&apos;s 5-minute tail after each window. It covers scheduled windows
          only. Each signed-in session outside them adds its own length plus the activity minutes.
          Check the real figure in the Neon console.
        </p>
      </section>
    </PageContainer>
  );
}
