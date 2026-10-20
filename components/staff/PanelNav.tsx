"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LayoutDashboard } from "lucide-react";
import { visibleGroups, type StaffNavGroup, type StaffNavTier } from "./nav-items";

export interface PanelNavProps {
  canSeeOrders: boolean;
  currentTier: StaffNavTier;
}

/** Exact match for the overview, prefix match elsewhere so /staff/orders/123 stays active. */
function isRouteActive(href: string, pathname: string): boolean {
  return href === "/staff" ? pathname === href : pathname.startsWith(href);
}

/**
 * The persistent admin-panel nav (#1177).
 *
 * IT NO LONGER OWNS THE LIST. Every destination comes from `components/staff/nav-items.ts`, which
 * the hub at `app/(admin)/staff/page.tsx` renders from too. Before #1177 these were two
 * hand-maintained flat lists — 25 links for an admin, 13 for staff — and keeping them in agreement
 * was a thing a test had to police rather than a property of the code; it failed twice (#612,
 * #626). Add a page in the module, not here. `tests/staff-nav-parity.test.ts` fails if this file
 * carries a `/staff/*` href of its own; `/staff` below is the one allowed exception.
 *
 * THE CLOSED PANELS ARE HIDDEN, NOT UNMOUNTED, and that is load-bearing rather than incidental:
 * it keeps the full destination set readable from a single `curl` of any panel page, so "no route
 * became unreachable" is checkable without driving a browser (spec R6).
 */
export function PanelNav({ canSeeOrders, currentTier }: PanelNavProps) {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const close = useCallback(() => setOpenGroup(null), []);

  /**
   * Close on navigation.
   *
   * `openGroup` is DELIBERATELY not a dependency. Listing it would re-run this effect the moment a
   * group opened and close it again immediately — the standing rule in `CLAUDE.md` (React &
   * Next.js Hooks), and the defect class behind #1144. `close` is stable via `useCallback`, so the
   * effect genuinely depends on `pathname` alone.
   *
   * `react-hooks/set-state-in-effect` is silenced rather than satisfied, which `CLAUDE.md`
   * prescribes for exactly this case: closing on navigation IS synchronising React state to an
   * external change (the URL), and the alternatives the rule suggests — closing in each link's
   * onClick, or keying the state off the pathname — either miss a navigation the nav did not
   * originate (browser back, a redirect, a link elsewhere on the page) or reintroduce the
   * re-render loop the dependency note above is about.
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see the note above
    close();
  }, [pathname, close]);

  // Dismissal: a pointer outside the nav, or Escape (which returns focus to the trigger).
  useEffect(() => {
    if (!openGroup) return;

    function onPointerDown(event: PointerEvent) {
      if (!navRef.current?.contains(event.target as Node)) {
        setOpenGroup(null);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenGroup((current) => {
        if (current) triggerRefs.current[current]?.focus();
        return null;
      });
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openGroup]);

  // Every hook runs before this: a conditional return above them would break the rules of hooks.
  if (!canSeeOrders) return null;

  const groups = visibleGroups(currentTier);

  return (
    <nav aria-label="Store admin" className="w-full border-b border-black/10 bg-white shadow-sm">
      <div className="relative mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-4">
        <Link
          href="/staff"
          className={`inline-flex items-center gap-2 border-b-2 px-1 pb-3 pt-4 text-sm font-bold transition-colors ${
            pathname === "/staff"
              ? "border-primary text-primary"
              : "border-transparent text-black/60 hover:border-black/20 hover:text-black/80"
          }`}
        >
          <LayoutDashboard className="h-4 w-4" aria-hidden />
          Overview
        </Link>

        {groups.map((group: StaffNavGroup) => {
          const isOpen = openGroup === group.id;
          const hasActiveRoute = group.items.some((item) => isRouteActive(item.href, pathname));
          const panelId = `panel-nav-${group.id}`;

          return (
            <div key={group.id} className="relative">
              <button
                type="button"
                ref={(node) => {
                  triggerRefs.current[group.id] = node;
                }}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenGroup(isOpen ? null : group.id)}
                className={`inline-flex items-center gap-2 border-b-2 px-1 pb-3 pt-4 text-sm font-bold transition-colors ${
                  hasActiveRoute || isOpen
                    ? "border-primary text-primary"
                    : "border-transparent text-black/60 hover:border-black/20 hover:text-black/80"
                }`}
              >
                {group.label}
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>

              <div
                id={panelId}
                hidden={!isOpen}
                className="absolute left-0 top-full z-20 mt-1 w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-black/10 bg-white py-2 shadow-lg"
              >
                <ul>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isRouteActive(item.href, pathname);

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-black/5 ${
                            active ? "font-bold text-primary" : "text-black/70"
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
