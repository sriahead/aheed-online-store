import { describe, expect, it, vi } from "vitest";
import {
  SYNONYM_LOAD_LIMIT,
  listApprovedAliasMap,
  listSynonymsForVendor,
} from "@/lib/repositories/search-synonyms";

/**
 * P2.6 slice 3 (#566), R18.
 *
 * `SYNONYM_LOAD_LIMIT` bounds two reads: `listApprovedAliasMap` (R17/R18 — it runs on every
 * storefront search) and the staff listing `listSynonymsForVendor`, which has no pagination of
 * its own. Found missing at `/validate` (2026-09-04): the constant was correctly applied in the
 * source but nothing asserted it, so a future edit dropping the `take` would pass every other
 * check silently.
 */
function makeStub(rows: unknown[] = []) {
  const findMany = vi.fn(async (_args: unknown) => rows);
  const client = { searchSynonym: { findMany } };
  return { client: client as never, findMany };
}

const VENDOR = "vendor-1";

describe("SYNONYM_LOAD_LIMIT is applied as `take` (R18)", () => {
  it("bounds listApprovedAliasMap's read, which runs on every search", async () => {
    const { client, findMany } = makeStub();
    await listApprovedAliasMap(client, VENDOR);

    const args = findMany.mock.calls[0][0] as { take: number };
    expect(args.take).toBe(SYNONYM_LOAD_LIMIT);
  });

  it("bounds listSynonymsForVendor's read, which has no pagination of its own", async () => {
    const { client, findMany } = makeStub();
    await listSynonymsForVendor(client, VENDOR);

    const args = findMany.mock.calls[0][0] as { take: number };
    expect(args.take).toBe(SYNONYM_LOAD_LIMIT);
  });
});
