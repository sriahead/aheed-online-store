import { describe, it, expect } from "vitest";
import {
  inUncertainDepartment,
  matchRestrictedName,
  parseArgs,
  policyRestriction,
  softened,
} from "@/scripts/catalogue-restrict-by-policy";

const family = (name: string) => matchRestrictedName(name)?.family ?? null;

describe("#1200 S1c department policy", () => {
  it("restricts by the till department, checking the parent category too", () => {
    expect(policyRestriction(["TOBACCO"])).toEqual({
      restriction: "AGE_RESTRICTED",
      department: "TOBACCO",
    });
    expect(policyRestriction(["Instant Lottery"])?.restriction).toBe("PROHIBITED");
    expect(policyRestriction(["Top-ups", "PHONE CARDS"])?.restriction).toBe("NOT_DELIVERABLE");
    expect(policyRestriction(["Groceries"])).toBeNull();
  });

  it("knows the uncertain departments", () => {
    expect(inUncertainDepartment(["DEFAULT"])).toBe(true);
    expect(inUncertainDepartment(["misc"])).toBe(true);
    expect(inUncertainDepartment(["Groceries"])).toBe(false);
  });
});

describe("#1200 S1c name keywords — one case per family, plus the false positives seen on real data", () => {
  it.each([
    ["SHISHA KING", "tobacco"],
    ["RIZLA SILVER", "tobacco"],
    ["STELLA BOTTLE", "alcohol"],
    ["RED WINE 75CL", "alcohol"],
    ["NATIONAL LOTTERY SCRATCHCARD", "lottery"],
    ["LYCA 10 POUND", "phone or top-up card"],
    ["10.16G PHONE", "phone or top-up card"],
    ["1ST CLASS STAMPS", "stamps"],
    ["KITCHEN KNIFE", "blades"],
    ["CLIPPER LIGHTER", "lighter or gas refill"],
  ])("%s → %s", (name, expected) => {
    expect(family(name)).toBe(expected);
  });

  it.each([
    "APPLE CIDER VINEGAR",
    "RED WINE VINEGAR 500ML",
    "LISA WINE LEAVES 450G",
    "BASMATI RICE 5KG",
    "GINGER PASTE",
  ])("%s is not restricted", (name) => {
    expect(family(name)).toBeNull();
  });
});

describe("#1200 S1c arguments", () => {
  it("is a dry run unless --apply; production needs its own flag", () => {
    const a = parseArgs(["f", "K", "--vendor-slug", "aheed-food-centre"]);
    expect(a).toMatchObject({ vendorSlug: "aheed-food-centre", apply: false, production: false });
    expect(parseArgs(["f", "K", "--apply", "--production", "--confirm-host", "h"])).toMatchObject({
      apply: true,
      production: true,
      confirmHost: "h",
    });
  });
});

describe("#1200 S1c --soften-plu", () => {
  it("turns a hard block into NEEDS_REVIEW only for the listed PLUs", () => {
    const soft = new Set(["4559"]);
    expect(softened("PROHIBITED", "4559", soft)).toBe("NEEDS_REVIEW");
    expect(softened("AGE_RESTRICTED", "5112", soft)).toBe("AGE_RESTRICTED");
    expect(softened("PROHIBITED", null, soft)).toBe("PROHIBITED");
  });

  it("parses a comma-separated list", () => {
    expect([...parseArgs(["f", "K", "--soften-plu", "4559, 6424"]).softenPlus]).toEqual([
      "4559",
      "6424",
    ]);
  });
});
