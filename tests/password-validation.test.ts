import { describe, expect, it } from "vitest";
import { evaluatePassword, PASSWORD_RULES } from "@/features/auth/password-validation";

describe("evaluatePassword", () => {
  it("evaluates empty password as weak with 0 met rules", () => {
    const res = evaluatePassword("");
    expect(res.score).toBe(0);
    expect(res.allMet).toBe(false);
    expect(res.strength).toBe("weak");
  });

  it("checks minimum 8 characters requirement", () => {
    const shortRule = PASSWORD_RULES.find((r) => r.id === "length")!;
    expect(shortRule.test("Abc1!")).toBe(false);
    expect(shortRule.test("Abcdef1!")).toBe(true);
  });

  it("checks uppercase letter requirement", () => {
    const rule = PASSWORD_RULES.find((r) => r.id === "uppercase")!;
    expect(rule.test("password123!")).toBe(false);
    expect(rule.test("Password123!")).toBe(true);
  });

  it("checks lowercase letter requirement", () => {
    const rule = PASSWORD_RULES.find((r) => r.id === "lowercase")!;
    expect(rule.test("PASSWORD123!")).toBe(false);
    expect(rule.test("Password123!")).toBe(true);
  });

  it("checks number requirement", () => {
    const rule = PASSWORD_RULES.find((r) => r.id === "number")!;
    expect(rule.test("Password!!!")).toBe(false);
    expect(rule.test("Password123!")).toBe(true);
  });

  it("checks special character requirement", () => {
    const rule = PASSWORD_RULES.find((r) => r.id === "special")!;
    expect(rule.test("Password123")).toBe(false);
    expect(rule.test("Password123!")).toBe(true);
    expect(rule.test("Password123@")).toBe(true);
    expect(rule.test("Password123#")).toBe(true);
    expect(rule.test("Password123$")).toBe(true);
  });

  it("rates password meeting all 5 requirements as strong", () => {
    const res = evaluatePassword("P@ssw0rd2026!");
    expect(res.score).toBe(5);
    expect(res.allMet).toBe(true);
    expect(res.strength).toBe("strong");
    expect(res.strengthLabel).toBe("Strong");
  });

  it("rates password meeting 3-4 requirements as medium", () => {
    const res = evaluatePassword("Password123"); // missing special character
    expect(res.score).toBe(4);
    expect(res.allMet).toBe(false);
    expect(res.strength).toBe("medium");
  });
});
