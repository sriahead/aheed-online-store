// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SearchSuggest } from "@/components/layout/SearchSuggest";

/**
 * P2.6 slice 5 (#568), R32-R34 — the combobox contract and the client-side half of the route's
 * cost bounds.
 *
 * The keyboard cases are the ones that matter most. A suggestion list is trivially usable with a
 * mouse and trivially broken for everyone else, and nothing in `lint`/`typecheck`/`build` can tell
 * the difference — `jsx-a11y` checks the attributes exist, not that arrow keys move anything.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const RESPONSE = {
  products: [
    { slug: "basmati-rice", name: "Basmati Rice 5kg", inStock: true },
    { slug: "rice-flour", name: "Rice Flour", inStock: false },
  ],
  categories: [{ slug: "rice-and-grains", name: "Rice and Grains" }],
  terms: [] as string[],
};

beforeEach(() => {
  push.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => RESPONSE })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function renderSuggest() {
  return render(<SearchSuggest placeholder="Search products…" />);
}

/** Type a query and let the debounce elapse, so suggestions are on screen. */
async function typeAndSettle(text = "rice") {
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: text } });
  await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
  return input;
}

describe("combobox semantics (R32)", () => {
  it("marks the input as a combobox controlling its listbox", async () => {
    renderSuggest();
    const input = await typeAndSettle();

    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-expanded")).toBe("true");

    const listbox = screen.getByRole("listbox");
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
  });

  it("renders one option per suggestion, products then categories", async () => {
    renderSuggest();
    await typeAndSettle();

    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Basmati Rice 5kg",
      "Rice FlourOut of stock",
      "Rice and GrainsDepartment",
    ]);
  });

  it("reports collapsed before anything is typed", () => {
    renderSuggest();
    expect(screen.getByRole("combobox").getAttribute("aria-expanded")).toBe("false");
  });
});

describe("keyboard navigation (R33)", () => {
  it("ArrowDown and ArrowUp move the active option and update aria-activedescendant", async () => {
    renderSuggest();
    const input = await typeAndSettle();
    const options = screen.getAllByRole("option");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
    expect(options[0].getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1].id);

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
  });

  it("wraps from the last option back to the first", async () => {
    renderSuggest();
    const input = await typeAndSettle();
    const options = screen.getAllByRole("option");

    for (let i = 0; i < options.length; i += 1) fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
  });

  it("Enter activates the highlighted option", async () => {
    renderSuggest();
    const input = await typeAndSettle();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(push).toHaveBeenCalledWith("/products/basmati-rice");
  });

  /**
   * With nothing highlighted, Enter must fall through to the form — that is the no-JS behaviour and
   * the right default. Intercepting it unconditionally would break submitting a query the shopper
   * typed in full without ever touching the arrow keys.
   */
  it("Enter with nothing highlighted does not navigate", async () => {
    renderSuggest();
    const input = await typeAndSettle();

    fireEvent.keyDown(input, { key: "Enter" });

    expect(push).not.toHaveBeenCalled();
  });

  it("Escape closes the list without navigating", async () => {
    renderSuggest();
    const input = await typeAndSettle();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("request bounds (R34)", () => {
  it("debounces: several keystrokes inside the window issue one fetch", () => {
    vi.useFakeTimers();
    renderSuggest();
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "ri" } });
    vi.advanceTimersByTime(50);
    fireEvent.change(input, { target: { value: "ric" } });
    vi.advanceTimersByTime(50);
    fireEvent.change(input, { target: { value: "rice" } });

    expect(fetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]).toContain(
      "q=rice",
    );
  });

  it("issues no request below the minimum query length", () => {
    vi.useFakeTimers();
    renderSuggest();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "r" } });
    vi.advanceTimersByTime(500);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("aborts a request superseded by a later keystroke", () => {
    vi.useFakeTimers();
    const abort = vi.fn();
    vi.stubGlobal(
      "AbortController",
      class {
        signal = {} as AbortSignal;
        abort = abort;
      },
    );

    renderSuggest();
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "rice" } });
    vi.advanceTimersByTime(300);
    fireEvent.change(input, { target: { value: "rice f" } });
    vi.advanceTimersByTime(300);

    expect(abort).toHaveBeenCalled();
  });
});
