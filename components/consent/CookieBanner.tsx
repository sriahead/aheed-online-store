"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  browserCookieJar,
  CONSENT_CHANGE_EVENT,
  CONSENT_COOKIE,
  expireBrowserCookie,
  isConsentValue,
  LEGACY_CONSENT_COOKIE,
  type ConsentValue,
} from "@/lib/storage-keys";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

function writeConsent(value: ConsentValue) {
  document.cookie = `${CONSENT_COOKIE}=${value}; max-age=${ONE_YEAR_SECONDS}; path=/; SameSite=Lax; Secure`;
}

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const jar = browserCookieJar();
    if (jar.get(CONSENT_COOKIE)) return;

    // #1080 — a choice made under the legacy name is carried across, so the rename does not ask
    // anyone again. The new cookie gets a full year: a page script cannot read how long the old
    // one had left. An unrecognised legacy value is no answer, so the banner shows.
    const legacy = jar.get(LEGACY_CONSENT_COOKIE)?.value;
    if (legacy !== undefined) expireBrowserCookie(LEGACY_CONSENT_COOKIE);
    if (isConsentValue(legacy)) {
      writeConsent(legacy);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsVisible(true);
  }, []);

  const saveConsent = (value: ConsentValue) => {
    writeConsent(value);
    setIsVisible(false);
    // #1065 — RewardsLauncher holds a `?ref=` code in memory until this reports `accepted`.
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: { value } }));
  };

  if (!isVisible) return null;

  return (
    <aside
      aria-label="Cookie Consent Banner"
      className="fixed bottom-0 inset-x-0 z-50 p-4 bg-white/95 backdrop-blur border-t border-black/10 shadow-lg text-primary transition duration-300"
    >
      <div className="mx-auto flex max-w-5xl flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="text-xs sm:text-sm text-primary-muted max-w-2xl leading-relaxed">
          <p className="font-semibold text-primary mb-1">We value your privacy</p>
          We use essential cookies to manage your cart, authentication, and store preferences.
          Optional cookies help us improve site experience. Read our{" "}
          <Link
            href="/privacy"
            className="font-medium underline underline-offset-2 hover:text-primary"
          >
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link
            href="/terms"
            className="font-medium underline underline-offset-2 hover:text-primary"
          >
            Terms of Service
          </Link>
          .
        </div>
        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={() => saveConsent("essential")}
            className="rounded-lg border border-primary/20 bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            Essential Only
          </button>
          <button
            type="button"
            onClick={() => saveConsent("accepted")}
            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            Accept All
          </button>
        </div>
      </div>
    </aside>
  );
}
