import { describe, it, expect } from "vitest";
import { parseArgs } from "@/scripts/delete-cell-orders";

describe("#1512 delete-cell-orders arguments", () => {
  it("is a dry run unless --apply is given", () => {
    expect(parseArgs(["secrets/x.vars", "AFC_DIRECT_URL"])).toEqual({
      file: "secrets/x.vars",
      key: "AFC_DIRECT_URL",
      apply: false,
      rehearse: false,
      confirmHost: undefined,
    });
  });

  it("reads --apply and the host it must confirm", () => {
    const a = parseArgs(["f", "K", "--apply", "--confirm-host", "ep-x.neon.tech"]);
    expect(a.apply).toBe(true);
    expect(a.confirmHost).toBe("ep-x.neon.tech");
  });

  it("leaves confirmHost unset when --apply has no --confirm-host", () => {
    expect(parseArgs(["f", "K", "--apply"]).confirmHost).toBeUndefined();
  });
});

describe("#1512 --rehearse", () => {
  it("is read as its own mode, separate from --apply", () => {
    const a = parseArgs(["f", "K", "--rehearse"]);
    expect(a.rehearse).toBe(true);
    expect(a.apply).toBe(false);
  });
});
