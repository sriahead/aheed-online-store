// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * #1305 — the checkout slot picker as a week grid.
 *
 * WHY IT RENDERS. The grid's contract with the checkout form is the pair of fields it submits
 * (`fulfilmentSlotId`, `fulfilmentDate`), and only a rendered form can show what `FormData` really
 * contains after a click, after paging, and with Express on. Layout maths is covered separately in
 * `tests/slot-grid.test.ts`.
 *
 * Only `Date` is faked, so promises and `waitFor` keep working on the real clock.
 */

type Slot = { id: string; startTime: string; endTime: string; capacity: number; available: number };

const getAvailableSlotsForWeek = vi.fn();
vi.mock("@/features/checkout/slots", () => ({ getAvailableSlotsForWeek }));

const { SlotPicker } = await import("@/components/checkout/SlotPicker");

const slot = (id: string, startTime: string, endTime: string, available: number): Slot => ({
  id,
  startTime,
  endTime,
  capacity: 9,
  available,
});

/** Every day gets the same three morning slots, except the FIRST requested day, which has no 06:00 one. */
function standardWeek(withAfternoon = false) {
  return async (_vendor: string, _method: string, days: string[]) =>
    days.map((day, index) => ({
      day,
      slots: [
        slot(`a-${day}`, "05:30", "06:30", 9),
        ...(index === 0 ? [] : [slot(`b-${day}`, "06:00", "07:00", 2)]),
        slot(`c-${day}`, "07:00", "08:00", 0),
        ...(withAfternoon ? [slot(`d-${day}`, "13:00", "14:00", 9)] : []),
      ],
    }));
}

function renderPicker(props: Partial<React.ComponentProps<typeof SlotPicker>> = {}) {
  return render(
    <form data-testid="form">
      <SlotPicker
        vendorId="vendor-1"
        method="DELIVERY"
        bookingWindowDays={7}
        required
        timezone="Europe/London"
        {...props}
      />
    </form>,
  );
}

const formData = () => new FormData(screen.getByTestId("form") as HTMLFormElement);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
  getAvailableSlotsForWeek.mockImplementation(standardWeek());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("#1305 slot grid: layout", () => {
  it("shows a header cell per day (at most seven), the month, and only the bands with rows (R15)", async () => {
    renderPicker({ bookingWindowDays: 10 });
    await screen.findByRole("table");

    const heads = [...document.querySelectorAll('thead th[scope="col"]')].map((th) =>
      th.textContent?.trim(),
    );
    expect(heads).toEqual([
      "Oct",
      "Tue 27",
      "Wed 28",
      "Thu 29",
      "Fri 30",
      "Sat 31",
      "Sun 1",
      "Mon 2",
    ]);

    const groups = [...document.querySelectorAll('th[scope="rowgroup"]')].map((th) =>
      th.textContent?.trim(),
    );
    expect(groups).toEqual(["Morning"]);
  });

  it("adds an Afternoon band when a slot starts at 12:00 or later (R15)", async () => {
    getAvailableSlotsForWeek.mockImplementation(standardWeek(true));
    renderPicker();
    await screen.findByRole("table");
    const groups = [...document.querySelectorAll('th[scope="rowgroup"]')].map((th) =>
      th.textContent?.trim(),
    );
    expect(groups).toEqual(["Morning", "Afternoon"]);
  });

  it("renders Free, N left, Full and a dash for the four cell states (R16)", async () => {
    renderPicker();
    await screen.findByRole("table");

    const radios = [
      ...document.querySelectorAll<HTMLInputElement>('input[name="fulfilmentSlotId"]'),
    ];
    const first = radios.find((r) => r.value === "a-2026-10-27")!;
    expect(first.disabled).toBe(false);
    expect(first.closest("label")?.textContent).toBe("Free");

    const few = radios.find((r) => r.value === "b-2026-10-28")!;
    expect(few.disabled).toBe(false);
    expect(few.closest("label")?.textContent).toBe("2 left");

    const full = radios.find((r) => r.value === "c-2026-10-27")!;
    expect(full.disabled).toBe(true);
    expect(full.closest("label")?.textContent).toBe("Full");

    // The first day has no 06:00 slot: a dash and no input in that cell.
    const row = [...document.querySelectorAll("tbody tr")].find((tr) =>
      tr.textContent?.includes("06:00 - 07:00"),
    )!;
    const firstCell = row.querySelectorAll("td")[0];
    expect(firstCell.textContent?.trim()).toBe("–");
    expect(firstCell.querySelector("input")).toBeNull();
  });

  it("names each cell for assistive technology (R17)", async () => {
    renderPicker();
    await screen.findByRole("table");
    const radio = document.querySelector<HTMLInputElement>('input[value="a-2026-10-27"]');
    expect(radio?.getAttribute("aria-label")).toBe("Tue 27 Oct, 05:30 to 06:30, free");
  });

  it("scrolls inside its own wrapper with a sticky time column (R23)", async () => {
    renderPicker();
    const table = await screen.findByRole("table");
    expect(table.parentElement?.className).toContain("overflow-x-auto");
    const timeCell = document.querySelector('tbody th[scope="row"]');
    expect(timeCell?.className).toContain("sticky");
    expect(timeCell?.className).toContain("left-0");
  });

  it("has dropped the old date strip and list (R24)", async () => {
    renderPicker();
    await screen.findByRole("table");
    expect(document.body.textContent).not.toContain("Select Date");
    expect(document.body.textContent).not.toContain("Select Time Slot");
  });
});

