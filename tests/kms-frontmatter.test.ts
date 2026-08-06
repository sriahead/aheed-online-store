import { describe, it, expect } from "vitest";
import { FrontMatter, trackFor } from "@/kms/schema/frontmatter";

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

describe("trackFor", () => {
  const base = FrontMatter.parse(validExample);

  it("routes customer audiences to customer-help", () => {
    expect(trackFor({ ...base, audience: ["customer"] })).toBe("customer-help");
    expect(trackFor({ ...base, audience: ["dev", "customer"] })).toBe("customer-help");
  });

  it("routes staff audiences (without customer) to staff-ops", () => {
    expect(trackFor({ ...base, audience: ["staff"] })).toBe("staff-ops");
    expect(trackFor({ ...base, audience: ["dev", "staff"] })).toBe("staff-ops");
  });

  it("routes dev-only audiences to internal-eng", () => {
    expect(trackFor({ ...base, audience: ["dev"] })).toBe("internal-eng");
  });
});
