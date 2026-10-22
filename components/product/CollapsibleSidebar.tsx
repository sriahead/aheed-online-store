"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { FILTERS_COLLAPSED_ATTRIBUTE, setFiltersCollapsed } from "./filters-collapsed";
import { Icon } from "@/components/icons/Icon";

/**
 * #1173 — the browse/filter column on `/search` and `/categories/[slug]`, collapsible at `md` and
 * up so the results get the room (and, via `app/globals.css`, one more product column).
 *
 * A PROGRESSIVE ENHANCEMENT over the always-open sidebar, never a replacement (#568,
 * `specs/design-system.md` "Disclosure surfaces"): the toggle buttons render only after hydration,
 * so with JavaScript off there is no dead control and the column is simply open. Below `md` none of
 * this applies; the filters stay in `FilterPanel`'s native `details` and Browse stays visible.
 *
 * The collapsed state lives on `<html>` (set before paint by `FILTERS_COLLAPSED_SCRIPT`), so CSS
 * shows the right layout from the first frame and this component only reads and flips it. Focus
 * moves to the counterpart button after each toggle, because the pressed one disappears.
 */
export function CollapsibleSidebar({ id, children }: { id: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const focusAfterToggle = useRef(false);
  const hideRef = useRef<HTMLButtonElement>(null);
  const showRef = useRef<HTMLButtonElement>(null);

  // Mount-time read of browser-only state: reading `<html>` during render would differ between the
  // server and the first client render (a hydration mismatch), and rendering the buttons only after
  // mount is the point (no dead control without JavaScript). Same pattern as `CookieBanner`.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(document.documentElement.hasAttribute(FILTERS_COLLAPSED_ATTRIBUTE));
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!focusAfterToggle.current) return;
    focusAfterToggle.current = false;
    (collapsed ? showRef : hideRef).current?.focus();
  }, [collapsed]);

  const toggle = (next: boolean) => {
    setFiltersCollapsed(next);
    focusAfterToggle.current = true;
    setCollapsed(next);
  };

  return (
    <div data-filters-sidebar="" className="filters-sidebar md:shrink-0">
      {mounted && !collapsed && (
        <button
          ref={hideRef}
          type="button"
          onClick={() => toggle(true)}
          aria-expanded="true"
          aria-controls={id}
          className="filters-sidebar-hide mb-3 hidden items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:bg-action-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action md:inline-flex"
        >
          <Icon name="panel-left-close" className="h-4 w-4" />
          Hide filters
        </button>
      )}
      {mounted && collapsed && (
        <button
          ref={showRef}
          type="button"
          onClick={() => toggle(false)}
          aria-expanded="false"
          aria-controls={id}
          aria-label="Show filters"
          title="Show filters"
          className="filters-sidebar-show hidden size-tap flex-col items-center justify-center gap-0.5 rounded-xl border border-black/10 bg-white text-primary shadow-sm hover:bg-action-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action md:flex"
        >
          <Icon name="panel-left-open" className="h-4 w-4" />
          <Icon name="sliders-horizontal" className="h-3 w-3 text-primary-muted" />
        </button>
      )}
      <div id={id} data-filters-content="">
        {children}
      </div>
    </div>
  );
}
