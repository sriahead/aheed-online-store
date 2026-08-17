import Link from "next/link";
import { Store } from "lucide-react";
import { TierToggle } from "./TierToggle";

export function PortalHeader({
  profileName,
  localityName,
  canSeeAdmin,
  currentTier,
}: {
  profileName: string;
  localityName: string;
  canSeeAdmin: boolean;
  currentTier: "staff" | "admin";
}) {
  return (
    <header className="bg-[#0d1b2a] text-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2e7d32] text-white">
            <Store className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <Link
                href="/staff"
                className="text-xl font-bold hover:text-white/80 transition-colors"
              >
                {profileName} Operations Portal
              </Link>
              {currentTier === "staff" && (
                <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-xs font-bold text-black tracking-wide">
                  STAFF TIER (SHOP-FLOOR)
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-white/60">
              One surface, role-gated capabilities for {localityName} shop-floor and inventory
              management.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <TierToggle initialTier={currentTier} canSeeAdmin={canSeeAdmin} />
          {!canSeeAdmin && (
            <Link
              href="/"
              className="text-sm font-semibold text-white/70 hover:text-white transition-colors"
            >
              View store
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