describe("#1305 slot grid: what it submits", () => {
  it("submits the chosen slot and that cell's day (R18)", async () => {
    renderPicker();
    await screen.findByRole("table");

    fireEvent.click(document.querySelector('input[value="a-2026-10-29"]')!);

    const data = formData();
    expect(data.get("fulfilmentSlotId")).toBe("a-2026-10-29");
    expect(data.get("fulfilmentDate")).toBe("2026-10-29");
  });

  it("submits today in the vendor zone as the date before anything is chosen (R18)", async () => {
    renderPicker();
    await screen.findByRole("table");
    const data = formData();
    expect(data.get("fulfilmentSlotId")).toBeNull();
    expect(data.get("fulfilmentDate")).toBe("2026-10-27");
  });

  it("disables every cell and the date while Express is on (R19)", async () => {
    renderPicker({
      method: "COLLECTION",
      expressCollectionEnabled: true,
      expressSchedules: [{ dayOfWeek: 2, openTime: "00:00", closeTime: "23:59" }],
    });
    await screen.findByRole("table");

    fireEvent.click(await screen.findByRole("switch"));

    const radios = [
      ...document.querySelectorAll<HTMLInputElement>('input[name="fulfilmentSlotId"]'),
    ];
    expect(radios.length).toBeGreaterThan(0);
    expect(radios.every((r) => r.disabled)).toBe(true);
    expect(document.querySelector<HTMLInputElement>('input[name="fulfilmentDate"]')?.disabled).toBe(
      true,
    );
  });
});

describe("#1305 slot grid: paging and fetching", () => {
  it("disables Previous on the first page and Next when no days remain (R20)", async () => {
    renderPicker({ bookingWindowDays: 7 });
    await screen.findByRole("table");
    expect((screen.getByLabelText("Previous week") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Next week") as HTMLButtonElement).disabled).toBe(true);
  });

  it("pages forward, shows the next days, and clears the selection (R20)", async () => {
    renderPicker({ bookingWindowDays: 14 });
    await screen.findByRole("table");
    fireEvent.click(document.querySelector('input[value="a-2026-10-29"]')!);
    expect(formData().get("fulfilmentSlotId")).toBe("a-2026-10-29");

    fireEvent.click(screen.getByLabelText("Next week"));
    await waitFor(() => {
      const heads = [...document.querySelectorAll('thead th[scope="col"]')].map((th) =>
        th.textContent?.trim(),
      );
      expect(heads.slice(0, 2)).toEqual(["Nov", "Tue 3"]);
    });

    expect(formData().get("fulfilmentSlotId")).toBeNull();
    // The off-screen choice must be gone, not merely not rendered: a stale selection would still
    // send its day (the slot radio is simply absent from this page, so the slot id alone proves
    // nothing).
    expect(formData().get("fulfilmentDate")).toBe("2026-10-27");
    expect((screen.getByLabelText("Previous week") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText("Next week") as HTMLButtonElement).disabled).toBe(true);

    // And paging back must not resurrect it.
    fireEvent.click(screen.getByLabelText("Previous week"));
    await waitFor(() => {
      expect(document.querySelectorAll('thead th[scope="col"]')[1].textContent?.trim()).toBe(
        "Tue 27",
      );
    });
    const checked = document.querySelectorAll<HTMLInputElement>(
      'input[name="fulfilmentSlotId"]:checked',
    );
    expect(checked).toHaveLength(0);
    expect(formData().get("fulfilmentSlotId")).toBeNull();
    expect(formData().get("fulfilmentDate")).toBe("2026-10-27");
  });

  it("asks for each page's days once (R21)", async () => {
    renderPicker({ bookingWindowDays: 14 });
    await screen.findByRole("table");
    expect(getAvailableSlotsForWeek).toHaveBeenCalledTimes(1);
    expect(getAvailableSlotsForWeek).toHaveBeenLastCalledWith("vendor-1", "DELIVERY", [
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);

    fireEvent.click(screen.getByLabelText("Next week"));
    await waitFor(() => expect(getAvailableSlotsForWeek).toHaveBeenCalledTimes(2));
    expect(getAvailableSlotsForWeek.mock.calls[1][2]).toEqual([
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
      "2026-11-09",
    ]);
  });

  it("says it is loading while the week is pending (R21)", async () => {
    // Resolved at the end on purpose: React entangles async transitions, so a promise that never
    // settles would hold every later test's transition behind it.
    let release: () => void = () => {};
    getAvailableSlotsForWeek.mockImplementation(
      (_v: string, _m: string, days: string[]) =>
        new Promise((resolve) => {
          release = () => resolve(days.map((day) => ({ day, slots: [] })));
        }),
    );
    renderPicker();
    expect(await screen.findByText("Loading slots…")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    release();
    expect(await screen.findByText("No slots available for these dates.")).toBeTruthy();
  });

  it("says so when no day of the page has a slot (R21)", async () => {
    getAvailableSlotsForWeek.mockImplementation(async (_v: string, _m: string, days: string[]) =>
      days.map((day) => ({ day, slots: [] })),
    );
    renderPicker();
    expect(await screen.findByText("No slots available for these dates.")).toBeTruthy();
  });
});

describe("#1305 slot grid: the vendor's zone decides the first day (R22)", () => {
  it.each([
    ["Pacific/Auckland", "Wed 28"],
    ["UTC", "Tue 27"],
  ])("%s starts on %s", async (timezone, expectedFirst) => {
    vi.setSystemTime(new Date("2026-10-27T23:30:00Z"));
    renderPicker({ timezone });
    await screen.findByRole("table");
    const firstDay = document.querySelectorAll('thead th[scope="col"]')[1];
    expect(firstDay.textContent?.trim()).toBe(expectedFirst);
  });
});
