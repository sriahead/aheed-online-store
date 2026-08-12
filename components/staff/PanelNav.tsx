import Link from "next/link";
import { ClipboardList, LayoutDashboard, Sparkles, TicketPercent } from "lucide-react";

/**
 * The admin panel's navigation (P6a, #158).
 *
 * NOT an authorization boundary. It decides which links to *draw*; every page
 * behind it re-runs its own `requireVendorRole`, and the server actions behind
 * those pages re-check again (a server action is a public endpoint at a stable
 * id). Hiding a link a viewer cannot use is a courtesy to the packing floor, not
 * a gate — see `app/(admin)/layout.tsx`.
 */
export interface PanelNavProps {
  /** False for a viewer with no vendor staff/admin role: renders no links at all. */
  canSeeOrders: boolean;
  /** True only for a vendor ADMIN or a platform admin — the money-touching pages. */
  canSeeAdmin: boolean;
}

const LINK_CLASS =
  "inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-primary/70 hover:bg-surface-muted hover:text-primary";

export function PanelNav({ canSeeOrders, canSeeAdmin }: PanelNavProps) {
  if (!canSeeOrders) return null;

  return (
    <nav aria-label="Store admin" className="border-b border-black/10 bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-1 px-4 py-2">
        <Link href="/staff" className={LINK_CLASS}>
          <LayoutDashboard className="h-4 w-4" aria-hidden />
          Overview
        </Link>
        <Link href="/staff/orders" className={LINK_CLASS}>
          <ClipboardList className="h-4 w-4" aria-hidden />
          Orders
        </Link>
        {canSeeAdmin && (
          <>
            <Link href="/staff/loyalty" className={LINK_CLASS}>
              <Sparkles className="h-4 w-4" aria-hidden />
              Loyalty
            </Link>
            <Link href="/staff/discounts" className={LINK_CLASS}>
              <TicketPercent className="h-4 w-4" aria-hidden />
              Discounts
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
