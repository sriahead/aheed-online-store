import { beforeEach, describe, expect, it, vi } from "vitest";
import { csvCell, toCsv } from "@/lib/pricing/csv";

/** #1309 R24: the CSV export route and its quoting. */

const requireVendorRole = vi.fn();
vi.mock("@/lib/auth-rbac", () => ({ requireVendorRole }));

const URL_BASE = "http://localhost/staff/platform/costs/export";

async function get(section: string | null) {
  const { GET } = await import("@/app/(admin)/staff/platform/costs/export/route");
  return GET(new Request(section === null ? URL_BASE : `${URL_BASE}?section=${section}`));
}

beforeEach(() => {
  requireVendorRole.mockReset();
  requireVendorRole.mockResolvedValue({ ok: true, via: "platform-admin", vendorId: "v1" });
});

describe("platform admin", () => {
  it.each(["costs", "competitors", "plans", "scenarios", "models"])(
    "returns %s as an attachment CSV",
    async (section) => {
      const response = await get(section);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/^text\/csv/);
      expect(response.headers.get("content-disposition")).toMatch(
        new RegExp(`attachment; filename="${section}-\\d{4}-\\d{2}-\\d{2}\\.csv"`),
      );
      const [header] = (await response.text()).split("\r\n");
      expect(header).toMatch(/(^|,)(as_of|retrieved_on)(,|$)/);
      if (["costs", "competitors", "plans", "scenarios", "models"].includes(section)) {
        expect(header).toMatch(/currency/);
      }
    },
  );

  it("money is integer minor units, never a formatted amount", async () => {
    const body = await (await get("competitors")).text();
    expect(body).not.toMatch(/[£$]\d/);
    expect(body).toContain(",2500,GBP,");
  });

  it("rejects an unknown or missing section with 400", async () => {
    expect((await get("secrets")).status).toBe(400);
    expect((await get(null)).status).toBe(400);
  });
});

describe("refusals carry no CSV", () => {
  it.each([
    ["unauthenticated", { ok: false, status: 401, reason: "unauthenticated" }, 401],
    ["vendor STAFF", { ok: false, status: 403, reason: "forbidden" }, 403],
    ["vendor ADMIN", { ok: true, via: "ADMIN", vendorId: "v1" }, 403],
  ])("%s gets %s", async (_label, auth, status) => {
    requireVendorRole.mockResolvedValue(auth);
    const response = await get("costs");
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type") ?? "").not.toMatch(/csv/);
    expect(await response.text()).not.toContain(",");
  });
});

describe("quoting (RFC 4180) and formula injection", () => {
  it("prefixes a formula-looking text cell and quotes it", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+1")).toBe(`"'+1"`);
    expect(csvCell("@cmd")).toBe(`"'@cmd"`);
    expect(csvCell("-x")).toBe(`"'-x"`);
  });

  it("quotes commas, quotes and newlines; leaves numbers (including negatives) as numbers", () => {
    expect(csvCell('a, "b"')).toBe(`"a, ""b"""`);
    expect(csvCell("line\nbreak")).toBe(`"line\nbreak"`);
    expect(csvCell(-700)).toBe("-700");
    expect(csvCell(null)).toBe("");
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("a,b\r\n1,x\r\n");
  });
});
