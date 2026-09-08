import { describe, expect, it, vi } from "vitest";
import {
  ERROR_EVENT_INSERT_SQL,
  buildErrorEventInsertParams,
  recordErrorEventDirect,
} from "@/lib/error-event-fallback";
import type { RecordErrorEventInput } from "@/lib/repositories/error-events";

/**
 * Proves R1, R3-R10 (#674) — the Prisma-free fallback write path.
 *
 * What this file CANNOT prove, deliberately: that the statement is valid SQL
 * that real Postgres accepts. A hand-built executor returns whatever its author
 * assumed, which is the trap `CLAUDE.md` records for Prisma driver error codes
 * and the Workers AI response shape. `scripts/verify-error-event-fallback.ts`
 * answers that against a real database; this file pins the shape and, more
 * importantly, the failure behaviour — which a live script cannot exercise.
 */

const INPUT: RecordErrorEventInput = {
  message: "boom",
  stack: "at foo",
  digest: "4136472788",
  path: "/checkout",
  method: "GET",
  routerKind: "App Router",
  routeType: "render",
};

describe("ERROR_EVENT_INSERT_SQL", () => {
  it("targets the ErrorEvent table and no other", () => {
    expect(ERROR_EVENT_INSERT_SQL).toMatch(/INSERT INTO "ErrorEvent"/);
    const tables = ERROR_EVENT_INSERT_SQL.match(/INTO\s+"(\w+)"/g) ?? [];
    expect(tables).toEqual(['INTO "ErrorEvent"']);
  });

  it("uses exactly the eight numbered placeholders, each once", () => {
    expect(ERROR_EVENT_INSERT_SQL.match(/\$\d+/g)).toEqual([
      "$1",
      "$2",
      "$3",
      "$4",
      "$5",
      "$6",
      "$7",
      "$8",
    ]);
  });

  it("interpolates nothing — no value is concatenated into the statement", () => {
    // A template substitution would have been resolved by now; if the constant
    // still carries one it is a literal, which is equally wrong here.
    expect(ERROR_EVENT_INSERT_SQL).not.toContain("${");
  });

  it("names the eight columns in the order the params are built", () => {
    const columns = ERROR_EVENT_INSERT_SQL.slice(
      ERROR_EVENT_INSERT_SQL.indexOf("(") + 1,
      ERROR_EVENT_INSERT_SQL.indexOf(")"),
    )
      .split(",")
      .map((c) => c.trim().replace(/"/g, ""));

    expect(columns).toEqual([
      "id",
      "digest",
      "message",
      "stack",
      "path",
      "method",
      "routerKind",
      "routeType",
    ]);
  });

  it("omits createdAt, which the database defaults", () => {
    expect(ERROR_EVENT_INSERT_SQL).not.toMatch(/createdAt/);
  });
});

describe("buildErrorEventInsertParams", () => {
  it("returns eight parameters", () => {
    expect(buildErrorEventInsertParams(INPUT)).toHaveLength(8);
  });

  it("supplies a uuid id, because the column has no database default", () => {
    expect(buildErrorEventInsertParams(INPUT)[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("mints a fresh id per call, so two records of the same error do not collide", () => {
    expect(buildErrorEventInsertParams(INPUT)[0]).not.toBe(buildErrorEventInsertParams(INPUT)[0]);
  });

  it("truncates message and stack via the shared row builder", () => {
    const params = buildErrorEventInsertParams({
      ...INPUT,
      message: "m".repeat(2500),
      stack: "s".repeat(9000),
    });

    expect((params[2] as string).length).toBe(2000);
    expect((params[3] as string).length).toBe(8000);
  });

  it("strips a query string from the path via the shared row builder", () => {
    const params = buildErrorEventInsertParams({
      ...INPUT,
      path: "/orders/lookup?email=someone@example.com",
    });

    expect(params[4]).toBe("/orders/lookup");
  });

  it("passes a null stack through as null rather than the string 'null'", () => {
    expect(buildErrorEventInsertParams({ ...INPUT, stack: null })[3]).toBeNull();
  });
});

describe("recordErrorEventDirect", () => {
  it("writes once and reports success when the executor resolves", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);

    await expect(
      recordErrorEventDirect(INPUT, { readConnectionString: () => "postgres://x", execute }),
    ).resolves.toBe(true);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toBe(ERROR_EVENT_INSERT_SQL);
    expect(execute.mock.calls[0][1]).toHaveLength(8);
  });

  it("issues no retention sweep — the only statement is the insert", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);

    await recordErrorEventDirect(INPUT, {
      readConnectionString: () => "postgres://x",
      execute,
    });

    expect(execute).toHaveBeenCalledTimes(1);
    for (const call of execute.mock.calls) {
      expect(call[0]).not.toMatch(/DELETE/i);
    }
  });

  it("reports failure and queries nothing when there is no connection string", async () => {
    const execute = vi.fn();

    await expect(
      recordErrorEventDirect(INPUT, { readConnectionString: () => undefined, execute }),
    ).resolves.toBe(false);

    expect(execute).not.toHaveBeenCalled();
  });

  it("does not reject when the executor returns a rejected promise", async () => {
    await expect(
      recordErrorEventDirect(INPUT, {
        readConnectionString: () => "postgres://x",
        execute: () => Promise.reject(new Error("connection refused")),
      }),
    ).resolves.toBe(false);
  });

  it("does not reject when the executor throws synchronously", async () => {
    await expect(
      recordErrorEventDirect(INPUT, {
        readConnectionString: () => "postgres://x",
        execute: () => {
          throw new Error("driver exploded");
        },
      }),
    ).resolves.toBe(false);
  });

  it("does not reject when resolving the connection string itself throws", async () => {
    await expect(
      recordErrorEventDirect(INPUT, {
        readConnectionString: () => {
          throw new Error("no request context");
        },
      }),
    ).resolves.toBe(false);
  });
});
