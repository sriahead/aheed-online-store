// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const signUpEmail = vi.fn(async (_body: Record<string, unknown>) => ({ error: null }));
const sendVerificationEmail = vi.fn(async (_opts: { email: string; callbackURL?: string }) => ({
  data: { status: true },
  error: null,
}));

vi.mock("@/features/auth/api-client", () => ({
  signUp: { email: (body: Record<string, unknown>) => signUpEmail(body) },
  sendVerificationEmail: (opts: { email: string; callbackURL?: string }) =>
    sendVerificationEmail(opts),
}));

const { RegisterForm } = await import("@/features/auth/components/RegisterForm");

beforeEach(() => {
  signUpEmail.mockClear();
  sendVerificationEmail.mockClear();
});
afterEach(cleanup);

describe("RegisterForm password validation and controls", () => {
  it("renders password and confirm password inputs", () => {
    render(<RegisterForm marketingStatement={null} />);
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm Password")).toBeTruthy();
  });

  it("toggles password visibility between password and text type", () => {
    render(<RegisterForm marketingStatement={null} />);
    const passwordInput = screen.getByLabelText("Password") as HTMLInputElement;
    const toggleButton = screen.getByRole("button", { name: /show password/i });

    expect(passwordInput.type).toBe("password");
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe("text");
    expect(screen.getByRole("button", { name: /hide password/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /hide password/i }));
    expect(passwordInput.type).toBe("password");
  });

  it("toggles confirm password visibility between password and text type", () => {
    render(<RegisterForm marketingStatement={null} />);
    const confirmInput = screen.getByLabelText("Confirm Password") as HTMLInputElement;
    const toggleButton = screen.getByRole("button", { name: /show confirm password/i });

    expect(confirmInput.type).toBe("password");
    fireEvent.click(toggleButton);
    expect(confirmInput.type).toBe("text");
    expect(screen.getByRole("button", { name: /hide confirm password/i })).toBeTruthy();
  });

  it("disables create account button while password requirements are incomplete", () => {
    render(<RegisterForm marketingStatement={null} />);
    const submitBtn = screen.getByRole("button", { name: /create account/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "short" } });
    expect(submitBtn.disabled).toBe(true);
  });

  it("shows passwords do not match error when confirm password differs", () => {
    render(<RegisterForm marketingStatement={null} />);
    const passwordInput = screen.getByLabelText("Password");
    const confirmInput = screen.getByLabelText("Confirm Password");

    fireEvent.change(passwordInput, { target: { value: "Password123!" } });
    fireEvent.change(confirmInput, { target: { value: "Password123?" } });
    fireEvent.blur(confirmInput);

    expect(screen.getByText(/passwords do not match/i)).toBeTruthy();
    const submitBtn = screen.getByRole("button", { name: /create account/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it("enables create account button and displays match indicator when all requirements are met", () => {
    render(<RegisterForm marketingStatement={null} />);
    const nameInput = screen.getByLabelText("Name");
    const emailInput = screen.getByLabelText("Email");
    const passwordInput = screen.getByLabelText("Password");
    const confirmInput = screen.getByLabelText("Confirm Password");
    const submitBtn = screen.getByRole("button", { name: /create account/i }) as HTMLButtonElement;

    fireEvent.change(nameInput, { target: { value: "Sarah Connor" } });
    fireEvent.change(emailInput, { target: { value: "sarah@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "StrongPass123!" } });
    fireEvent.change(confirmInput, { target: { value: "StrongPass123!" } });

    expect(screen.getByText(/passwords match/i)).toBeTruthy();
    expect(screen.getByText(/strong/i)).toBeTruthy();
    expect(submitBtn.disabled).toBe(false);
  });

  it("submits the form successfully and displays verification screen with resend option", async () => {
    render(<RegisterForm marketingStatement={null} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sarah Connor" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sarah@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "StrongPass123!" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "StrongPass123!" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(signUpEmail).toHaveBeenCalledTimes(1));
    expect(signUpEmail).toHaveBeenCalledWith({
      name: "Sarah Connor",
      email: "sarah@example.com",
      password: "StrongPass123!",
    });
    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeTruthy());
    expect(screen.getByText("sarah@example.com")).toBeTruthy();

    const resendBtn = screen.getByRole("button", { name: /resend verification email/i });
    fireEvent.click(resendBtn);
    await waitFor(() => expect(sendVerificationEmail).toHaveBeenCalledTimes(1));
    expect(sendVerificationEmail).toHaveBeenCalledWith({
      email: "sarah@example.com",
      callbackURL: "/signed-in",
    });
    expect(screen.getByText(/verification email sent/i)).toBeTruthy();
  });
});
