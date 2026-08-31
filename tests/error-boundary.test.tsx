// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import GlobalError from "@/app/global-error";
import RootError from "@/app/error";
import StorefrontError from "@/app/(storefront)/error";
import AdminError from "@/app/(admin)/error";
import { ErrorPanel } from "@/components/errors/ErrorPanel";

/**
 * Proves R1–R8 (#467, #478, #479) against the four boundaries a user can
 * actually reach.
 *
 * #459 shipped these with no test at all, and the evidence recorded for the
 * slice was a `200 OK` on a healthy page — which exercises no boundary, since a
 * boundary only renders when something throws beneath it. A `200` on a working
 * homepage is equally consistent with the files not existing.
 *
 * The load-bearing case is the leak one. #430 makes a missing production Stripe
 * or Resend key throw a Zod issue list naming environment variables, and these
 * boundaries are the surface that throw lands on; a shopper must see none of it.
 * The branded-copy assertions are cheap by comparison — they would pass against
 * a component that also dumped the stack trace underneath.
 *
 * `vitest.config.mts` sets `environment: "node"` globally, so the docblock above
 * is the same jsdom opt-in `tests/a11y/*.tsx` and `tests/order-items-card.tsx`
 * use.
 */

afterEach(cleanup);

/** Every boundary, rendered the way React renders it: an error and a reset. */
const boundaries = [
  { name: "app/global-error.tsx", Component: GlobalError, log: "global error boundary" },
  { name: "app/error.tsx", Component: RootError, log: "root error boundary" },
  {
    name: "app/(storefront)/error.tsx",
    Component: StorefrontError,
    log: "storefront error boundary",
  },
  { name: "app/(admin)/error.tsx", Component: AdminError, log: "staff portal error boundary" },
] as const;

/**
 * An error shaped like a real one: a message that names config, a digest Next
 * attaches in production, and a stack. All three are things the user must not
 * see.
 */
function configError(): Error & { digest?: string } {
  const error = new Error(
    "Invalid environment: STRIPE_SECRET_KEY is required in production, RESEND_API_KEY is required in production",
  ) as Error & { digest?: string };
  error.digest = "3849271056";
  error.stack = `${error.message}\n    at getPaymentEnv (lib/config.ts:120:11)`;
  return error;
}

/** `global-error` supplies its own <html>/<body>; jsdom keeps the text either way. */
function renderedText(container: HTMLElement): string {
  return container.textContent ?? "";
}

describe.each(boundaries)("$name", ({ Component, log }) => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("renders the branded panel with a retry control", () => {
    render(<Component error={configError()} reset={() => {}} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Something went wrong");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("leaks neither the message, the digest, nor the stack (R6)", () => {
    const error = configError();
    const { container } = render(<Component error={error} reset={() => {}} />);

    const text = renderedText(container);
    const html = container.innerHTML;

    for (const secret of ["STRIPE_SECRET_KEY", "RESEND_API_KEY", "lib/config.ts"]) {
      expect(text).not.toContain(secret);
      expect(html).not.toContain(secret);
    }
    expect(text).not.toContain(error.message);
    expect(text).not.toContain(error.digest);
    expect(html).not.toContain(error.digest);
  });

  it("logs the raw error once, for observability (R7)", () => {
    const error = configError();
    render(<Component error={error} reset={() => {}} />);

    expect(consoleError).toHaveBeenCalledTimes(1);
    const [label, logged] = consoleError.mock.calls[0];
    expect(String(label)).toContain(log);
    expect(logged).toBe(error);
  });

  it("invokes reset() when the retry button is pressed (R8)", () => {
    const reset = vi.fn();
    render(<Component error={configError()} reset={reset} />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("uses the audited danger tokens, never the stock red palette (R5)", () => {
    const { container } = render(<Component error={configError()} reset={() => {}} />);

    // The stock scale is reserved for neutrals per design-system.md; the icon
    // disc must read from --color-danger / --color-danger-tint, which
    // tests/design-tokens-contrast.test.ts audits.
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-red-\d{2,3}\b/);
    expect(container.innerHTML).toContain("bg-danger-tint");
    expect(container.innerHTML).toContain("text-danger");
  });
});

describe("ErrorPanel (R1)", () => {
  it("is the single definition every boundary renders", () => {
    const { container } = render(
      <ErrorPanel title="Something went wrong" message="A message." onRetry={() => {}} />,
    );

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Something went wrong");
    expect(container.querySelector("main")).toBeTruthy();
  });

  it("fills the viewport when alone and yields to chrome when not", () => {
    const { container: bare } = render(<ErrorPanel title="t" message="m" onRetry={() => {}} />);
    expect(bare.querySelector("main")?.className).toContain("min-h-screen");
    cleanup();

    const { container: inChrome } = render(
      <ErrorPanel title="t" message="m" onRetry={() => {}} fullHeight={false} />,
    );
    expect(inChrome.querySelector("main")?.className).toContain("min-h-[60vh]");
  });

  it("cannot render error detail, because it is never given any", () => {
    // The component's props carry no error object at all. This is the
    // structural half of R6: a future "show details" toggle would have to add a
    // prop first, which is a visible change rather than a quiet one.
    expect(ErrorPanel.length).toBe(1); // a single destructured props argument
    const source = ErrorPanel.toString();
    expect(source).not.toContain("stack");
    expect(source).not.toContain("digest");
  });
});
