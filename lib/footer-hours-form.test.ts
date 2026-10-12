import { describe, expect, it } from "vitest";
import {
  OPENING_HOURS_FIELD,
  openingHoursLabelField,
  openingHoursValueField,
  parseFooterHours,
} from "@/lib/footer-hours-form";

const row = (label: string, hours: string) => ({ label, hours });

describe("parseFooterHours (#1055)", () => {
  it("keeps rows in submitted order with sortOrder from their position", () => {
    const result = parseFooterHours({
      rows: [row("Monday – Friday", "[OPEN] – 8pm"), row("Sunday", "10am – 4pm")],
      badges: [],
    });
    expect(result.ok && result.value.openingHours).toEqual([
      { label: "Monday – Friday", hours: "[OPEN] – 8pm", sortOrder: 0 },
      { label: "Sunday", hours: "10am – 4pm", sortOrder: 1 },
    ]);
  });

  it("drops a fully blank row without leaving a gap in sortOrder", () => {
    const result = parseFooterHours({
      rows: [row("Mon", "9–5"), row(" ", ""), row("Tue", "9–5")],
      badges: [],
    });
    expect(result.ok && result.value.openingHours.map((r) => r.sortOrder)).toEqual([0, 1]);
  });

  it("refuses a ninth row", () => {
    const result = parseFooterHours({
      rows: Array.from({ length: 9 }, (_, i) => row(`Day ${i}`, "9–5")),
      badges: [],
    });
    expect(!result.ok && result.error.field).toBe(OPENING_HOURS_FIELD);
  });

  it("refuses a half-filled row against its blank input", () => {
    const noHours = parseFooterHours({ rows: [row("Ok", "1"), row("Saturday", "")], badges: [] });
    expect(!noHours.ok && noHours.error.field).toBe(openingHoursValueField(1));
    const noLabel = parseFooterHours({ rows: [row("", "9–5")], badges: [] });
    expect(!noLabel.ok && noLabel.error.field).toBe(openingHoursLabelField(0));
  });

  it("limits label and hours to 40 characters", () => {
    expect(parseFooterHours({ rows: [row("x".repeat(40), "y".repeat(40))], badges: [] }).ok).toBe(
      true,
    );
    const label = parseFooterHours({ rows: [row("x".repeat(41), "9–5")], badges: [] });
    expect(!label.ok && label.error.field).toBe(openingHoursLabelField(0));
    const hours = parseFooterHours({ rows: [row("Mon", "y".repeat(41))], badges: [] });
    expect(!hours.ok && hours.error.field).toBe(openingHoursValueField(0));
  });

  it("dedupes badges, puts them in display order and ignores unknown values", () => {
    const result = parseFooterHours({
      rows: [],
      badges: ["GOOGLE_PAY", "VISA", "VISA", "BITCOIN", "AMEX"],
    });
    expect(result.ok && result.value.paymentBadges).toEqual(["VISA", "AMEX", "GOOGLE_PAY"]);
  });

  it("allows an empty set, which hides hours and badges", () => {
    expect(parseFooterHours({ rows: [], badges: [] })).toEqual({
      ok: true,
      value: { openingHours: [], paymentBadges: [] },
    });
  });
});
