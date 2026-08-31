import { AlertTriangle } from "lucide-react";

/**
 * The branded "something went wrong" surface, defined once (#478/#479).
 *
 * Four boundaries render this — `app/global-error.tsx`, `app/error.tsx`,
 * `app/(storefront)/error.tsx` and `app/(admin)/error.tsx`. #459 shipped the
 * markup duplicated across two of them, which is how they drifted off the
 * design system together: both hardcoded `bg-red-100 text-red-600` instead of
 * the audited `--color-danger` / `--color-danger-tint` pair that
 * `tests/design-tokens-contrast.test.ts` guards.
 *
 * COLOURS ARE TOKENS, NOT THE STOCK PALETTE. Every pairing used here is one the
 * contrast test already asserts: danger-on-danger-tint for the icon disc,
 * primary-on-surface-muted for the text, white-on-primary for the button.
 *
 * NOTHING ABOUT THE ERROR IS RENDERED. This component never receives the error
 * object at all — not as a prop, not for a "details" toggle. #430 makes a
 * misconfigured production key throw a Zod issue list naming environment
 * variables; the way to guarantee that never reaches a shopper is for the
 * rendering component to have no access to it. Boundaries log it instead.
 */
export function ErrorPanel({
  title,
  message,
  onRetry,
  fullHeight = true,
}: {
  title: string;
  message: string;
  onRetry: () => void;
  /** Full viewport for a bare page; shorter when chrome is still around it. */
  fullHeight?: boolean;
}) {
  return (
    <main
      className={`flex ${
        fullHeight ? "min-h-screen" : "min-h-[60vh]"
      } flex-col items-center justify-center gap-4 px-6 text-center bg-surface-muted text-primary`}
    >
      <div className="rounded-full bg-danger-tint p-4 text-danger">
        <AlertTriangle className="h-8 w-8" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="max-w-md text-sm text-primary/70">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
      >
        Try again
      </button>
    </main>
  );
}
