"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a server-rendered page current without a reload (#1435 R22): `router.refresh()` re-runs
 * the page's server render with the viewer's existing access, so no new endpoint and no new
 * credential surface exist. Polling, not a push connection: a held-open connection on Workers costs
 * more and adds nothing an order page needs.
 *
 * Only while the tab is visible, so a background tab costs nothing; on coming back it refreshes at
 * once if a full interval has passed. Renders nothing.
 */
export function LiveRefresh({
  active,
  intervalMs = 45_000,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();
  const last = useRef(0);

  useEffect(() => {
    if (!active) return;
    last.current = Date.now();

    const refresh = () => {
      last.current = Date.now();
      router.refresh();
    };
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current >= intervalMs) {
        refresh();
      }
    };

    const id = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, intervalMs, router]);

  return null;
}
