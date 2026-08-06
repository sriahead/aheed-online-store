"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "../api-client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error: signInError } = await signIn.email({ email, password });
    setSubmitting(false);

    if (signInError) {
      setError(signInError.message ?? "Sign in failed. Check your email and password.");
      return;
    }
    router.push("/account");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-primary">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-sm border border-black/20 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-primary">Password</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-sm border border-black/20 px-3 py-2"
        />
      </label>
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
        {submitting ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-sm">
        <a href="/forgot-password" className="text-primary underline">
          Forgot your password?
        </a>
      </p>
      <p className="text-sm">
        No account?{" "}
        <a href="/register" className="text-primary underline">
          Register
        </a>
      </p>
    </form>
  );
}
