import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("getEmailService", () => {
  it("skips sending (no crash) when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getEmailService } = await import("@/lib/email");
    await getEmailService().send({ to: "a@example.com", subject: "hi", html: "<p>hi</p>" });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it("builds a correct request against Resend's REST API when configured", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "no-reply@example.com";
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchSpy);

    const { getEmailService } = await import("@/lib/email");
    await getEmailService().send({
      to: "customer@example.com",
      subject: "Verify your email",
      html: "<p>click</p>",
    });

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
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toEqual({
      from: "no-reply@example.com",
      to: "customer@example.com",
      subject: "Verify your email",
      html: "<p>click</p>",
    });
  });

  it("logs, doesn't throw, when Resend responds with an error", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "no-reply@example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => "bad request" }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getEmailService } = await import("@/lib/email");
    await expect(
      getEmailService().send({ to: "a@example.com", subject: "hi", html: "<p>hi</p>" }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
  });
});
