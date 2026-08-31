"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/errors/ErrorPanel";

/**
 * The outer in-layout fallback (#459, corrected in #478).
 *
 * This is NOT the boundary most page crashes reach. `app/(storefront)/error.tsx`
 * and `app/(admin)/error.tsx` sit closer to their pages and keep the surrounding
 * chrome; this one catches what they structurally cannot — a throw from a route
 * group's own layout (e.g. `getCurrentVendorProfile()` failing in
 * `app/(storefront)/layout.tsx`), since a boundary inside a layout cannot catch
 * that layout's own error.
 *
 * So by the time this renders, the chrome genuinely could not be built, and the
 * copy says so rather than pretending otherwise. #459's plan claimed this file
 * rendered "inside the existing root layout, meaning the site navigation, header
 * and footer will still be visible" — `app/layout.tsx` renders `{children}` and
 * nothing else, so that was never true of any version of this file.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Caught by root error boundary:", error);
  }, [error]);

  return (
    <ErrorPanel
      title="Something went wrong"
      message="We couldn't load this page. Trying again may help; if it keeps happening, please contact support."
      onRetry={reset}
    />
  );
}
