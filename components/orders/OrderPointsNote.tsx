import { Sparkles } from "lucide-react";

/**
 * What an order says about loyalty points earned (P7.5b, #138).
 *
 * Separate from `OrderItemsCard` on purpose. That card is shared with
 * `/staff/orders/{n}`, and points earned are a fact about a CUSTOMER's loyalty
 * account rather than about the order's money — staff have no reason to see it,
 * and folding it into the money block would put it there automatically.
 *
 * The figure is never predicted. `earnPoints` writes the EARN ledger row inside
 * `confirmPayment`'s transaction, so `pointsEarned` is non-null exactly when the
 * award has actually happened; before that there is nothing true to show a
 * number for. A forward-looking estimate was considered and rejected: the tier
 * multiplier is resolved from a windowed spend query and snapshotted onto the
 * EARN row precisely because it moves, so an estimate computed outside that
 * write path can legitimately disagree with what lands.
 */
export function OrderPointsNote({
  status,
  pointsEarned,
  hasAccount,
}: {
  status: string;
  /** Null = no EARN row yet (unpaid, or a guest order). Never rendered as "0". */
  pointsEarned: number | null;
  /** False for a guest order — a guest earns nothing, so promise nothing. */
  hasAccount: boolean;
}) {
  // A cancelled order earns nothing, and its compensation deliberately does not
  // reverse an earn (releaseOrder only ever acts on PENDING_PAYMENT, strictly
  // before confirmPayment). Guarding on status rather than on the data being
  // absent keeps that independent of how the row got there.
  if (status === "CANCELLED") return null;
  if (!hasAccount) return null;

  if (pointsEarned !== null && pointsEarned > 0) {
    return (
      <p className="mb-5 flex items-center gap-2 rounded-2xl bg-action-tint px-4 py-3 text-sm text-primary">
        <Sparkles className="h-4 w-4 shrink-0 text-action" aria-hidden />
        <span>
          You earned <span className="font-bold">{pointsEarned}</span> points on this order.
        </span>
      </p>
    );
  }

  if (status === "PENDING_PAYMENT") {
    return (
      <p className="mb-5 flex items-center gap-2 rounded-2xl bg-surface-muted px-4 py-3 text-sm text-primary/80">
        <Sparkles className="h-4 w-4 shrink-0 text-primary/50" aria-hidden />
        {/* Deliberately carries no number — see the component note. */}
        <span>Your loyalty points are added once payment clears.</span>
      </p>
    );
  }

  return null;
}
