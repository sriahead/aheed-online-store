"use client";

import { useState } from "react";
import { signIn } from "../api-client";

/**
 * Shared by /login and /register — Better Auth's social sign-in creates an
 * account on first use, so both pages need the same control, not two.
 */
export function GoogleSignInButton() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setError(null);
    setSubmitting(true);

    const { error: signInError } = await signIn.social({
      provider: "google",
      callbackURL: "/account",
    });
    setSubmitting(false);

    if (signInError) {
      setError(signInError.message ?? "Google sign-in failed. Please try again.");
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
