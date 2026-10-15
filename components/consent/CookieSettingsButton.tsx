"use client";

import { CONSENT_SETTINGS_OPEN_EVENT } from "@/lib/storage-keys";

/**
 * Reopens the consent banner so a shopper can change their answer (#1107). A button, not a link:
 * it navigates nowhere. Styling comes from the caller, so it can sit in the footer's link row and
 * in the privacy page's prose and match each.
 */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(CONSENT_SETTINGS_OPEN_EVENT))}
      className={className}
    >
      Cookie settings
    </button>
  );
}
