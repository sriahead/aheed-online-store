import { describe, it, expect } from "vitest";
import {
  PRODUCT_RESTRICTIONS,
  allowedRestrictionTargets,
  bulkEnableOutcome,
  decideEnable,
  decideSetRestriction,
  isHardBlock,
  planBulkAction,
  stricterOf,
  summarisePlanRisks,
  type BulkCandidate,
  type EnableDecision,
  type ProductRestriction,
  type RestrictionActor,
} from "@/lib/product-restriction";

/**
 * #1211 (R16, R17, R23) — the restriction rules, exhaustively. The expected table below is an
 * INLINE COPY of specs/2026-10-22-catalogue-restrictions-stock-states/plan.md "Hard block versus
 * admin override", written out rather than derived, so the test cannot pass by re-implementing
 * whatever the code does.
 */

type R = ProductRestriction | null;
const ALL: R[] = [null, ...PRODUCT_RESTRICTIONS];
const ACTORS: RestrictionActor[] = ["STAFF", "ADMIN"];

/** plan.md's table: restriction → [STAFF, ADMIN unconfirmed-or-blank, ADMIN confirmed+reason]. */
const TABLE: Record<string, [EnableDecision, EnableDecision, EnableDecision]> = {
  none: [{ kind: "ENABLE" }, { kind: "ENABLE" }, { kind: "ENABLE" }],
  NEEDS_REVIEW: [
    { kind: "REFUSED", reason: "ADMIN_ONLY" },
    { kind: "NEEDS_CONFIRMATION", restriction: "NEEDS_REVIEW" },
    { kind: "ENABLE_CLEARING", restriction: "NEEDS_REVIEW" },
  ],
  NOT_DELIVERABLE: [
    { kind: "REFUSED", reason: "ADMIN_ONLY" },
    { kind: "NEEDS_CONFIRMATION", restriction: "NOT_DELIVERABLE" },
    { kind: "ENABLE_CLEARING", restriction: "NOT_DELIVERABLE" },
  ],
  AGE_RESTRICTED: [
    { kind: "REFUSED", reason: "HARD_BLOCK" },
    { kind: "REFUSED", reason: "HARD_BLOCK" },
    { kind: "REFUSED", reason: "HARD_BLOCK" },
  ],
  PROHIBITED: [
    { kind: "REFUSED", reason: "HARD_BLOCK" },
    { kind: "REFUSED", reason: "HARD_BLOCK" },
    { kind: "REFUSED", reason: "HARD_BLOCK" },
  ],
};

function expected(restriction: R, actor: RestrictionActor, confirmed: boolean, reason: string) {
  const row = TABLE[restriction ?? "none"];
  if (actor === "STAFF") return row[0];
  return confirmed && reason.trim() !== "" ? row[2] : row[1];
}

describe("decideEnable (R16) — all 40 combinations against plan.md's table", () => {
  const cases: [R, RestrictionActor, boolean, string][] = [];
  for (const restriction of ALL)
    for (const actor of ACTORS)
      for (const confirmed of [false, true])
        for (const reason of ["  ", "Checked with the supplier"])
          cases.push([restriction, actor, confirmed, reason]);

  it("enumerates exactly 5 × 2 × 2 × 2 = 40 cases", () => {
    expect(cases).toHaveLength(40);
  });

  it.each(cases)(
    "restriction %s, actor %s, confirmed %s, reason %j",
    (r, actor, confirmed, reason) => {
      expect(decideEnable({ restriction: r, actor, confirmed, reason })).toEqual(
        expected(r, actor, confirmed, reason),
      );
    },
  );

  it("PROHIBITED and AGE_RESTRICTED are HARD_BLOCK in EVERY combination", () => {
    for (const [r, actor, confirmed, reason] of cases) {
      if (r !== "PROHIBITED" && r !== "AGE_RESTRICTED") continue;
      expect(decideEnable({ restriction: r, actor, confirmed, reason })).toEqual({
        kind: "REFUSED",
        reason: "HARD_BLOCK",
      });
    }
  });

  it("a null or undefined reason never confirms", () => {
    for (const reason of [null, undefined]) {
      expect(
        decideEnable({ restriction: "NEEDS_REVIEW", actor: "ADMIN", confirmed: true, reason }),
      ).toEqual({ kind: "NEEDS_CONFIRMATION", restriction: "NEEDS_REVIEW" });
    }
  });
});

describe("decideSetRestriction (R17) — every (from, to) pair, both actors", () => {
  const rank = (r: R) =>
    r === "PROHIBITED" ? 4 : r === "AGE_RESTRICTED" ? 3 : r === "NOT_DELIVERABLE" ? 2 : r ? 1 : 0;

  for (const actor of ACTORS)
    for (const from of ALL)
      for (const to of ALL) {
        const want =
          actor === "STAFF"
            ? { kind: "REFUSED", reason: "ADMIN_ONLY" }
            : from === to
              ? { kind: "NO_CHANGE" }
              : rank(to) < rank(from)
                ? { kind: "REFUSED", reason: "WOULD_LOOSEN" }
                : { kind: "ALLOWED" };
        it(`${actor}: ${from} → ${to} is ${want.kind}`, () => {
          expect(decideSetRestriction(from, to, actor)).toEqual(want);
        });
      }

  it("no ADMIN path loosens a hard block to anything, including null", () => {
    for (const from of ["PROHIBITED", "AGE_RESTRICTED"] as const) {
      for (const to of ALL) {
        if (to === from) continue;
        if (from === "AGE_RESTRICTED" && to === "PROHIBITED") continue; // tightening
        expect(decideSetRestriction(from, to, "ADMIN")).toEqual({
          kind: "REFUSED",
          reason: "WOULD_LOOSEN",
        });
      }
    }
  });

  it("the ADMIN selector offers only the current value and stricter ones", () => {
    expect(allowedRestrictionTargets("NOT_DELIVERABLE")).toEqual([
      "PROHIBITED",
      "AGE_RESTRICTED",
      "NOT_DELIVERABLE",
    ]);
    expect(allowedRestrictionTargets(null)).toEqual([...PRODUCT_RESTRICTIONS]);
    expect(allowedRestrictionTargets("PROHIBITED")).toEqual(["PROHIBITED"]);
  });
});

