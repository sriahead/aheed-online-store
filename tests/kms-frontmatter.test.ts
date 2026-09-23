import { describe, it, expect } from "vitest";
import { FrontMatter, trackFor, AUDIENCE_TRACK, TRACK_SITE } from "@/kms/schema/frontmatter";
import { isSliceLocal } from "@/kms/schema/repo";
import { destinationFor } from "@/kms/scripts/assemble";

const validExample = {
  id: "adr-003-storage-abstraction",
  title: "ADR-003 — Object Storage Abstraction (S3-compatible)",
  audience: ["dev"],
  type: "adr",
  status: "approved",
  version: "1.0.0",
  updated: "2026-08-05",
  visibility: "internal",
  tags: ["storage", "r2", "s3", "portability", "adr"],
  summary:
    "Access object storage only via the S3 API behind a StorageService port; the DB stores relative keys and URLs are composed at read time.",
  related: ["adr-001-hosting", "architecture"],
};

// Proves the KMS contract from specs/2026-08-06-kms/plan.md §3.
describe("FrontMatter", () => {
  it("parses a valid front-matter block", () => {
    const result = FrontMatter.safeParse(validExample);
    expect(result.success).toBe(true);
  });

  it("defaults tags to an empty array when omitted", () => {
    const { tags, ...rest } = validExample;
    const result = FrontMatter.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tags).toEqual([]);
  });

  it("requires visibility — never defaults to public", () => {
    const { visibility, ...rest } = validExample;
    const result = FrontMatter.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a malformed id (uppercase/spaces)", () => {
    const result = FrontMatter.safeParse({ ...validExample, id: "Not A Valid Id" });
    expect(result.success).toBe(false);
  });

  it("rejects a summary that's too short", () => {
    const result = FrontMatter.safeParse({ ...validExample, summary: "too short" });
    expect(result.success).toBe(false);
  });
});

/**
 * Precedence is staff-ops, then internal-eng, then customer-help — most restrictive first, so a
 * document reaches the public surface only when it touches NO internal audience (#861).
 *
 * This file previously asserted the opposite for a mixed list: `["dev", "customer"]` was expected
 * to derive customer-help, because the old derivation tested customer audiences first and returned
 * on the first match. That is the defect, not the contract. It sent
 * docs/operations-research/order-fulfilment-core.md — `visibility: internal`, audience including
 * `shopper` — to the public site, leaving the #851 pilot's canonical orders document absent from
 * the only deployed KMS surface.
 */
describe("trackFor", () => {
  const base = FrontMatter.parse(validExample);

  it("routes a customer-only audience to customer-help", () => {
    expect(trackFor({ ...base, audience: ["customer"] })).toBe("customer-help");
    expect(trackFor({ ...base, audience: ["shopper"] })).toBe("customer-help");
  });

  it("keeps a mixed customer audience OFF the public track", () => {
    expect(trackFor({ ...base, audience: ["dev", "customer"] })).toBe("internal-eng");
    expect(trackFor({ ...base, audience: ["staff", "shopper"] })).toBe("staff-ops");
  });

  it("routes staff audiences to staff-ops, ahead of engineering", () => {
    expect(trackFor({ ...base, audience: ["staff"] })).toBe("staff-ops");
    expect(trackFor({ ...base, audience: ["dev", "staff"] })).toBe("staff-ops");
  });

  it("routes dev-only audiences to internal-eng", () => {
    expect(trackFor({ ...base, audience: ["dev"] })).toBe("internal-eng");
  });

  // platform-admin was in the Audience enum and in none of the old branches, so it fell through
  // to internal-eng and the platform admin guide rendered in the engineering section.
  it("routes platform-admin to staff-ops rather than falling through", () => {
    expect(trackFor({ ...base, audience: ["platform-admin"] })).toBe("staff-ops");
    expect(trackFor({ ...base, audience: ["product", "platform-admin"] })).toBe("staff-ops");
  });

  // The four documents this slice re-routes, by their real audience lists.
  it("routes each re-routed document to staff-ops", () => {
    const realAudiences: Record<string, FrontMatter["audience"]> = {
      "order-fulfilment-core": ["staff", "store-admin", "dev", "product", "shopper"],
      "kms-pilot-orders-fulfilment-plan": ["dev", "product", "staff", "store-admin", "shopper"],
      "platform-admin-guide": ["platform-admin"],
      "business-case": ["product", "platform-admin"],
    };
    for (const [id, audience] of Object.entries(realAudiences)) {
      expect(trackFor({ ...base, id, audience })).toBe("staff-ops");
    }
  });
});

