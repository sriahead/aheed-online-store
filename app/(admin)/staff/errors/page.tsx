import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getRecentErrorEvents } from "@/lib/error-events-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Error Events" };

const LIMIT = 50;

export default async function ErrorEventsPage() {
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
  // #508 — a per-vendor store admin also satisfies requireVendorRole("ADMIN"), but a stack
  // trace can reveal internal file paths and implementation details a vendor-scoped account
  // has no reason to see. Only a platform admin (User.role === "ADMIN", via "platform-admin")
  // gets past this.
  if (auth.via !== "platform-admin") {
    return (
      <PanelRefusal
        title="Platform admin only"
        message="This area is restricted to platform administrators."
      />
    );
  }

  const events = await getRecentErrorEvents(LIMIT);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-semibold text-primary">Error Events</h1>
      <p className="mb-6 text-sm text-primary/70">
        The most recent {LIMIT} server-side errors, newest first. Independent of Cloudflare Workers
        Logs.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white shadow-sm">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-[#f5f5f0] text-primary">
            <tr>
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Method</th>
              <th className="px-4 py-3 font-semibold">Path</th>
              <th className="px-4 py-3 font-semibold">Router</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Message</th>
              <th className="px-4 py-3 font-semibold">Digest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10">
            {events.map((event) => (
              <tr key={event.id} className="hover:bg-black/5 align-top">
                <td className="px-4 py-3 whitespace-nowrap text-primary/60">
                  {event.createdAt.toLocaleString("en-GB")}
                </td>
                <td className="px-4 py-3 text-primary/80">{event.method}</td>
                <td className="px-4 py-3 whitespace-normal text-primary">{event.path}</td>
                <td className="px-4 py-3 text-primary/60">{event.routerKind}</td>
                <td className="px-4 py-3 text-primary/60">{event.routeType}</td>
                <td className="px-4 py-3 max-w-md whitespace-normal text-primary">
                  {event.message}
                </td>
                <td className="px-4 py-3 text-primary/60">{event.digest ?? "—"}</td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-primary/60">
                  No error events recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