describe("stricterOf / isHardBlock", () => {
  it("orders PROHIBITED > AGE_RESTRICTED > NOT_DELIVERABLE > NEEDS_REVIEW > null", () => {
    expect(stricterOf(null, "NEEDS_REVIEW")).toBe("NEEDS_REVIEW");
    expect(stricterOf("NOT_DELIVERABLE", "NEEDS_REVIEW")).toBe("NOT_DELIVERABLE");
    expect(stricterOf("NOT_DELIVERABLE", "AGE_RESTRICTED")).toBe("AGE_RESTRICTED");
    expect(stricterOf("PROHIBITED", "AGE_RESTRICTED")).toBe("PROHIBITED");
    expect(stricterOf(null, null)).toBeNull();
  });

  it("hard-blocks exactly PROHIBITED and AGE_RESTRICTED", () => {
    expect(ALL.filter(isHardBlock)).toEqual(["PROHIBITED", "AGE_RESTRICTED"]);
  });
});

describe("planBulkAction (R23)", () => {
  const candidates: BulkCandidate[] = ALL.flatMap((restriction, i) =>
    [false, true]
      // The DB CHECK forbids an active restricted product, so only generate legal rows.
      .filter((isActive) => !(isActive && restriction !== null))
      .flatMap((isActive) =>
        (["TRACKED", "UNTRACKED", "UNKNOWN"] as const).map((stockMode) => ({
          id: `p-${i}-${isActive}-${stockMode}`,
          name: `Product ${i}`,
          isActive,
          restriction,
          stockMode,
        })),
      ),
  );
  const ids = candidates.map((c) => c.id);

  for (const actor of ACTORS)
    for (const confirmation of [
      { confirmed: false, reason: null },
      { confirmed: true, reason: "Reviewed" },
    ]) {
      it(`ENABLE (${actor}, confirmed=${confirmation.confirmed}) equals decideEnable per product`, () => {
        const plan = planBulkAction("ENABLE", ids, candidates, actor, confirmation);
        expect(plan).toHaveLength(candidates.length);
        plan.forEach((entry, i) => {
          const product = candidates[i];
          expect(entry.outcome).toEqual(bulkEnableOutcome(product, actor, confirmation));
          const decision = decideEnable({
            restriction: product.restriction,
            actor,
            ...confirmation,
          });
          // The mapping, spelled out: the bulk outcome is the single decision, nothing looser.
          if (decision.kind === "REFUSED") {
            expect(entry.outcome).toEqual({ kind: "SKIPPED", reason: decision.reason });
          } else if (decision.kind === "NEEDS_CONFIRMATION") {
            expect(entry.outcome).toEqual({ kind: "SKIPPED", reason: "NEEDS_CONFIRMATION" });
          } else if (decision.kind === "ENABLE_CLEARING") {
            expect(entry.outcome).toEqual(decision);
          } else {
            expect(entry.outcome.kind).toBe(product.isActive ? "NO_CHANGE" : "ENABLE");
          }
        });
      });
    }

  it("DISABLE and MARK_UNTRACKED never change a restriction, and MARK_UNTRACKED never isActive", () => {
    for (const actor of ACTORS) {
      for (const action of ["DISABLE", "MARK_UNTRACKED"] as const) {
        const plan = planBulkAction(action, ids, candidates, actor, {
          confirmed: true,
          reason: "x",
        });
        for (const entry of plan) {
          expect(["ENABLE", "ENABLE_CLEARING"]).not.toContain(entry.outcome.kind);
          if (action === "MARK_UNTRACKED") {
            expect(["MARK_UNTRACKED", "NO_CHANGE"]).toContain(entry.outcome.kind);
          } else {
            expect(["DISABLE", "NO_CHANGE"]).toContain(entry.outcome.kind);
          }
        }
      }
    }
  });

  it("reports a foreign id as SKIPPED: NOT_FOUND and drops duplicate ids", () => {
    const plan = planBulkAction(
      "ENABLE",
      [candidates[0].id, "another-vendors-product", candidates[0].id],
      candidates,
      "ADMIN",
      { confirmed: true, reason: "x" },
    );
    expect(plan).toHaveLength(2);
    expect(plan[1]).toEqual({
      productId: "another-vendors-product",
      name: null,
      restriction: null,
      outcome: { kind: "SKIPPED", reason: "NOT_FOUND" },
    });
  });

  it("summarisePlanRisks splits hard blocks from overridable restrictions", () => {
    const plan = planBulkAction("ENABLE", ids, candidates, "ADMIN", {
      confirmed: false,
      reason: null,
    });
    const { hardBlocked, overridable } = summarisePlanRisks(plan);
    expect(new Set(hardBlocked.map((e) => e.restriction))).toEqual(
      new Set(["PROHIBITED", "AGE_RESTRICTED"]),
    );
    expect(new Set(overridable.map((e) => e.restriction))).toEqual(
      new Set(["NOT_DELIVERABLE", "NEEDS_REVIEW"]),
    );
  });
});
