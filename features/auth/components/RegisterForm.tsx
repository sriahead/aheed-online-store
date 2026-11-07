"use client";

import { useId, useMemo, useState } from "react";
import { signUp, sendVerificationEmail } from "../api-client";
import { signedInPath } from "../signed-in-path";
import { MARKETING_OPT_IN_FIELD } from "@/lib/marketing-consent";
import { evaluatePassword, PASSWORD_RULES } from "../password-validation";
import { Icon } from "@/components/icons/Icon";

/**
 * `marketingStatement` is the store's marketing-consent sentence when its switch is on, else
 * `null` (#1134). Required so no caller can silently drop the choice. The checkbox is unticked and
 * optional: consent must be a separate, positive act, never a condition of creating an account.
 */
export function RegisterForm({
  marketingStatement,
  next,
}: {
  marketingStatement: string | null;
  next?: string;
}) {
  const formId = useId();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);

  const evaluation = useMemo(() => evaluatePassword(password), [password]);

  const passwordsMatch = useMemo(
    () => confirmPassword.length > 0 && password === confirmPassword,
    [password, confirmPassword],
  );

  const hasMismatch = useMemo(
    () => confirmTouched && confirmPassword.length > 0 && password !== confirmPassword,
    [confirmTouched, password, confirmPassword],
  );

  const canSubmit = evaluation.allMet && passwordsMatch && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!evaluation.allMet) {
      setError("Please ensure your password meets all requirements below.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter your password to confirm.");
      return;
    }

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

  async function handleResend() {
    setResending(true);
    setResendStatus(null);
    try {
      const { error: resendError } = await sendVerificationEmail({
        email,
        callbackURL: signedInPath(next),
      });
      if (resendError) {
        setResendSuccess(false);
        setResendStatus(
          resendError.message ?? "Failed to resend verification email. Please try again.",
        );
      } else {
        setResendSuccess(true);
        setResendStatus("Verification email sent! Please check your inbox and spam folder.");
      }
    } catch {
      setResendSuccess(false);
      setResendStatus("Failed to resend verification email. Please try again.");
    } finally {
      setResending(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-black/10 bg-surface-muted p-6 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-action/10 text-action">
          <Icon name="check" className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-primary">Verify your email</h2>
          <p className="text-sm text-primary">
            Check <strong>{email}</strong> for a verification link before signing in.
          </p>
        </div>

        {resendStatus && (
          <p
            role="status"
            className={`text-xs font-medium p-2.5 rounded-lg ${
              resendSuccess
                ? "bg-action/10 text-action border border-action/20"
                : "bg-danger-tint text-danger border border-danger/20"
            }`}
          >
            {resendStatus}
          </p>
        )}

        <div className="pt-2 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="w-full rounded-full border border-black/20 bg-white px-4 py-2 text-sm font-semibold text-primary transition hover:bg-surface-muted disabled:opacity-50"
          >
            {resending ? "Sending verification email…" : "Resend verification email"}
          </button>

          <a
            href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
            className="text-sm font-medium text-primary underline hover:text-action"
          >
            Return to sign in
          </a>
        </div>
      </div>
    );
  }

  // Visual strength indicator bar width & color
  const strengthColor =
    evaluation.strength === "strong"
      ? "bg-action"
      : evaluation.strength === "medium"
        ? "bg-amber-500"
        : "bg-danger";

  const strengthWidth =
    password.length === 0
      ? "w-0"
      : evaluation.score === 1
        ? "w-1/5"
        : evaluation.score === 2
          ? "w-2/5"
          : evaluation.score === 3
            ? "w-3/5"
            : evaluation.score === 4
              ? "w-4/5"
              : "w-full";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Full Name Field */}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-primary">Name</span>
        <input
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-black/20 px-3 py-2 text-primary focus:border-action focus:outline-none focus:ring-1 focus:ring-action"
        />
      </label>

      {/* Email Field */}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-primary">Email</span>
        <input
          autoComplete="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-black/20 px-3 py-2 text-primary focus:border-action focus:outline-none focus:ring-1 focus:ring-action"
        />
      </label>

      {/* Password Field with Show/Hide Toggle */}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${formId}-password`} className="text-sm font-semibold text-primary">
          Password
        </label>
        <div className="relative">
          <input
            id={`${formId}-password`}
            autoComplete="new-password"
            type={showPassword ? "text" : "password"}
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (!passwordTouched) setPasswordTouched(true);
            }}
            onBlur={() => setPasswordTouched(true)}
            className="w-full rounded-lg border border-black/20 py-2 pl-3 pr-10 text-primary focus:border-action focus:outline-none focus:ring-1 focus:ring-action"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-primary-muted hover:text-primary transition p-1"
          >
            <Icon name={showPassword ? "eye-off" : "eye"} className="h-4 w-4" />
          </button>
        </div>

        {/* Password Strength Meter */}
        {password.length > 0 && (
          <div className="mt-2 space-y-1.5" aria-live="polite">
            <div className="flex items-center justify-between text-xs">
              <span className="text-primary-muted">Password Strength:</span>
              <span
                className={`font-semibold ${
                  evaluation.strength === "strong"
                    ? "text-action"
                    : evaluation.strength === "medium"
                      ? "text-amber-700"
                      : "text-danger"
                }`}
              >
                {evaluation.strengthLabel}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
              <div
                className={`h-full transition-all duration-300 ${strengthWidth} ${strengthColor}`}
              />
            </div>
          </div>
        )}

        {/* Password Requirements Checklist */}
        <div className="mt-2 space-y-1 rounded-lg border border-black/10 bg-surface-muted/60 p-3 text-xs">
          <p className="font-semibold text-primary mb-1.5">Password requirements:</p>
          {PASSWORD_RULES.map((rule) => {
            const isMet = evaluation.metRules.has(rule.id);
            return (
              <div key={rule.id} className="flex items-center gap-2">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                    isMet ? "bg-action text-white" : "border border-black/20 text-transparent"
                  }`}
                >
                  <Icon name="check" className="h-2.5 w-2.5" />
                </span>
                <span className={isMet ? "text-primary font-medium" : "text-primary-muted"}>
                  {rule.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirm Password Field with Show/Hide Toggle & Matching Indicator */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${formId}-confirm-password`}
          className="text-sm font-semibold text-primary"
        >
          Confirm Password
        </label>
        <div className="relative">
          <input
            id={`${formId}-confirm-password`}
            autoComplete="new-password"
            type={showConfirmPassword ? "text" : "password"}
            required
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (!confirmTouched) setConfirmTouched(true);
            }}
            onBlur={() => setConfirmTouched(true)}
            className={`w-full rounded-lg border py-2 pl-3 pr-10 text-primary focus:outline-none focus:ring-1 ${
              hasMismatch
                ? "border-danger focus:border-danger focus:ring-danger"
                : passwordsMatch
                  ? "border-action focus:border-action focus:ring-action"
                  : "border-black/20 focus:border-action focus:ring-action"
            }`}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((prev) => !prev)}
            aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-primary-muted hover:text-primary transition p-1"
          >
            <Icon name={showConfirmPassword ? "eye-off" : "eye"} className="h-4 w-4" />
          </button>
        </div>

        {/* Passwords Match Feedback */}
        {confirmPassword.length > 0 && (
          <div className="mt-1 flex items-center gap-1.5 text-xs" aria-live="polite">
            {passwordsMatch ? (
              <p className="flex items-center gap-1 font-medium text-action">
                <Icon name="check" className="h-3.5 w-3.5" />
                Passwords match
              </p>
            ) : hasMismatch ? (
              <p className="font-medium text-danger">Passwords do not match</p>
            ) : null}
          </div>
        )}
      </div>

      {/* Marketing Opt-in Checkbox (Optional) */}
      {marketingStatement !== null && (
        <label className="flex items-start gap-2 text-sm text-primary cursor-pointer mt-1">
          <input
            type="checkbox"
            name={MARKETING_OPT_IN_FIELD}
            checked={marketingOptIn}
            onChange={(e) => setMarketingOptIn(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded text-action focus:ring-action"
          />
          <span>{marketingStatement}</span>
        </label>
      )}

      {/* Top-level Error Alert */}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-tint border border-danger/20 p-2.5 text-sm text-danger font-medium"
        >
          {error}
        </p>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-full bg-action px-4 py-2.5 font-semibold text-white transition hover:bg-action-hover disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
      >
        {submitting ? "Creating account…" : "Create account"}
      </button>

      <p className="text-sm text-center">
        Already have an account?{" "}
        <a href="/login" className="text-primary font-medium underline hover:text-action">
          Sign in
        </a>
      </p>
    </form>
  );
}
