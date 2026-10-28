import { describe, expect, it } from "vitest";
import { landingPath, safeNextPath, type LandingAccess } from "@/lib/auth-landing";
import { signedInPath } from "@/features/auth/signed-in-path";

const ACCESS: LandingAccess[] = ["platform-admin", "store", "shopper"];

describe("landingPath (#1319)", () => {
  it("sends each role to its own home by default", () => {
    expect(landingPath("platform-admin")).toBe("/staff/platform");
    expect(landingPath("store")).toBe("/staff");
    expect(landingPath("shopper")).toBe("/account");
  });

  it("lets a safe same-origin next win for every role", () => {
    for (const access of ACCESS) {
      expect(landingPath(access, "/checkout?step=2")).toBe("/checkout?step=2");
    }
  });

  const unsafe: (string | null | undefined)[] = [
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "evil",
    "",
    null,
    undefined,
    "/a\nb",
  ];

  it.each(unsafe.map((v) => [JSON.stringify(v) ?? "undefined", v]))(
    "refuses %s and falls back to the default",
    (_label, value) => {
      expect(safeNextPath(value)).toBeNull();
      expect(landingPath("store", value)).toBe("/staff");
      expect(landingPath("platform-admin", value)).toBe("/staff/platform");
      expect(landingPath("shopper", value)).toBe("/account");
    },
  );

  it("refuses DEL as a control character", () => {
    expect(safeNextPath("/a\u007fb")).toBeNull();
  });
});

describe("signedInPath — where the sign-in controls go (#1319)", () => {
  it("goes to /signed-in, forwarding next encoded for the landing to vet", () => {
    expect(signedInPath()).toBe("/signed-in");
    expect(signedInPath("")).toBe("/signed-in");
    expect(signedInPath("/checkout?step=2")).toBe("/signed-in?next=%2Fcheckout%3Fstep%3D2");
  });
});
