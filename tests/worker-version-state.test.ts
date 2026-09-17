import { describe, expect, test } from "vitest";
import { workerVersionState } from "../scripts/verify-storage-credentials";

/**
 * #780 — the pure half of the deployed-version check.
 *
 * The property worth protecting here is NOT "different ids mean stale". It is that a failed
 * lookup is never reported as a mismatch. The dev machine this runs on produced transient
 * `fetch failed` errors repeatedly while #755 was being diagnosed, and a check that turned a
 * flaky network into "your credentials are not live" would train everyone to ignore it — which
 * is exactly how a real stale Worker would then slip through.
 */
describe("workerVersionState", () => {
  const A = "859a1ff6-0000-4000-a000-000000000001";
  const B = "c0b794df-0000-4000-a000-000000000002";

  test("in-sync when the lookup succeeded and the deployed version IS the newest", () => {
    expect(workerVersionState(A, A, true)).toBe("in-sync");
  });

  test("stale when the lookup succeeded and a newer version was never deployed", () => {
    expect(workerVersionState(A, B, true)).toBe("stale");
  });

  test("unknown when the lookup failed", () => {
    expect(workerVersionState(A, A, false)).toBe("unknown");
  });

  // The case the ordering in the implementation exists for. A failed lookup yields nulls, but
  // even if it somehow yielded two DIFFERENT ids, that is still not evidence of staleness —
  // `lookupOk` is checked first precisely so an unreachable API cannot masquerade as a mismatch.
  test("unknown — NOT stale — when the lookup failed and the ids differ", () => {
    expect(workerVersionState(A, B, false)).toBe("unknown");
  });

  test("unknown when either id is missing, even on a nominally successful lookup", () => {
    expect(workerVersionState(null, B, true)).toBe("unknown");
    expect(workerVersionState(A, null, true)).toBe("unknown");
    expect(workerVersionState(null, null, true)).toBe("unknown");
  });

  test("unknown when an id is an empty string rather than null", () => {
    expect(workerVersionState("", B, true)).toBe("unknown");
    expect(workerVersionState(A, "", true)).toBe("unknown");
  });

  test("comparison is exact — ids sharing a prefix are not treated as equal", () => {
    expect(workerVersionState("859a1ff6", "859a1ff6-0000", true)).toBe("stale");
  });
});
