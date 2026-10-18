"use client";

import { useState } from "react";
import { signUp } from "../api-client";
import { MARKETING_OPT_IN_FIELD } from "@/lib/marketing-consent";

/**
 * `marketingStatement` is the store's marketing-consent sentence when its switch is on, else
 * `null` (#1134). Required so no caller can silently drop the choice. The checkbox is unticked and
 * optional: consent must be a separate, positive act, never a condition of creating an account.
 */
export function RegisterForm({ marketingStatement }: { marketingStatement: string | null }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Better Auth passes extra body keys through to the user-create hook without storing them on
    // the user; the flag is sent only when the box is ticked and the store asks.
    const { error: signUpError } = await signUp.email({
      name,
      email,
      password,
      ...(marketingStatement !== null && marketingOptIn ? { [MARKETING_OPT_IN_FIELD]: true } : {}),
    });
    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message ?? "Registration failed. Check your details and try again.");
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <p className="rounded-2xl border border-black/10 bg-surface-muted p-5">
        Check <strong>{email}</strong> for a verification link before signing in.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-primary">Name</span>
        <input
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-black/20 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-primary">Email</span>
        <input
          autoComplete="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-black/20 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-primary">Password</span>
        <input
          autoComplete="new-password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-black/20 px-3 py-2"
        />
      </label>
      {marketingStatement !== null && (
        <label className="flex items-start gap-2 text-sm text-primary">
          <input
            type="checkbox"
            name={MARKETING_OPT_IN_FIELD}
            checked={marketingOptIn}
            onChange={(e) => setMarketingOptIn(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>{marketingStatement}</span>
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-action px-4 py-2 font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Creating account…" : "Create account"}
      </button>
      <p className="text-sm">
        Already have an account?{" "}
        <a href="/login" className="text-primary underline">
          Sign in
        </a>
      </p>
    </form>
  );
}
