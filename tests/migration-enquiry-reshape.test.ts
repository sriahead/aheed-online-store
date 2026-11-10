import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #1482 R30a — `20261110120000_vendor_enquiries_reshape` must be safe on BOTH shapes of
 * VendorEnquiry, because CI applies it to databases holding either. Behaviour against real Postgres
 * is proven by `scripts/verify-enquiry-reshape.ts`; this guards the file's structure so a later edit
 * cannot quietly make a statement unconditional.
 */

const SQL = readFileSync(
  "prisma/migrations/20261110120000_vendor_enquiries_reshape/migration.sql",
  "utf8",
);
const body = SQL.split(/\r?\n/)
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .trim();

describe("vendor_enquiries_reshape migration (#1482 R30a)", () => {
  it("is one DO block and nothing outside it", () => {
    expect(body.startsWith("DO $$")).toBe(true);
    expect(body.endsWith("END $$;")).toBe(true);
    expect(body.match(/DO \$\$/g)).toHaveLength(1);
  });

  it("does everything only when the old replyBody column exists in the current schema", () => {
    const guard = body.indexOf("column_name = 'replyBody'");
    expect(guard).toBeGreaterThan(-1);
    expect(body).toContain("table_schema = current_schema()");
    for (const statement of [
      "CREATE TYPE",
      "ALTER TABLE",
      "CREATE TABLE",
      "INSERT INTO",
      "DROP COLUMN",
    ]) {
      expect(body.indexOf(statement), statement).toBeGreaterThan(guard);
    }
  });

  it("copies replies BEFORE dropping their columns", () => {
    expect(body.indexOf('INSERT INTO "VendorEnquiryReply"')).toBeLessThan(
      body.indexOf('DROP COLUMN "replyBody"'),
    );
  });

  it("never drops a table or an enum", () => {
    expect(body).not.toMatch(/DROP\s+(TABLE|TYPE)/i);
  });
});
