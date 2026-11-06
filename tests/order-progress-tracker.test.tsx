// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { OrderProgressTracker } from "@/components/orders/OrderProgressTracker";
import type { TimelineEntry } from "@/lib/order-status";

/** #1435 R20 (the tracker), R22 (LiveRefresh), R23 (NewOrdersNotice). */

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { LiveRefresh } = await import("@/components/orders/LiveRefresh");
const { NewOrdersNotice } = await import("@/components/staff/NewOrdersNotice");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  refresh.mockReset();
});

const at = (iso: string) => new Date(iso);
function timeline(...statuses: string[]): TimelineEntry[] {
  return statuses.map((status, i) => ({
    status,
    label: status,
    at: at(`2026-11-05T1${i}:00:00.000Z`),
  }));
}

function renderTracker(
  status: string,
  method: "DELIVERY" | "COLLECTION",
  events: string[],
  slot: string | null = "Friday 6 November, 10:00–12:00",
) {
  return render(
    <OrderProgressTracker
      orderNumber="SHO-1"
      status={status}
      fulfilmentMethod={method}
      timeline={timeline(...events)}
      slotLabel={slot}
    />,
  );
}

describe("OrderProgressTracker (R20)", () => {
  it.each([
    ["CONFIRMED", ["current", "upcoming", "upcoming"]],
    ["OUT_FOR_DELIVERY", ["done", "current", "upcoming"]],
    ["DELIVERED", ["done", "done", "current"]],
  ])("delivery at %s", (status, expected) => {
    const events = ["CONFIRMED", "OUT_FOR_DELIVERY", "DELIVERED"].slice(
      0,
      expected.indexOf("current") + 1,
    );
    const { container } = renderTracker(status, "DELIVERY", events);
    const items = [...container.querySelectorAll("li")];
    expect(items.map((li) => li.getAttribute("data-state"))).toEqual(expected);
    expect(items.map((li) => li.querySelector("p")?.textContent)).toEqual([
      "Order confirmed",
      "Out for delivery",
      "Delivered",
    ]);
    const current = container.querySelector('[aria-current="step"]');
    expect(current?.getAttribute("data-state")).toBe("current");
    expect(current?.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it.each([
    ["CONFIRMED", ["current", "upcoming", "upcoming"]],
    ["READY_FOR_COLLECTION", ["done", "current", "upcoming"]],
    ["COLLECTED", ["done", "done", "current"]],
  ])("collection at %s shows the collection path, never delivery", (status, expected) => {
    const { container } = renderTracker(status, "COLLECTION", [
      "CONFIRMED",
      "READY_FOR_COLLECTION",
      "COLLECTED",
    ]);
    expect(
      [...container.querySelectorAll("li")].map((li) => li.getAttribute("data-state")),
    ).toEqual(expected);
    expect(container.textContent).toContain("Ready for collection");
    expect(container.textContent).not.toContain("Out for delivery");
  });

  it("done steps show their time; upcoming steps do not", () => {
    const { container } = renderTracker("OUT_FOR_DELIVERY", "DELIVERY", [
      "CONFIRMED",
      "OUT_FOR_DELIVERY",
    ]);
    const items = [...container.querySelectorAll("li")];
    expect(items[0].querySelectorAll("p")).toHaveLength(2);
    expect(items[2].querySelectorAll("p")).toHaveLength(1);
  });

  it("shows what happens next with the slot, and no link", () => {
    const { container } = renderTracker("CONFIRMED", "DELIVERY", ["CONFIRMED"]);
    expect(container.textContent).toContain(
      "We'll pack your order and email you when it's out for delivery.",
    );
    expect(container.textContent).toContain("Your delivery slot: Friday 6 November, 10:00–12:00.");
    expect(container.querySelector("a")).toBeNull();
  });

  it("PENDING_PAYMENT: the first step is current and reads Confirming payment", () => {
    const { container } = renderTracker("PENDING_PAYMENT", "DELIVERY", ["PENDING_PAYMENT"]);
    const current = container.querySelector('[aria-current="step"]');
    expect(current?.textContent).toContain("Confirming payment");
    expect(container.querySelectorAll('[data-state="current"]')).toHaveLength(1);
  });

  it("CANCELLED: no step list, a single cancelled state", () => {
    const { container } = renderTracker("CANCELLED", "DELIVERY", ["CONFIRMED", "CANCELLED"]);
    expect(container.querySelector("ol")).toBeNull();
    expect(screen.getByText("Order cancelled")).toBeTruthy();
    expect(container.textContent).toMatch(/No payment has been returned/);
  });

  it("every motion class is motion-safe", () => {
    const source = readFileSync("components/orders/OrderProgressTracker.tsx", "utf8");
    const classes = source.match(/[\w:-]*(transition|animate)[\w-]*/g) ?? [];
    for (const c of classes.filter((c) => !c.startsWith("@")))
      expect(c.startsWith("motion-safe:")).toBe(true);
  });
});

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("LiveRefresh (R22)", () => {
  it("refreshes every interval while visible, not while hidden, and at once on return", () => {
    vi.useFakeTimers();
    setVisibility("visible");
    render(<LiveRefresh active intervalMs={45_000} />);
    act(() => void vi.advanceTimersByTime(45_000));
    expect(refresh).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    act(() => void vi.advanceTimersByTime(90_000));
    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => setVisibility("visible"));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does nothing when inactive, and renders no DOM", () => {
    vi.useFakeTimers();
    setVisibility("visible");
    const { container } = render(<LiveRefresh active={false} />);
    act(() => void vi.advanceTimersByTime(200_000));
    expect(refresh).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });

  it("defaults to 45 seconds", () => {
    vi.useFakeTimers();
    setVisibility("visible");
    render(<LiveRefresh active />);
    act(() => void vi.advanceTimersByTime(44_999));
    expect(refresh).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("NewOrdersNotice (R23)", () => {
  it("counts orders that were not there at first render, and Dismiss resets", () => {
    const { rerender } = render(<NewOrdersNotice confirmedOrderNumbers={["A", "B"]} />);
    expect(screen.queryByRole("status")).toBeNull();

    rerender(<NewOrdersNotice confirmedOrderNumbers={["C", "A", "B"]} />);
    expect(screen.getByRole("status").textContent).toContain(
      "1 new order since you opened this page",
    );

    rerender(<NewOrdersNotice confirmedOrderNumbers={["D", "C", "A"]} />);
    expect(screen.getByRole("status").textContent).toContain(
      "2 new orders since you opened this page",
    );

    fireEvent.click(screen.getByText("Dismiss"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("the sound is off by default", () => {
    window.localStorage.removeItem("staff-orders-sound");
    render(<NewOrdersNotice confirmedOrderNumbers={[]} />);
    expect((screen.getByLabelText("Sound for new orders") as HTMLInputElement).checked).toBe(false);
  });

  it("works when localStorage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      const { rerender } = render(<NewOrdersNotice confirmedOrderNumbers={["A"]} />);
      fireEvent.click(screen.getByLabelText("Sound for new orders"));
      expect((screen.getByLabelText("Sound for new orders") as HTMLInputElement).checked).toBe(
        true,
      );
      rerender(<NewOrdersNotice confirmedOrderNumbers={["B", "A"]} />);
      expect(screen.getByRole("status").textContent).toContain("1 new order");
    } finally {
      spy.mockRestore();
      set.mockRestore();
    }
  });
});
