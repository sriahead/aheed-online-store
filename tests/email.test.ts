import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isRecipientAllowed, resolveSender } from "@/lib/email/policy";
import { createCloudflareAdapter } from "@/lib/email/cloudflare";
import { createResendAdapter } from "@/lib/email/resend";
import { createLogAdapter } from "@/lib/email/log";
import type { ResolvedEmail } from "@/lib/email/types";

/**
 * #1217 — the provider-agnostic email port. Covers R2 (selection), R3/R4 (adapter requests),
 * R5 (sender resolution), R6 (recipient policy) and R7 (failures never throw).
 *
 * `@opennextjs/cloudflare` is mocked so a test can put an `EMAIL` binding in the "Worker context"
 * or leave it absent. lib/config's readEnv reads the same context and falls back to process.env
 * for string values, which is where these tests set config.
 */

const cfEnv: { current: Record<string, unknown> | null } = { current: null };

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    if (!cfEnv.current) throw new Error("not in a Worker");
    return { env: cfEnv.current };
  },
}));

const originalEnv = { ...process.env };

function fakeBinding() {
  return { send: vi.fn().mockResolvedValue({ messageId: "m1" }) };
}

beforeEach(() => {
  process.env = { ...originalEnv };
  for (const k of [
    "EMAIL_PROVIDER",
    "EMAIL_FROM",
    "EMAIL_VERIFIED_DOMAINS",
    "EMAIL_RECIPIENT_MODE",
    "EMAIL_ALLOWED_RECIPIENTS",
    "RESEND_API_KEY",
    "PLATFORM_NAME",
  ]) {
    delete process.env[k];
  }
  process.env.EMAIL_FROM = "no-reply@platform.test";
  process.env.EMAIL_RECIPIENT_MODE = "open";
  cfEnv.current = null;
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function send(params: Parameters<Awaited<ReturnType<typeof load>>["send"]>[0]) {
  return (await load()).send(params);
}

async function load() {
  const { getEmailService } = await import("@/lib/email");
  return getEmailService();
}

const MESSAGE = { to: "customer@example.com", subject: "Hello", html: "<p>hi</p>" };

describe("adapter selection (R2)", () => {
  it("EMAIL_PROVIDER=cloudflare uses the binding", async () => {
    const binding = fakeBinding();
    cfEnv.current = { EMAIL: binding };
    process.env.EMAIL_PROVIDER = "cloudflare";
    expect(await send(MESSAGE)).toEqual({ status: "sent" });
    expect(binding.send).toHaveBeenCalledOnce();
  });

  it("EMAIL_PROVIDER=resend uses Resend even when the binding exists", async () => {
    const binding = fakeBinding();
    cfEnv.current = { EMAIL: binding };
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_key";
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await send(MESSAGE)).toEqual({ status: "sent" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(binding.send).not.toHaveBeenCalled();
  });

  it("EMAIL_PROVIDER=log sends nothing", async () => {
    const binding = fakeBinding();
    cfEnv.current = { EMAIL: binding };
    process.env.EMAIL_PROVIDER = "log";
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await send(MESSAGE)).status).toBe("skipped");
    expect(binding.send).not.toHaveBeenCalled();
  });

  it("unset with the binding present picks Cloudflare", async () => {
    const binding = fakeBinding();
    cfEnv.current = { EMAIL: binding };
    expect(await send(MESSAGE)).toEqual({ status: "sent" });
    expect(binding.send).toHaveBeenCalledOnce();
  });

  it("unset with no binding picks log only", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await send(MESSAGE)).status).toBe("skipped");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

const RESOLVED: ResolvedEmail = {
  from: { name: "Corner Shop", email: "orders@shop.test" },
  replyTo: "help@shop.test",
  to: "customer@example.com",
  subject: "Order confirmed",
  html: "<p>thanks</p>",
};

describe("cloudflare adapter (R3)", () => {
  it("passes the exact message object to the binding", async () => {
    const binding = fakeBinding();
    await createCloudflareAdapter(binding).deliver(RESOLVED);
    expect(binding.send).toHaveBeenCalledWith({
      from: { name: "Corner Shop", email: "orders@shop.test" },
      to: "customer@example.com",
      subject: "Order confirmed",
      html: "<p>thanks</p>",
      replyTo: "help@shop.test",
    });
  });

  it("omits replyTo when none is resolved", async () => {
    const binding = fakeBinding();
    await createCloudflareAdapter(binding).deliver({ ...RESOLVED, replyTo: undefined });
    expect(binding.send.mock.calls[0][0]).not.toHaveProperty("replyTo");
  });
});

describe("resend adapter (R4)", () => {
  it("builds the Resend request with a formatted from and reply_to", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchSpy);
    await createResendAdapter("re_test_key").deliver(RESOLVED);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test_key",
          "content-type": "application/json",
        }),
      }),
    );
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({
      from: "Corner Shop <orders@shop.test>",
      to: "customer@example.com",
      subject: "Order confirmed",
      html: "<p>thanks</p>",
      reply_to: "help@shop.test",
    });
  });
});

