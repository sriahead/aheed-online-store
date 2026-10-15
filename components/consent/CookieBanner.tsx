"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  browserCookieJar,
  CONSENT_CHANGE_EVENT,
  CONSENT_COOKIE,
  CONSENT_SETTINGS_OPEN_EVENT,
  expireBrowserCookie,
  isConsentValue,
  LEGACY_CONSENT_COOKIE,
  LEGACY_REFERRAL_COOKIE,
  readBrowserConsent,
  REFERRAL_COOKIE,
  type ConsentValue,
} from "@/lib/storage-keys";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

function writeConsent(value: ConsentValue) {
  document.cookie = `${CONSENT_COOKIE}=${value}; max-age=${ONE_YEAR_SECONDS}; path=/; SameSite=Lax; Secure`;
}

const CHOICE_LABELS: Record<ConsentValue, string> = {
  essential: "Essential Only",
  accepted: "Accept All",
};

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);
  // #1107 — the stored choice, set only when "Cookie settings" reopens the banner, so a first
  // visit shows no "current choice" line.
  const [currentChoice, setCurrentChoice] = useState<ConsentValue | null>(null);
  const [reopened, setReopened] = useState(false);
  const essentialButton = useRef<HTMLButtonElement>(null);

  // #1107 — always listening, unlike the first-visit check below: a shopper who has answered can
  // still change their answer from the footer or the privacy page.
  useEffect(() => {
    const onOpen = () => {
      setCurrentChoice(readBrowserConsent());
      setReopened(true);
      setIsVisible(true);
    };
    window.addEventListener(CONSENT_SETTINGS_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONSENT_SETTINGS_OPEN_EVENT, onOpen);
  }, []);

  // A reopen is the shopper's own request, so focus goes to the choice. A first-visit banner
  // appears unasked and must not take focus from the page.
  useEffect(() => {
    if (isVisible && reopened) essentialButton.current?.focus();
  }, [isVisible, reopened]);

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
    // #1107 — cleared here, not only in RewardsLauncher: that component renders only for a
    // loyalty-on vendor and stops listening once a choice is stored, so a later switch from
    // Accept All to Essential Only through "Cookie settings" would otherwise keep the cookie.
    if (value === "essential") {
      expireBrowserCookie(REFERRAL_COOKIE);
      expireBrowserCookie(LEGACY_REFERRAL_COOKIE);
    }
    setIsVisible(false);
    setReopened(false);
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
          {/* #1107 — the only optional storage is the referral cookie (#1065); nothing measures or
              "improves site experience", so the banner no longer says so. */}
          We use essential cookies and browser storage to keep you signed in, hold your basket, and
          remember your delivery choice and checkout details. One optional cookie remembers a
          referral code from a link you followed, and it is set only if you choose Accept All. Read
          our{" "}
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
          {currentChoice && (
            <p className="mt-1 font-medium text-primary">
              Your current choice: {CHOICE_LABELS[currentChoice]}.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            ref={essentialButton}
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
