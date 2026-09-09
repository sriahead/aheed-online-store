import { describe, expect, it, vi } from "vitest";
import { keysetCursorArgs, runKeysetPage } from "@/lib/repositories/pagination";

/**
 * #682 — the keyset cursor reached Prisma unvalidated at five call sites.
 *
 * The cases below are not hypothetical shapes: each one was reproduced live
 * under `npm run preview` against the dev database on 2026-09-09, before the
 * guard existed. Two distinct failure modes, which is why both a "returns page
 * one" case and a "rejects a non-string" case matter:
 *
 *   a malformed or stale cursor  -> HTTP 200 with an EMPTY list ("No products")
 *   a repeated ?cursor= param    -> HTTP 500, PrismaClientValidationError
 *
 * The first is the one worth dwelling on. Prisma does not throw when a cursor
 * matches no row — it returns nothing — so the pre-guard behaviour rendered a
 * 2,080-product catalogue as empty with no error anywhere.
 */

const REAL_ID = "a8fce2ba-11d5-46fd-9800-63d37562cab7";

describe("keysetCursorArgs (#682)", () => {
  describe("applies the cursor for a well-formed id", () => {
    it("returns Prisma's cursor/skip pair", () => {
      expect(keysetCursorArgs(REAL_ID)).toEqual({ cursor: { id: REAL_ID }, skip: 1 });
    });

    it("accepts a hand-authored seed id that is not a random v4", () => {
      // prisma/seed.ts writes ids like this; a version-pinned regex would
      // reject them and silently paginate back to page one.
      const seeded = "a4ed0000-0000-4000-a000-000000000001";
      expect(keysetCursorArgs(seeded)).toEqual({ cursor: { id: seeded }, skip: 1 });
    });

    it("accepts an uppercase id", () => {
      expect(keysetCursorArgs(REAL_ID.toUpperCase())).toEqual({
        cursor: { id: REAL_ID.toUpperCase() },
        skip: 1,
      });
    });

    it("trims surrounding whitespace rather than rejecting", () => {
      expect(keysetCursorArgs(`  ${REAL_ID}  `)).toEqual({ cursor: { id: REAL_ID }, skip: 1 });
    });
  });

  describe("falls back to the first page", () => {
    it.each([
      ["undefined", undefined],
      ["null", null],
      ["an empty string", ""],
      ["whitespace only", "   "],
      ["a non-uuid word", "not-a-uuid"],
      ["a truncated uuid", "a8fce2ba-11d5-46fd-9800"],
      ["a uuid with a trailing character", `${REAL_ID}x`],
      ["a numeric offset", "25"],
      ["a SQL fragment", "' OR 1=1--"],
      ["a path traversal attempt", "../../etc/passwd"],
      ["a uuid containing a non-hex character", "g8fce2ba-11d5-46fd-9800-63d37562cab7"],
    ])("returns no cursor for %s", (_label, input) => {
      expect(keysetCursorArgs(input as string | undefined)).toEqual({});
    });

    /**
     * The 500 case. A repeated query parameter is `string[]` at runtime no
     * matter what the calling page's `searchParams` type says, and
     * `cursor: { id: ["x", "y"] }` threw PrismaClientValidationError live.
     */
    it("returns no cursor for a repeated query parameter (an array)", () => {
      expect(keysetCursorArgs([REAL_ID, REAL_ID])).toEqual({});
      expect(keysetCursorArgs(["x", "y"])).toEqual({});
      expect(keysetCursorArgs([REAL_ID])).toEqual({});
    });
  });

  /**
   * The remainder the syntactic check cannot reach: a well-formed id naming no
   * row. Prisma returns an empty result rather than erroring, so before this
   * existed `?cursor=00000000-0000-4000-8000-000000000000` rendered "No
   * products" against a 2,080-product catalogue (measured live, 2026-09-09).
   */
  describe("runKeysetPage", () => {
    it("returns the cursored page untouched when it has rows", async () => {
      const run = vi.fn(async () => ["a", "b"]);
      const args = keysetCursorArgs(REAL_ID);

      expect(await runKeysetPage(args, run)).toEqual(["a", "b"]);
      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(args);
    });

    it("retries from the first page when a cursored page comes back empty", async () => {
      const run = vi.fn(async (a: { cursor?: { id: string } }) =>
        a.cursor ? [] : ["first-page-row"],
      );

      expect(await runKeysetPage(keysetCursorArgs(REAL_ID), run)).toEqual(["first-page-row"]);
      expect(run).toHaveBeenCalledTimes(2);
      expect(run).toHaveBeenLastCalledWith({});
    });

    it("does NOT retry when no cursor was applied", async () => {
      // A filter that genuinely matches nothing must still render an empty
      // list — retrying here would show unrelated rows for `?q=zzzzz`.
      const run = vi.fn(async () => []);

      expect(await runKeysetPage(keysetCursorArgs("not-a-uuid"), run)).toEqual([]);
      expect(run).toHaveBeenCalledTimes(1);
    });

    it("costs nothing extra on the happy path", async () => {
      const run = vi.fn(async () => ["row"]);
      await runKeysetPage(keysetCursorArgs(undefined), run);
      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  it("never returns a partial pair", () => {
    // A `cursor` without `skip: 1` would silently repeat the boundary row on
    // every page; a `skip` without a cursor would drop a row from page one.
    for (const input of [REAL_ID, "bad", undefined, ["a", "b"]]) {
      const args = keysetCursorArgs(input as string | undefined);
      expect("cursor" in args).toBe("skip" in args);
    }
  });
});