describe("sender resolution (R5)", () => {
  const base = { platformFrom: "no-reply@platform.test", platformName: "Platform" };

  it("a verified vendor domain sends as the vendor, with no replyTo", () => {
    expect(
      resolveSender({
        ...base,
        sender: { name: "Corner Shop", email: "orders@shop.test" },
        verifiedDomains: "other.test, shop.test",
      }),
    ).toEqual({ from: { name: "Corner Shop", email: "orders@shop.test" } });
  });

  it("an unverified vendor domain sends as the platform with replyTo the vendor", () => {
    expect(
      resolveSender({
        ...base,
        sender: { name: "Corner Shop", email: "orders@shop.test" },
        verifiedDomains: "other.test",
      }),
    ).toEqual({
      from: { name: "Corner Shop", email: "no-reply@platform.test" },
      replyTo: "orders@shop.test",
    });
  });

  it("no sender means the platform itself", () => {
    expect(resolveSender({ ...base, verifiedDomains: "shop.test" })).toEqual({
      from: { name: "Platform", email: "no-reply@platform.test" },
    });
  });

  it("matches the domain case-insensitively", () => {
    expect(
      resolveSender({
        ...base,
        sender: { name: "Corner Shop", email: "Orders@Shop.TEST" },
        verifiedDomains: "SHOP.test",
      }).replyTo,
    ).toBeUndefined();
  });
});

describe("recipient policy (R6)", () => {
  it("open allows anyone", () => {
    expect(isRecipientAllowed({ to: "a@x.test", mode: "open", allowedRecipients: "" })).toBe(true);
  });

  it("allowlist allows a listed address, case-insensitively", () => {
    expect(
      isRecipientAllowed({
        to: "Tester@X.test",
        mode: "allowlist",
        allowedRecipients: "tester@x.test",
      }),
    ).toBe(true);
  });

  it("a disallowed recipient is skipped, logged, and never reaches the adapter", async () => {
    const binding = fakeBinding();
    cfEnv.current = { EMAIL: binding };
    process.env.EMAIL_RECIPIENT_MODE = "allowlist";
    process.env.EMAIL_ALLOWED_RECIPIENTS = "tester@x.test";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await send(MESSAGE);
    expect(result.status).toBe("skipped");
    expect(binding.send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("unset mode is allowlist mode", () => {
    expect(isRecipientAllowed({ to: "a@x.test", mode: undefined, allowedRecipients: "" })).toBe(
      false,
    );
    expect(
      isRecipientAllowed({ to: "a@x.test", mode: undefined, allowedRecipients: "a@x.test" }),
    ).toBe(true);
  });

  it("an empty allowlist sends nothing", () => {
    expect(
      isRecipientAllowed({ to: "a@x.test", mode: "allowlist", allowedRecipients: undefined }),
    ).toBe(false);
  });
});

describe("failures never throw (R7)", () => {
  it("cloudflare: a throwing binding resolves as failed and is logged", async () => {
    cfEnv.current = {
      EMAIL: { send: vi.fn().mockRejectedValue(new Error("domain not onboarded")) },
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await send(MESSAGE);
    expect(result).toEqual({ status: "failed", reason: "domain not onboarded" });
    expect(error).toHaveBeenCalledOnce();
  });

  it("cloudflare: a missing binding resolves as failed", async () => {
    expect(await createCloudflareAdapter(undefined).deliver(RESOLVED)).toMatchObject({
      status: "failed",
    });
  });

  it("resend: a 500 resolves as failed and is logged", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }),
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await send(MESSAGE)).status).toBe("failed");
    expect(error).toHaveBeenCalledOnce();
  });

  it("resend: a missing key resolves as failed", async () => {
    expect(await createResendAdapter(undefined).deliver(RESOLVED)).toMatchObject({
      status: "failed",
    });
  });

  it("log: never throws", async () => {
    await expect(createLogAdapter().deliver(RESOLVED)).resolves.toMatchObject({
      status: "skipped",
    });
  });

  it("an invalid configuration resolves as failed rather than throwing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.EMAIL_FROM;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await send(MESSAGE)).status).toBe("failed");
    expect(error).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });
});
