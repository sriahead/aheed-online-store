"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "../api-client";
import { signedInPath } from "../signed-in-path";

/**
 * Shared by /login and /register — Better Auth's social sign-in creates an
 * account on first use, so both pages need the same control, not two.
 * Returns through `/signed-in`, which lands each role on its own home (#1319).
 */
export function GoogleSignInButton({ next }: { next?: string } = {}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function handleClick() {
    setError(null);
    setSubmitting(true);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // Safety fallback: if browser has not navigated away after 8s, unlock button
    timeoutRef.current = setTimeout(() => {
      setSubmitting(false);
    }, 8000);

    try {
      const errorTarget = `/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;
      const res = await signIn.social({
        provider: "google",
        callbackURL: signedInPath(next),
        errorCallbackURL: errorTarget,
      });

      if (res?.error) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setSubmitting(false);
        setError(res.error.message ?? "Google sign-in failed. Please try again.");
        return;
      }

      // Explicitly trigger navigation if the auth URL was returned
      if (res?.data?.url) {
        window.location.assign(res.data.url);
        return;
      }
    } catch (err: unknown) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setSubmitting(false);
      const message =
        err instanceof Error ? err.message : "Failed to initiate Google sign-in. Please try again.";
      setError(message);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="rounded-full border border-black/20 px-4 py-2 font-semibold text-primary disabled:opacity-50"
      >
        {submitting ? "Redirecting…" : "Continue with Google"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
