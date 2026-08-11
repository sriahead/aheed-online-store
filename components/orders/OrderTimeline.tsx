import { formatOrderDateTime, type TimelineEntry } from "@/lib/order-status";

/**
 * The order's status history (P4a, #122), built by lib/order-status.ts's
 * buildTimeline. It renders labels derived from `status` — OrderStatusEvent.note
 * is never selected by the repository and has no field on TimelineEntry, so a
 * staff note written in P4b cannot reach this page.
 */
export function OrderTimeline({ timeline }: { timeline: TimelineEntry[] }) {
  if (timeline.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-black/10 bg-white p-5">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-primary">Progress</h2>
      <ol className="space-y-3">
        {timeline.map((entry, index) => {
          const isCurrent = index === timeline.length - 1;
          return (
            <li key={`${entry.status}-${entry.at.toISOString()}`} className="flex gap-3">
              <span
                aria-hidden
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                  isCurrent ? "bg-action" : "bg-primary/25"
                }`}
              />
              <div className="min-w-0">
                <p
                  className={`text-sm ${isCurrent ? "font-bold text-primary" : "text-primary/70"}`}
                >
                  {entry.label}
                </p>
                <p className="text-xs text-primary/50">{formatOrderDateTime(entry.at)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
