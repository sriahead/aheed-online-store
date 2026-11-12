import { describe, it, expect } from "vitest";
import {
  parseArgs,
  toStagingEmail,
  toStagingHost,
  toStagingLabel,
} from "@/scripts/cell-staging-after-refresh";

const D = "aheedfoodcentre.co.uk";

describe("#1512 cell-staging-after-refresh", () => {
  it("rewrites the production host to the staging host, and leaves others alone", () => {
    expect(toStagingHost(`www.${D}`, D)).toBe(`staging.${D}`);
    expect(toStagingHost(D, D)).toBe(`staging.${D}`);
    expect(toStagingHost(`staging.${D}`, D)).toBe(`staging.${D}`);
    expect(toStagingHost("srimart.merqify.com", D)).toBe("srimart.merqify.com");
  });

  it("moves an address on the client domain to the staging subdomain, idempotently", () => {
    expect(toStagingEmail(`orders@${D}`, D)).toBe(`orders@staging.${D}`);
    expect(toStagingEmail(`orders@staging.${D}`, D)).toBe(`orders@staging.${D}`);
    expect(toStagingEmail("no-reply@merqify.com", D)).toBe("no-reply@merqify.com");
    expect(toStagingEmail("not-an-email", D)).toBe("not-an-email");
  });

  it("parses --domain, --apply and --confirm-host", () => {
    expect(
      parseArgs(["f", "K", "--domain", D, "--apply", "--confirm-host", "ep-x.neon.tech"]),
    ).toEqual({ file: "f", key: "K", domain: D, apply: true, confirmHost: "ep-x.neon.tech" });
  });
});

describe("#1512 health label", () => {
  it("adds the staging suffix to a copied label once, and leaves the default alone", () => {
    expect(toStagingLabel("afc-dedicated-cell")).toBe("afc-dedicated-cell-staging");
    expect(toStagingLabel("afc-dedicated-cell-staging")).toBe("afc-dedicated-cell-staging");
    expect(toStagingLabel("ok")).toBe("ok");
  });
});
