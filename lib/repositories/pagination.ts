/**
 * Keyset pagination arguments, built from a cursor that arrived in a URL (#682).
 *
 * Every growable list in this repository paginates on `(createdAt desc, id desc)`
 * using Prisma's `cursor` + `skip: 1`, per `specs/architecture.md`'s pagination
 * strategy. The cursor itself reaches those functions straight from a query
 * string that a shopper or an owner may have edited, bookmarked, truncated or
 * forged — and until this module existed, it went into `prisma.<model>.findMany`
 * with no check of any kind at five separate call sites.
 *
 * The reasoning is not new here. `parseSearchOffset` in `./products.ts` already
 * applies exactly this argument to the ranked-search offset, in a comment that
 * says a cursor "arrives straight from a URL a shopper may have edited,
 * bookmarked or truncated". That guard was written for one path and never
 * carried to the keyset ones. This module is that carry-over, in one place, so
 * a sixth list cannot be added without it (`tests/pagination-guard-coverage.test.ts`).
 *
 * WHAT WENT WRONG WITHOUT IT — both measured live under `npm run preview`
 * against the dev database on 2026-09-09, not reasoned about:
 *
 *   ?cursor=not-a-uuid                  -> HTTP 200, "No products", ZERO rows
 *   ?cursor=<well-formed, no such row>  -> HTTP 200, "No products", ZERO rows
 *   ?cursor=<uuid>&cursor=<uuid>        -> HTTP 500, PrismaClientValidationError
 *
 * The first two are the quieter defect and the reason a syntactic check is worth
 * having at all: Prisma does NOT throw on a cursor that matches nothing, it
 * returns an empty page. So a stale bookmark renders an owner's catalogue as
 * empty, which reads as "my products are gone" rather than as a bad link.
 *
 * The third is why the parameter type is `string | string[] | undefined` rather
 * than the `string | undefined` the calling pages declare. A repeated query
 * parameter is `string[]` at runtime whatever the page's type annotation says,
 * and `cursor: { id: ["x", "y"] }` reached Prisma and threw
 * `PrismaClientValidationError`. Narrowing here is what makes the annotation
 * true rather than aspirational.
 *
 * PURE — no Prisma client, no request context, no imports. It takes a value and
 * returns a plain object, so `tests/pagination.test.ts` needs no database, and
 * `tests/repository-purity.test.ts` / `tests/repository-client-injection.test.ts`
 * both stay green with this file present.
 */

/**
 * Hex-shaped UUID, deliberately NOT pinned to version 4 or to the RFC variant
 * nibble. `Product.id` and `Order.id` are `@default(uuid())` so every id this
 * app generates is a v4, but the seed also writes hand-authored ids
 * (`a4ed0000-0000-4000-a000-000000000001`) and a stricter pattern would risk
 * rejecting a legitimate cursor — which fails CLOSED to page one and is
 * therefore silent. The looser shape still rejects everything this guard exists
 * to reject: SQL metacharacters, path traversal, empty strings and arrays.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Prisma keyset arguments — spread into a `findMany` call, empty for page one. */
export interface KeysetCursorArgs {
  cursor?: { id: string };
  skip?: number;
}

/**
 * Prisma's `cursor`/`skip` pair for a raw URL cursor, or an empty object —
 * meaning the first page — for anything that is not a single well-formed id.
 *
 * Returning page one rather than throwing is deliberate and matches
 * `parseSearchOffset`'s existing rule for the search offset: a bad cursor is a
 * stale or edited link, not an attack to report, and the useful response is the
 * top of the list the reader asked for.
 */
export function keysetCursorArgs(cursor: string | string[] | undefined | null): KeysetCursorArgs {
  if (typeof cursor !== "string") return {};
  const id = cursor.trim();
  if (!UUID_SHAPE.test(id)) return {};
  return { cursor: { id }, skip: 1 };
}

/**
 * Run a keyset page, falling back to the FIRST page when a cursor was applied
 * and matched nothing.
 *
 * The syntactic check above cannot catch every broken cursor, and this is the
 * remainder: an id that is perfectly well-formed but names no row — a bookmark
 * to a product since deleted, or a cursor carried across a filter change. Prisma
 * returns an empty result for those rather than erroring, so the page renders as
 * an empty catalogue with no indication anything is wrong. Measured live on
 * 2026-09-09: `?cursor=00000000-0000-4000-8000-000000000000` returned HTTP 200
 * and "No products" against a 2,080-product catalogue.
 *
 * Deciding this in advance would need an existence check on every paginated
 * request — one extra round-trip on the happy path, against a slice whose other
 * half exists to REMOVE round-trips (#670). Deciding it afterwards costs nothing
 * on the happy path and one extra query only when the page would otherwise have
 * been blank, which is strictly better than what it replaces.
 *
 * Only fires when a cursor was actually applied, so a filter that genuinely
 * matches nothing (`?q=zzzzz`) still correctly renders an empty list.
 *
 * Takes the query as a callback rather than importing Prisma, which is what
 * keeps this module pure and `tests/pagination.test.ts` database-free.
 */
export async function runKeysetPage<T>(
  args: KeysetCursorArgs,
  run: (pageArgs: KeysetCursorArgs) => Promise<T[]>,
): Promise<T[]> {
  const rows = await run(args);
  if (rows.length === 0 && args.cursor !== undefined) return run({});
  return rows;
}
