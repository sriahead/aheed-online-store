// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const signInSocial = vi.fn();

vi.mock("@/features/auth/api-client", () => ({
  signIn: {
    social: (args: Record<string, unknown>) => signInSocial(args),
  },
}));

const { GoogleSignInButton } = await import("@/features/auth/components/GoogleSignInButton");

describe("GoogleSignInButton", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    signInSocial.mockClear();
    (window as unknown as { location: unknown }).location = {
      ...originalLocation,
      assign: vi.fn(),
      href: "https://aheed-staging.merqify.com/login",
    };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    (window as unknown as { location: unknown }).location = originalLocation;
  });

  it("renders Continue with Google button initially", () => {
    render(<GoogleSignInButton />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
  });

  it("calls signIn.social with /signed-in callback URL and assigns location on success", async () => {
    signInSocial.mockResolvedValueOnce({
      data: { url: "https://accounts.google.com/o/oauth2/v2/auth?test=1" },
      error: null,
    });

    render(<GoogleSignInButton />);
    const btn = screen.getByRole("button", { name: "Continue with Google" });
    fireEvent.click(btn);

    expect(signInSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/signed-in",
      errorCallbackURL: "/login",
    });

    await waitFor(() => {
      expect(window.location.assign).toHaveBeenCalledWith(
        "https://accounts.google.com/o/oauth2/v2/auth?test=1",
      );
    });
  });

  it("preserves next parameter in callback and error URLs", async () => {
    signInSocial.mockResolvedValueOnce({
      data: { url: "https://accounts.google.com/o/oauth2/v2/auth?test=2" },
      error: null,
    });

    render(<GoogleSignInButton next="/checkout" />);
    const btn = screen.getByRole("button", { name: "Continue with Google" });
    fireEvent.click(btn);

    expect(signInSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/signed-in?next=%2Fcheckout",
      errorCallbackURL: "/login?next=%2Fcheckout",
    });
  });

  it("displays error message and re-enables button when signIn.social returns an error", async () => {
    signInSocial.mockResolvedValueOnce({
      data: null,
      error: { message: "Access denied by provider" },
    });

    render(<GoogleSignInButton />);
    const btn = screen.getByRole("button", { name: "Continue with Google" });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Access denied by provider");
      expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    });
  });

  it("catches rejection and re-enables button without hanging", async () => {
    signInSocial.mockRejectedValueOnce(new Error("Network connection lost"));

    render(<GoogleSignInButton />);
    const btn = screen.getByRole("button", { name: "Continue with Google" });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Network connection lost");
      expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    });
  });

  it("unlocks button after safety timeout if navigation is pending", async () => {
    vi.useFakeTimers();
    // Hanging promise that never resolves
    signInSocial.mockReturnValueOnce(new Promise(() => {}));

    render(<GoogleSignInButton />);
    const btn = screen.getByRole("button", { name: "Continue with Google" });
    fireEvent.click(btn);

    expect(screen.getByRole("button", { name: "Redirecting…" })).toBeTruthy();

    // Advance fake timers by 8.1 seconds
    act(() => {
      vi.advanceTimersByTime(8100);
    });

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
  });
});
