import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1546 — staging's allowlist also accepts a mailbox a store saved as a receiving address's
 * forward-to, and Client Setup's test email to the signed-in admin. The secret cannot be edited by
 * the Worker, so the policy reads what a platform admin already saved. Production (open) never
 * looks anything up.
 */

const cfEnv: { current: Record<string, unknown> | null } = { current: null };

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    if (!cfEnv.current) throw new Error("not in a Worker");
    return { env: cfEnv.current };
  },
}));

const isRegisteredForwardTo = vi.fn<(prisma: unknown, address: string) => Promise<boolean>>();

vi.mock("@/lib/db", () => ({ getPrisma: () => ({}) }));
vi.mock("@/lib/repositories/inbound-address", () => ({
  isRegisteredForwardTo: (prisma: unknown, address: string) =>
    isRegisteredForwardTo(prisma, address),
}));

const originalEnv = { ...process.env };

function fakeBinding() {
  return { send: vi.fn().mockResolvedValue({ messageId: "m1" }) };
}

let binding: ReturnType<typeof fakeBinding>;

beforeEach(() => {
  process.env = { ...originalEnv };
  for (const k of ["EMAIL_PROVIDER", "EMAIL_RECIPIENT_MODE", "EMAIL_VERIFIED_DOMAINS", "APP_ENV"]) {
    delete process.env[k];
  }
  process.env.EMAIL_FROM = "no-reply@platform.test";
  process.env.EMAIL_ALLOWED_RECIPIENTS = "listed@x.test";
  binding = fakeBinding();
  cfEnv.current = { EMAIL: binding };
  isRegisteredForwardTo.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

async function send(message: { to: string; recipientIsSignedInAdmin?: boolean }) {
  const { getEmailService } = await import("@/lib/email");
  return getEmailService().send({ subject: "Hello", html: "<p>hi</p>", ...message });
}

describe("allowlist mode accepts Client Setup addresses (#1546)", () => {
  it("R1: a listed recipient is sent with no lookup", async () => {
    expect(await send({ to: "Listed@x.test" })).toEqual({ status: "sent" });
    expect(isRegisteredForwardTo).not.toHaveBeenCalled();
  });

  it("R2: an unlisted saved forward-to mailbox is sent", async () => {
    isRegisteredForwardTo.mockResolvedValue(true);
    expect(await send({ to: "Shop@Mailbox.test" })).toEqual({ status: "sent" });
    expect(isRegisteredForwardTo).toHaveBeenCalledWith(expect.anything(), "Shop@Mailbox.test");
    expect(binding.send).toHaveBeenCalledOnce();
  });

  it("R3/R5: a mailbox no receiving address forwards to is skipped", async () => {
    isRegisteredForwardTo.mockResolvedValue(false);
    const result = await send({ to: "stranger@x.test" });
    expect(result).toEqual({
      status: "skipped",
      reason: "recipient is not on EMAIL_ALLOWED_RECIPIENTS (recipient mode is allowlist)",
    });
    expect(binding.send).not.toHaveBeenCalled();
  });

  it("R5: a failed lookup keeps the skip and is logged", async () => {
    isRegisteredForwardTo.mockRejectedValue(new Error("db down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await send({ to: "stranger@x.test" })).status).toBe("skipped");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("db down"));
    expect(binding.send).not.toHaveBeenCalled();
  });

  it("R4: the test email to the signed-in admin is sent without a lookup", async () => {
    expect(await send({ to: "admin@x.test", recipientIsSignedInAdmin: true })).toEqual({
      status: "sent",
    });
    expect(isRegisteredForwardTo).not.toHaveBeenCalled();
  });

  it("R6: open mode sends anyone and never looks anything up", async () => {
    process.env.EMAIL_RECIPIENT_MODE = "open";
    expect(await send({ to: "stranger@x.test" })).toEqual({ status: "sent" });
    expect(isRegisteredForwardTo).not.toHaveBeenCalled();
  });
});

describe("only the two own-address test emails may claim the signed-in admin exemption (R4)", () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
      return /\.(ts|tsx)$/.test(name) ? [path.replace(/\\/g, "/")] : [];
    });
  }

  // A property key (`recipientIsSignedInAdmin: true`) is the only way to claim the exemption. The
  // interface declares it with `?:`, and generated docs only name it.
  // #1564 added the second: the Email templates page's Send test, which goes only to the signed-in
  // store admin's own address (`sendTestEmailTemplate`). Anything else claiming it is a leak.
  it("only Client Setup and Email templates set recipientIsSignedInAdmin", () => {
    const setters = ["app", "components", "features", "lib", "workers"]
      .flatMap(sources)
      .filter((path) => /recipientIsSignedInAdmin\s*:/.test(readFileSync(path, "utf8")));
    expect(setters.sort()).toEqual([
      "lib/client-setup-service.ts",
      "lib/email-templates-service.ts",
    ]);
  });
});

describe("Receiving addresses note (R7)", () => {
  it("renders only in allowlist mode", () => {
    const page = readFileSync("app/(admin)/staff/platform/client-setup/page.tsx", "utf8");
    expect(page).toMatch(
      /recipientMode === "allowlist" && \(\s*<p[^>]*data-allowlist-forward-note>\s*\{ALLOWLIST_FORWARD_NOTE\}/,
    );
  });
});
