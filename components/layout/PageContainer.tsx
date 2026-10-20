import type { ReactNode } from "react";

/**
 * The one page-level width container (#1180).
 *
 * Before this existed, each of the ~60 pages chose its own `max-width` while every chrome element
 * above them was `max-w-7xl` — `Header`'s three rows and, since #1177, `PanelNav`. The admin hub
 * was `max-w-5xl` under a `max-w-7xl` nav, so the nav's first tab and the page heading started
 * 128px apart; the admin's table pages ran as narrow as `max-w-2xl` (672px). `app/layout.tsx` still
 * declines to constrain width, deliberately — the constraint lives HERE, not in a layout, because
 * a layout cannot vary per page and a per-page literal is what drifted.
 *
 * ALL THREE WIDTHS SHARE `mx-auto w-full px-4`. That shared gutter — not the `max-width` — is what
 * actually fixes alignment: a `narrow` page still lines up with the header, it just stops sooner.
 *
 * `width` IS REQUIRED AND HAS NO DEFAULT, on purpose. A default is how a page silently inherits a
 * width nobody chose, which is the drift this component exists to end. `tsc` rejects an omission.
 *
 * `className` APPENDS; IT CANNOT OVERRIDE. This repo has no `clsx` and no `tailwind-merge`, so two
 * competing `max-w-*` classes would resolve by stylesheet source order rather than by intent —
 * silently, and differently per build. `tests/page-container.test.ts` rejects `max-w-`, `mx-auto`
 * and `px-` in this prop. Non-layout extras (`text-primary`, `space-y-8`) are fine.
 *
 * Vertical padding is preserved from each page rather than standardised: vertical rhythm was not
 * what was misaligned, and moving it would shift the shopper's browse pages for no stated reason.
 */
export type PageWidth = "wide" | "standard" | "narrow";
export type PagePadY = "default" | "tight";

/** Matches the chrome (`wide`), then two readable steps down. See `specs/design-system.md`. */
const WIDTH_CLASS: Record<PageWidth, string> = {
  wide: "max-w-7xl",
  standard: "max-w-5xl",
  narrow: "max-w-2xl",
};

const PAD_Y_CLASS: Record<PagePadY, string> = {
  default: "py-8",
  tight: "py-6",
};

export interface PageContainerProps {
  width: PageWidth;
  padY?: PagePadY;
  /** Appended after the layout classes. Must not contain `max-w-`, `mx-auto` or `px-`. */
  className?: string;
  children: ReactNode;
}

/**
 * Renders the page's `<main>` landmark. Neither route-group layout renders one
 * (`app/(admin)/layout.tsx` and `components/layout/StorefrontChrome.tsx` both render a plain
 * `div`), so the page owns it and there is exactly one per rendered page.
 */
export function PageContainer({
  width,
  padY = "default",
  className,
  children,
}: PageContainerProps) {
  const classes = `mx-auto w-full px-4 ${WIDTH_CLASS[width]} ${PAD_Y_CLASS[padY]}`;

  return <main className={className ? `${classes} ${className}` : classes}>{children}</main>;
}
