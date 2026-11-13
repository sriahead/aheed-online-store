import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  existingAccountEmail,
  notifyExistingAccountSignUp,
  type ExistingAccountDeps,
} from "@/lib/notifications/existing-account";
import type { OutgoingEmail } from "@/lib/email/types";

const BASE = "https://shop.example";

describe("#1558 existingAccountEmail", () => {
  it("R2: subject names the store", () => {
    const email = existingAccountEmail({ storeName: "Corner Shop", baseUrl: BASE, providers: [] });
    expect(email.subject).toBe("You already have an account with Corner Shop");
  });

  it("R3/R4: password account gets absolute sign-in and forgot-password links, no Google line", () => {
    const { html } = existingAccountEmail({
      storeName: "Corner Shop",
      baseUrl: `${BASE}/`,
      providers: ["credential"],
    });
    expect(html).toContain(`href="${BASE}/login"`);
    expect(html).toContain(`href="${BASE}/forgot-password"`);
    expect(html).not.toContain("Google");
    expect(html).toContain("Didn&#39;t try to create an account?");
  });

  it("R3: Google-only account is pointed at Google, not a password reset", () => {
    const { html } = existingAccountEmail({
      storeName: "Corner Shop",
      baseUrl: BASE,
      providers: ["google"],
    });
    expect(html).toContain("sign in with Google");
    expect(html).not.toContain("forgot-password");
  });

  it("R3: both providers get both routes; neither recorded falls back to the reset link", () => {
    const both = existingAccountEmail({
      storeName: "S",
      baseUrl: BASE,
      providers: ["credential", "google"],
    });
    expect(both.html).toContain("sign in with Google");
    expect(both.html).toContain("forgot-password");
    const none = existingAccountEmail({ storeName: "S", baseUrl: BASE, providers: [] });
    expect(none.html).toContain("forgot-password");
  });

  it("R3: escapes the store name and carries no token-bearing link", () => {
    const { html } = existingAccountEmail({
      storeName: `<b>"Bad" & Co</b>`,
      baseUrl: BASE,
      providers: ["credential"],
    });
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;&quot;Bad&quot; &amp; Co&lt;/b&gt;");
    expect(html).not.toMatch(/token=|callbackURL|verify-email|reset-password/);
  });
});

function deps(overrides: Partial<ExistingAccountDeps> = {}) {
  const base = {
    loadProviders: vi.fn(async (_userId: string): Promise<readonly string[]> => ["credential"]),
    resolveSender: vi.fn(async () => ({ name: "Corner Shop", email: "shop@example.com" })),
    defaultStoreName: "Platform",
    send: vi.fn(async (_email: OutgoingEmail): Promise<unknown> => undefined),
    log: vi.fn((_line: string) => undefined),
  };
  // Overrides are vi.fn() mocks too; the cast keeps `.mock` on every member.
  return { ...base, ...overrides } as typeof base;
}

const USER = { id: "u1", email: "holder@example.com" };

describe("#1558 notifyExistingAccountSignUp", () => {
  it("R2: sends one email to the holder from the store's sender", async () => {
    const d = deps();
    await notifyExistingAccountSignUp(USER, BASE, d);
    expect(d.send).toHaveBeenCalledTimes(1);
    const sent = d.send.mock.calls[0][0];
    expect(sent.to).toBe("holder@example.com");
    expect(sent.sender).toEqual({ name: "Corner Shop", email: "shop@example.com" });
    expect(sent.subject).toBe("You already have an account with Corner Shop");
    expect(d.loadProviders).toHaveBeenCalledWith("u1");
  });

  it("R2: no store resolved falls back to the platform name", async () => {
    const d = deps({ resolveSender: vi.fn(async () => undefined) });
    await notifyExistingAccountSignUp(USER, BASE, d);
    expect(d.send.mock.calls[0][0].subject).toBe("You already have an account with Platform");
  });

  it.each([
    ["loadProviders", { loadProviders: vi.fn(async () => Promise.reject(new Error("db"))) }],
    ["resolveSender", { resolveSender: vi.fn(async () => Promise.reject(new Error("vendor"))) }],
    ["send", { send: vi.fn(async () => Promise.reject(new Error("smtp"))) }],
  ] as const)("R5: a failing %s resolves and logs without the address", async (_name, o) => {
    const d = deps(o as unknown as Partial<ExistingAccountDeps>);
    await expect(notifyExistingAccountSignUp(USER, BASE, d)).resolves.toBeUndefined();
    expect(d.log).toHaveBeenCalledTimes(1);
    expect(d.log.mock.calls[0][0]).not.toContain("holder@example.com");
    expect(d.log.mock.calls[0][0]).toContain("userId=u1");
  });
});

describe("#1558 no base URL", () => {
  it("R4: without a base URL nothing is sent and the skip is logged without the address", async () => {
    const d = deps();
    await notifyExistingAccountSignUp(USER, undefined, d);
    expect(d.send).not.toHaveBeenCalled();
    expect(d.log.mock.calls[0][0]).toContain("no base URL");
    expect(d.log.mock.calls[0][0]).not.toContain("holder@example.com");
  });
});

describe("#1558 wiring", () => {
  const root = process.cwd();
  const auth = readFileSync(join(root, "lib/auth.ts"), "utf8");

  it("R1: lib/auth.ts wires onExistingUserSignUp to the service with the request baseURL", () => {
    expect(auth).toMatch(
      /onExistingUserSignUp:\s*async \(\{ user \}\) => \{\s*await notifyExistingAccountSignUpForRequest\(user, baseURL\);/,
    );
    expect(auth).toContain("requireEmailVerification: true");
  });

  it("R7: /sign-up/email stays rate limited", () => {
    expect(auth).toMatch(/SENSITIVE_AUTH_PATHS = \[[^\]]*"\/sign-up\/email"/);
  });

  it("R6: the register success screen is neutral", () => {
    const form = readFileSync(join(root, "features/auth/components/RegisterForm.tsx"), "utf8");
    expect(form).toContain("Check your email");
    expect(form).toContain("Open it to continue.");
    expect(form).not.toContain("verification link before signing in");
  });
});
