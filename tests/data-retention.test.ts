import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ASSISTANT_CONVERSATION_RETENTION_DAYS,
  ATTEMPT_RECORD_RETENTION_HOURS,
  SEARCH_QUERY_LOG_RETENTION_DAYS,
} from "@/lib/data-retention";
import { AUTH_RATE_LIMIT_WINDOW_MS } from "@/lib/repositories/auth-rate-limit";
import { ORDER_LOOKUP_WINDOW_MS } from "@/lib/repositories/order-lookup-rate-limit";
import { DISCOUNT_CODE_WINDOW_MS } from "@/lib/repositories/discount-code-throttle";
import { FEEDBACK_RATE_LIMIT } from "@/lib/repositories/customer-feedback-rate-limit";
import { LIST_NORMALISATION_WINDOW_MS } from "@/lib/repositories/list-normalisation-rate-limit";

/**
 * #1041 / #1107 R1–R3 — one source for how long each hashed-IP record is kept, read by the
 * repositories that sweep the tables and by `/privacy`, which states the figures to shoppers.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const source = (path: string) => readFileSync(`${ROOT}${path}`, "utf8");

describe("lib/data-retention.ts (R1)", () => {
  it("holds today's values and imports nothing", () => {
    expect(SEARCH_QUERY_LOG_RETENTION_DAYS).toBe(90);
    expect(ASSISTANT_CONVERSATION_RETENTION_DAYS).toBe(90);
    expect(ATTEMPT_RECORD_RETENTION_HOURS).toBe(1);
    expect(source("lib/data-retention.ts")).not.toMatch(/^import /m);
  });
});

describe("each sweeping repository takes its retention from it (R2)", () => {
  it.each([
    ["lib/repositories/search-query-log.ts", "SEARCH_QUERY_LOG_RETENTION_DAYS"],
    ["lib/repositories/assistant-conversations.ts", "ASSISTANT_CONVERSATION_RETENTION_DAYS"],
    ["lib/repositories/auth-rate-limit.ts", "ATTEMPT_RECORD_RETENTION_HOURS"],
    ["lib/repositories/order-lookup-rate-limit.ts", "ATTEMPT_RECORD_RETENTION_HOURS"],
    ["lib/repositories/discount-code-throttle.ts", "ATTEMPT_RECORD_RETENTION_HOURS"],
    ["lib/repositories/customer-feedback-rate-limit.ts", "ATTEMPT_RECORD_RETENTION_HOURS"],
    ["lib/repositories/list-normalisation-rate-limit.ts", "ATTEMPT_RECORD_RETENTION_HOURS"],
  ])("%s imports %s and builds its retention from it", (path, constant) => {
    const text = source(path);
    expect(text).toContain(`import { ${constant} } from "@/lib/data-retention";`);
    // assistant-conversations keeps a local RETENTION_DAYS alias, which it re-exports.
    const initialisers = [...text.matchAll(/const RETENTION_(?:MS|DAYS) = ([^;]+);/g)].map(
      (m) => m[1],
    );
    expect(initialisers.length).toBeGreaterThan(0);
    expect(initialisers.join(" ")).toMatch(new RegExp(`\\b${constant}\\b`));
    for (const init of initialisers) {
      for (const literal of init.match(/\b\d[\d_]*\b/g) ?? []) {
        expect(["1000", "60", "24"]).toContain(literal);
      }
    }
  });
});

describe("retention outlives every rate-limit window (R3)", () => {
  const retentionMs = ATTEMPT_RECORD_RETENTION_HOURS * 3_600_000;
  it.each([
    ["AuthenticationAttempt", AUTH_RATE_LIMIT_WINDOW_MS],
    ["OrderLookupAttempt", ORDER_LOOKUP_WINDOW_MS],
    ["DiscountCodeAttempt", DISCOUNT_CODE_WINDOW_MS],
    ["CustomerFeedbackAttempt", FEEDBACK_RATE_LIMIT.windowMs],
    ["ListNormalisationAttempt", LIST_NORMALISATION_WINDOW_MS],
  ])("%s's window is shorter than its retention", (_table, windowMs) => {
    expect(windowMs).toBeLessThan(retentionMs);
  });
});
