import { describe, it, expect, vi, beforeEach } from "vitest";

const setVendorRole = vi.fn();
vi.mock("@/lib/roles-service", () => ({ setVendorRole }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

/** #1482 R20 — the Team & Access action allow-lists the role before anything reaches the repository. */
describe("assignRoleAction role allow-list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setVendorRole.mockResolvedValue(undefined);
  });

  it("refuses a role the form does not offer, without calling setVendorRole", async () => {
    const { assignRoleAction } = await import("@/app/(admin)/staff/team/actions");
    const result = await assignRoleAction({}, form({ email: "a@example.com", role: "OWNER" }));
    expect(result).toEqual({ error: "Invalid role", success: undefined });
    expect(setVendorRole).not.toHaveBeenCalled();
  });

  it.each([
    ["STAFF", "STAFF"],
    ["ADMIN", "ADMIN"],
    ["PLATFORM_ADMIN", "PLATFORM_ADMIN"],
    ["NONE", null],
  ])("passes %s through as %s", async (role, expected) => {
    const { assignRoleAction } = await import("@/app/(admin)/staff/team/actions");
    const result = await assignRoleAction({}, form({ email: "a@example.com", role }));
    expect(result).toEqual({ success: true, error: undefined });
    expect(setVendorRole).toHaveBeenCalledWith("a@example.com", expected);
  });
});
