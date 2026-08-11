import { orderStatusLabel } from "@/lib/order-status";

/**
 * The customer-facing status pill (P4a, #122). Tone comes from the status alone,
 * using semantic design tokens — never raw hex (design-system.md).
 */
const TONE: Record<string, string> = {
  PENDING_PAYMENT: "bg-accent-tint text-primary",
  CONFIRMED: "bg-action/10 text-action",
  OUT_FOR_DELIVERY: "bg-accent-tint text-primary",
  DELIVERED: "bg-action/10 text-action",
  CANCELLED: "bg-danger-tint text-danger",
};

const DEFAULT_TONE = "bg-surface-muted text-primary";

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
        TONE[status] ?? DEFAULT_TONE
      }`}
    >
      {orderStatusLabel(status)}
    </span>
  );
}
