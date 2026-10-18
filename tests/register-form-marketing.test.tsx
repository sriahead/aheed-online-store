// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * #1134 — the register form's marketing checkbox: absent when the store does not ask, unticked and
 * optional when it does, and the sign-up body carries `marketingOptIn: true` only when ticked.
 */

const signUpEmail = vi.fn(async (_body: Record<string, unknown>) => ({ error: null }));

vi.mock("@/features/auth/api-client", () => ({
  signUp: { email: (body: Record<string, unknown>) => signUpEmail(body) },
}));

const { RegisterForm } = await import("@/features/auth/components/RegisterForm");

const STATEMENT =
  "Email me marketing and promotional offers from Test Store. You can change this at any time in your account.";

beforeEach(() => signUpEmail.mockClear());
afterEach(cleanup);

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "A Shopper" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
}

describe("RegisterForm marketing consent", () => {
  it("renders no checkbox when the store does not ask for marketing consent", () => {
    render(<RegisterForm marketingStatement={null} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("renders an unticked, optional checkbox labelled with the statement, before submit", () => {
    render(<RegisterForm marketingStatement={STATEMENT} />);
    const box = screen.getByRole("checkbox", { name: STATEMENT }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.required).toBe(false);
    const password = screen.getByLabelText("Password");
    const submit = screen.getByRole("button", { name: /create account/i });
    expect(password.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sends marketingOptIn: true only when the box is ticked", async () => {
    render(<RegisterForm marketingStatement={STATEMENT} />);
    fireEvent.click(screen.getByRole("checkbox", { name: STATEMENT }));
    fillAndSubmit();
    await waitFor(() => expect(signUpEmail).toHaveBeenCalledTimes(1));
    expect(signUpEmail.mock.calls[0][0]).toMatchObject({ marketingOptIn: true });
  });

  it("sends no marketingOptIn when the box is left unticked", async () => {
    render(<RegisterForm marketingStatement={STATEMENT} />);
    fillAndSubmit();
    await waitFor(() => expect(signUpEmail).toHaveBeenCalledTimes(1));
    expect(signUpEmail.mock.calls[0][0]).not.toHaveProperty("marketingOptIn");
  });
});
