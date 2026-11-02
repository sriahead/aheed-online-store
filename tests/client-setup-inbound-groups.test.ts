import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { groupAddressesByForwardTo } from "@/lib/client-setup/inbound-groups";
import type { InboundAddressRow } from "@/lib/repositories/inbound-address";

/**
 * #1399 R7 — Client Setup's receiving addresses grouped by the mailbox they forward to.
 */

function row(address: string, forwardTo: string): InboundAddressRow {
  return {
    id: `id-${address}`,
    vendorId: "v1",
    address,
    purpose: "SUPPORT",
    forwardTo,
    createdAt: new Date(0),
  };
}

describe("groupAddressesByForwardTo (R7)", () => {
  const rows = [
    row("orders@shop.test", "hub@inbox.test"),
    row("other@shop.test", "own@inbox.test"),
    row("info@shop.test", "hub@inbox.test"),
  ];

  it("puts addresses sharing a mailbox in one group, sorted, every row exactly once", () => {
    const groups = groupAddressesByForwardTo(rows, null);
    expect(groups.map((g) => g.forwardTo)).toEqual(["hub@inbox.test", "own@inbox.test"]);
    expect(groups[0].addresses.map((a) => a.address)).toEqual([
      "info@shop.test",
      "orders@shop.test",
    ]);
    expect(groups[1].addresses.map((a) => a.address)).toEqual(["other@shop.test"]);
    expect(groups.flatMap((g) => g.addresses)).toHaveLength(rows.length);
  });

  it("flags only the group whose mailbox is the default", () => {
    const groups = groupAddressesByForwardTo(rows, "hub@inbox.test");
    expect(groups.map((g) => g.isDefault)).toEqual([true, false]);
  });

  it("flags nothing when there is no default", () => {
    expect(groupAddressesByForwardTo(rows, null).some((g) => g.isDefault)).toBe(false);
  });

  it("returns no groups for no addresses", () => {
    expect(groupAddressesByForwardTo([], "hub@inbox.test")).toEqual([]);
  });

  it("is a plain module, not a server-action file", () => {
    const source = readFileSync("lib/client-setup/inbound-groups.ts", "utf8");
    expect(source).not.toMatch(/^\s*["']use server["']/m);
  });
});
