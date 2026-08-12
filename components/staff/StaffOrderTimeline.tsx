import { formatOrderDateTime, type StaffTimelineEntry } from "@/lib/order-status";

/**
 * The staff view of an order's history (P6a, #158).
 *
 * The deliberate counterpart to components/orders/OrderTimeline, which renders
 * the CUSTOMER timeline and structurally cannot show a note — its entry type has
 * no such field and the repository never selects the column (P4a, #122). This
 * component takes a different type, from a different builder, fed by a different
 * repository method. The separation is the guarantee: an internal note reaching
 * a shopper's page would require someone to change three things, not to forget
 * one.
 *
 * Every event is shown, including consecutive repeats of the same status — for
 * staff that repetition is the diagnostic information, not noise.
 */
export function StaffOrderTimeline({ timeline }: { timeline: StaffTimelineEntry[] }) {
  if (timeline.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-black/10 bg-white p-5">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-primary">History</h2>
      <ol className="space-y-3">
        {timeline.map((entry, index) => {
          const isCurrent = index === timeline.length - 1;
          return (
            <li key={`${entry.status}-${entry.at.toISOString()}-${index}`} className="flex gap-3">
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
                <p className="text-xs text-primary/50">
                  {formatOrderDateTime(entry.at)}
                  {entry.actorName ? ` · ${entry.actorName}` : ""}
                </p>
                {entry.note && <p className="mt-1 text-xs text-primary/70">{entry.note}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
