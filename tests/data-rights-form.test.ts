import { describe, it, expect } from "vitest";
import {
  checkEmailConfirmation,
  eraseConfirmationMode,
  erasureSummary,
  initialDataRightsState,
  parseDisplayName,
} from "@/lib/data-rights-form";

/**
 * P7b (#216) — the pure field rules behind /account/data.
 *
 * No DB, no session, no FormData: everything here is decided before any of
 * those exist, which is the point of keeping it out of the "use server" file.
 */

describe("parseDisplayName", () => {
  it("accepts a name and trims surrounding whitespace", () => {
    const result = parseDisplayName("  Aisha Khan  ");
    expect(result).toEqual({ ok: true, value: "Aisha Khan" });
  });

  it("rejects an empty submission", () => {
    const result = parseDisplayName("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.state.field).toBe("name");
  });

  it("rejects a whitespace-only submission rather than storing a blank name", () => {
    const result = parseDisplayName("   ");
    expect(result.ok).toBe(false);
  });

  it("rejects a missing field", () => {
    expect(parseDisplayName(null).ok).toBe(false);
  });

  it("keeps interior spacing and non-ASCII characters intact", () => {
    const result = parseDisplayName("Zoë  van der Berg");
    expect(result).toEqual({ ok: true, value: "Zoë  van der Berg" });
  });
});

describe("eraseConfirmationMode", () => {
  it("asks for a password when the account has credentials", () => {
    expect(eraseConfirmationMode(["credential"])).toBe("password");
  });

  it("asks for the email when the account is OAuth-only", () => {
    // A Google account has no stored password, so a password prompt would be an
    // unpassable gate rather than a security control.
    expect(eraseConfirmationMode(["google"])).toBe("email");
  });

  it("prefers the password when both are linked", () => {
    expect(eraseConfirmationMode(["google", "credential"])).toBe("password");
  });

  it("falls back to the email confirmation when no provider is recorded", () => {
    expect(eraseConfirmationMode([])).toBe("email");
  });
});

describe("checkEmailConfirmation", () => {
  it("accepts the exact account email", () => {
    expect(checkEmailConfirmation("sam@example.com", "sam@example.com").ok).toBe(true);
  });

  it("tolerates the whitespace a paste tends to add", () => {
    expect(checkEmailConfirmation("  sam@example.com  ", "sam@example.com").ok).toBe(true);
  });

  it("refuses a different address", () => {
    const result = checkEmailConfirmation("someone@example.com", "sam@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.state.field).toBe("confirmEmail");
  });

  it("refuses a case-mismatched address — the friction is the point", () => {
    expect(checkEmailConfirmation("Sam@Example.com", "sam@example.com").ok).toBe(false);
  });

  it("refuses a missing submission", () => {
    expect(checkEmailConfirmation(null, "sam@example.com").ok).toBe(false);
  });
});

describe("erasureSummary", () => {
  it("says the sign-in is gone when this was the last vendor", () => {
    const summary = erasureSummary(true, 3);
    expect(summary).toContain("sign-in has been deleted");
    expect(summary).toContain("3 orders");
  });

  it("says the sign-in survives when another vendor still holds data", () => {
    const summary = erasureSummary(false, 1);
    expect(summary).toContain("Your sign-in still works");
    expect(summary).toContain("1 order was kept");
  });

  it("always discloses that orders are retained rather than deleted", () => {
    // The whole slice exists because /privacy promised something the app didn't
    // do; a summary that said "everything is gone" would recreate that gap.
    for (const identityDeleted of [true, false]) {
      expect(erasureSummary(identityDeleted, 2)).toContain("anonymised financial records");
    }
  });
});

describe("initialDataRightsState", () => {
  it("starts clean", () => {
    expect(initialDataRightsState).toEqual({ error: null, field: null, done: null });
  });
});
