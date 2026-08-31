"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/errors/ErrorPanel";

/**
 * The staff portal's boundary (#478), the `(admin)` counterpart to
 * `app/(storefront)/error.tsx`.
 *
 * Rendering inside `app/(admin)/layout.tsx` keeps the portal `Header` and
 * `PanelNav` mounted, so a crashed `/staff/*` page leaves a member of staff
 * able to navigate to another panel instead of stranding them on a bare page.
 * `brandStyle()` is applied on that layout's wrapper, so this keeps the
 * vendor's branding for the same reason the storefront one does.
 *
 * This is a CRASH boundary, not an authorization refusal. A page refusing a
 * signed-in non-staff user must still render `<PanelRefusal>` from its own
 * `requireVendorRole(...)` branch — see CLAUDE.md's staff-panel section. Never
 * let a refusal reach here by throwing.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Caught by staff portal error boundary:", error);
  }, [error]);

  return (
    <ErrorPanel
      title="Something went wrong"
      message="We couldn't load this panel. Trying again may help; if it keeps happening, please report it."
      onRetry={reset}
      fullHeight={false}
    />
  );
}
