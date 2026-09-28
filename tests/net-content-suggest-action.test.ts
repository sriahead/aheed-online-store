import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #927 — `suggestNetContent` (R7-R9): ADMIN only, vendor from the session, and a valid
 * "use server" module. The actions module is imported for real; its dependencies are mocked.
 */

const mocks = vi.hoisted(() => ({
  requireVendorRole: vi.fn(),
  runForVendor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole: mocks.requireVendorRole }));
vi.mock("@/lib/net-content-suggestions-service", () => ({
  runNetContentSuggestionsForVendor: mocks.runForVendor,
  rejectNetContentSuggestionForVendor: vi.fn(),
  reviewNetContentSuggestionForVendor: vi.fn(),
}));

import * as actions from "@/features/admin/net-content-suggestions";
import { initialNetContentReviewState } from "@/lib/net-content-review-form";

const admin = {
  ok: true,
  user: { id: "u1", email: "a@x", name: "A" },
  vendorId: "v1",
  via: "ADMIN",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireVendorRole.mockResolvedValue(admin);
  mocks.runForVendor.mockResolvedValue({ kind: "nothing-eligible" });
});

describe('features/admin/net-content-suggestions.ts is a valid "use server" module (R7)', () => {
  it("exports only async functions, including suggestNetContent", () => {
    const exports = Object.entries(actions);
    expect(Object.keys(actions)).toContain("suggestNetContent");
    for (const [name, value] of exports) {
      expect(typeof value, `${name} must be a function`).toBe("function");
      expect((value as () => unknown).constructor.name, `${name} must be async`).toBe(
        "AsyncFunction",
      );
    }
  });
});

describe("suggestNetContent", () => {
  it("is guarded by requireVendorRole('ADMIN') alone (R8)", async () => {
    await actions.suggestNetContent(initialNetContentReviewState, new FormData());
    expect(mocks.requireVendorRole).toHaveBeenCalledWith("ADMIN");
  });

  it("refuses a signed-out caller without running (R8)", async () => {
    mocks.requireVendorRole.mockResolvedValue({
      ok: false,
      status: 401,
      reason: "unauthenticated",
    });
    const state = await actions.suggestNetContent(initialNetContentReviewState, new FormData());
    expect(state).toEqual({
      error: "Please sign in as a store admin to ask for suggestions.",
      notice: null,
    });
    expect(mocks.runForVendor).not.toHaveBeenCalled();
  });

  it("refuses staff without running (R8)", async () => {
    mocks.requireVendorRole.mockResolvedValue({ ok: false, status: 403, reason: "forbidden" });
    const state = await actions.suggestNetContent(initialNetContentReviewState, new FormData());
    expect(state).toEqual({
      error: "Only a store admin can ask the AI for suggestions.",
      notice: null,
    });
    expect(mocks.runForVendor).not.toHaveBeenCalled();
  });

  it("uses the session's vendor, never a form field (R9)", async () => {
    const form = new FormData();
    form.set("vendorId", "other");
    await actions.suggestNetContent(initialNetContentReviewState, form);
    expect(mocks.runForVendor).toHaveBeenCalledWith("v1");
  });

  it("revalidates the page only after a run (R9)", async () => {
    await actions.suggestNetContent(initialNetContentReviewState, new FormData());
    expect(mocks.revalidatePath).not.toHaveBeenCalled();

    mocks.runForVendor.mockResolvedValue({
      kind: "ran",
      summary: {
        outcome: "completed",
        attempted: 1,
        pending: 1,
        noAnswer: 0,
        failed: 0,
        inputTokens: 1,
        outputTokens: 1,
        neurons: 5,
        neuronsIncomplete: false,
        meanLatencyMs: 1,
      },
    });
    const state = await actions.suggestNetContent(initialNetContentReviewState, new FormData());
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/staff/net-content");
    expect(state.notice).toBe(
      "Asked about 1 product(s): 1 suggested, 0 no answer, 0 failed (about 5 neurons).",
    );
  });
});
