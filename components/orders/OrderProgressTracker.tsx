import { formatOrderDateTime, type TimelineEntry } from "@/lib/order-status";
import { nextStepText, slotSentence } from "@/lib/order-notifications/next-step";

/**
 * The order's progress, every step of its own path shown — including the ones still to come
 * (#1435 R20). It replaces `OrderTimeline` (P4a, #122), which listed only what had already
 * happened, and the lookup page's hand-rolled stepper, which was delivery-only.
 *
 * Why every step: seeing how far along an order is, and how little is left, is what makes the wait
 * feel shorter (goal-gradient / Zeigarnik). The "what happens next" line underneath comes from the
 * same module as the customer emails (`lib/order-notifications/next-step.ts`), so the page and the
 * email never disagree. Calm on purpose: colour marks the current step, and the only motion is
 * `motion-safe:`, so a reduced-motion setting turns it off.
 *
 * Built from `status` and the timeline only — a staff note can never reach it (see buildTimeline).
 */

type Method = "DELIVERY" | "COLLECTION";

const STEPS: Record<Method, { status: string; label: string }[]> = {
  DELIVERY: [
    { status: "CONFIRMED", label: "Order confirmed" },
    { status: "OUT_FOR_DELIVERY", label: "Out for delivery" },
    { status: "DELIVERED", label: "Delivered" },
  ],
  COLLECTION: [
    { status: "CONFIRMED", label: "Order confirmed" },
    { status: "READY_FOR_COLLECTION", label: "Ready for collection" },
    { status: "COLLECTED", label: "Collected" },
  ],
};

export interface OrderProgressTrackerProps {
  orderNumber: string;
  status: string;
  fulfilmentMethod: Method;
  timeline: TimelineEntry[];
  slotLabel: string | null;
}

function latestAt(timeline: TimelineEntry[], status: string): Date | null {
  const matches = timeline.filter((entry) => entry.status === status);
  return matches.length > 0 ? matches[matches.length - 1].at : null;
}

export function OrderProgressTracker({
  orderNumber,
  status,
  fulfilmentMethod,
  timeline,
  slotLabel,
}: OrderProgressTrackerProps) {
  const next = nextStepText(status, fulfilmentMethod, orderNumber);
  const slot = slotSentence(status, fulfilmentMethod, slotLabel);

  if (status === "CANCELLED") {
    const at = latestAt(timeline, "CANCELLED");
    return (
      <section className="mb-6 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-primary">Progress</h2>
        <div aria-live="polite">
          <p className="text-sm font-bold text-danger" data-state="cancelled">
            Order cancelled
          </p>
        </div>
        {at && <p className="text-xs text-primary-muted">{formatOrderDateTime(at)}</p>}
        {next && <p className="mt-3 text-sm text-primary-muted">{next}</p>}
      </section>
    );
  }

  const steps = STEPS[fulfilmentMethod];
  const index = steps.findIndex((step) => step.status === status);
  // PENDING_PAYMENT (or a status this build does not know) sits on the first step.
  const currentIndex = index === -1 ? 0 : index;
  const pending = status === "PENDING_PAYMENT";

  return (
    <section className="mb-6 rounded-2xl border border-black/10 bg-white p-5">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-primary">Progress</h2>
      <ol className="space-y-3">
        {steps.map((step, i) => {
          const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
          const isCurrent = state === "current";
          const label = isCurrent && pending ? "Confirming payment" : step.label;
          // A reached step shows when it happened; an unpaid order's first step has not happened.
          const at = state === "upcoming" || pending ? null : latestAt(timeline, step.status);
          return (
            <li
              key={step.status}
              data-state={state}
              aria-current={isCurrent ? "step" : undefined}
              className="flex gap-3"
            >
              <span
                aria-hidden
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full motion-safe:transition-colors ${
                  isCurrent ? "bg-action" : state === "done" ? "bg-primary" : "bg-primary/25"
                }`}
              />
              <div className="min-w-0">
                {isCurrent ? (
                  <div aria-live="polite">
                    <p className="text-sm font-bold text-primary">{label}</p>
                  </div>
                ) : (
                  <p
                    className={`text-sm ${state === "done" ? "text-primary" : "text-primary-muted"}`}
                  >
                    {label}
                  </p>
                )}
                {at && <p className="text-xs text-primary-muted">{formatOrderDateTime(at)}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {next && (
        <p className="mt-4 rounded-xl bg-accent-tint px-4 py-3 text-sm text-primary">
          <span className="font-bold">What happens next: </span>
          {next}
          {slot && ` ${slot}`}
        </p>
      )}
    </section>
  );
}
