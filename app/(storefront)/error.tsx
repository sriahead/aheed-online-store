"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/errors/ErrorPanel";

/**
 * The storefront's own boundary (#478) — the one a shopper actually hits.
 *
 * Sitting INSIDE `app/(storefront)/layout.tsx`, it renders within
 * `StorefrontChrome`, so a crashed product or checkout page still shows the
 * header, the footer and the navigation the shopper needs to get somewhere
 * else. That is what #459's plan promised of the root `app/error.tsx` and what
 * a root boundary structurally cannot deliver: the root layout renders
 * `{children}` and nothing else, so a boundary beside it unmounts the whole
 * route group, chrome included.
 *
 * It also keeps per-vendor branding. `brandStyle()` is applied on
 * `StorefrontChrome`'s wrapper (ADR-004 slice 4), which is still mounted above
 * this component — so SriMart's blue stays blue here, where on the root
 * boundary it would fall back to Aheed's green.
 *
 * `min-h-[60vh]` rather than the full viewport: the chrome is supplying the
 * rest of the page.
 */
export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Caught by storefront error boundary:", error);
  }, [error]);

  return (
    <ErrorPanel
      title="Something went wrong"
      message="We couldn't load this page. Trying again may help, or use the menu above to keep shopping."
      onRetry={reset}
      fullHeight={false}
    />
  );
}
