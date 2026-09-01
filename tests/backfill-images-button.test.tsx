// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { BackfillImagesButton } from "@/components/staff/BackfillImagesButton";

/**
 * #507 — this button reported its result through a native `alert()`.
 *
 * That blocks the whole tab until someone clicks it: an operator gets a modal in
 * the way of a background job's result, and browser automation freezes outright —
 * CDP calls, screenshots and even closing the tab hang until a human dismisses
 * the dialog, so the button could not be exercised end-to-end by any scripted
 * check. Found during `/validate` for #502.
 *
 * The assertion that matters is `alert` never being called. Checking only that a
 * message renders would pass just as happily with the `alert()` still there.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const alertSpy = vi.fn();
const fetchMock = vi.fn();

beforeEach(() => {
  alertSpy.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("alert", alertSpy);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function click() {
  screen.getByRole("button", { name: /auto-fill missing images/i }).click();
}

describe("BackfillImagesButton", () => {
  it("reports success inline and never calls alert()", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: "Backfill complete", processed: 3 }),
    });
    render(<BackfillImagesButton />);
    click();

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Backfill complete");
    expect(status.textContent).toContain("3 generated");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("reports a refusal inline using the route's `error` field, not `message`", async () => {
    // 401/403 answer with `error`; reading `message` would show the operator
    // nothing at all.
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "Staff only" }),
    });
    render(<BackfillImagesButton />);
    click();

    const alertRegion = await screen.findByRole("alert");
    expect(alertRegion.textContent).toContain("Staff only");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("reports a network failure inline rather than throwing it away", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<BackfillImagesButton />);
    click();

    const alertRegion = await screen.findByRole("alert");
    expect(alertRegion.textContent).toContain("Failed to start backfill");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("re-enables the button after a run so a second attempt is possible", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: "No products need backfill", processed: 0 }),
    });
    render(<BackfillImagesButton />);
    click();

    await screen.findByRole("status");
    // Plain DOM assertion: `@testing-library/jest-dom` is deliberately not a
    // dependency here, so `toBeDisabled()` does not exist.
    await waitFor(() => {
      const button = screen.getByRole("button", {
        name: /auto-fill missing images/i,
      }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });
  });
});
