"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const COOKIE_NAME = "aheed_cookie_consent";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if consent cookie exists
    const hasConsent = document.cookie.split("; ").some((row) => row.startsWith(`${COOKIE_NAME}=`));
    if (!hasConsent) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsVisible(true);
    }
  }, []);

  const saveConsent = (value: "accepted" | "essential") => {
    document.cookie = `${COOKIE_NAME}=${value}; max-age=${ONE_YEAR_SECONDS}; path=/; SameSite=Lax; Secure`;
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <aside
      aria-label="Cookie Consent Banner"
      className="fixed bottom-0 inset-x-0 z-50 p-4 bg-white/95 backdrop-blur border-t border-black/10 shadow-lg text-primary transition-all duration-300"
    >
      <div className="mx-auto flex max-w-5xl flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="text-xs sm:text-sm text-primary/80 max-w-2xl leading-relaxed">
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
            className="rounded-lg border border-primary/20 bg-white px-3 py-1.5 text-xs font-semibold text-primary hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            Essential Only
          </button>
          <button
            type="button"
            onClick={() => saveConsent("accepted")}
            className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            Accept All
          </button>
        </div>
      </div>
    </aside>
  );
}
