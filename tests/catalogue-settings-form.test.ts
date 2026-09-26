import { describe, expect, it } from "vitest";
import {
  initialCatalogueSettingsState,
  parseCatalogueSettings,
  type CatalogueSettingsRaw,
} from "@/lib/catalogue-settings-form";

/**
 * #905 R5 — the catalogue-settings form: six label switches and the store description.
 */

const ALL_OFF: CatalogueSettingsRaw = {
  showHalalLabel: null,
  showFreshLabel: null,
  showOrganicLabel: null,
  showVegetarianLabel: null,
  showGlutenFreeLabel: null,
  showHmcCertification: null,
  storeDescription: "",
};

describe("parseCatalogueSettings (#905 R5)", () => {
  it("(a) a switch is on exactly when the browser submitted 'on'", () => {
    const result = parseCatalogueSettings({
      ...ALL_OFF,
      showFreshLabel: "on",
      showOrganicLabel: "true",
    });
    expect(result.ok && result.value.showFreshLabel).toBe(true);
    expect(result.ok && result.value.showOrganicLabel).toBe(false);
    expect(result.ok && result.value.showHalalLabel).toBe(false);
  });

  it("(b) collapses whitespace, including newlines, to one line", () => {
    const result = parseCatalogueSettings({ ...ALL_OFF, storeDescription: " a\n\n b " });
    expect(result.ok && result.value.storeDescription).toBe("a b");
  });

  it("(b) a blank description becomes null", () => {
    const result = parseCatalogueSettings({ ...ALL_OFF, storeDescription: "   " });
    expect(result.ok && result.value.storeDescription).toBeNull();
  });

  it("(c) accepts exactly 200 characters and refuses 201", () => {
    expect(parseCatalogueSettings({ ...ALL_OFF, storeDescription: "x".repeat(200) }).ok).toBe(true);
    const refused = parseCatalogueSettings({ ...ALL_OFF, storeDescription: "x".repeat(201) });
    expect(refused).toEqual({
      ok: false,
      error: {
        field: "storeDescription",
        message: "Keep the store description to 200 characters or fewer.",
      },
    });
  });

  it("(c) judges the length after collapsing whitespace", () => {
    const padded = `${"x".repeat(100)}\n\n\n\n${"y".repeat(99)}`;
    expect(parseCatalogueSettings({ ...ALL_OFF, storeDescription: padded }).ok).toBe(true);
  });

  it("(d) refuses HMC certification without Halal, naming the HMC field", () => {
    expect(parseCatalogueSettings({ ...ALL_OFF, showHmcCertification: "on" })).toEqual({
      ok: false,
      error: {
        field: "showHmcCertification",
        message: "HMC certification needs the Halal label switched on.",
      },
    });
  });

  it("(d) accepts HMC certification with Halal", () => {
    const result = parseCatalogueSettings({
      ...ALL_OFF,
      showHalalLabel: "on",
      showHmcCertification: "on",
    });
    expect(result.ok && result.value.showHmcCertification).toBe(true);
  });

  it("the initial form state carries no error", () => {
    expect(initialCatalogueSettingsState).toEqual({ error: null, field: null, saved: false });
  });
});