describe("assembly routing", () => {
  const base = FrontMatter.parse(validExample);

  // The guarantee visibility exists to provide. Before #861 assemble.ts never read the field:
  // routing was track-only, so an internal document with a customer audience was written into
  // the public site's content directory.
  it("never routes an internal document to the public site", () => {
    const audiences = Object.keys(AUDIENCE_TRACK) as FrontMatter["audience"];
    for (const audience of audiences) {
      const fm = { ...base, audience: [audience], visibility: "internal" as const };
      expect(destinationFor(fm, "public")).toBeNull();
    }
    const mixed = {
      ...base,
      audience: ["staff", "shopper"] as FrontMatter["audience"],
      visibility: "internal" as const,
    };
    expect(destinationFor(mixed, "public")).toBeNull();
    expect(destinationFor(mixed, "internal")).toEqual({ subdir: "staff" });
  });

  it("never routes a public document to the internal site", () => {
    const fm = {
      ...base,
      audience: ["customer"] as FrontMatter["audience"],
      visibility: "public" as const,
    };
    expect(destinationFor(fm, "internal")).toBeNull();
    expect(destinationFor(fm, "public")).toEqual({ subdir: "customer" });
  });

  // A document whose track and visibility disagree assembles nowhere; kms:validate fails on it
  // rather than letting it disappear silently.
  it("routes a track/visibility disagreement to neither site", () => {
    const fm = {
      ...base,
      audience: ["customer"] as FrontMatter["audience"],
      visibility: "internal" as const,
    };
    expect(TRACK_SITE[trackFor(fm)]).not.toBe(fm.visibility);
    expect(destinationFor(fm, "internal")).toBeNull();
    expect(destinationFor(fm, "public")).toBeNull();
  });
});

describe("isSliceLocal", () => {
  it("matches the three template filenames inside a dated slice directory", () => {
    expect(isSliceLocal("specs/2026-09-13-p402-express-sla/requirements.md")).toBe(true);
    expect(isSliceLocal("specs/2026-09-13-p402-express-sla/validation.md")).toBe(true);
    expect(isSliceLocal("specs/2026-09-13-p402-express-sla/build-notes.md")).toBe(true);
  });

  // plan.md carries the slice's single indexed entry, so it is never slice-local. Nor is any
  // other document that happens to live in a slice directory — widening the rule to "anything
  // under specs/<date>/" would swallow the three below, all real or potential KMS documents.
  it("does not match plan.md or other documents in a slice directory", () => {
    expect(isSliceLocal("specs/2026-09-13-p402-express-sla/plan.md")).toBe(false);
    expect(
      isSliceLocal("specs/2026-09-22-kms-pilot-orders-fulfilment/kms-strategy-evaluation.md"),
    ).toBe(false);
    expect(isSliceLocal("specs/2026-08-19-p7-closeout/rls-experiment.md")).toBe(false);
    expect(isSliceLocal("specs/2026-09-17-claude-md-guardrail-refactor/migration-ledger.md")).toBe(
      false,
    );
  });

  it("does not match the same filenames outside a dated slice directory", () => {
    expect(isSliceLocal("specs/templates/feature-spec/requirements.md")).toBe(false);
    expect(isSliceLocal("docs/developer-portal/validation.md")).toBe(false);
    expect(isSliceLocal("requirements.md")).toBe(false);
  });
});
